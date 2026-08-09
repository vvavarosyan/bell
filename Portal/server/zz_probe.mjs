import pg from 'pg';
const c = new pg.Client({ connectionString: 'postgres://localhost:5432/bell_intel', connectionTimeoutMillis: 5000 });
await c.connect();
const q = async (sql, p=[]) => (await c.query(sql, p)).rows;
console.log('--- recent sweep rows ---');
console.table(await q(`SELECT board_key, ok, jobs_seen, swept_at FROM job_board_sweeps ORDER BY swept_at DESC LIMIT 10`));
console.log('--- open jobs: last_seen_at vs good_sweeps_since_seen ---');
console.table(await q(`
  SELECT j.board_key, j.external_id, j.last_seen_at,
     (SELECT count(*)::int FROM job_board_sweeps s WHERE s.board_key=j.board_key AND s.ok
        AND s.swept_at > COALESCE(j.last_seen_at, j.created_at)) AS good_sweeps_since_seen
   FROM jobs j WHERE j.board_key IS NOT NULL AND j.closed_at IS NULL
   ORDER BY j.last_seen_at DESC NULLS LAST LIMIT 10`));
console.log('--- does the sweep row that SAW a job sort after its last_seen_at? ---');
console.table(await q(`
  SELECT s.board_key, s.swept_at, s.jobs_seen,
         (SELECT count(*)::int FROM jobs j WHERE j.board_key=s.board_key AND j.last_seen_at < s.swept_at
            AND j.last_seen_at > s.swept_at - interval '10 minutes') AS jobs_stamped_just_before_this_sweep_row
    FROM job_board_sweeps s WHERE s.ok ORDER BY s.swept_at DESC LIMIT 8`));
await c.end();
