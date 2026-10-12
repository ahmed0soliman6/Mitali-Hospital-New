const { getAdmin, userFromRequest, profile } = require('../_lib/supabase-admin');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const admin = getAdmin();
    const { user } = await userFromRequest(req, admin);
    const p = await profile(admin, user.id);
    if (!p || p.status === 'موقوف') return res.status(403).json({ error: 'inactive-user' });
    const month = String(req.query?.month || 'all');
    if (month !== 'all' && !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'invalid-month' });

    // 1. Try high-performance database RPC function first
    try {
      const { data: rpcData, error: rpcError } = await admin.rpc('get_financial_summary', { p_month: month });
      if (!rpcError && rpcData && typeof rpcData.totalIncome === 'number') {
        return res.status(200).json(rpcData);
      }
    } catch (_rpcErr) {}

    async function sum(table) {
      let allRows = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        let q = admin.from(table).select('amount, total, paid, payload').range(from, from + batchSize - 1);
        if (month !== 'all') {
          const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
          q = q.gte('date', `${month}-01`).lte('date', `${month}-${String(last).padStart(2, '0')}`);
        }
        const { data, error } = await q;
        if (error) {
          throw Object.assign(new Error(`Database error fetching ${table} summary: ${error.message || error}`), { status: 500, code: error.code || 'database-error' });
        }
        if (!Array.isArray(data)) {
          throw Object.assign(new Error(`Invalid response format from database for ${table}`), { status: 500 });
        }
        allRows = allRows.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      const total = allRows.reduce((s, r) => {
        const val = r.amount != null && r.amount !== '' ? Number(r.amount)
          : (r.total != null && r.total !== '' ? Number(r.total)
          : (r.payload?.amount != null ? Number(r.payload.amount)
          : (r.paid != null ? Number(r.paid) : 0)));
        return s + (isNaN(val) ? 0 : val);
      }, 0);
      return { total, count: allRows.length };
    }

    const [income, expense] = await Promise.all([sum('income'), sum('expense')]);
    return res.status(200).json({
      month,
      income,
      expense,
      totalIncome: income.total,
      totalExpense: expense.total,
      net: income.total - expense.total
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.code || e.message || 'financial-summary-failed' });
  }
};
