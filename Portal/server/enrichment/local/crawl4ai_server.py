#!/usr/bin/env python3
"""
Bell · Crawl4AI local scraping server  (warm-browser edition).
-------------------------------------------------------------------------------
A tiny stdlib HTTP wrapper around crawl4ai's AsyncWebCrawler so the Node engine
can render JS-heavy / anti-bot company sites for free, locally. Started as a
LaunchAgent by "Install Crawl4AI Engine.command" on 127.0.0.1:11235.

This version keeps ONE browser warm on a background event loop and reuses it for
every request — so it launches once at startup instead of spawning a fresh
browser per page (which made an icon flicker in the macOS dock and was slower).

Endpoints:
  GET  /health  -> {"ok": true|false, "warm": bool, "error": ...}
  POST /crawl   -> body {"url": "...", "wait_for": ms?,
                         "js_code": str|[str]?, "wait_selector": "css:..."|"js:..."?,
                         "settle_ms": int?}
                   -> {"ok", "status", "url", "html", "markdown"}

  js_code / wait_selector / settle_ms are OPTIONAL and only used for JS-heavy
  pages (e.g. expanding a wpDataTables grid to show all rows before scraping).
  Omitting them yields the original plain-render behaviour, unchanged.

Defensive by design: any failure returns {"ok": false, ...} so the Node client
falls back to the local Playwright renderer. Nothing here can break harvesting.
"""

import os
import json
import asyncio
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("BELL_CRAWL4AI_PORT", "11235"))

READY = False
IMPORT_ERROR = None
_crawler = None

# Recycle the warm browser every N crawls so Chromium memory can't accumulate
# over a long run (thousands of tender detail pages) and swamp a low-RAM (8GB)
# Mac. Set BELL_CRAWL4AI_RECYCLE=0 to disable.
RECYCLE_EVERY = int(os.environ.get("BELL_CRAWL4AI_RECYCLE", "150"))
_req_count = 0
_recycle_lock = None

# One persistent event loop on a background thread holds the warm crawler.
_loop = asyncio.new_event_loop()


def _run_loop():
    asyncio.set_event_loop(_loop)
    _loop.run_forever()


threading.Thread(target=_run_loop, daemon=True).start()


def _make_crawler():
    """Build an AsyncWebCrawler with memory-frugal Chromium flags when the
    installed crawl4ai exposes BrowserConfig; otherwise the plain default. The
    flags keep per-tab memory low on an 8GB machine; the try/except means an
    older crawl4ai simply falls back and still works."""
    from crawl4ai import AsyncWebCrawler
    try:
        from crawl4ai import BrowserConfig
        bc = BrowserConfig(headless=True, extra_args=[
            "--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox",
            "--disable-extensions", "--disable-background-networking",
            "--disable-back-forward-cache", "--renderer-process-limit=1",
            "--js-flags=--max-old-space-size=256",
        ])
        return AsyncWebCrawler(config=bc, verbose=False)
    except Exception:
        return AsyncWebCrawler(verbose=False)


async def _open(c):
    # Prefer an explicit start(); fall back to the async context manager.
    if hasattr(c, "start"):
        await c.start()
    else:
        await c.__aenter__()


async def _close(c):
    try:
        if hasattr(c, "close"):
            await c.close()
        else:
            await c.__aexit__(None, None, None)
    except Exception:
        pass


async def _start_crawler():
    global _crawler, READY, IMPORT_ERROR
    try:
        c = _make_crawler()
        await _open(c)
        _crawler = c
        READY = True
    except Exception as e:  # pragma: no cover
        IMPORT_ERROR = str(e)
        READY = False


async def _maybe_recycle():
    """Every RECYCLE_EVERY crawls, swap in a fresh browser and close the old one
    (after a short grace so in-flight crawls finish). Best-effort: on any failure
    we keep the existing crawler, so this can never break harvesting."""
    global _crawler, _req_count, _recycle_lock
    if not RECYCLE_EVERY:
        return
    if _recycle_lock is None:
        _recycle_lock = asyncio.Lock()
    async with _recycle_lock:
        _req_count += 1
        if _req_count % RECYCLE_EVERY != 0 or _crawler is None:
            return
        old = _crawler
        try:
            fresh = _make_crawler()
            await _open(fresh)
            _crawler = fresh
        except Exception:
            return  # keep the old crawler if a fresh one won't start
        await asyncio.sleep(1.5)   # let the last in-flight crawls finish
        await _close(old)


