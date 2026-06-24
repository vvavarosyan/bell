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
  POST /crawl   -> body {"url": "...", "wait_for": ms?}
                   -> {"ok", "status", "url", "html", "markdown"}

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

# One persistent event loop on a background thread holds the warm crawler.
_loop = asyncio.new_event_loop()


def _run_loop():
    asyncio.set_event_loop(_loop)
    _loop.run_forever()


threading.Thread(target=_run_loop, daemon=True).start()


async def _start_crawler():
    global _crawler, READY, IMPORT_ERROR
    try:
        from crawl4ai import AsyncWebCrawler
        c = AsyncWebCrawler(verbose=False)
        # Prefer an explicit start(); fall back to the async context manager.
        if hasattr(c, "start"):
            await c.start()
        else:
            await c.__aenter__()
        _crawler = c
        READY = True
    except Exception as e:  # pragma: no cover
        IMPORT_ERROR = str(e)
        READY = False


# Launch the warm browser once, waiting up to 180s for the first download/boot.
try:
    _fut = asyncio.run_coroutine_threadsafe(_start_crawler(), _loop)
    _fut.result(timeout=180)
except Exception as e:  # pragma: no cover
    IMPORT_ERROR = IMPORT_ERROR or str(e)
    READY = False


async def _do_crawl(url, wait_for):
    cfg = None
    try:
        from crawl4ai import CrawlerRunConfig, CacheMode
        cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=int(wait_for or 30000))
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


def crawl_sync(url, wait_for):
    fut = asyncio.run_coroutine_threadsafe(_do_crawl(url, wait_for), _loop)
    return fut.result(timeout=90)


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
            self._send(200, crawl_sync(url, (body or {}).get("wait_for")))
        except Exception as e:
            self._send(200, {"ok": False, "error": str(e)[:300]})


if __name__ == "__main__":
    status = "ready (warm browser)" if READY else ("NOT ready: %s" % IMPORT_ERROR)
    print("Bell Crawl4AI server on http://%s:%d  (%s)" % (HOST, PORT, status), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
