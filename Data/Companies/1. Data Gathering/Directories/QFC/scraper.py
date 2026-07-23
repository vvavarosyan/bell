#!/usr/bin/env python3
"""
QFC (Qatar Financial Centre) Public Register Scraper — full coverage.

Source: https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx

The register is an ASP.NET WebForms app. To collect every company across
every licence status we:

  1. GET the base listing page once to obtain a fresh viewstate.
  2. For each of the 9 status filters (Licensed, Withdrawn, Inactive,
     etc.), POST a search submission with hdStatusId=<N>. The response
     IS the listing of companies in that status. From it we extract the
     30 company cards on page 1 and figure out how many pages this
     status has.
  3. For pages 2..N within the same status, GET ?page=K with the same
     requests.Session — the server keeps the filter in session state.
  4. For each company card, POST __EVENTTARGET=CompanyLists$ctrlIDX$ctl00
     **with Referer + Origin headers set** — this is the critical bit
     that makes the server return the detail HTML instead of a 302 to
     www.qfc.qa.
  5. Parse the detail page via the .registration-item span/span pattern.

Everything is rate-limited (delay_min..delay_max seconds between every
request, configurable via env var), retried on 429/503/connection
errors, paused on consecutive failures, and resumable via a progress
file that tracks (status_id, last_page_completed).
"""

from __future__ import annotations

import atexit
import json
import os
import random
import re
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
SOURCE_NAME = "QFC - Qatar Financial Centre Public Register"
BASE_URL = "https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx"
ORIGIN = "https://eservices.qfc.qa"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
SCRAPER_VERSION = "3.0.0"

# The 9 licence statuses present in the QFC register's filter dropdown
# Known size of the live register (confirmed via direct URL navigation:
# ?page=175 is the last page, with 22 cards and "next" disabled).
# 174 full pages * 30 + 22 = 5,242 companies in the unfiltered view, which
# spans every licence status (the default view is NOT Licensed-only).
KNOWN_TOTAL_PAGES = 175

# The filter dropdown values are retained here for diagnostics + future use,
# but the live site has a critical limitation: pagination beyond page 1 of
# a filtered view resets the filter (URL-based pagination breaks the WebForms
# postback chain). So we scrape the unfiltered view, which DOES paginate
# correctly and DOES contain every status.
STATUS_LABELS: Dict[str, str] = {
    "1":  "Licensed",
    "3":  "Licence Withdrawn by QFCA",
    "4":  "Licensed - In Liquidation",
    "5":  "Licensed - Inactive",
    "7":  "Not yet licensed to conduct permitted activities",
    "8":  "License Voluntarily Withdrawn",
    "10": "Not Licensed",
    "11": "Under Deregistration",
    "13": "Frozen Under Court Order",
    "14": "Licensed - not yet commenced regulated activities",
    "15": "Suspended by Court Order",
    "16": "Licensed - Regulated Activities Suspended",
}

# Rate limiting
MIN_DELAY = float(os.environ.get("SCRAPE_DELAY_MIN", "2.0"))
MAX_DELAY = float(os.environ.get("SCRAPE_DELAY_MAX", "4.0"))
if MAX_DELAY < MIN_DELAY:
    MAX_DELAY = MIN_DELAY
RETRY_WAIT_SECONDS = 120
MAX_RETRIES = 3
CONSECUTIVE_FAILURE_THRESHOLD = 3
LONG_PAUSE_SECONDS = 15 * 60

MAX_RUN_MINUTES = int(os.environ.get("SCRAPE_MAX_MINUTES", "360"))
# Detail-page fetching is now ON by default (we proved the technique works
# with Referer+Origin). Flip to false to skip detail POSTs.
FETCH_DETAILS = os.environ.get("SCRAPE_FETCH_DETAILS", "true").strip().lower() in (
    "1", "true", "yes", "on"
)

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
SCANS_DIR = SCRIPT_DIR / "scans"
STATE_DIR = SCRIPT_DIR / "state"
PROGRESS_FILE = STATE_DIR / "progress.json"
LOCK_FILE = STATE_DIR / "scraper.lock"
LATEST_FILE = SCANS_DIR / "qfc_companies_latest.json"