# Launch the warm browser once, waiting up to 180s for the first download/boot.
try:
    _fut = asyncio.run_coroutine_threadsafe(_start_crawler(), _loop)
    _fut.result(timeout=180)
except Exception as e:  # pragma: no cover
    IMPORT_ERROR = IMPORT_ERROR or str(e)
    READY = False


async def _do_crawl(url, wait_for, js_code=None, wait_selector=None, settle_ms=None):
    await _maybe_recycle()
    cfg = None
    try:
        from crawl4ai import CrawlerRunConfig, CacheMode
        kwargs = dict(cache_mode=CacheMode.BYPASS, page_timeout=int(wait_for or 30000))
        # Optional JS execution (e.g. expand a DataTables grid to "All" rows).
        if js_code:
            kwargs["js_code"] = js_code if isinstance(js_code, list) else [js_code]
        # Optional wait condition. crawl4ai expects a "css:<selector>" or
        # "js:<expr>" string; accept a bare selector and prefix it for callers.
        if wait_selector:
            ws = str(wait_selector)
            kwargs["wait_for"] = ws if ws.startswith(("css:", "js:")) else ("css:" + ws)
        # Optional settle delay (ms) before the HTML is captured, to let the JS
        # finish re-rendering. crawl4ai takes seconds.
        if settle_ms:
            try:
                kwargs["delay_before_return_html"] = float(settle_ms) / 1000.0
            except Exception:
                pass
        cfg = CrawlerRunConfig(**kwargs)
    except Exception:
        cfg = None
    r = await (_crawler.arun(url=url, config=cfg) if cfg is not None else _crawler.arun(url=url))
    html = getattr(r, "html", "") or getattr(r, "cleaned_html", "") or ""
    md = getattr(r, "markdown", "")
    try:
        md = getattr(md, "raw_markdown", None) or str(md or "")
    except Exception:
        md = ""
    return {
        "ok": bool(getattr(r, "success", True)) and bool(html),
        "status": getattr(r, "status_code", 200) or 200,
        "url": getattr(r, "url", url) or url,
        "html": html,
        "markdown": md,
    }


def crawl_sync(url, wait_for, js_code=None, wait_selector=None, settle_ms=None):
    fut = asyncio.run_coroutine_threadsafe(
        _do_crawl(url, wait_for, js_code=js_code, wait_selector=wait_selector, settle_ms=settle_ms),
        _loop)
    # Allow extra wall-clock when JS expansion is requested (DataTables "All" can
    # take a while to render thousands of rows).
    return fut.result(timeout=180 if (js_code or wait_selector) else 90)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # quiet

    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def do_GET(self):
        if self.path.startswith("/health"):
            self._send(200, {"ok": bool(READY), "engine": "crawl4ai", "warm": _crawler is not None, "error": IMPORT_ERROR})
        else:
            self._send(404, {"ok": False})

    def do_POST(self):
        if not self.path.startswith("/crawl"):
            return self._send(404, {"ok": False})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            url = (body or {}).get("url")
            if not url:
                return self._send(400, {"ok": False, "error": "no url"})
            if not READY or _crawler is None:
                return self._send(200, {"ok": False, "error": "crawl4ai not ready: %s" % IMPORT_ERROR})
            b = body or {}
            self._send(200, crawl_sync(
                url,
                b.get("wait_for"),
                js_code=b.get("js_code"),
                wait_selector=b.get("wait_selector"),
                settle_ms=b.get("settle_ms"),
            ))
        except Exception as e:
            self._send(200, {"ok": False, "error": str(e)[:300]})


if __name__ == "__main__":
    status = "ready (warm browser)" if READY else ("NOT ready: %s" % IMPORT_ERROR)
    print("Bell Crawl4AI server on http://%s:%d  (%s)" % (HOST, PORT, status), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
