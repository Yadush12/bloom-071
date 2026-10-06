require('dotenv').config();
const pool = require('./db');
(async () => {
  const uid = async (e) => (await pool.query('SELECT id FROM users WHERE email=$1', [e])).rows[0].id;
  const H = {
    'a@demo.com': [['Image cleaning scripts', 8.7, 8.4, 8.0, 120, 30], ['Augmentation pipeline', 7.9, 7.6, 7.5, 95, 20], ['Evaluation harness', 8.2, 8.0, 7.8, 60, 10]],
    'b@demo.com': [['Dataset quality report', 9.2, 9.0, 8.8, 15, 28], ['Class-imbalance analysis', 9.0, 8.8, 8.5, 22, 18], ['Model comparison notes', 8.8, 8.6, 8.2, 18, 8]],
    'c@demo.com': [['Literature review', 7.4, 7.2, 7.0, 40, 25], ['Annotation guide', 6.8, 7.0, 6.5, 35, 15], ['Baseline CNN', 7.9, 7.5, 7.4, 50, 5]]
  };
  await pool.query("DELETE FROM contributions WHERE artifact='[synthetic demo history]'");
  for (const [email, rows] of Object.entries(H)) {
    const u = await uid(email);
    for (const [d, imp, q, e, cm, days] of rows)
      await pool.query("INSERT INTO contributions(user_id,artifact,artifact_hash,description,ai_declared,similarity,impact_score,quality_score,reviewed_effort,status,commit_count,created_at) VALUES($1,'[synthetic demo history]','demo',$2,false,0,$3,$4,$5,'ACCEPTED',$6,now()-make_interval(days=>$7))", [u, d, imp, q, e, cm, days]);
  }
  console.log('History seeded'); await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
