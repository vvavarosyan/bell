#!/usr/bin/env python3
"""
Bell · Crawl4AI local scraping server.
-------------------------------------------------------------------------------
A tiny stdlib HTTP wrapper around crawl4ai's AsyncWebCrawler so the Node engine
can render JS-heavy / anti-bot company sites for free, locally. Started as a
LaunchAgent by "Install Crawl4AI Engine.command" on 127.0.0.1:11235.

Endpoints:
  GET  /health  -> {"ok": true|false}   (true only when crawl4ai imported OK)
  POST /crawl   -> body {"url": "...", "wait_for": ms?}
                   -> {"ok", "status", "url", "html", "markdown"}

Defensive by design: any failure returns {"ok": false, ...} so the Node client
falls back to the local Playwright renderer. Nothing here can break harvesting.
"""

import os
import json
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("BELL_CRAWL4AI_PORT", "11235"))

# Probe the import once at startup; /health reports it so the Node side only
# routes traffic here when the engine is genuinely ready.
READY = False
IMPORT_ERROR = None
try:
    import crawl4ai  # noqa: F401
    READY = True
except Exception as e:  # pragma: no cover
    IMPORT_ERROR = str(e)
    READY = False


async def crawl_one(url, wait_for):
    from crawl4ai import AsyncWebCrawler
    cfg = None
    try:
        from crawl4ai import CrawlerRunConfig, CacheMode
        cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=int(wait_for or 30000))
    except Exception:
        cfg = None
    async with AsyncWebCrawler(verbose=False) as crawler:
        try:
            r = await (crawler.arun(url=url, config=cfg) if cfg is not None else crawler.arun(url=url))
        except TypeError:
            r = await crawler.arun(url=url)
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
            self._send(200, {"ok": bool(READY), "engine": "crawl4ai", "error": IMPORT_ERROR})
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
            if not READY:
                return self._send(200, {"ok": False, "error": "crawl4ai not ready: %s" % IMPORT_ERROR})
            res = asyncio.run(crawl_one(url, (body or {}).get("wait_for")))
            self._send(200, res)
        except Exception as e:
            self._send(200, {"ok": False, "error": str(e)[:300]})


if __name__ == "__main__":
    status = "ready" if READY else ("NOT ready: %s" % IMPORT_ERROR)
    print("Bell Crawl4AI server on http://%s:%d  (crawl4ai %s)" % (HOST, PORT, status), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
