# Firecrawl Spark Pro Agent — async `/v2/agent` returns `data: null` consistently (credits still charged)

## Summary

The async agent endpoint `POST /v2/agent` is returning `"data": null` on every request I send, even when credits are being charged (so the agent IS doing work internally — it just can't return any output). This blocks every Spark Pro use case I have. I've tested across multiple API keys and request shapes; the failure is identical every time.

## Environment

- **Endpoint:** `POST https://api.firecrawl.dev/v2/agent`
- **Status endpoint:** `GET https://api.firecrawl.dev/v2/agent/{id}`
- **Model:** `spark-1-pro` (Firecrawl default — also tried `spark-1-mini`, same result)
- **Date observed:** 2026-05-26
- **Auth:** Bearer token, valid (scrape and search endpoints work fine with the same key)

## Reproduction — four progressively simpler tests, all return `data: null`

### Test 1 — no schema, single URL anchor

**Request**
```json
POST /v2/agent
{
  "prompt": "Find basic facts about Qatar Airways: official name, year founded, headquarters city, CEO, and primary website. Return a short report with sources.",
  "urls": ["https://www.qatarairways.com/"]
}
```

**Response (after polling status)**
```json
{
  "success": true,
  "status": "completed",
  "data": null,
  "model": "spark-1-pro",
  "creditsUsed": 0
}
```

### Test 2 — with schema + required fields + multiple URL anchors

**Request**
```json
POST /v2/agent
{
  "prompt": "Find basic facts about Qatar Airways from their official website.",
  "urls": ["https://www.qatarairways.com/", "https://en.wikipedia.org/wiki/Qatar_Airways"],
  "schema": {
    "type": "object",
    "properties": {
      "official_name":     { "type": "string" },
      "year_founded":      { "type": "integer" },
      "headquarters_city": { "type": "string" },
      "ceo":               { "type": "string" },
      "website":           { "type": "string" }
    },
    "required": ["official_name", "website"]
  }
}
```

**Response**
```json
{
  "success": true,
  "status": "completed",
  "data": null,
  "model": "spark-1-pro",
  "creditsUsed": 116
}
```

Note: 116 credits were charged. The agent clearly did work — it just returned no data.

### Test 3 — schema with no required fields

**Request**
```json
POST /v2/agent
{
  "prompt": "Find the official name, founding year, and headquarters of Qatar Airways.",
  "urls": ["https://en.wikipedia.org/wiki/Qatar_Airways"],
  "schema": {
    "type": "object",
    "properties": {
      "name":         { "type": "string" },
      "founded":      { "type": "string" },
      "headquarters": { "type": "string" }
    }
  }
}
```

**Response**
```json
{
  "success": true,
  "status": "completed",
  "data": null,
  "model": "spark-1-pro",
  "creditsUsed": 104
}
```

### Test 4 — trivial extraction, single URL, minimal schema

**Request**
```json
POST /v2/agent
{
  "prompt": "Extract the page title from this URL.",
  "urls": ["https://example.com/"],
  "schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" }
    }
  }
}
```

**Response**
```json
{
  "success": true,
  "status": "completed",
  "data": null,
  "model": "spark-1-pro",
  "creditsUsed": 19
}
```

This is the most trivial possible request — extract a `<title>` tag from `example.com`. 19 credits charged, `data: null` returned.

## Expected behavior

For tests 2, 3, and 4, the agent should return populated `data` matching the requested schema. Examples:

```json
// Expected for Test 4
{
  "success": true,
  "status": "completed",
  "data": {
    "title": "Example Domain"
  },
  "model": "spark-1-pro",
  "creditsUsed": 19
}
```

## Actual behavior

`data` is always `null`, regardless of:
- Whether a schema is provided
- Whether the schema has `required` fields
- Whether URLs are anchored
- How complex or simple the prompt is
- How many credits get charged

## Impact

This blocks every production use case I have on Spark Pro. The other Firecrawl endpoints (`/v2/scrape`, `/v2/search`) work correctly with the same API key.

## Suggested investigation

1. Check the serialization step between the Spark model output and the response storage — sounds like the model is producing output that isn't being persisted into the response payload.
2. Verify `data` field assignment in the async-result delivery path.
3. Check whether the issue is specific to `/v2/agent` async polling or also affects synchronous Agent calls.
4. Related GitHub issues that may share root cause:
   - https://github.com/firecrawl/firecrawl/issues/1836 (extract with Zod schema → empty data)
   - https://github.com/firecrawl/firecrawl/issues/1309 (crawl returns null data)

## What I need

- A fix, or
- Workaround (a different request shape that does return data), or
- Confirmation that I should use a different endpoint for this kind of structured agent extraction.

Happy to provide my account email or recent job IDs for server-side investigation if useful.
