#!/usr/bin/env python3
"""
MOCI (Ministry of Commerce & Industry) Business Map Scraper
============================================================
Source: https://businessmap.moci.gov.qa

The MOCI site is a React shell that embeds a Microsoft Power BI report
inside a cross-origin iframe. All company data is delivered by Power BI's
private wabi.powerbi.com/.../querydata endpoints. There is no public
REST API, no CSV export within reach, and no auth token usable for the
Power BI Export REST API.

Approach: launch headless Chromium via Playwright, navigate to the
Search Organizations page, intercept every wabi.powerbi.com response,
apply the Active filter, scroll the table to trigger every row to load,
and (if fetch_details=true) for each row navigate the embedded Power BI
report to the company-detail page (ReportSection6f5f01a5d69f9ad6b0f1)
with the row's filter values, capturing additional fields.

Two modes:
  * SCRAPE_MODE=diagnose  - one-off run that loads the page, captures the
    first few Power BI responses, and dumps them as raw JSON for analysis.
    Run this FIRST (Diagnose MOCI.command).
  * SCRAPE_MODE=production - the real scrape. Run after the diagnostic
    is analysed and the listing/detail parsers are tuned to the captured
    field shape.
"""
from __future__ import annotations

import asyncio
import atexit
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Playwright is the only third-party dep at runtime
from playwright.async_api import async_playwright, Response, Page

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
SOURCE_NAME = "MOCI - Qatar Business Map"
BASE_URL = "https://businessmap.moci.gov.qa/en/"
SEARCH_URL = "https://businessmap.moci.gov.qa/en/SearchOrganizations"
# MOCI uses Power BI dedicated capacity in Qatar-Central region rather than
# the public wabi.powerbi.com endpoint. Every host that carries Power BI
# query/metadata traffic for this report:
WABI_HOSTS = (
    "wabi.powerbi.com",
    "analysis.windows.net",       # *.analysis.windows.net (regional metadata)
    "pbidedicated.windows.net",   # *.pbidedicated.windows.net (data queries)
    "app.powerbi.com",            # embed shell
)
EMBED_TOKEN_URL = "https://businessmap.moci.gov.qa/app/Token/EmbedToken"

# Known Power BI report identifiers (from Chrome Extension probe)
REPORT_ID_EN = "6ab0e66a-1d50-4bbf-9971-4dc7369c3a20"
WORKSPACE_ID = "abac358d-da3e-4eca-96a6-57b0525087c3"
DETAIL_PAGE_NAME = "ReportSection6f5f01a5d69f9ad6b0f1"

SCRAPER_VERSION = "1.0.0-stage1-listings"

# Runtime knobs
MAX_RUN_MINUTES = int(os.environ.get("SCRAPE_MAX_MINUTES", "720"))
ACTIVE_ONLY = os.environ.get("SCRAPE_ACTIVE_ONLY", "true").lower() in (
    "1", "true", "yes", "on"
)
INCLUDE_PRO_LICENSE = os.environ.get(
    "SCRAPE_INCLUDE_PRO_LICENSE", "true"
).lower() in ("1", "true", "yes", "on")
FETCH_DETAILS = os.environ.get("SCRAPE_FETCH_DETAILS", "true").lower() in (
    "1", "true", "yes", "on"
)
SCROLL_PAUSE = float(os.environ.get("SCRAPE_SCROLL_PAUSE", "1.0"))
DETAIL_PAUSE = float(os.environ.get("SCRAPE_DETAIL_PAUSE", "1.5"))
HEADLESS = os.environ.get("SCRAPE_HEADLESS", "true").lower() in (
    "1", "true", "yes", "on"
)
MODE = os.environ.get("SCRAPE_MODE", "production").lower().strip()
# Manual mode: open browser, let user navigate + scroll, capture wabi traffic
MANUAL_MODE = os.environ.get("SCRAPE_MANUAL", "false").strip().lower() in (
    "1", "true", "yes", "on"
)

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
SCANS_DIR = SCRIPT_DIR / "scans"
STATE_DIR = SCRIPT_DIR / "state"
PROGRESS_FILE = STATE_DIR / "progress.json"
LOCK_FILE = STATE_DIR / "scraper.lock"
LATEST_FILE = SCANS_DIR / "moci_companies_latest.json"


# -----------------------------------------------------------------------------
# Utilities
# -----------------------------------------------------------------------------
def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def acquire_lock() -> bool:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        try:
            other = int(LOCK_FILE.read_text(encoding="utf-8").strip() or "0")
        except ValueError:
            other = 0
        if other and pid_is_alive(other):
            log(f"Another scraper instance is running (pid={other}). Exiting.")
            return False
        log(f"Removing stale lock file (pid {other} not alive).")
        LOCK_FILE.unlink(missing_ok=True)
    LOCK_FILE.write_text(str(os.getpid()))
    atexit.register(release_lock)
    signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
    signal.signal(signal.SIGINT, lambda *a: sys.exit(0))
    return True


def release_lock() -> None:
    try:
        if LOCK_FILE.exists() and LOCK_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
            LOCK_FILE.unlink()
    except Exception:
        pass


def pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def load_progress() -> Dict[str, Any]:
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            log("WARNING: progress file corrupt; starting fresh.")
    return {
        "scraper_version": SCRAPER_VERSION,
        "started_at": now_iso(),
        "companies": [],
        "professional_licenses": [],
        "scraped_cr_numbers": [],
        "listing_complete": False,
        "details_complete": False,
    }


