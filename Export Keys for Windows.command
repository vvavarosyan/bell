#!/bin/bash
# Bell — Export the API keys from the Mac's Keychain into ONE file for the ROG.
# ⚠ The file contains secrets. Carry it on the USB stick next to the database file,
#   let Claude on the ROG import it, then DELETE it from the USB and the Desktop.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
echo "=========================================================="
echo " BELL — API KEY EXPORT (for the Windows machine)"
echo "=========================================================="
echo ""
node -e '
import("./keychain.js").then(async ({ getKey }) => {
  const names = ["anthropic","apify","elevenlabs","firecrawl","openai","pii","reoon","resend","resend-outreach","sync-token"];
  const lines = [];
  for (const n of names) {
    const v = await getKey(n).catch(() => null);
    if (v) lines.push("BDI_KEY_" + n.toUpperCase().replace(/-/g, "_") + "=" + v);
    else console.log("  (no value stored for " + n + " — skipped)");
  }
  const fs = await import("node:fs");
  const os = await import("node:os");
  const out = os.homedir() + "/Desktop/bell-keys-for-windows.env";
  fs.writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
  console.log("Wrote " + lines.length + " key(s) to Desktop: bell-keys-for-windows.env");
  console.log("");
  console.log("Copy it to the USB stick WITH the database file. Delete both copies");
  console.log("of this keys file after the ROG import is done.");
  process.exit(0);
}).catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
'
echo ""
read -p "Press Return to close…"
