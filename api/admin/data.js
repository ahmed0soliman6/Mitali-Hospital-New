const { requireManager } = require('../_lib/supabase-admin');
const COLLECTIONS = ['visits_clinic','visits_dental','visits_operations','visits_labs','visits_radiology','income','expense','lab_expenses'];
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const { admin } = await requireManager(req);
    if (req.body?.action !== 'wipeBusinessData') return res.status(400).json({ error: 'unknown-action' });
    if (String(req.body.confirmationText || '') !== 'حذف كل بيانات المستشفى') return res.status(400).json({ error: 'confirmation-required', requiredPhrase: 'حذف كل بيانات المستشفى' });
    const deleted = {};
    for (const collection of COLLECTIONS) {
      try {
        const { data, error } = await admin.from('data_records').delete().eq('collection', collection).select('id');
        deleted[collection] = (!error && data) ? data.length : 0;
      } catch (_e) {
        deleted[collection] = 0;
      }
    }
    return res.status(200).json({ ok: true, deleted, preserveAccounts: true, preserveSettings: true, preserveDoctors: true, preserveEmployees: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.code || e.message || 'data-wipe-failed' });
  }
};
