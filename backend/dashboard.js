module.exports = (app, { auth, wrap, pool }) => {
  const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
  app.get('/api/dashboard', auth, wrap(async (req, res) => {
    const u = req.user, out = { role: u.role };
    if (u.role === 'student') {
      out.credit_series = await q("SELECT c.created_at, k.points, COALESCE(m.title,c.description) AS label FROM credits k JOIN contributions c ON c.id=k.contribution_id LEFT JOIN milestones m ON m.id=c.milestone_id WHERE k.user_id=$1 ORDER BY c.created_at,c.id", [u.id]);
      out.dims = (await q("SELECT COALESCE(AVG(complexity),0)::float AS complexity, COALESCE(AVG(completeness),0)::float AS completeness, COALESCE(AVG(documentation),0)::float AS documentation, COALESCE(AVG(initiative),0)::float AS initiative FROM credits WHERE user_id=$1", [u.id]))[0];
      out.impact_series = await q("SELECT c.created_at, c.status, c.impact_score::float AS impact, c.quality_score::float AS quality, COALESCE(m.title,c.description) AS label FROM contributions c LEFT JOIN milestones m ON m.id=c.milestone_id WHERE c.user_id=$1 AND c.impact_score IS NOT NULL ORDER BY c.created_at,c.id", [u.id]);
      out.status = await q("SELECT status, count(*)::int AS n FROM contributions WHERE user_id=$1 GROUP BY status", [u.id]);
      out.earned = +(await q("SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE user_id=$1", [u.id]))[0].t;
    } else if (u.role === 'expert') {
      out.reviews = await q("SELECT decision, quality::float AS quality, impact::float AS impact, created_at FROM reviews WHERE reviewer_id=$1 ORDER BY created_at,id", [u.id]);
      out.pending = (await q("SELECT count(*)::int AS n FROM contributions c WHERE c.status IN ('SUBMITTED','FLAGGED') AND c.project_id IN (SELECT project_id FROM project_members WHERE user_id=$1 AND status<>'left')", [u.id]))[0].n;
      out.projects = (await q("SELECT count(*)::int AS n FROM project_members WHERE user_id=$1 AND status<>'left'", [u.id]))[0].n;
    } else if (u.role === 'sponsor') {
      out.milestones = await q("SELECT m.title, m.amount, m.status FROM milestones m JOIN projects p ON p.id=m.project_id WHERE p.sponsor_id=$1 ORDER BY m.id", [u.id]);
      out.escrow = await q("SELECT e.status, COALESCE(SUM(e.amount),0)::int AS total FROM escrows e JOIN projects p ON p.id=e.project_id WHERE p.sponsor_id=$1 GROUP BY e.status", [u.id]);
      out.contrib = await q("SELECT c.status, count(*)::int AS n FROM contributions c JOIN projects p ON p.id=c.project_id WHERE p.sponsor_id=$1 GROUP BY c.status", [u.id]);
      out.team = (await q("SELECT count(*)::int AS n FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE p.sponsor_id=$1 AND pm.status<>'left'", [u.id]))[0].n;
    } else {
      out.users = await q("SELECT role, verification_status, count(*)::int AS n FROM users GROUP BY role, verification_status");
      out.ledger = await q("SELECT action, count(*)::int AS n FROM ledger_entries GROUP BY action ORDER BY n DESC LIMIT 8");
      out.ledger_total = (await q("SELECT count(*)::int AS n FROM ledger_entries"))[0].n;
      out.ai_actions = (await q("SELECT count(*)::int AS n FROM ledger_entries WHERE actor_type='AI'"))[0].n;
      out.contrib = await q("SELECT status, count(*)::int AS n FROM contributions GROUP BY status");
      out.escrow = await q("SELECT status, COALESCE(SUM(amount),0)::int AS total FROM escrows GROUP BY status");
      out.projects = (await q("SELECT count(*)::int AS n FROM projects"))[0].n;
    }
    res.json(out);
  }));
};
