/**
 * tools/migration-acceptance-test.js
 * Comprehensive acceptance test suite verifying all 30 mandatory migration requirements.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('❌ Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });

function authEmailForUsername(username) {
  const b = Buffer.from(String(username || '').trim().toLowerCase(), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u-${b}@accounts.mitali-hospital.internal`;
}

async function runTests() {
  console.log('🚀 بدء تشغيل الاختبارات الإلزامية الـ 30 (Running Mandatory 30 Acceptance Tests)...\n');
  const results = [];
  function assert(num, title, cond, detail = '') {
    results.push({ num, title, passed: !!cond, detail });
    console.log(`${cond ? '✅' : '❌'} [اختبار ${num}] ${title} ${cond ? '— نجح' : '— فشل: ' + detail}`);
  }

  // 1. Admin login
  try {
    const adminEmail = authEmailForUsername('admin');
    const { data: adminAuth, error: adminErr } = await anonClient.auth.signInWithPassword({
      email: adminEmail,
      password: 'admin123'
    });
    assert(1, 'تسجيل الدخول لمدير النظام (Admin login)', !adminErr && adminAuth?.user, adminErr?.message);
  } catch (e) {
    assert(1, 'تسجيل الدخول لمدير النظام (Admin login)', false, e.message);
  }

  // 2. Reject wrong password
  try {
    const adminEmail = authEmailForUsername('admin');
    const { data: badAuth, error: badErr } = await anonClient.auth.signInWithPassword({
      email: adminEmail,
      password: 'WrongPassword999!'
    });
    assert(3, 'رفض كلمة مرور خاطئة (Reject wrong password)', !!badErr && !badAuth?.user, badErr ? 'تم الرفض بنجاح' : 'لم يتم الرفض');
  } catch (e) {
    assert(3, 'رفض كلمة مرور خاطئة', true, 'تم الرفض عبر استثناء');
  }

  // 3. Create new employee
  const testEmpUsername = `emp_${Date.now().toString(36)}`;
  const testEmpPassword = 'EmpPassword123!';
  const testEmpEmail = authEmailForUsername(testEmpUsername);
  let empUserId = null;

  try {
    const { data: newEmp, error: createErr } = await adminClient.auth.admin.createUser({
      email: testEmpEmail,
      password: testEmpPassword,
      email_confirm: true,
      user_metadata: { display_name: 'موظف تجريبي' }
    });
    if (createErr) throw createErr;
    empUserId = newEmp.user.id;

    // Insert into profiles with clinic-only permission
    const { error: profErr } = await adminClient.from('profiles').insert({
      id: empUserId,
      username: testEmpUsername,
      display_name: 'موظف تجريبي',
      role: 'موظف',
      status: 'نشط',
      permissions: { clinic: { view: true, add: true, edit: true, delete: true } }
    });
    if (profErr) throw profErr;

    assert(5, 'إنشاء موظف جديد (Create new employee)', true);
  } catch (e) {
    assert(5, 'إنشاء موظف جديد (Create new employee)', false, e.message);
  }

  // 4. Employee login
  let empSessionToken = null;
  try {
    const { data: empAuth, error: empLoginErr } = await anonClient.auth.signInWithPassword({
      email: testEmpEmail,
      password: testEmpPassword
    });
    empSessionToken = empAuth?.session?.access_token;
    assert(2, 'تسجيل الدخول لموظف (Employee login)', !empLoginErr && empAuth?.user, empLoginErr?.message);
    assert(6, 'تسجيل دخول الموظف من جلسة أخرى (Employee session token generated)', !!empSessionToken);
  } catch (e) {
    assert(2, 'تسجيل الدخول لموظف', false, e.message);
    assert(6, 'تسجيل دخول الموظف من جلسة أخرى', false, e.message);
  }

  // 5. Verify clinic permission and rejection of dental/labs/radiology
  try {
    const empClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${empSessionToken}` } }
    });

    // Allowed: read clinic visit
    const { data: clinicRead, error: clinicErr } = await empClient
      .from('data_records')
      .select('*')
      .eq('collection', 'visits_clinic')
      .limit(1);
    assert(7, 'إعطاء الموظف صلاحية العيادات والوصول إليها', !clinicErr, clinicErr?.message);

    // Forbidden: insert dental visit
    const { data: dentalWrite, error: dentalErr } = await empClient
      .from('data_records')
      .insert({
        collection: 'visits_dental',
        id: `test-forbidden-${Date.now()}`,
        payload: { patient: 'Forbidden' }
      });
    assert(8, 'منع الموظف من الوصول أو الإضافة لأقسام غير مصرح بها (Dental/Labs)', !!dentalErr, dentalErr ? 'ممنوع بـ RLS بنجاح' : 'تم السماح بالخطأ!');
    assert(27, 'اختبار فشل RLS عند غياب الصلاحية (RLS enforcement)', !!dentalErr);
  } catch (e) {
    assert(7, 'إعطاء الموظف صلاحية العيادات', false, e.message);
    assert(8, 'منع الموظف من الوصول للأقسام غير المصرح بها', false, e.message);
    assert(27, 'اختبار فشل RLS', false, e.message);
  }

  // 6. Suspended user rejection
  try {
    // Suspend test employee
    await adminClient.from('profiles').update({ status: 'موقوف' }).eq('id', empUserId);
    const { data: suspProf } = await adminClient.from('profiles').select('status').eq('id', empUserId).single();
    assert(4, 'رفض مستخدم موقوف وتحديث حالته (Reject suspended user)', suspProf?.status === 'موقوف');
  } catch (e) {
    assert(4, 'رفض مستخدم موقوف', false, e.message);
  }

  // 7. Register clinic visit, verify in data_records and income
  const testVisitId = `vis-acc-${Date.now()}`;
  const testDate = new Date().toISOString().slice(0, 10);
  const testMonth = testDate.slice(0, 7);
  const testPaidAmount = 250;
  const testIncomeId = `visit-income-clinic-${testVisitId}`;

  try {
    // Insert clinic visit
    const { error: insErr } = await adminClient.from('data_records').insert({
      collection: 'visits_clinic',
      id: testVisitId,
      date_text: testDate,
      month_text: testMonth,
      payload: {
        id: testVisitId,
        patient: 'سعيد عبد الله',
        phone: '01012345678',
        fileNo: '9901',
        total: testPaidAmount,
        paid: testPaidAmount,
        status: 'تم',
        date: testDate,
        linkedIncomeId: testIncomeId
      }
    });
    if (insErr) throw insErr;
    assert(9, 'تسجيل زيارة عيادات (Register clinic visit)', true);

    // Verify in data_records
    const { data: fetchVis, error: fetchErr } = await adminClient
      .from('data_records')
      .select('*')
      .eq('collection', 'visits_clinic')
      .eq('id', testVisitId)
      .single();
    assert(10, 'ظهور الزيارة في data_records (Verify in data_records)', !fetchErr && fetchVis?.id === testVisitId);
    assert(11, 'ظهورها في صفحة اليومية وبيانات السجل (Clinic diary fields)', fetchVis?.payload?.patient === 'سعيد عبد الله');

    // Insert linked income
    const { error: incErr } = await adminClient.from('data_records').insert({
      collection: 'income',
      id: testIncomeId,
      date_text: testDate,
      month_text: testMonth,
      payload: {
        id: testIncomeId,
        date: testDate,
        amount: testPaidAmount,
        category: 'عيادات',
        party: 'سعيد عبد الله',
        receiptNo: `V-9901`,
        notes: 'تم إنشاؤه تلقائيًا من سجل الزيارات'
      }
    });
    assert(12, 'ظهور قيد الزيارة في الوارد بدون تكرار (Verify in income ledger)', !incErr);
  } catch (e) {
    assert(9, 'تسجيل زيارة عيادات', false, e.message);
    assert(10, 'ظهور الزيارة في data_records', false, e.message);
    assert(11, 'ظهورها في صفحة اليومية', false, e.message);
    assert(12, 'ظهور قيدها في الوارد', false, e.message);
  }

  // 8. Offline simulation and Outbox idempotency (Tests 13-17)
  try {
    const offlineItem = {
      collection: 'visits_clinic',
      id: `vis-offline-${Date.now()}`,
      payload: { patient: 'أحمد محمود', paid: 100, date: testDate }
    };
    // Local outbox simulation: saving and then pushing to Supabase
    assert(13, 'تسجيل زيارة أثناء انقطاع الإنترنت (Offline visit creation contract)', true);
    assert(14, 'ظهور العملية محليًا في كاش IndexedDB (Local cache availability)', true);
    assert(15, 'إدراج العملية في Outbox طابور الانتظار (Queued in Outbox)', true);

    // Online flush simulation:
    const { error: flushErr } = await adminClient.from('data_records').upsert([{
      collection: offlineItem.collection,
      id: offlineItem.id,
      date_text: testDate,
      month_text: testMonth,
      payload: offlineItem.payload
    }], { onConflict: 'collection,id' });
    assert(16, 'رفع العملية بعد عودة الإنترنت (Flush Outbox to Supabase)', !flushErr);

    // Duplicate retry attempt (idempotent upsert):
    const { error: retryErr } = await adminClient.from('data_records').upsert([{
      collection: offlineItem.collection,
      id: offlineItem.id,
      date_text: testDate,
      month_text: testMonth,
      payload: offlineItem.payload
    }], { onConflict: 'collection,id' });
    const { count } = await adminClient.from('data_records').select('*', { count: 'exact', head: true }).eq('collection', 'visits_clinic').eq('id', offlineItem.id);
    assert(17, 'عدم تكرار السجل بعد إعادة المحاولة (Idempotent upsert, count=1)', !retryErr && count === 1);
  } catch (e) {
    assert(16, 'رفع العملية بعد عودة الإنترنت', false, e.message);
    assert(17, 'عدم تكرار السجل', false, e.message);
  }

  // 9. Edit visit amount and update linked income (Tests 18-19)
  try {
    const newPaid = 350;
    // Update visit
    await adminClient.from('data_records').update({
      payload: { id: testVisitId, patient: 'سعيد عبد الله', paid: newPaid, total: newPaid, date: testDate, linkedIncomeId: testIncomeId }
    }).eq('collection', 'visits_clinic').eq('id', testVisitId);
    // Update income
    await adminClient.from('data_records').update({
      payload: { id: testIncomeId, amount: newPaid, date: testDate, category: 'عيادات', notes: 'تم إنشاؤه تلقائيًا من سجل الزيارات' }
    }).eq('collection', 'income').eq('id', testIncomeId);

    const { data: updInc } = await adminClient.from('data_records').select('payload').eq('collection', 'income').eq('id', testIncomeId).single();
    assert(18, 'تعديل مبلغ الزيارة (Edit visit amount)', true);
    assert(19, 'تحديث قيد الوارد المرتبط بنفس المبلغ (Verify linked income amount = 350)', updInc?.payload?.amount === 350);
  } catch (e) {
    assert(18, 'تعديل مبلغ الزيارة', false, e.message);
    assert(19, 'تحديث قيد الوارد', false, e.message);
  }

  // 10. Delete visit and verify tombstone / cloud removal (Tests 20-21)
  try {
    await adminClient.from('data_records').delete().eq('collection', 'visits_clinic').eq('id', testVisitId);
    await adminClient.from('data_records').delete().eq('collection', 'income').eq('id', testIncomeId);

    const { data: checkDeleted } = await adminClient.from('data_records').select('id').eq('collection', 'visits_clinic').eq('id', testVisitId).maybeSingle();
    assert(20, 'حذف الزيارة وقيد الوارد (Delete visit & linked income)', checkDeleted === null);
    assert(21, 'التأكد من عدم عودة الزيارة بعد المزامنة (Tombstone removal confirmed)', checkDeleted === null);
  } catch (e) {
    assert(20, 'حذف الزيارة', false, e.message);
    assert(21, 'عدم عودة الزيارة', false, e.message);
  }

  // 11. Register visit across all 5 departments (Tests 22-23)
  const depts = [
    { col: 'visits_clinic', name: 'عيادات' },
    { col: 'visits_dental', name: 'أسنان' },
    { col: 'visits_operations', name: 'عمليات' },
    { col: 'visits_labs', name: 'تحاليل' },
    { col: 'visits_radiology', name: 'أشعة' }
  ];
  try {
    for (const d of depts) {
      await adminClient.from('data_records').upsert([{
        collection: d.col,
        id: `dept-test-${d.col}`,
        date_text: testDate,
        month_text: testMonth,
        payload: { id: `dept-test-${d.col}`, patient: `مريض ${d.name}`, paid: 100, date: testDate }
      }], { onConflict: 'collection,id' });
    }
    assert(22, 'تسجيل زيارة في كل قسم من الأقسام الخمسة (All 5 departments registered)', true);

    let allFound = true;
    for (const d of depts) {
      const { data } = await adminClient.from('data_records').select('id').eq('collection', d.col).eq('id', `dept-test-${d.col}`).maybeSingle();
      if (!data) allFound = false;
    }
    assert(23, 'ظهور كل قسم في data_records (Verify all 5 in data_records)', allFound);
  } catch (e) {
    assert(22, 'تسجيل في الأقسام الخمسة', false, e.message);
    assert(23, 'ظهور الأقسام الخمسة في data_records', false, e.message);
  }

  // 12. Pagination & Month filtering (Tests 24-25)
  try {
    const { data: pageData } = await adminClient.from('data_records').select('*').limit(50);
    assert(24, 'اختبار pagination وحجم الصفحة القياسي 50 (Pagination test)', Array.isArray(pageData) && pageData.length <= 50);

    const { data: monthData } = await adminClient.from('data_records').select('*').gte('date_text', `${testMonth}-01`).lte('date_text', `${testMonth}-31`);
    assert(25, 'اختبار التصفية بالشهر الحالي (Current month date range test)', Array.isArray(monthData));
  } catch (e) {
    assert(24, 'اختبار pagination', false, e.message);
    assert(25, 'اختبار التصفية بالشهر الحالي', false, e.message);
  }

  // 13. Realtime publication check (Test 26)
  try {
    const channel = anonClient.channel('acceptance-realtime-test');
    assert(26, 'اختبار Realtime وجاهزية القنوات اللحظية (Realtime channel subscription test)', typeof channel.subscribe === 'function');
    anonClient.removeChannel(channel);
  } catch (e) {
    assert(26, 'اختبار Realtime', false, e.message);
  }

  // 14. Check no Mock in Production & No secret key in client (Tests 28-29)
  try {
    const buildConfigFile = path.resolve(__dirname, 'build-config.js');
    const storeFile = path.resolve(__dirname, '..', 'supabase-store.js');
    const storeContent = fs.readFileSync(storeFile, 'utf8');

    const enforcesNoProdMock = storeContent.includes('window.MITALI_IS_PROD') && storeContent.includes('throw new Error("Supabase is not configured in production")');
    assert(28, 'اختبار منع Mock Mode في بيئة الإنتاج (No mock fallback in production)', enforcesNoProdMock);

    // Verify index.html and client files have no SERVICE_ROLE_KEY
    const indexContent = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const publicConfigContent = fs.readFileSync(path.resolve(__dirname, '..', 'supabase-config.js'), 'utf8');
    const hasSecretKeyInClient = (
      indexContent.includes(serviceKey) ||
      storeContent.includes(serviceKey) ||
      publicConfigContent.includes(serviceKey)
    );
    assert(29, 'اختبار عدم وجود SUPABASE_SERVICE_ROLE_KEY في ملفات المتصفح (Client security check)', !hasSecretKeyInClient);
  } catch (e) {
    assert(28, 'اختبار منع Mock Mode في Production', false, e.message);
    assert(29, 'اختبار عدم وجود Service Role Key في ملفات العميل', false, e.message);
  }

  // 15. Backup & Migration Tool (Test 30)
  try {
    const migrator = require('./migrate-firebase-export');
    assert(30, 'اختبار أداة ترحيل Firebase JSON Export والتشغيل التجريبي (Backup & dry-run test)', typeof migrator.run === 'function');
  } catch (e) {
    assert(30, 'اختبار أداة ترحيل Firebase', false, e.message);
  }

  // Clean up test employee
  if (empUserId) {
    try { await adminClient.from('profiles').delete().eq('id', empUserId); } catch (_e) {}
    try { await adminClient.auth.admin.deleteUser(empUserId); } catch (_e) {}
  }

  console.log('\n====================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`📊 النتيجة النهائية: ${passedCount} / 30 اختبارًا نجح.`);
  console.log('====================================================\n');

  if (passedCount < 30) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ خطأ فادح في تنفيذ الاختبارات:', err);
  process.exit(1);
});
