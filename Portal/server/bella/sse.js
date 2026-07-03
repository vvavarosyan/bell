// Shared SSE parser for Anthropic streams — ZERO imports by design.
//
// Both Bella brains use this: the portal brain (brain.js, full DB-backed tool
// registry) and the marketing brain (marketing.js, which must stay free of
// any db import — locked isolation commitment #1). Keeping the parser here
// lets marketing.js avoid importing brain.js (whose import chain reaches
// db.js through the tool registry).

/**
 * Feed raw chunk text in any fragmentation; emits {event, data} per complete
 * frame. Comment/heartbeat frames are ignored per the SSE spec.
 */
export function createSSEFeeder(onEvent) {
  let buf = '';
  return function feed(chunkText) {
    buf += chunkText;
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      let data = null;
      try { data = JSON.parse(dataLines.join('\n')); } catch { continue; }
      onEvent(event, data);
    }
  };
}
