const { requireManager } = require('../_lib/supabase-admin');
const COLLECTIONS = [
  'visits_clinic',
  'visits_dental',
  'visits_operations',
  'visits_labs',
  'visits_radiology',
  'income',
  'expense',
  'lab_expenses',
  'patient_file_index_clinic',
  'patient_file_index_dental',
  'patient_file_index',
  'patient_files_clinic',
  'patient_files_dental',
  'outbox',
  'audit_log'
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const { admin } = await requireManager(req);
    if (req.body?.action !== 'wipeBusinessData') return res.status(400).json({ error: 'unknown-action' });
    const phrase = String(req.body.confirmationText || '').trim();
    if (phrase !== 'حذف كل بيانات المستشفى') {
      return res.status(400).json({ error: 'confirmation-required', requiredPhrase: 'حذف كل بيانات المستشفى' });
    }
    const deleted = {};
    let totalDeleted = 0;
    for (const collection of COLLECTIONS) {
      try {
        let count = 0;
        const { data, error } = await admin.from(collection).delete().neq('id', '___non_existent___').select('id');
        if (!error && Array.isArray(data)) {
          count = data.length;
        } else {
          try {
            const legRes = await admin.from('data_records').delete().eq('collection', collection).select('id');
            if (!legRes.error && Array.isArray(legRes.data)) count = legRes.data.length;
          } catch (_e) {}
        }
        deleted[collection] = count;
        totalDeleted += count;
        try {
          await admin.from('data_records').delete().eq('collection', collection);
        } catch (_e) {}
      } catch (_e) {
        deleted[collection] = 0;
      }
    }
    const wipeId = `wipe_${Date.now()}`;
    return res.status(200).json({
      ok: true,
      wipeId,
      totalDeleted,
      deleted,
      preserveAccounts: true,
      preserveSettings: true,
      preserveDoctors: true,
      preserveEmployees: true
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.code || e.message || 'data-wipe-failed' });
  }
};
