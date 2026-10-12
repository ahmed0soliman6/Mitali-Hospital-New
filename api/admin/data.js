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
  'audit_log'
];

const ARCHIVE_TABLES = [
  { table: 'visits_clinic', label: 'زيارات العيادات' },
  { table: 'visits_dental', label: 'زيارات الأسنان' },
  { table: 'visits_operations', label: 'زيارات العمليات' },
  { table: 'visits_labs', label: 'زيارات التحاليل' },
  { table: 'visits_radiology', label: 'زيارات الأشعة' },
  { table: 'income', label: 'الوارد' },
  { table: 'expense', label: 'المنصرف' },
  { table: 'lab_expenses', label: 'مصروفات المعمل' }
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  try {
    const { admin } = await requireManager(req);

    // 1. GET: Return Database Storage Metrics & Available Archive Years
    if (req.method === 'GET') {
      let sizeBytes = 0;
      try {
        const { data: rpcSize, error: rpcErr } = await admin.rpc('get_database_size');
        if (!rpcErr && rpcSize != null) sizeBytes = Number(rpcSize) || 0;
      } catch (_e) {}

      let rowCount = 0;
      for (const t of ['visits_clinic', 'visits_dental', 'income', 'expense']) {
        try {
          const { count } = await admin.from(t).select('id', { count: 'exact', head: true });
          rowCount += (count || 0);
        } catch (_cErr) {}
      }

      // Base Postgres system overhead is ~44 MB.
      let sizeMb = sizeBytes > 0 ? (sizeBytes / (1024 * 1024)) : (44.0 + (rowCount * 0.0012));
      sizeMb = Math.round(sizeMb * 100) / 100;
      const limitMb = 500;
      const percentUsed = Math.min(100, Math.round((sizeMb / limitMb) * 10000) / 100);
      const freeMb = Math.max(0, Math.round((limitMb - sizeMb) * 100) / 100);
      const warning = percentUsed >= 85;

      return res.status(200).json({
        ok: true,
        sizeMb,
        limitMb,
        percentUsed,
        freeMb,
        warning,
        warningMessage: warning
          ? '⚠️ تنبيه سعة التخزين: مساحة السحابة اقتربت من الامتلاء، يُرجى الدخول لقسم الأرشيف لتصدير وحذف سنة سابقة لتوفير مساحة مجانية.'
          : null
      });
    }

    // 2. POST: Handle Actions
    const action = req.body?.action;

    // Action A: Export Archive for a Year
    if (action === 'exportYear') {
      const year = String(req.body.year || '').trim();
      if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: 'invalid-year' });

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const exportData = {};
      let totalRecords = 0;

      for (const item of ARCHIVE_TABLES) {
        try {
          let q = admin.from(item.table).select('*');
          if (item.table === 'lab_expenses') {
            q = q.like('month', `${year}-%`);
          } else {
            q = q.gte('date', startDate).lte('date', endDate);
          }
          const { data, error } = await q;
          if (!error && Array.isArray(data)) {
            exportData[item.table] = data;
            totalRecords += data.length;
          } else {
            exportData[item.table] = [];
          }
        } catch (_err) {
          exportData[item.table] = [];
        }
      }

      return res.status(200).json({
        ok: true,
        year,
        totalRecords,
        data: exportData
      });
    }

    // Action B: Purge Year Data (Preserves Patients, Doctors, Employees, Settings)
    if (action === 'purgeYear') {
      const year = String(req.body.year || '').trim();
      if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: 'invalid-year' });

      const requiredPhrase = `حذف أرشيف سنة ${year}`;
      const typed = String(req.body.confirmationText || '').trim();
      if (typed !== requiredPhrase) {
        return res.status(400).json({ error: 'confirmation-required', requiredPhrase });
      }

      // Try RPC first
      try {
        const { data: rpcData, error: rpcErr } = await admin.rpc('purge_year_data', { p_year: year });
        if (!rpcErr && rpcData && rpcData.ok) {
          return res.status(200).json(rpcData);
        }
      } catch (_rpcE) {}

      // Fallback: Delete table by table
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const deleted = {};
      let totalDeleted = 0;

      for (const item of ARCHIVE_TABLES) {
        try {
          let q = admin.from(item.table).delete();
          if (item.table === 'lab_expenses') {
            q = q.like('month', `${year}-%`);
          } else {
            q = q.gte('date', startDate).lte('date', endDate);
          }
          const { data, error } = await q.select('id');
          if (!error && Array.isArray(data)) {
            deleted[item.table] = data.length;
            totalDeleted += data.length;
          }
        } catch (_tErr) {}
      }

      return res.status(200).json({
        ok: true,
        year,
        totalDeleted,
        deleted
      });
    }

    // Action C: Wipe Entire Business Data
    if (action === 'wipeBusinessData') {
      const phrase = String(req.body.confirmationText || '').trim();
      if (phrase !== 'حذف كل بيانات المستشفى') {
        return res.status(400).json({ error: 'confirmation-required', requiredPhrase: 'حذف كل بيانات المستشفى' });
      }
      try {
        const { data: rpcData, error: rpcError } = await admin.rpc('wipe_business_data');
        if (!rpcError && rpcData && rpcData.ok) {
          return res.status(200).json(rpcData);
        }
      } catch (_rpcErr) {}

      const deleted = {};
      let totalDeleted = 0;
      for (const collection of COLLECTIONS) {
        try {
          const { data, error } = await admin.from(collection).delete().neq('id', '___non_existent___').select('id');
          if (!error && Array.isArray(data)) {
            deleted[collection] = data.length;
            totalDeleted += data.length;
          }
        } catch (_tErr) {}
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
    }

    return res.status(400).json({ error: 'unknown-action' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.code || e.message || 'data-action-failed' });
  }
};