# -----------------------------------------------------------------------------
# Tiny utilities
# -----------------------------------------------------------------------------
def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def polite_sleep() -> None:
    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = re.sub(r"<[^>]+>", " ", str(value))
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def normalize_label(label: str) -> str:
    """Turn 'Date of QFC Incorporation or Registration' into
       'date_of_qfc_incorporation_or_registration'."""
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s


# -----------------------------------------------------------------------------
# Lock file
# -----------------------------------------------------------------------------
def acquire_lock() -> bool:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        try:
            other = int(LOCK_FILE.read_text(encoding="utf-8").strip() or "0")
        except ValueError:
            other = 0
        if other and pid_is_alive(other):
            log(f"Another scraper instance is already running (pid={other}). Exiting.")
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


# -----------------------------------------------------------------------------
# Progress
# -----------------------------------------------------------------------------
def load_progress() -> Dict[str, Any]:
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            log("WARNING: progress file corrupt; starting fresh.")
    return {
        "scraper_version": SCRAPER_VERSION,
        "started_at": now_iso(),
        "total_pages": None,
        "total_pages_verified": False,
        "last_completed_page": 0,
        "companies": [],            # entity_type=company records
        "trusts": [],               # entity_type=trust records
        "scraped_qfc_numbers": [],  # dedup set across companies + trusts
        "trusts_scraped": False,
    }


