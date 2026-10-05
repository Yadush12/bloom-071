module.exports = (app, { auth, only, wrap, pool }) => {
  app.post('/api/ledger/restore', auth, only('admin'), wrap(async (req, res) => {
    const t = global.TAMPER || {};
    for (const id of Object.keys(t)) await pool.query('UPDATE ledger_entries SET details=$1 WHERE id=$2', [t[id], +id]);
    global.TAMPER = {};
    res.json({ restored: Object.keys(t).length });
  }));
};
