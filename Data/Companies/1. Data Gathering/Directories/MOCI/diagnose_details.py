#!/usr/bin/env python3
"""
MOCI Stage-2 — DETAIL QUERY DIAGNOSE (live capture, run once).
==============================================================
Proves Stage 2 on REAL data before we build the production loop — the same
diagnose-first discipline that made Stage 1 correct (Bell's 100% bar).

What it does, with your help (visible Chrome, ~1 minute):
  1. Loads a few known CR numbers from the latest Stage-1 scan.
  2. Opens the Business Map, you click "Search for Organizations" once.
  3. It CAPTURES the report's own querydata request (endpoint URL + the
     Authorization token the browser negotiated — none of which is knowable
     offline), then REPLAYS it with our batched detail + activity queries
     (built by stage2_query.py) for those CR numbers.
  4. Saves the raw responses to state/ so Claude can finalise the decoder and
     the field→Bell mapping against real bytes — no guessing.

Nothing is written to Bell. Read-only probe.
"""
from __future__ import annotations
import asyncio
import glob
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = HERE / "state"
STATE.mkdir(exist_ok=True)
SCANS = HERE / "scans"

sys.path.insert(0, str(HERE))
from stage2_query import build_detail_query, build_activity_query  # noqa: E402

QUERYDATA_MARKER = "querydata"


def log(msg=""):
    print(msg, flush=True)


def pick_cr_numbers(n=6):
    """Grab a handful of real CR numbers from the newest Stage-1 scan."""
    latest = SCANS / "moci_companies_latest.json"
    if latest.exists():
        path = latest
    else:
        globbed = sorted(glob.glob(str(SCANS / "moci_companies_*.json")))
        if not globbed:
            return []
        path = Path(globbed[-1])
    try:
        data = json.load(open(path, errors="ignore"))
    except Exception:
        return []
    out = []
    for c in data.get("companies", []):
        cr = c.get("cr_number")
        if cr and str(cr).strip():
            out.append(str(cr).strip())
        if len(out) >= n:
            break
    return out


async def main():
    try:
        from playwright.async_api import async_playwright
    except Exception:
        log("ERROR: Playwright not installed. Run 'Diagnose MOCI.command' once first (it sets up the venv).")
        return

    cr_nums = pick_cr_numbers()
    if not cr_nums:
        log("ERROR: no CR numbers found in scans/ — run a Stage-1 scan first (Run Scan Now.command).")
        return
    log(f"Testing with {len(cr_nums)} real CR numbers: {', '.join(cr_nums)}\n")

    captured = {"url": None, "headers": None, "body": None}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        context = await browser.new_context(
            user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
            viewport={"width": 1440, "height": 900}, locale="en-US", timezone_id="Asia/Qatar",
        )
        await context.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); window.chrome={runtime:{}};")
        page = await context.new_page()

        def on_request(req):
            if captured["url"] is None and req.method == "POST" and QUERYDATA_MARKER in req.url:
                try:
                    captured["url"] = req.url
                    captured["headers"] = dict(req.headers)
                    captured["body"] = req.post_data
                    log(f"✓ Captured a live querydata request:\n    {req.url[:120]}…")
                except Exception as e:
                    log(f"  (capture note: {e})")
        page.on("request", on_request)

        for target in ["https://businessmap.moci.gov.qa/en", "https://businessmap.moci.gov.qa/"]:
            try:
                r = await page.goto(target, wait_until="domcontentloaded", timeout=60000)
                if r and r.status < 400:
                    break
            except Exception as e:
                log(f"  nav failed: {e}")

        log("")
        log("=" * 74)
        log(" YOUR TURN (Chrome window):")
        log("  1. If you see 503 / Service Unavailable, retype")
        log("       https://businessmap.moci.gov.qa/en  and press Enter until it loads.")
        log("  2. Click the red 'Search for Organizations' button ONCE.")
        log("  3. Come back here — capture is automatic. (Waiting up to 3 min…)")
        log("=" * 74)

        for _ in range(180):
            if captured["url"]:
                break
            await asyncio.sleep(1)

        if not captured["url"]:
            log("\n✗ No querydata request captured. Make sure you clicked 'Search for Organizations'.")
            await browser.close()
            return

        # Replay with OUR batched detail + activity queries, reusing the live token.
        headers = {k: v for k, v in (captured["headers"] or {}).items()
                   if k.lower() not in ("content-length",)}
        headers["content-type"] = "application/json;charset=UTF-8"

        results = {"captured_url": captured["url"], "captured_headers_keys": sorted((captured["headers"] or {}).keys()),
                   "captured_body_sample": (captured["body"] or "")[:4000], "cr_numbers": cr_nums}

        for label, builder in (("detail", build_detail_query), ("activity", build_activity_query)):
            body = builder(cr_nums)
            try:
                resp = await context.request.post(captured["url"], headers=headers, data=json.dumps(body))
                txt = await resp.text()
                results[label] = {"status": resp.status, "request_body": body, "response_body": txt[:1_000_000]}
                log(f"  {label}: HTTP {resp.status}, {len(txt)} bytes")
            except Exception as e:
                results[label] = {"error": str(e), "request_body": body}
                log(f"  {label}: ERROR {e}")

        out = STATE / "diagnostic-details.json"
        out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        log(f"\n✓ Saved → {out}")
        log("  Send state/diagnostic-details.json to Claude to finalise Stage 2.")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