def save_progress(progress: Dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = PROGRESS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(progress, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(PROGRESS_FILE)


# -----------------------------------------------------------------------------
# Power BI response capture
# -----------------------------------------------------------------------------
class WabiCapture:
    """Captures every wabi.powerbi.com response that comes through the browser.
    Each captured entry has the URL, request body, response status, and the
    parsed response JSON (if valid).
    """

    def __init__(self) -> None:
        self.events: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    def attach(self, page: Page) -> None:
        page.on("response", lambda resp: asyncio.create_task(self._on_response(resp)))

    async def _on_response(self, resp: Response) -> None:
        try:
            if not any(h in resp.url for h in WABI_HOSTS):
                return
            # Read body — Playwright handles decompression automatically
            try:
                body = await resp.body()
                text = body.decode("utf-8", errors="replace")
            except Exception as e:
                text = f"<failed to read body: {e}>"

            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None

            req = resp.request
            req_body = None
            try:
                rb = req.post_data
                if rb:
                    try:
                        req_body = json.loads(rb)
                    except json.JSONDecodeError:
                        req_body = rb[:5000]
            except Exception:
                req_body = None

            entry = {
                "captured_at": now_iso(),
                "url": resp.url,
                "method": req.method,
                "status": resp.status,
                "request_body": req_body,
                "response_body": parsed if parsed is not None else text[:50000],
            }
            async with self._lock:
                self.events.append(entry)
        except Exception as e:
            log(f"WabiCapture._on_response error: {e}")



async def page_is_503(page) -> bool:
    """Return True if the page is currently showing the IIS 503 error page.

    The error page is ~320 chars and contains 'Service Unavailable'. The real
    React app HTML is ~7000+ chars.
    """
    try:
        content = await page.content()
        if not content:
            return True
        if len(content) < 1500 and ("Service Unavailable" in content
                                     or "HTTP Error 503" in content):
            return True
        return False
    except Exception:
        return True


async def wait_for_real_content(page, max_seconds: int = 60) -> bool:
    """Wait up to max_seconds for the page to STOP showing the 503 error and
    start showing real HTML. Returns True if real content arrived, False if
    the 503 page is still showing at the end of the wait."""
    import time as _t
    start = _t.monotonic()
    while _t.monotonic() - start < max_seconds:
        await page.wait_for_timeout(5000)
        if not await page_is_503(page):
            return True
    return False


# -----------------------------------------------------------------------------
# Power BI DSR decoder
# -----------------------------------------------------------------------------
# Power BI's DataShape Result (DSR) is a compressed columnar format:
#   - Each row is { "C": [values], "R": <bitmask of repeated-from-previous cols>,
#                   "Ø": <bitmask of null columns> }
#   - C contains only the values that are NOT repeated and NOT null
#   - Schema (on first row) names columns G0..GN with optional DN dictionary refs
#   - ValueDicts D0..DN map dictionary indices to actual string values
# This decoder walks rows in order, reconstructing each row by combining the
# C array with the previous row's values where R bit is set and treating
# columns indicated in Ø as null.
def decode_dsr(ds_block: Dict[str, Any]) -> List[List[Any]]:
    """Return a list of fully-reconstructed rows for a single DS block."""
    ph = ds_block.get("PH", [])
    if not ph:
        return []
    rows = ph[0].get("DM0", [])
    if not rows:
        return []
    # First row carries the schema in "S"
    schema = rows[0].get("S", [])
    if not schema:
        return []
    dicts = ds_block.get("ValueDicts", {}) or {}

    out: List[List[Any]] = []
    last = [None] * len(schema)
    for row in rows:
        cvals = row.get("C", []) or []
        R = row.get("R", 0) or 0
        null_mask = row.get("\u00d8", 0) or row.get("Ø", 0) or 0
        c_idx = 0
        new_row: List[Any] = []
        for col_idx in range(len(schema)):
            bit = 1 << col_idx
            if null_mask & bit:
                new_row.append(None)
            elif R & bit:
                new_row.append(last[col_idx])
            else:
                if c_idx < len(cvals):
                    raw = cvals[c_idx]
                    c_idx += 1
                    sc = schema[col_idx]
                    dn = sc.get("DN")
                    if dn and dn in dicts and isinstance(raw, int):
                        try:
                            new_row.append(dicts[dn][raw])
                        except (IndexError, KeyError):
                            new_row.append(raw)
                    else:
                        new_row.append(raw)
                else:
                    new_row.append(None)
        last = new_row[:]
        out.append(new_row)
    return out


def decode_listing_response(body: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Decode a Power BI listing query response into clean row dicts.

    Looks for the dsr.DS[0] block with the listing-shape columns and returns
    a list of {column_name: value} dicts.
    """
    try:
        data = body["results"][0]["result"]["data"]
        desc = data["descriptor"]
        dsr = data["dsr"]
    except (KeyError, TypeError, IndexError):
        return []

    selects = desc.get("Select", [])
    # Build a mapping from G-index -> friendly column name
    col_names: List[str] = []
    for sel in selects:
        # Prefer the Property name from GroupKeys / SourceRef
        prop = None
        gk = sel.get("GroupKeys", [])
        if gk and isinstance(gk[0], dict):
            src = gk[0].get("Source", {})
            prop = src.get("Property")
        if not prop:
            prop = sel.get("Name", "")
            if "." in prop:
                prop = prop.rsplit(".", 1)[1]
        col_names.append(prop or f"col_{len(col_names)}")

    rows_out: List[Dict[str, Any]] = []
    for ds_block in dsr.get("DS", []):
        for row in decode_dsr(ds_block):
            rec = {}
            for i, val in enumerate(row):
                if i < len(col_names):
                    rec[col_names[i]] = val
            rows_out.append(rec)
    return rows_out


def is_listing_event(ev: Dict[str, Any]) -> bool:
    """Heuristic: does this captured wabi event look like a listing query?

    Listing queries select 7-10 columns including ORG_NAME_ENU and CR_NUM/CP_NUM.
    """
    if "pbidedicated" not in ev.get("url", ""):
        return False
    if ev.get("method") != "POST":
        return False
    body = ev.get("response_body")
    if not isinstance(body, dict):
        return False
    try:
        data = body["results"][0]["result"]["data"]
        desc = data["descriptor"]
        selects = desc.get("Select", [])
        # Look for the signature listing columns
        names = [s.get("Name", "") for s in selects]
        has_org_name = any("ORG_NAME_ENU" in n for n in names)
        has_cr_or_cp = any(("CR_NUM" in n) or ("CP_NUM" in n) for n in names)
        return has_org_name and has_cr_or_cp and len(selects) >= 6
    except (KeyError, IndexError, TypeError):
        return False


# Listing field schema — what we expose in the final JSON for each company
LISTING_FIELDS_MAP = {
    "CR_NUM": "cr_number",
    "CP_NUM": "cp_number",
    "ORG_NAME_ENU": "organization_name",
    "X_CRN_STATUS": "cr_status",
    "CR_EXPIRY_DATE": "cr_expiry_date",
    "LEGAL_FORM_EN": "legal_form",
    "LangEN": "cp_status",
    "CP_EXPIRY_DATE": "cp_expiry_date",
    "SME_RANKING": "classification",
    "CLASSIFICATION_YEAR": "classification_year",
}


def normalize_listing_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Translate raw DSR column names to the friendly schema we want to emit."""
    out: Dict[str, Any] = {"entity_type": "company"}
    for raw_key, friendly_key in LISTING_FIELDS_MAP.items():
        if raw_key in row:
            out[friendly_key] = row[raw_key]
    # Convert epoch-millis dates to ISO format if present
    for date_key in ("cr_expiry_date", "cp_expiry_date"):
        v = out.get(date_key)
        if isinstance(v, (int, float)):
            try:
                out[date_key] = datetime.fromtimestamp(v / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            except (ValueError, OSError):
                pass
    return out


# -----------------------------------------------------------------------------
# Diagnose mode
# -----------------------------------------------------------------------------
async def run_diagnose() -> int:
    """Capture comprehensive state evidence from the live MOCI site.

    Captures:
      - Initial navigation HTTP status (catches 503s explicitly)
      - All network responses (not just wabi.powerbi.com) with status codes
      - Full-page screenshot (so we can see what loaded visually)
      - Page HTML at the end of the wait period
      - The full Power BI wabi traffic (if any) for parser tuning

    Writes:
      - state/diagnostic-summary.txt    (human-readable summary)
      - state/diagnostic-wabi.json      (Power BI traffic — empty if site is down)
      - state/diagnostic-all-requests.json  (every URL hit + status code)
      - state/diagnostic-page.html      (the rendered HTML at end-of-wait)
      - state/diagnostic-screenshot.png (visual proof of what loaded)
    """
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    out_summary = STATE_DIR / "diagnostic-summary.txt"
    out_wabi = STATE_DIR / "diagnostic-wabi.json"
    out_all_req = STATE_DIR / "diagnostic-all-requests.json"
    out_html = STATE_DIR / "diagnostic-page.html"
    out_png = STATE_DIR / "diagnostic-screenshot.png"

    summary_lines: List[str] = []
    all_requests: List[Dict[str, Any]] = []

    def emit(s: str = "") -> None:
        log(s)
        summary_lines.append(s)

    emit("=" * 70)
    emit("MOCI DIAGNOSTIC v2")
    emit("=" * 70)
    emit(f"Mode: diagnose (capture, don't scrape)")
    emit(f"Headless: {HEADLESS}")
    emit(f"Target: {BASE_URL}")
    emit("")

    capture = WabiCapture()
    nav_response_status = None
    nav_error = None

    async with async_playwright() as p:
        emit("Launching Chromium...")
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
            ignore_https_errors=True,
        )
        page = await context.new_page()
        capture.attach(page)

        # Capture every response (not just wabi)
        def on_resp(resp):
            all_requests.append({
                "url": resp.url,
                "status": resp.status,
                "method": resp.request.method,
                "content_type": resp.headers.get("content-type", ""),
            })
        page.on("response", on_resp)

        # Listen for failed requests too
        page.on("requestfailed", lambda req: emit(
            f"  REQUEST FAILED: {req.method} {req.url} — {req.failure}"
        ))

        # MOCI is slow and flaky. Use long timeouts + patient polling
        # rather than fixed waits.
        MAX_WAIT_FOR_FIRST_WABI = 120  # seconds to wait for any Power BI request
        EXTRA_WAIT_AFTER_FIRST = 45    # additional seconds for follow-up queries
        NAV_TIMEOUT = 120000           # 120 sec for the page itself to load

        async def wait_for_wabi(max_seconds: int, label: str) -> int:
            """Poll every 5 sec until we see wabi traffic OR max_seconds elapses.
            Returns total wabi-events count at the end."""
            initial = len(capture.events)
            start = time.monotonic()
            while time.monotonic() - start < max_seconds:
                await page.wait_for_timeout(5000)
                seen = len(capture.events) - initial
                elapsed = int(time.monotonic() - start)
                emit(f"  [{label}] +{elapsed:3d}s  wabi events: {len(capture.events)} (+{seen} new)")
                if seen > 0:
                    return len(capture.events)
            return len(capture.events)

        # Step 1: Navigate to /en/ (the only URL that actually exists -
        # the app is a SPA where the URL never changes regardless of which
        # section the user is on). Retry on 503 since the backend is flaky.
        NAV_ATTEMPTS = 4
        NAV_RETRY_WAIT = 10
        for attempt in range(1, NAV_ATTEMPTS + 1):
            emit(f"Navigating to {BASE_URL} (attempt {attempt}/{NAV_ATTEMPTS})...")
            try:
                resp = await page.goto(
                    BASE_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT
                )
                if resp is not None:
                    nav_response_status = resp.status
                    emit(f"  Navigation HTTP status: {resp.status}")
                    if resp.status < 400:
                        break
                    emit(f"  Got {resp.status}, waiting {NAV_RETRY_WAIT}s before retry...")
                    await page.wait_for_timeout(NAV_RETRY_WAIT * 1000)
                else:
                    emit("  Navigation returned no response object")
                    break
            except Exception as e:
                nav_error = str(e)
                emit(f"  goto failed: {e}")
                await page.wait_for_timeout(NAV_RETRY_WAIT * 1000)

        if nav_response_status is None or nav_response_status >= 400:
            emit("")
            emit("Site is still 503 after retries. Capturing state and exiting.")
        else:
            # Step 2: Wait for the React app to render. MOCI is heavy and
            # can take 20-60s before interactive controls appear.
            emit("")
            emit("Waiting up to 60s for the React app to render (networkidle)...")
            try:
                await page.wait_for_load_state("networkidle", timeout=60000)
                emit("  networkidle reached")
            except Exception as e:
                emit(f"  networkidle wait timed out: {e}")

            # Step 3: Click into Search Organizations via the Power BI
            # iframe. The button is rendered INSIDE the iframe (cross-
            # origin app.powerbi.com), not in the React parent.
            #
            # Wait for the iframe element to be in the DOM, then use
            # frame_locator to reach across the cross-origin boundary.
            emit("Looking for the Power BI iframe...")
            iframe_selector = "iframe[src*='powerbi.com']"
            try:
                await page.wait_for_selector(iframe_selector, timeout=30000)
                emit("  Power BI iframe found in DOM.")
            except Exception as e:
                emit(f"  iframe not found: {e}")

            pbi_frame = page.frame_locator(iframe_selector)

            clicked = False
            # Search inside the iframe with multiple selector strategies.
            for sel in [
                "text='Search for Organizations'",
                "button:has-text('Search for Organizations')",
                "a:has-text('Search for Organizations')",
                "[role='button']:has-text('Search for Organizations')",
                "*:has-text('Search for Organizations'):not(:has(*))",
            ]:
                try:
                    el = pbi_frame.locator(sel).first
                    # Wait up to 30s for it to appear (Power BI is slow)
                    await el.wait_for(state="visible", timeout=30000)
                    emit(f"Found 'Search for Organizations' inside iframe via: {sel}")
                    await el.click(timeout=10000)
                    emit("  Clicked. Waiting 5s for Power BI to re-render...")
                    await page.wait_for_timeout(5000)
                    clicked = True
                    break
                except Exception as e:
                    emit(f"  selector {sel} not usable: {type(e).__name__}")

            if not clicked:
                emit("WARNING: Could not click Search for Organizations.")
                emit("         Will still poll for whatever Power BI loaded")
                emit("         on the dashboard view.")

        # Step 4: Patient wait for Power BI to wake up.
        emit("")
        emit(f"Polling up to {MAX_WAIT_FOR_FIRST_WABI}s for first Power BI request...")
        total_after_first = await wait_for_wabi(MAX_WAIT_FOR_FIRST_WABI, "wait")

        # Step 5: Once we see one wabi request, give it more time for follow-ups.
        if total_after_first > 0:
            emit("")
            emit(f"First Power BI request seen. Waiting {EXTRA_WAIT_AFTER_FIRST}s "
                 "more to gather follow-up queries...")
            await wait_for_wabi(EXTRA_WAIT_AFTER_FIRST, "more")
        else:
            emit("")
            emit("No Power BI traffic after the long wait - capturing state anyway.")

        # Capture page HTML + screenshot for visual proof
        try:
            html_now = await page.content()
            out_html.write_text(html_now, encoding="utf-8")
            emit(f"Saved page HTML ({len(html_now)} chars) -> {out_html.name}")
        except Exception as e:
            emit(f"  HTML capture failed: {e}")

        try:
            await page.screenshot(path=str(out_png), full_page=False)
            emit(f"Saved screenshot -> {out_png.name}")
        except Exception as e:
            emit(f"  Screenshot failed: {e}")

        emit("")
        emit("=" * 70)
        emit("NETWORK SUMMARY")
        emit("=" * 70)
        emit(f"Total responses captured (all hosts): {len(all_requests)}")
        emit(f"Power BI (wabi.powerbi.com) responses: {len(capture.events)}")
        emit("")

        # Aggregate by host
        from collections import Counter
        by_host: Counter = Counter()
        by_status: Counter = Counter()
        for r in all_requests:
            try:
                host = r["url"].split("/")[2]
            except IndexError:
                host = "<unknown>"
            by_host[host] += 1
            by_status[r["status"]] += 1
        emit("Hosts contacted:")
        for host, count in by_host.most_common(20):
            emit(f"  {count:4d}  {host}")
        emit("")
        emit("Status codes:")
        for st, count in sorted(by_status.items()):
            emit(f"  {st}: {count}")
        emit("")

        # Show the top 10 status-error responses
        errors = [r for r in all_requests if r["status"] >= 400]
        if errors:
            emit(f"Error responses ({len(errors)} total, first 10 shown):")
            for r in errors[:10]:
                emit(f"  {r['status']} {r['method']} {r['url'][:120]}")

        # Show the first few wabi events (if any)
        if capture.events:
            emit("")
            emit(f"Power BI (wabi.powerbi.com) events: {len(capture.events)}")
            for i, ev in enumerate(capture.events[:5]):
                emit(f"  [{i+1}] {ev['method']} {ev['url'][:120]}  status={ev['status']}")

        await context.close()
        await browser.close()

    # Persist everything
    out_wabi.write_text(
        json.dumps(capture.events, indent=2, ensure_ascii=False)[:5_000_000]
    , encoding="utf-8")
    out_all_req.write_text(
        json.dumps(all_requests, indent=2, ensure_ascii=False)
    , encoding="utf-8")
    out_summary.write_text(chr(10).join(summary_lines), encoding="utf-8")

    # Final verdict
    emit("")
    emit("=" * 70)
    emit("VERDICT")
    emit("=" * 70)
    if nav_response_status is None:
        emit("❌ Navigation never completed — likely DNS/network issue or hard error")
    elif nav_response_status >= 500:
        emit(f"❌ MOCI returned {nav_response_status} — site is DOWN, retry later")
    elif nav_response_status >= 400:
        emit(f"❌ MOCI returned {nav_response_status} — check the URL/route")
    elif len(capture.events) == 0:
        emit("⚠️  Page loaded BUT no Power BI traffic was captured")
        emit("    Possible causes:")
        emit("      - Power BI iframe failed to initialize (try opening")
        emit("        https://businessmap.moci.gov.qa in Chrome to confirm)")
        emit("      - The page redirected somewhere unexpected")
        emit("      - Power BI is still bootstrapping after 35 seconds")
        emit(f"    See {out_png.name} for a visual of what loaded.")
    else:
        emit(f"✅ Captured {len(capture.events)} Power BI responses — send")
        emit(f"   diagnostic-wabi.json + diagnostic-summary.txt to Claude.")
    emit("")
    emit("Send these files to Claude regardless of verdict:")
    emit("  - state/diagnostic-summary.txt")
    emit("  - state/diagnostic-wabi.json")
    emit("  - state/diagnostic-all-requests.json")
    emit("  - state/diagnostic-page.html")
    emit("  - state/diagnostic-screenshot.png")

    out_summary.write_text(chr(10).join(summary_lines), encoding="utf-8")
    return 0


# -----------------------------------------------------------------------------
# Manual capture mode — user drives, scraper just watches
# -----------------------------------------------------------------------------
async def run_manual_capture() -> int:
    """Open a visible browser, let the user navigate + scroll manually, capture
    every Power BI listing response that lands. Saves to JSON when the user
    presses Enter in the Terminal."""
    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    started_at = now_iso()
    capture = WabiCapture()
    seen_companies: Dict[str, Dict[str, Any]] = {}

    async with async_playwright() as p:
        log("Opening visible Chrome window...")
        browser = await p.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
            locale="en-US",
            timezone_id="Asia/Qatar",
        )
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            window.chrome = { runtime: {} };
        """)
        page = await context.new_page()
        capture.attach(page)

        # Try to open the MOCI page; if it 503s, leave it for the user to refresh.
        for target in [
            "https://businessmap.moci.gov.qa/en",
            "https://businessmap.moci.gov.qa/",
        ]:
            try:
                log(f"Trying {target}...")
                resp = await page.goto(target, wait_until="domcontentloaded", timeout=60000)
                if resp:
                    log(f"  HTTP {resp.status}")
                    if resp.status < 400:
                        break
            except Exception as e:
                log(f"  failed: {e}")

        # Print the user-facing instructions
        log("")
        log("=" * 78)
        log(" YOUR TURN — please follow these steps in the Chrome window:")
        log("=" * 78)
        log("")
        log("STEP 1.  If the page shows 'Service Unavailable' / 503 error,")
        log("         manually retype the URL in Chrome's address bar:")
        log("            https://businessmap.moci.gov.qa/en")
        log("         and press Enter. Retry until the dashboard loads")
        log("         (shows 'Total Organizations: 213199').")
        log("")
        log("STEP 2.  Click the red 'Search for Organizations' button.")
        log("         The company list table will appear.")
        log("")
        log("STEP 3.  Scroll the company table all the way to the bottom.")
        log("         IMPORTANT: scroll INSIDE the table itself (use its")
        log("         scrollbar), not on the page outside it.")
        log("         Don't click on any company row — that opens a")
        log("         detail page and breaks the flow.")
        log("")
        log("STEP 4.  Also scroll the 'Professional License' table further")
        log("         down on the page if you want those records too.")
        log("")
        log("STEP 5.  When the progress counter below stops growing, press")
        log("         ENTER in THIS TERMINAL WINDOW (not the browser).")
        log("         The scraper will save everything and finish.")
        log("")
        log("Live capture count will print here every 10 seconds. Data is")
        log("auto-saved to scans/moci_companies_partial.json continuously.")
        log("=" * 78)
        log("")

        # Wait for user Enter while showing progress every 10 seconds
        loop = asyncio.get_event_loop()
        input_future = loop.run_in_executor(
            None, input, ">>> Press ENTER here when you've finished scrolling: "
        )

        last_count = 0
        check_n = 0
        consume_idx = 0
        while not input_future.done():
            await asyncio.sleep(10)
            check_n += 1
            # Decode any new listing events
            for i in range(consume_idx, len(capture.events)):
                ev = capture.events[i]
                if not is_listing_event(ev):
                    continue
                try:
                    rows = decode_listing_response(ev["response_body"])
                except Exception:
                    continue
                for row in rows:
                    rec = normalize_listing_row(row)
                    key = rec.get("cr_number") or rec.get("cp_number")
                    if not key:
                        continue
                    if key in seen_companies:
                        for k, v in rec.items():
                            if v is not None and seen_companies[key].get(k) is None:
                                seen_companies[key][k] = v
                    else:
                        seen_companies[key] = rec
            consume_idx = len(capture.events)

            current = len(seen_companies)
            if current > last_count:
                log(f"  ... captured {current:,} unique companies "
                    f"({len(capture.events)} wabi events). Keep scrolling!")
                # Partial save so a crash doesn't lose anything
                try:
                    partial_path = SCANS_DIR / "moci_companies_partial.json"
                    partial_path.write_text(json.dumps({
                        "source": SOURCE_NAME,
                        "scan_started_at": started_at,
                        "scan_status": "in_progress (manual)",
                        "total_count": current,
                        "companies": list(seen_companies.values()),
                    }, indent=2, ensure_ascii=False))
                except Exception as e:
                    log(f"  partial save failed: {e}")
            else:
                log(f"  ... no new rows in last 10s ({current:,} total). "
                    f"If you're done, press ENTER in this Terminal.")
            last_count = current

        await input_future
        log("")
        log("Saving final output...")
        await context.close()
        await browser.close()

    companies = list(seen_companies.values())
    if ACTIVE_ONLY:
        before = len(companies)
        companies = [c for c in companies if (c.get("cr_status") == "Active")
                                          or (c.get("cp_status") == "Active")]
        log(f"Filtered to Active-only: {before:,} -> {len(companies):,}")

    now = datetime.now()
    fname = f"moci_companies_{now.strftime('%Y-%m-%d_%H%M%S')}.json"
    fpath = SCANS_DIR / fname
    payload = {
        "source": SOURCE_NAME,
        "source_url": BASE_URL,
        "scraper": "scraper.py",
        "scraper_version": SCRAPER_VERSION,
        "scan_started_at": started_at,
        "scan_completed_at": now_iso(),
        "scan_mode": "manual",
        "active_only": ACTIVE_ONLY,
        "total_count": len(companies),
        "companies": companies,
    }
    fpath.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    LATEST_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        (SCANS_DIR / "moci_companies_partial.json").unlink(missing_ok=True)
    except Exception:
        pass
    log(f"Saved {len(companies):,} companies to {fpath.name}")
    log(f"Also updated {LATEST_FILE.name}")
    return 0


# -----------------------------------------------------------------------------
# Production scrape mode
# -----------------------------------------------------------------------------
async def run_production() -> int:
    """Stage 1: capture all listing-page data via UI-driven scroll, decode,
    and write to scans/.

    Approach:
      1. Launch Chromium, navigate to MOCI, click Search for Organizations
         to trigger the Power BI report to load the company-listing tables.
      2. Attach a WabiCapture network listener that records every
         pbidedicated.windows.net POST + response.
      3. Programmatically scroll the Power BI iframe to trigger Power BI's
         internal "load more rows" queries until no new rows arrive for
         N consecutive scroll-rounds.
      4. Decode every captured listing response via decode_listing_response,
         dedup by CR_NUM (falling back to CP_NUM), filter to Active if
         ACTIVE_ONLY is set, and save.

    Stage 2 (detail-page enrichment via batched WHERE CR_NUM IN queries) is
    not implemented yet — once Stage 1 is confirmed working, the detail
    fetch can be layered on top.
    """
    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    capture = WabiCapture()
    started_at = now_iso()

    # Scroll heuristics
    MAX_SCROLL_ROUNDS = 1000
    QUIESCENT_ROUNDS_TO_STOP = 10
    SCROLL_INTERVAL_SEC = 2.0

    seen_companies: Dict[str, Dict[str, Any]] = {}  # key = CR_NUM or CP_NUM

    def harvest_capture() -> int:
        """Decode any new listing events in capture.events into seen_companies.
        Returns total unique companies known so far."""
        for ev in capture.events:
            if ev.get("_consumed"):
                continue
            ev["_consumed"] = True
            if not is_listing_event(ev):
                continue
            try:
                rows = decode_listing_response(ev["response_body"])
            except Exception as e:
                log(f"  decode error on listing event: {e}")
                continue
            for row in rows:
                rec = normalize_listing_row(row)
                key = rec.get("cr_number") or rec.get("cp_number")
                if not key:
                    continue
                # Merge — later occurrences overwrite earlier (Power BI may
                # send the same company in multiple visuals with extra fields)
                if key in seen_companies:
                    existing = seen_companies[key]
                    for k, v in rec.items():
                        if v is not None and existing.get(k) is None:
                            existing[k] = v
                else:
                    seen_companies[key] = rec
        return len(seen_companies)

    async with async_playwright() as p:
        log("Launching Chromium...")
        # Use Chromium's "new headless" mode which is harder to detect than
        # the legacy headless mode. Some launch args also reduce automation
        # signals that WAFs key on.
        browser = await p.chromium.launch(
            headless=HEADLESS,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-features=IsolateOrigins,site-per-process",
            ] if HEADLESS else [],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1440, "height": 900},
            locale="en-US",
            timezone_id="Asia/Qatar",
        )

        # Stealth: hide common signals that WAFs use to detect headless
        # Chromium. The big three are navigator.webdriver === true, an
        # empty plugins list, and missing chrome.runtime. Hiding these
        # often gets us past Cloudflare/Akamai/Azure WAFs.
        await context.add_init_script("""
            // Hide webdriver flag — the most common detection signal.
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            // Real browsers report plugins; headless has none.
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                ]
            });
            // Languages should match the UA + locale.
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            // chrome.runtime is present in real Chrome but absent in headless.
            window.chrome = { runtime: {} };
            // Make Notification.permission look like real browsers default.
            const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
            if (originalQuery) {
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications'
                        ? Promise.resolve({ state: Notification.permission })
                        : originalQuery(parameters)
                );
            }
        """)

        page = await context.new_page()
        capture.attach(page)

        # Step 1: Patient dual-strategy navigation.
        # MOCI's backend flickers 503 for minutes. Each retry round tries TWO
        # paths: (a) direct to businessmap.moci.gov.qa, (b) the user-confirmed
        # workaround — load the parent ministry site at www.moci.gov.qa and
        # click the "Qatar Business Map" top-menu link, which often succeeds
        # when the direct URL returns 503.
        NAV_ATTEMPTS = 12
        NAV_RETRY_WAIT_SEC = 60
        NAV_TIMEOUT = 120000
        PARENT_URL = "https://www.moci.gov.qa/en/"
        nav_status = None

        async def try_direct() -> Optional[int]:
            try:
                resp = await page.goto(
                    BASE_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT
                )
                if resp is None:
                    return None
                status = resp.status
                if status < 400:
                    # HTTP says success but MOCI's WAF sometimes returns
                    # 200 with the same 503 body. Verify with content check.
                    await page.wait_for_timeout(2000)
                    if await page_is_503(page):
                        log("    direct: HTTP 200 but content is 503 page; treating as failure")
                        return 503
                return status
            except Exception as e:
                log(f"    direct goto raised: {type(e).__name__}: {e}")
                return None

        async def try_via_parent() -> Optional[int]:
            try:
                resp = await page.goto(
                    PARENT_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT
                )
                if resp is None or resp.status >= 400:
                    return resp.status if resp else None
                log(f"    parent loaded ({resp.status}). Hunting for the Qatar Business Map link...")
                for sel in [
                    "a:has-text(\"Qatar Business Map\")",
                    "a[href*=\"businessmap.moci.gov.qa\"]",
                    "text=Qatar Business Map",
                ]:
                    try:
                        el = page.locator(sel).first
                        await el.wait_for(state="visible", timeout=8000)
                        log(f"    clicking link via {sel}")
                        # The link may open in a new tab via target=_blank
                        try:
                            async with page.context.expect_page(timeout=15000) as new_page_info:
                                await el.click()
                            new_page = await new_page_info.value
                            log(f"    link opened new tab: {new_page.url}")
                            # Replace `page` for the rest of the run.
                            await new_page.wait_for_load_state("domcontentloaded", timeout=NAV_TIMEOUT)
                            if "businessmap.moci.gov.qa" in (new_page.url or ""):
                                # Re-attach capture to the new page
                                capture.attach(new_page)
                                return 200, new_page
                        except Exception:
                            # Not a new-tab link — same-page navigation
                            try:
                                async with page.expect_navigation(timeout=20000):
                                    await el.click()
                            except Exception:
                                await el.click()
                                await page.wait_for_timeout(5000)
                            if "businessmap.moci.gov.qa" in (page.url or ""):
                                return 200
                            log(f"    after click, page url is: {page.url}")
                    except Exception as e:
                        log(f"    selector {sel} not usable: {type(e).__name__}")
                return None
            except Exception as e:
                log(f"    parent goto raised: {type(e).__name__}: {e}")
                return None

        for attempt in range(1, NAV_ATTEMPTS + 1):
            log(f"Navigation attempt {attempt}/{NAV_ATTEMPTS}: trying direct...")
            status = await try_direct()
            if status is not None and status < 400:
                nav_status = status
                log(f"  Direct succeeded (HTTP {status}).")
                break
            log(f"  Direct returned {status}. Trying via parent site...")
            result = await try_via_parent()
            # try_via_parent may return: int status, None, or (200, new_page)
            switched = False
            if isinstance(result, tuple):
                nav_status, new_page = result
                page = new_page
                switched = True
                log(f"  Parent-site workaround succeeded (new tab).")
            elif isinstance(result, int) and result < 400:
                nav_status = result
                switched = True
                log(f"  Parent-site workaround succeeded (HTTP {result}).")

            if switched:
                # The parent click delivered us to a new tab. DO NOT page.goto
                # anywhere — that defeats the workaround because page.goto
                # bypasses the click context and hits the WAF as a fresh
                # request. Just wait for the click's natural landing page to
                # render real content. If it stays as the 503 stub for 90s,
                # retry the whole cycle.
                current_url = page.url or ""
                log(f"  Landed at {current_url}. Waiting up to 90s for content to render...")
                got_content = await wait_for_real_content(page, max_seconds=90)
                if got_content:
                    content_len = len((await page.content()) or "")
                    log(f"  Page rendered with real content ({content_len} chars HTML).")
                    log(f"  Current URL: {page.url}")
                    nav_status = 200
                else:
                    content_len = len((await page.content()) or "")
                    log(f"  After 90s the click-landing is STILL the 503 page (HTML {content_len} chars).")
                    log("  Will retry the whole nav cycle.")
                    nav_status = None
                    switched = False
                if switched:
                    break

            log(f"  Both paths failed this round (parent returned {result}).")
            if attempt < NAV_ATTEMPTS:
                log(f"  Waiting {NAV_RETRY_WAIT_SEC}s before next attempt... (total budget {NAV_ATTEMPTS * NAV_RETRY_WAIT_SEC // 60} min)")
                await page.wait_for_timeout(NAV_RETRY_WAIT_SEC * 1000)

        if nav_status is None or nav_status >= 400:
            log(f"FAILED: tried {NAV_ATTEMPTS} rounds of direct + parent-site routes "
                f"(~{NAV_ATTEMPTS * NAV_RETRY_WAIT_SEC // 60} min of patient retrying).")
            log("")
            log("Possible causes:")
            log("  1. MOCI's WAF is in an aggressive window — try again in 1-2 hours.")
            log("  2. WAF is flagging headless Chromium specifically. Workaround:")
            log("     open schedule.config in TextEdit, set headless=false, save,")
            log("     then double-click Install Daily Auto-Scan.command to apply.")
            log("     A visible browser usually bypasses headless detection.")
            log("  3. Your IP may have been rate-limited from this run's many retries.")
            log("     Wait 30+ minutes before retrying.")
            await context.close(); await browser.close()
            return 1

        # Step 2: Wait for React to settle
        log("Waiting for React shell to settle (networkidle)...")
        try:
            await page.wait_for_load_state("networkidle", timeout=60000)
        except Exception:
            log("  networkidle timeout (continuing anyway)")

        # Step 3: Click "Search for Organizations" inside the iframe
        log("Clicking Search for Organizations inside the Power BI iframe...")
        iframe_selector = "iframe[src*='powerbi.com']"
        try:
            await page.wait_for_selector(iframe_selector, timeout=90000)
        except Exception as e:
            log(f"  iframe not found after 90s: {e}")
            log(f"  Current page URL: {page.url}")
            log(f"  HTML length: {len(await page.content())}")
            await context.close(); await browser.close()
            return 1

        pbi_frame = page.frame_locator(iframe_selector)
        clicked = False
        for sel in [
            "text='Search for Organizations'",
            "button:has-text('Search for Organizations')",
            "a:has-text('Search for Organizations')",
            "text='البحث عن المنظمات'",            # Arabic fallback
            "a:has-text('البحث عن المنظمات')",
        ]:
            try:
                el = pbi_frame.locator(sel).first
                await el.wait_for(state="visible", timeout=60000)
                await el.click(timeout=10000)
                clicked = True
                log(f"  Clicked via: {sel}")
                break
            except Exception as e:
                log(f"  selector {sel} not usable: {type(e).__name__}")
        if not clicked:
            log("FAILED: could not click 'Search for Organizations'. Aborting.")
            await context.close(); await browser.close()
            return 1

        # Step 4: Wait for initial table data
        log("Waiting for initial table data to load (up to 60s)...")
        for _ in range(12):
            await page.wait_for_timeout(5000)
            total = harvest_capture()
            log(f"  initial wait... {total} companies decoded so far, "
                f"{len(capture.events)} wabi events captured")
            if total > 0:
                break

        # Step 5: Scroll loop — drive Power BI's infinite scroll
        log("")
        log("Starting scroll loop to fetch all rows...")
        last_total = harvest_capture()
        quiescent = 0
        deadline = time.monotonic() + MAX_RUN_MINUTES * 60

        # ---- Real mouse-wheel scrolling (the only thing that actually works) ----
        # Power BI's auth (cookies + in-memory JS state) is not replayable from
        # outside the browser context. So we don't try. Instead we drive the
        # report exactly like a real user does — position the mouse over the
        # company table and fire wheel events. Each scroll triggers Power BI
        # to load the next batch of ~500 rows, which WabiCapture records and
        # we decode via harvest_capture().
        #
        # In headless mode mouse wheel events don't reach the Power BI visual.
        # In VISIBLE mode (headless=false in schedule.config) they do.

        # Find the Power BI iframe's position on the parent page
        try:
            iframe_el = await page.query_selector("iframe[src*='powerbi.com']")
            iframe_box = await iframe_el.bounding_box() if iframe_el else None
        except Exception as e:
            log(f"  iframe bounding_box failed: {e}")
            iframe_box = None

        # Find the company table's position INSIDE the iframe via JS, then
        # combine with iframe position to get viewport-absolute coords.
        table_view_x, table_view_y = 720, 600  # fallback
        try:
            pbi_frames = [f for f in page.frames if "powerbi.com" in (f.url or "")]
            for fr in pbi_frames:
                try:
                    info = await fr.evaluate(
                        """() => {
                            const sels = [
                                '[role=\"grid\"]',
                                '[class*=\"pivotTable\"]',
                                '[class*=\"tableEx\"]',
                                '[class*=\"scrollContent\"]',
                                '[class*=\"scrollable\"]',
                                '[class*=\"grid\"]',
                            ];
                            let best = null;
                            let bestArea = 0;
                            for (const sel of sels) {
                                for (const el of document.querySelectorAll(sel)) {
                                    const r = el.getBoundingClientRect();
                                    const area = r.width * r.height;
                                    if (r.height > 150 && area > bestArea) {
                                        best = { x: r.left, y: r.top, w: r.width, h: r.height,
                                                 sel: sel,
                                                 sh: el.scrollHeight, ch: el.clientHeight };
                                        bestArea = area;
                                    }
                                }
                            }
                            return best;
                        }"""
                    )
                    if info:
                        log(f"  Found scrollable element inside {fr.url[:80]}:")
                        log(f"    selector={info['sel']}  size={info['w']:.0f}x{info['h']:.0f}")
                        log(f"    scroll: {info['ch']:.0f} visible of {info['sh']:.0f} total")
                        if iframe_box:
                            table_view_x = iframe_box["x"] + info["x"] + info["w"] / 2
                            table_view_y = iframe_box["y"] + info["y"] + info["h"] / 2
                            break
                except Exception as e:
                    log(f"    frame inspect failed: {e}")
        except Exception as e:
            log(f"  table coord discovery failed: {e}")

        log(f"Mouse-wheel scroll loop starting at viewport ({table_view_x:.0f}, {table_view_y:.0f})...")

        # Save a debug screenshot so we can see what the page actually looks like
        try:
            debug_png = SCANS_DIR / f"debug-before-scroll-{datetime.now().strftime('%H%M%S')}.png"
            await page.screenshot(path=str(debug_png), full_page=False)
            log(f"  Saved debug screenshot to {debug_png.name}")
        except Exception as e:
            log(f"  Screenshot failed: {e}")

        SCROLL_DELTA = 1500
        SCROLLS_PER_ROUND = 6
        ROUND_WAIT_SEC = 2.5
        QUIESCENT_THRESHOLD = 25
        MAX_ROUNDS = 2000

        # Hover the mouse over the table — but DO NOT click, because clicking
        # on a row in Power BI's table navigates to that company's detail
        # page, breaking the scroll-to-load-more flow.
        try:
            await page.mouse.move(table_view_x, table_view_y)
            await page.wait_for_timeout(500)
        except Exception as e:
            log(f"  Initial mouse setup failed: {e}")

        last_total = harvest_capture()
        log(f"  starting total: {last_total:,}")
        quiescent = 0
        rounds_done = 0

        for round_n in range(1, MAX_ROUNDS + 1):
            if time.monotonic() > deadline:
                log(f"  Time cap reached at scroll round {round_n}")
                break
            rounds_done = round_n
            # Move mouse to scroll target then fire wheel events
            try:
                await page.mouse.move(table_view_x, table_view_y)
                for _ in range(SCROLLS_PER_ROUND):
                    await page.mouse.wheel(0, SCROLL_DELTA)
                    await page.wait_for_timeout(120)
            except Exception as e:
                log(f"  mouse.wheel failed at round {round_n}: {e}")
                break
            await page.wait_for_timeout(int(ROUND_WAIT_SEC * 1000))
            total = harvest_capture()
            grew = total - last_total
            if grew > 0:
                quiescent = 0
                log(f"  [round {round_n}] +{grew:,} companies (total {total:,})")
                last_total = total
                # Save partial progress every 5 rounds so a crash doesn't
                # destroy the data we've collected.
                if round_n % 5 == 0:
                    try:
                        partial_path = SCANS_DIR / "moci_companies_partial.json"
                        partial_payload = {
                            "source": SOURCE_NAME,
                            "source_url": BASE_URL,
                            "scraper": "scraper.py",
                            "scraper_version": SCRAPER_VERSION,
                            "scan_started_at": started_at,
                            "scan_status": "in_progress",
                            "rounds_completed": round_n,
                            "total_count": len(seen_companies),
                            "companies": list(seen_companies.values()),
                        }
                        partial_path.write_text(
                            json.dumps(partial_payload, indent=2, ensure_ascii=False)
                        , encoding="utf-8")
                    except Exception as save_err:
                        log(f"  partial save failed: {save_err}")
            else:
                quiescent += 1
                if quiescent % 5 == 0:
                    log(f"  [round {round_n}] no growth ({total:,} total, {quiescent}/{QUIESCENT_THRESHOLD} quiescent)")
                if quiescent >= QUIESCENT_THRESHOLD:
                    log(f"  Plateau reached after {quiescent} quiescent rounds. Assuming all rows loaded.")
                    break

        final_total = harvest_capture()
        log("")
        log(f"Scroll complete after {rounds_done} rounds. {final_total:,} unique companies captured.")

        # Clean up partial file — the final JSON file is written below
        try:
            (SCANS_DIR / "moci_companies_partial.json").unlink(missing_ok=True)
        except Exception:
            pass
        log("")
        log(f"Scroll loop complete. {final_total:,} unique companies captured.")

        await context.close()
        await browser.close()

    companies = list(seen_companies.values())
    if ACTIVE_ONLY:
        before = len(companies)
        companies = [c for c in companies if (c.get("cr_status") == "Active")
                                          or (c.get("cp_status") == "Active")]
        log(f"Filtered to Active-only: {before:,} -> {len(companies):,}")

    # Write output
    now = datetime.now()
    fname = f"moci_companies_{now.strftime('%Y-%m-%d_%H%M%S')}.json"
    fpath = SCANS_DIR / fname
    payload = {
        "source": SOURCE_NAME,
        "source_url": BASE_URL,
        "scraper": "scraper.py",
        "scraper_version": SCRAPER_VERSION,
        "scan_started_at": started_at,
        "scan_completed_at": now_iso(),
        "active_only": ACTIVE_ONLY,
        "include_professional_license": INCLUDE_PRO_LICENSE,
        "fetch_details": False,  # Stage 1 does not fetch details yet
        "total_count": len(companies),
        "companies": companies,
    }
    fpath.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    LATEST_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"Wrote {len(companies):,} companies to {fpath.name}")
    log(f"Also updated {LATEST_FILE.name}")
    return 0


# -----------------------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------------------
def main() -> int:
    log(f"MOCI Scraper v{SCRAPER_VERSION} starting (mode={MODE}, headless={HEADLESS})")
    log(f"  active_only={ACTIVE_ONLY}  include_professional_license={INCLUDE_PRO_LICENSE}")
    log(f"  fetch_details={FETCH_DETAILS}  scroll_pause={SCROLL_PAUSE}s  detail_pause={DETAIL_PAUSE}s")
    log(f"  max_run_minutes={MAX_RUN_MINUTES}")

    if not acquire_lock():
        return 0

    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    if MODE == "diagnose":
        return asyncio.run(run_diagnose())
    elif MODE == "production":
        if MANUAL_MODE:
            return asyncio.run(run_manual_capture())
        return asyncio.run(run_production())
    else:
        log(f"Unknown SCRAPE_MODE={MODE!r}; valid values are 'diagnose' or 'production'.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
