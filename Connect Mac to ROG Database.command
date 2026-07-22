#!/bin/bash
# Bell — point this Mac at the ROG's database (the two-machine flip).
# Asks for the Postgres password RIGHT HERE in this window — it is typed locally,
# hidden as you type, saved only into a file on this Mac that GitHub never sees.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
echo "=========================================================="
echo " BELL — CONNECT THIS MAC TO THE ROG DATABASE"
echo "=========================================================="
echo ""
echo "ROG address: 192.168.1.161 (your home network)"
echo ""
read -r -s -p "Postgres password (hidden while you type, then press Return): " PW
echo ""
if [ -z "$PW" ]; then echo "No password entered — nothing changed."; read -p "Press Return to close…"; exit 1; fi
echo ""
echo "Writing the connection file and testing…"
PW="$PW" node -e '
const pw = encodeURIComponent(process.env.PW);
const url = "postgres://postgres:" + pw + "@192.168.1.161:5432/bell_intel";
const fs = require("fs");
fs.writeFileSync(".db-target", url + "\n", { mode: 0o600 });
import("./db.js").then(async ({ query, pool }) => {
  const r = (await query("SELECT count(*)::int n FROM companies")).rows[0].n;
  const l = (await query("SELECT count(*)::int n FROM company_locations")).rows[0].n;
  console.log("");
  console.log("CONNECTED to the ROG database ✓");
  console.log("   companies: " + r.toLocaleString() + "   locations: " + l.toLocaleString());
  console.log("");
  console.log("This Mac now reads and writes the ROG. Tell Claude: \"connected\".");
  await pool.end();
  process.exit(0);
}).catch((e) => {
  fs.unlinkSync(".db-target");
  console.log("");
  console.log("COULD NOT CONNECT — the flip was rolled back, this Mac still uses its own database.");
  console.log("Reason: " + e.message);
  console.log("Usual causes: the ROG session has not finished the firewall step yet, or the");
  console.log("password was mistyped. Fix and double-click this again — safe to repeat.");
  process.exit(1);
});
'
echo ""
read -p "Press Return to close…"
