import { query } from './db.js';
const a = (await query('SELECT now() AS t')).rows[0].t;      // stands in for upsertJobs' last_seen_at = now()
const b = (await query('SELECT now() AS t')).rows[0].t;      // stands in for recordSweep's swept_at = now()
const c = (await query('SELECT now() AS t')).rows[0].t;
console.log('last_seen_at (stmt 1) :', a.toISOString(), a.getTime());
console.log('swept_at    (stmt 2) :', b.toISOString(), b.getTime());
console.log('stmt 3               :', c.toISOString(), c.getTime());
console.log('swept_at STRICTLY AFTER last_seen_at ?', b > a, ' / c>b:', c > b);
const r = (await query(`SELECT now() > $1::timestamptz AS strictly_after`, [a])).rows[0];
console.log('server-side compare  :', r.strictly_after);
const tt = (await query(`SELECT to_char(now(),'HH24:MI:SS.US') AS t`)).rows[0].t;
const tt2 = (await query(`SELECT to_char(now(),'HH24:MI:SS.US') AS t`)).rows[0].t;
console.log('microsecond precision:', tt, tt2);
process.exit(0);
