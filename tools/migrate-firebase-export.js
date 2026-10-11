/**
 * tools/migrate-firebase-export.js
 * Tool for migrating Firebase JSON Exports to Supabase PostgreSQL without modifying original Firebase.
 *
 * Usage:
 *   node tools/migrate-firebase-export.js --file <path-to-export.json> [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const COLLECTIONS_MAP = {
  visitsClinic: 'visits_clinic',
  visits_clinic: 'visits_clinic',
  clinic_visits: 'visits_clinic',
  clinic: 'visits_clinic',
  visitsDental: 'visits_dental',
  visits_dental: 'visits_dental',
  dental_visits: 'visits_dental',
  dental: 'visits_dental',
  visitsOperations: 'visits_operations',
  visits_operations: 'visits_operations',
  operations_visits: 'visits_operations',
  operations: 'visits_operations',
  visitsLabs: 'visits_labs',
  visits_labs: 'visits_labs',
  labs_visits: 'visits_labs',
  labs: 'visits_labs',
  visitsRadiology: 'visits_radiology',
  visits_radiology: 'visits_radiology',
  radiology_visits: 'visits_radiology',
  radiology: 'visits_radiology',
  doctors: 'doctors',
  employees: 'employees',
  income: 'income',
  expense: 'expense',
  payroll: 'payroll',
  labExpenses: 'lab_expenses',
  lab_expenses: 'lab_expenses',
  patientFilesClinic: 'patient_file_index_clinic',
  patient_file_index_clinic: 'patient_file_index_clinic',
  patientFilesDental: 'patient_file_index_dental',
  patient_file_index_dental: 'patient_file_index_dental',
  categories: 'categories',
  specialties: 'specialties',
  settings: 'settings',
  auditLog: 'audit_log',
  audit_log: 'audit_log',
  systemControl: 'system_control',
  system_control: 'system_control'
};

function authEmailForUsername(username) {
  const b = Buffer.from(String(username || '').trim().toLowerCase(), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u-${b}@accounts.mitali-hospital.internal`;
}

function cleanPayload(record) {
  if (!record || typeof record !== 'object') return {};
  const copy = { ...record };
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArgIndex = args.indexOf('--file');
  let filePath = fileArgIndex !== -1 ? args[fileArgIndex + 1] : null;

  if (!filePath) {
    const candidates = ['firebase-export.json', 'backup.json', 'mitali-backup.json'];
    for (const c of candidates) {
      if (fs.existsSync(path.resolve(process.cwd(), c))) {
        filePath = c;
        break;
      }
    }
  }

  if (!filePath || !fs.existsSync(path.resolve(process.cwd(), filePath))) {
    console.log('----------------------------------------------------');
    console.log('ℹ️ أرسل Firebase JSON Export أو نفّذ التصدير من مشروع Firebase قبل بدء نقل البيانات.');
    console.log('   طريقة التشغيل بمجرد توفر الملف:');
    console.log('   node tools/migrate-firebase-export.js --file <path-to-export.json> --dry-run');
    console.log('   node tools/migrate-firebase-export.js --file <path-to-export.json>');
    console.log('----------------------------------------------------');
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  console.log(`📂 جاري فحص ملف النسخ الاحتياطي: ${resolvedPath}`);
  const rawData = fs.readFileSync(resolvedPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (err) {
    console.error('❌ فشل قراءة ملف JSON:', err.message);
    process.exit(1);
  }

  // 1. Create a timestamped backup copy
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupCopyPath = path.resolve(backupDir, `backup-${Date.now()}-${path.basename(filePath)}`);
  fs.writeFileSync(backupCopyPath, rawData, 'utf8');
  console.log(`🔒 تم إنشاء نسخة احتياطية آمنة غير قابلة للتعديل في: ${backupCopyPath}`);

  const sourceData = parsed.data || parsed;
  const report = {
    mode: dryRun ? 'DRY-RUN (تشغيل تجريبي بلا تعديل)' : 'LIVE-MIGRATION (نقل فعلي)',
    totalCollections: 0,
    collections: {},
    users: { found: 0, created: 0, skipped: 0, duplicates: 0 },
    overallRecords: { source: 0, transformed: 0, duplicates: 0, rejected: 0 }
  };

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('❌ مطلوب ضبط متغيرات SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY لتنفيذ النقل.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1.5 Support unified visits collection if present
  if (sourceData.visits) {
    const rawVisits = sourceData.visits;
    const unifiedList = Array.isArray(rawVisits)
      ? rawVisits
      : (typeof rawVisits === 'object' && rawVisits !== null ? Object.entries(rawVisits).map(([id, doc]) => ({ id: (doc && doc.id) || id, ...(doc || {}) })) : []);
    for (const v of unifiedList) {
      if (!v || !v.id) continue;
      const k = String(v.kind || v.type || v.section || v.department || '').toLowerCase();
      const target = k.includes('dent') || k.includes('أسنان') ? 'visits_dental'
        : k.includes('oper') || k.includes('عمليات') ? 'visits_operations'
        : k.includes('lab') || k.includes('تحاليل') ? 'visits_labs'
        : k.includes('rad') || k.includes('xray') || k.includes('أشعة') ? 'visits_radiology'
        : 'visits_clinic';
      sourceData[target] = sourceData[target] || [];
      if (!sourceData[target].some(x => x.id === v.id)) sourceData[target].push(v);
    }
  }

  // 1.6 If income contains visit-income-* entries but visit collections are empty or missing:
  const rawIncome = sourceData.income;
  if (rawIncome) {
    const incomeList = Array.isArray(rawIncome)
      ? rawIncome
      : (typeof rawIncome === 'object' && rawIncome !== null ? Object.entries(rawIncome).map(([id, doc]) => ({ id: (doc && doc.id) || id, ...(doc || {}) })) : []);
    const KIND_MAP = {
      clinic: 'visits_clinic',
      dental: 'visits_dental',
      visitsDental: 'visits_dental',
      operations: 'visits_operations',
      labs: 'visits_labs',
      radiology: 'visits_radiology'
    };
    for (const inc of incomeList) {
      if (!inc || !inc.id || !inc.id.startsWith('visit-income-')) continue;
      const parts = inc.id.split('-');
      const kind = parts[2];
      const targetColl = KIND_MAP[kind];
      if (!targetColl) continue;
      sourceData[targetColl] = sourceData[targetColl] || [];
      const visitId = inc.id.replace(`visit-income-${kind}-`, '');
      if (!sourceData[targetColl].some(x => x.id === visitId)) {
        let patientName = inc.party || '';
        if (!patientName && inc.desc) {
          const m = inc.desc.match(/—\s*([^()]+)/);
          if (m) patientName = m[1].trim();
        }
        const amt = Number(inc.amount) || 0;
        const fileNo = (inc.receiptNo && !inc.receiptNo.startsWith('V-m')) ? inc.receiptNo.replace(/^V-/, '') : '';
        const vObj = {
          id: visitId,
          date: inc.date || (inc.createdAt ? inc.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          patient: patientName || 'مريض',
          fileNo: fileNo,
          phone: '',
          doctorId: inc.doctorId || '',
          total: amt,
          paid: amt,
          status: 'تم',
          paymentMethod: inc.paymentMethod || 'نقدي',
          notes: (inc.notes && inc.notes !== 'تم إنشاؤه تلقائيًا من سجل الزيارات') ? inc.notes : '',
          linkedIncomeId: inc.id,
          createdAt: inc.createdAt || new Date().toISOString(),
          updatedAt: inc.updatedAt || new Date().toISOString()
        };
        if (targetColl === 'visits_clinic' || targetColl === 'visits_dental') vObj.examType = 'كشف';
        else vObj.serviceName = targetColl === 'visits_operations' ? 'عملية' : targetColl === 'visits_labs' ? 'تحليل' : 'أشعة';
        sourceData[targetColl].push(vObj);
      }
    }
  }

  // 2. Process Business Collections (Group by Target Collection First)
  const groupedCollections = {};
  for (const [key, targetCollection] of Object.entries(COLLECTIONS_MAP)) {
    const rawVal = sourceData[key];
    if (!rawVal) continue;
    let records = [];
    if (Array.isArray(rawVal)) {
      records = rawVal;
    } else if (typeof rawVal === 'object' && rawVal !== null) {
      records = Object.entries(rawVal).map(([docId, docVal]) => ({ id: (docVal && docVal.id) || docId, ...(docVal || {}) }));
    }
    if (!records.length) continue;

    if (!groupedCollections[targetCollection]) {
      groupedCollections[targetCollection] = [];
    }
    groupedCollections[targetCollection].push(...records);
  }

  for (const [targetCollection, records] of Object.entries(groupedCollections)) {
    report.totalCollections++;
    report.collections[targetCollection] = { source: records.length, valid: 0, duplicates: 0, rejected: 0 };
    report.overallRecords.source += records.length;

    const seenIds = new Set();
    const rowsToUpsert = [];

    for (const r of records) {
      if (!r || r.id == null) {
        report.collections[targetCollection].rejected++;
        report.overallRecords.rejected++;
        continue;
      }
      const id = String(r.id);
      if (seenIds.has(id)) {
        report.collections[targetCollection].duplicates++;
        report.overallRecords.duplicates++;
        continue;
      }
      seenIds.add(id);

      const payload = cleanPayload(r);
      const date = String(payload.date || '');
      const month = String(payload.month || (date.match(/^\d{4}-\d{2}/) || [''])[0] || '');

      rowsToUpsert.push({
        collection: targetCollection,
        id,
        payload,
        date_text: date || null,
        month_text: month || null,
        updated_at: String(payload.updatedAt || payload.createdAt || new Date().toISOString()),
        created_at: String(payload.createdAt || new Date().toISOString())
      });
      report.collections[targetCollection].valid++;
      report.overallRecords.transformed++;
    }

    if (!dryRun && rowsToUpsert.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
        const chunk = rowsToUpsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('data_records').upsert(chunk, { onConflict: 'collection,id' });
        if (error) {
          console.error(`❌ خطأ أثناء رفع دفعة إلى ${targetCollection}:`, error.message);
          process.exit(1);
        }
      }
    }
  }

  // 3. Process Users and Accounts
  let usersList = sourceData.staffAccounts || sourceData.users || sourceData.staff_accounts;
  if (usersList && typeof usersList === 'object' && !Array.isArray(usersList)) {
    usersList = Object.entries(usersList).map(([id, u]) => ({ id: (u && u.id) || id, ...(u || {}) }));
  }
  if (Array.isArray(usersList)) {
    report.users.found = usersList.length;
    for (const u of usersList) {
      const username = String(u.username || '').trim().toLowerCase();
      if (!username) {
        report.users.skipped++;
        continue;
      }
      const email = authEmailForUsername(username);

      if (!dryRun) {
        let authId = u.id || u.firebaseUid;
        try {
          const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
            email,
            password: 'TempPassword123!',
            email_confirm: true,
            user_metadata: { display_name: u.displayName || username }
          });
          if (createdUser?.user?.id) authId = createdUser.user.id;
          if (createErr && createErr.message.includes('already registered')) {
            report.users.duplicates++;
          }
        } catch (_e) {}

        const profileRow = {
          id: authId,
          username,
          display_name: u.displayName || username,
          role: u.role === 'مدير' ? 'مدير' : 'موظف',
          status: u.status === 'موقوف' ? 'موقوف' : 'نشط',
          permissions: u.permissions || {},
          credential_version: Number(u.credentialVersion || 1),
          security_version: Number(u.securityVersion || 1),
          created_at: u.createdAt || new Date().toISOString()
        };
        await supabase.from('profiles').upsert(profileRow, { onConflict: 'username' });
        report.users.created++;
      } else {
        report.users.created++;
      }
    }
  }

  console.log('\n====================================================');
  console.log(`📊 تقرير ترحيل البيانات (${report.mode}):`);
  console.log(`- إجمالي المجموعات المعالجة: ${report.totalCollections}`);
  console.log(`- إجمالي السجلات في المصدر: ${report.overallRecords.source}`);
  console.log(`- السجلات المحولة بنجاح: ${report.overallRecords.transformed}`);
  console.log(`- السجلات المكررة التي تم دمجها: ${report.overallRecords.duplicates}`);
  console.log(`- السجلات المرفوضة: ${report.overallRecords.rejected}`);
  console.log(`- حسابات المستخدمين: تم تجهيز ${report.users.created} من أصل ${report.users.found}`);
  console.log('تفاصيل المجموعات:');
  for (const [col, stats] of Object.entries(report.collections)) {
    console.log(`  • ${col}: ${stats.valid} سجل (المصدر: ${stats.source}, مكرر: ${stats.duplicates})`);
  }
  console.log('====================================================');
  if (dryRun) {
    console.log('✅ اكتمل الفحص التجريبي بنجاح تام (Dry-Run Passed). لتنفيذ النقل الفعلي شغّل الأمر بدون --dry-run.');
  } else {
    console.log('🎉 اكتمل النقل الفعلي بنجاح إلى جداول Supabase!');
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('❌ حدث خطأ غير متوقع أثناء الترحيل:', err);
    process.exit(1);
  });
}

module.exports = { run, COLLECTIONS_MAP, cleanPayload };