def save_progress(progress: Dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = PROGRESS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(progress, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(PROGRESS_FILE)


def clear_progress() -> None:
    PROGRESS_FILE.unlink(missing_ok=True)


# -----------------------------------------------------------------------------
# HTTP session
# -----------------------------------------------------------------------------
def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s


class TooManyFailures(Exception):
    pass


def do_request(
    session: requests.Session,
    method: str,
    url: str,
    *,
    data: Optional[Dict[str, str]] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    state: Dict[str, int],
    allow_redirects: bool = True,
) -> requests.Response:
    last_err = None
    headers = dict(extra_headers or {})
    # POST requests to QFC require Referer+Origin or they redirect to qfc.qa
    if method == "POST":
        headers.setdefault("Referer", url)
        headers.setdefault("Origin", ORIGIN)
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            polite_sleep()
            if method == "GET":
                resp = session.get(url, headers=headers, timeout=60,
                                   allow_redirects=allow_redirects)
            else:
                resp = session.post(url, data=data, headers=headers, timeout=60,
                                    allow_redirects=allow_redirects)
            if resp.status_code in (429, 503):
                log(f"  HTTP {resp.status_code} on {method} {url} "
                    f"(attempt {attempt}/{MAX_RETRIES}). Waiting {RETRY_WAIT_SECONDS}s...")
                time.sleep(RETRY_WAIT_SECONDS)
                last_err = f"HTTP {resp.status_code}"
                continue
            if resp.status_code >= 400:
                last_err = f"HTTP {resp.status_code}"
                log(f"  Non-retryable HTTP {resp.status_code} on {method} {url}")
                break
            state["consecutive_failures"] = 0
            return resp
        except (requests.ConnectionError, requests.Timeout) as e:
            log(f"  Connection error on {method} {url} "
                f"(attempt {attempt}/{MAX_RETRIES}): {e}. Waiting {RETRY_WAIT_SECONDS}s...")
            time.sleep(RETRY_WAIT_SECONDS)
            last_err = str(e)

    state["consecutive_failures"] = state.get("consecutive_failures", 0) + 1
    if state["consecutive_failures"] >= CONSECUTIVE_FAILURE_THRESHOLD:
        log(f"  {state['consecutive_failures']} consecutive failures. "
            f"Cooling off {LONG_PAUSE_SECONDS // 60}m...")
        time.sleep(LONG_PAUSE_SECONDS)
        state["consecutive_failures"] = 0
    raise TooManyFailures(f"Failed after {MAX_RETRIES} retries: {last_err}")


# -----------------------------------------------------------------------------
# Listing page parsing
# -----------------------------------------------------------------------------
def extract_hidden_fields(soup: BeautifulSoup) -> Dict[str, str]:
    return {
        i.get("name"): i.get("value", "") or ""
        for i in soup.find_all("input", type="hidden")
        if i.get("name")
    }


def detect_total_pages(soup: BeautifulSoup) -> int:
    """Find the highest page=N value in pagination links. Returns 1 if none."""
    highest = 1
    # Restrict to the company-pagination area so we don't pick up SEF/Director pages
    for a in soup.find_all("a", href=True):
        m = re.search(r"[?&]page=(\d+)", a["href"])
        if m:
            highest = max(highest, int(m.group(1)))
    return highest


def parse_listing_cards(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    cards = []
    container = soup.select_one("#PublicRegister")
    if container is None:
        container = soup
    for idx, card in enumerate(container.select(".qfc-informationResult")):
        cards.append(parse_listing_card(card, idx))
    return cards


def parse_trust_cards(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """Parse the Register of Trusts section (#PublicRegisterForTrust).

    Trust cards live in a separate tab on the same page as the Public
    Register, with cards identified by id-prefix "lstviewTrust_" instead
    of "CompanyLists_". Each card has the QFC number (TRxxxxx), Arabic
    and English names, location, date of registration of the trust, and
    an inline Trustee Information section.
    """
    trusts: List[Dict[str, Any]] = []
    container = soup.select_one("#PublicRegisterForTrust")
    if container is None:
        return trusts
    for idx, card in enumerate(container.select(".qfc-informationResult")):
        trusts.append(parse_trust_card(card, idx))
    return trusts


def parse_trust_card(card: Tag, idx: int) -> Dict[str, Any]:
    # QFC trust number (looks like "TR00001")
    qfc_number = None
    num_link = card.select_one("div.qfc-number a")
    if num_link is not None:
        for sp in reversed(num_link.find_all("span")):
            t = clean_text(sp.get_text())
            if t and t.upper().startswith("TR"):
                qfc_number = t
                break
        if qfc_number is None:
            raw = clean_text(num_link.get_text(" "))
            if raw:
                qfc_number = re.sub(r"(?i)^\s*QFC\s*Number\s*", "", raw).strip() or None

    arabic_el = card.select_one("div.ArabicFirmName a") or card.select_one("div.ArabicFirmName")
    english_el = card.select_one("div.EngFirmname a") or card.select_one("div.EngFirmname")
    arabic_name = clean_text(arabic_el.get_text(" ")) if arabic_el else None
    english_name = clean_text(english_el.get_text(" ")) if english_el else None

    status_el = card.select_one('[id*="lstviewTrust_lblListStatus"]')
    license_status = clean_text(status_el.get_text()) if status_el else None

    loc_el = card.select_one(".description-item.location-icon")
    location = clean_text(loc_el.get_text(" ")) if loc_el else None

    # Date of registration of the trust
    date_reg_el = card.select_one('[id*="lstviewTrust_DateOfRegistration"]')
    date_of_registration = clean_text(date_reg_el.get_text(" ")) if date_reg_el else None

    # CRM account number — a stable internal id
    crm_input = card.select_one('input[id*="lstviewTrust_hdnCRMAccountNo"]')
    crm_account_no = crm_input.get("value", "") if crm_input else None

    # Trustee information block — capture the full text for now, we can split later
    trustee_block = card.select_one(".divListTrusteeDetails")
    trustee_info = clean_text(trustee_block.get_text(" ")) if trustee_block else None

    return {
        "entity_type": "trust",
        "card_index": idx,
        "qfc_number": qfc_number,
        "arabic_name": arabic_name,
        "english_name": english_name,
        "license_status": license_status,
        "location": location,
        "date_of_registration_of_the_trust": date_of_registration,
        "crm_account_no": crm_account_no,
        "trustee_information": trustee_info,
        "_scraped_at": now_iso(),
    }


def parse_listing_card(card: Tag, idx: int) -> Dict[str, Any]:
    """Card shape (May 2026):

        <div class="qfc-informationResult">
          <span class="license-status">
            <span class="licence-icon" id="CompanyLists_lblLicStatusColor_N"/>
            <span class="licence-text" id="CompanyLists_lblListStatus_N">Licensed</span>
          </span>
          <div class="qfc-number"><a><span>QFC Number</span><span>05243</span></a></div>
          <div class="qfc-title">
            <div class="ArabicFirmName"><a>...</a></div>
            <div class="EngFirmname"><a>English Name</a></div>
          </div>
          <div class="description-details">
            <div class="description-item location-icon"><span>...</span></div>
          </div>
        </div>
    """
    # QFC number — pick the span inside .qfc-number a that contains digits
    qfc_number = None
    num_link = card.select_one("div.qfc-number a")
    if num_link is not None:
        for sp in reversed(num_link.find_all("span")):
            t = clean_text(sp.get_text())
            if t and any(c.isdigit() for c in t):
                qfc_number = t
                break
        if qfc_number is None:
            raw = clean_text(num_link.get_text(" "))
            if raw:
                qfc_number = re.sub(r"(?i)^\s*QFC\s*Number\s*", "", raw).strip() or None

    arabic_el = card.select_one("div.ArabicFirmName a") or card.select_one("div.ArabicFirmName")
    english_el = card.select_one("div.EngFirmname a") or card.select_one("div.EngFirmname")
    arabic_name = clean_text(arabic_el.get_text(" ")) if arabic_el else None
    english_name = clean_text(english_el.get_text(" ")) if english_el else None

    status_el = card.select_one('[id*="lblListStatus"]')
    license_status = clean_text(status_el.get_text()) if status_el else None

    loc_el = (card.select_one(".description-item.location-icon")
              or card.select_one(".description-details .description-item"))
    location = clean_text(loc_el.get_text(" ")) if loc_el else None

    return {
        "card_index": idx,
        "qfc_number": qfc_number,
        "arabic_name": arabic_name,
        "english_name": english_name,
        "license_status": license_status,
        "location": location,
    }


# -----------------------------------------------------------------------------
# Detail page parsing
# -----------------------------------------------------------------------------
# Map raw detail labels (lowercased, normalized) -> canonical output keys.
# This list is the union of labels seen on different company types
# (LLCs vs Branch entities, etc.) — missing labels just become null.
DETAIL_FIELD_MAP = {
    "licence_status":                                 "licence_status",
    "license_status":                                 "licence_status",
    "permitted_activities":                           "permitted_activities",
    "date_of_licence":                                "date_of_licence",
    "date_of_license":                                "date_of_licence",
    "senior_executive_function":                      "senior_executive_function",
    "registration_status":                            "registration_status",
    "place_of_incorporation":                         "place_of_incorporation",
    "date_of_qfc_incorporation_or_registration":      "date_of_qfc_incorporation_or_registration",
    "date_of_qfc_incorporation":                      "date_of_qfc_incorporation_or_registration",
    "date_of_qfc_registration":                       "date_of_qfc_incorporation_or_registration",
    "legal_status":                                   "legal_status",
    "directors":                                      "directors",
    "directors_llc":                                  "directors",
    "principal_representative":                       "principal_representative",
    "principal_place_of_business":                    "principal_place_of_business",
    "date_of_incorporation_outside_of_qfc":           "date_of_incorporation_outside_qfc",
    "date_of_incorporation_outside_qfc":              "date_of_incorporation_outside_qfc",
    "financial_year_end":                             "financial_year_end",
    "registered_address":                             "registered_address",
}

# Canonical keys we always emit (null when missing).
CANONICAL_DETAIL_KEYS = sorted(set(DETAIL_FIELD_MAP.values()))


def parse_detail_page(html: str) -> Dict[str, Optional[str]]:
    """Walk every .registration-item; first <span> is the label, second is the
    value. Map labels through DETAIL_FIELD_MAP for canonical keys."""
    soup = BeautifulSoup(html, "lxml")
    out: Dict[str, Optional[str]] = {k: None for k in CANONICAL_DETAIL_KEYS}

    # The detail-page title is the company's English name
    title_el = soup.find("title")
    if title_el:
        t = clean_text(title_el.get_text())
        if t:
            out["english_name_from_detail"] = t  # extra field, not in canon list

    for item in soup.select(".registration-item"):
        spans = item.find_all("span", recursive=False)
        if len(spans) < 2:
            # Some items wrap value in inner spans; fall back to all spans
            spans = item.find_all("span")
            if len(spans) < 2:
                continue
        label_text = clean_text(spans[0].get_text(" "))
        if not label_text:
            continue
        value_text = clean_text(spans[1].get_text(" "))
        if value_text is None:
            continue
        canonical = DETAIL_FIELD_MAP.get(normalize_label(label_text))
        if canonical:
            out[canonical] = value_text
        else:
            # Surface unknown labels with a "detail_other_" prefix so we never
            # silently drop data.
            out[f"detail_other_{normalize_label(label_text)}"] = value_text

    return out


# -----------------------------------------------------------------------------
# Search + pagination
# -----------------------------------------------------------------------------


def fetch_listing_page(
    session: requests.Session,
    page: int,
    state: Dict[str, int],
) -> BeautifulSoup:
    resp = do_request(session, "GET", f"{BASE_URL}?page={page}", state=state)
    return BeautifulSoup(resp.text, "lxml")


def fetch_detail(
    session: requests.Session,
    page: int,
    card_idx: int,
    hidden: Dict[str, str],
    state: Dict[str, int],
) -> Dict[str, Optional[str]]:
    payload = dict(hidden)
    payload["__EVENTTARGET"] = f"CompanyLists$ctrl{card_idx}$ctl00"
    payload["__EVENTARGUMENT"] = ""
    resp = do_request(
        session, "POST", f"{BASE_URL}?page={page}", data=payload, state=state,
    )
    # Sanity: if the response is the "Object moved" stub, we hit the bad path
    if resp.text.strip().startswith("<html><head><title>Object moved"):
        log("    WARNING: detail POST returned an Object-moved redirect. "
            "Skipping company.")
        return {k: None for k in CANONICAL_DETAIL_KEYS}
    return parse_detail_page(resp.text)


# -----------------------------------------------------------------------------
# Main scrape loop
# -----------------------------------------------------------------------------
def scrape(session: requests.Session, progress: Dict[str, Any]) -> bool:
    """Scrape the QFC register by paginating the unfiltered view 1..N.

    The unfiltered default view returns every company across every licence
    status (confirmed: ~5,242 across 175 pages of 30, last page 22). Status
    filters in the UI exist but are broken for pagination (page 2+ of a
    filter resets the filter), so we never touch them here.
    """
    state = {"consecutive_failures": 0}
    deadline = time.monotonic() + MAX_RUN_MINUTES * 60
    scraped_set = set(progress.get("scraped_qfc_numbers") or [])

    # Initial GET to seed viewstate + grab trusts off the first page.
    log("Fetching initial listing page...")
    base_resp = do_request(session, "GET", f"{BASE_URL}?page=1", state=state)
    base_soup = BeautifulSoup(base_resp.text, "lxml")

    # One-shot Trust pass — the trust register is on every page of the
    # company listing in #PublicRegisterForTrust. 10 trusts visible
    # (TR00001..TR00010) with no UI pagination.
    if not progress.get("trusts_scraped"):
        trusts = parse_trust_cards(base_soup)
        new_trusts = []
        for t in trusts:
            if t.get("qfc_number") and t["qfc_number"] not in scraped_set:
                new_trusts.append(t)
                scraped_set.add(t["qfc_number"])
        progress.setdefault("trusts", []).extend(new_trusts)
        progress["scraped_qfc_numbers"] = sorted(scraped_set)
        progress["trusts_scraped"] = True
        save_progress(progress)
        log(f"Captured {len(new_trusts)} trusts from Register of Trusts.")

    # Detect total pages: trust the known value (175) but verify by probing
    # the boundary, in case the register grew or shrank since we last looked.
    total_pages = progress.get("total_pages") or KNOWN_TOTAL_PAGES
    if not progress.get("total_pages_verified"):
        total_pages = detect_total_pages_via_probe(session, state, hint=total_pages)
        progress["total_pages"] = total_pages
        progress["total_pages_verified"] = True
        save_progress(progress)
    log(f"Total pages to scrape: {total_pages}")

    # Page 1 cards (from the initial GET) + every subsequent page.
    start_page = progress.get("last_completed_page", 0) + 1
    for page in range(start_page, total_pages + 1):
        if time.monotonic() > deadline:
            log(f"Time cap of {MAX_RUN_MINUTES} min reached. Saving and exiting.")
            save_progress(progress)
            return False

        if page == 1:
            soup = base_soup
        else:
            soup = fetch_listing_page(session, page, state)

        cards = parse_listing_cards(soup)
        hidden = extract_hidden_fields(soup)
        if not cards:
            log(f"[Page {page}/{total_pages}] returned 0 cards — stopping here.")
            break

        log(f"[Page {page}/{total_pages}] {len(cards)} cards")

        for c_idx, card in enumerate(cards):
            qfc_num = card.get("qfc_number")
            if qfc_num and qfc_num in scraped_set:
                continue
            if time.monotonic() > deadline:
                log("Time cap reached mid-page. Saving and exiting.")
                save_progress(progress)
                return False

            label = f"  [Page {page}/{total_pages}] [{c_idx + 1}/{len(cards)}]"
            log(f"{label} {qfc_num} - {card.get('english_name')} ({card.get('license_status')})")

            detail: Dict[str, Optional[str]] = {}
            if FETCH_DETAILS:
                try:
                    detail = fetch_detail(session, page, c_idx, hidden, state)
                except TooManyFailures as e:
                    log(f"      SKIPPED detail (request failed): {e}")

            merged = {
                "entity_type": "company",
                **card,
                **{k: v for k, v in detail.items() if v is not None},
                "_source_listing_page": page,
                "_scraped_at": now_iso(),
            }
            if merged.get("qfc_number"):
                scraped_set.add(merged["qfc_number"])
            progress["companies"].append(merged)

        progress["last_completed_page"] = page
        progress["scraped_qfc_numbers"] = sorted(scraped_set)
        save_progress(progress)

    return True


def detect_total_pages_via_probe(
    session: requests.Session, state: Dict[str, int], hint: int
) -> int:
    """Verify the total page count by probing.

    Strategy:
      1. GET ?page=<hint>. If it returns cards, walk forward by 1 until empty.
      2. If it returns no cards, walk backward by 1 until cards reappear.
    """
    log(f"Probing page {hint} to verify total page count...")
    soup = fetch_listing_page(session, hint, state)
    cards = parse_listing_cards(soup)
    if cards:
        # Walk forward until empty
        page = hint
        while True:
            page += 1
            soup = fetch_listing_page(session, page, state)
            if not parse_listing_cards(soup):
                last = page - 1
                log(f"  Probe found last page = {last}")
                return last
            if page > hint + 20:  # safety
                log(f"  Probe walked 20+ pages past hint, stopping at {page}")
                return page
    else:
        # Walk backward until cards reappear
        page = hint
        while page > 1:
            page -= 1
            soup = fetch_listing_page(session, page, state)
            if parse_listing_cards(soup):
                log(f"  Probe found last page = {page}")
                return page
        return 1


# -----------------------------------------------------------------------------
# Output
# -----------------------------------------------------------------------------
def write_final_output(progress: Dict[str, Any]) -> Path:
    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now()
    fname = f"qfc_companies_{now.strftime('%Y-%m-%d_%H%M%S')}.json"
    fpath = SCANS_DIR / fname

    companies = progress.get("companies") or []
    trusts = progress.get("trusts") or []
    payload = {
        "source": SOURCE_NAME,
        "source_url": BASE_URL,
        "scraper": "scraper.py",
        "scraper_version": SCRAPER_VERSION,
        "scan_started_at": progress.get("started_at"),
        "scan_completed_at": now_iso(),
        "total_count": len(companies) + len(trusts),
        "company_count": len(companies),
        "trust_count": len(trusts),
        "pages_scraped": progress.get("last_completed_page"),
        "total_pages": progress.get("total_pages"),
        "companies": companies,
        "trusts": trusts,
    }
    fpath.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    LATEST_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return fpath


# -----------------------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------------------
def main() -> int:
    mode = "listings + details" if FETCH_DETAILS else "listings only"
    log(f"QFC Scraper v{SCRAPER_VERSION} starting "
        f"(max {MAX_RUN_MINUTES} min, delay {MIN_DELAY:.1f}-{MAX_DELAY:.1f}s, mode={mode})")
    if not acquire_lock():
        return 0

    SCANS_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    progress = load_progress()
    if progress.get("last_completed_page"):
        log(f"Resuming from page {progress['last_completed_page'] + 1}. "
            f"Companies so far: {len(progress.get('companies') or [])}, "
            f"trusts so far: {len(progress.get('trusts') or [])}")
    else:
        log("Starting fresh scan")

    session = make_session()
    try:
        completed = scrape(session, progress)
    except KeyboardInterrupt:
        log("Interrupted. Progress saved; rerun to resume.")
        save_progress(progress)
        return 130
    except Exception as e:
        log(f"FATAL: {e}")
        save_progress(progress)
        raise

    if completed:
        out = write_final_output(progress)
        log(f"Scan complete. Wrote {out}")
        clear_progress()
    else:
        log(f"Partial run saved. {len(progress.get('companies') or [])} companies so far.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
