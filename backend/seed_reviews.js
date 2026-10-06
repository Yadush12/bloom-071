require('dotenv').config();
const pool = require('./db');
(async () => {
  const me = (await pool.query("SELECT id FROM users WHERE email='meera@demo.com'")).rows[0].id;
  await pool.query("DELETE FROM reviews WHERE comments='Synthetic demo review'");
  const cs = (await pool.query("SELECT id,quality_score,impact_score,created_at FROM contributions WHERE artifact='[synthetic demo history]'")).rows;
  for (const c of cs) await pool.query("INSERT INTO reviews(contribution_id,reviewer_id,quality,impact,decision,comments,created_at) VALUES($1,$2,$3,$4,'ACCEPTED','Synthetic demo review',$5::timestamptz + interval '1 day')", [c.id, me, c.quality_score, c.impact_score, c.created_at]);
  console.log('Reviews seeded'); await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
