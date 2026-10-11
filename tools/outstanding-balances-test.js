/**
 * tools/outstanding-balances-test.js
 * Comprehensive tests for Outstanding Balances, Patient Index linking,
 * field normalization, financial source of truth, and reconciliation.
 */

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const indexHtml = fs.readFileSync('index.html', 'utf8');

function setupSandbox(extra = {}) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Date, Math, Number, String, Object, JSON, Promise, Error, RegExp, Array, Map, Set,
    todayISO: () => '2026-10-11',
    fmt: n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    esc: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    waIconButtonHTML: (phone, cls, id) => `<button class="${cls}" data-id="${id}">WA</button>`,
    exportTableToCSV: (filename, headers, rows) => ({ filename, headers, rows }),
    openWhatsAppChat: () => {},
    route: () => {},
    state: { tablePage: {}, page: 'outstandingBalancesClinic' },
    DB: { visitsClinic: [], visitsDental: [], visitsOperations: [], visitsLabs: [], visitsRadiology: [] },
    ...extra
  };
  vm.createContext(sandbox);

  // Extract functions from index.html
  const extractFn = (name) => {
    const start = indexHtml.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function ${name} not found in index.html`);
    // Find matching function body
    let braceCount = 0;
    let started = false;
    let end = start;
    for (let i = start; i < indexHtml.length; i++) {
      if (indexHtml[i] === '{') {
        braceCount++;
        started = true;
      } else if (indexHtml[i] === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }
    return indexHtml.slice(start, end);
  };

  const code = [
    'const OUTSTANDING_PAGE_SIZE = 20;',
    'const OUTSTANDING_SECTION_META = ' + indexHtml.match(/const OUTSTANDING_SECTION_META = \{[\s\S]*?\n\};/)[0].replace('const OUTSTANDING_SECTION_META = ', ''),
    'this.OUTSTANDING_SECTION_META = OUTSTANDING_SECTION_META;',
    'const OUTSTANDING_PAGE_SECTION = ' + (indexHtml.match(/const OUTSTANDING_PAGE_SECTION = \{[\s\S]*?\n\};/)?.[0]?.replace('const OUTSTANDING_PAGE_SECTION = ', '') || '{\n  outstandingBalancesClinic: "clinic",\n  outstandingBalancesDental: "dental",\n  outstandingBalancesOperations: "operations",\n  outstandingBalancesLabs: "labs",\n  outstandingBalancesRadiology: "radiology"\n};'),
    'this.OUTSTANDING_PAGE_SECTION = OUTSTANDING_PAGE_SECTION;',
    extractFn('sortByEntryOrderDesc'),
    extractFn('getPatientFields'),
    extractFn('patientKey'),
    extractFn('visitRemaining'),
    extractFn('buildPatientIndexLookups'),
    extractFn('matchVisitToPatientIndex'),
    extractFn('groupPatients'),
    extractFn('getIndexReconciliationMismatches'),
    extractFn('outstandingPaginationHTML'),
    extractFn('outstandingPageInfo'),
    extractFn('outstandingVisits'),
    extractFn('renderOutstandingCard')
  ].join('\n\n');

  vm.runInContext(code, sandbox);
  return sandbox;
}

(async () => {
  console.log('🧪 بدء تشغيل اختبارات صفحات المستحقات وربطها بملفات المرضى...');
  const sb = setupSandbox();

  // 1. اختبار زيارة قديمة تحتوي على name بدل patient ومريض مطابق في الفهرس
  {
    const legacyVisits = [
      { id: 'v101', name: 'أحمد محمود', fileNo: '101', total: 200, paid: 50, kind: 'عيادات', kindKey: 'visitsClinic' }
    ];
    const patientIndex = [
      { id: 'F:101', fileNo: '101', name: 'أحمد محمود مصطفى', phone: '01012345678', totalDue: 150 }
    ];

    const debtors = sb.groupPatients(legacyVisits, patientIndex);
    assert.strictEqual(debtors.length, 1, 'يجب تجميع زيارة المريض في سجل واحد');
    assert.strictEqual(debtors[0].name, 'أحمد محمود مصطفى', 'يجب إثراء الاسم المكتمل من فهرس المرضى');
    assert.strictEqual(debtors[0].fileNo, '101', 'يجب مطابقة وتثبيت رقم الملف');
    assert.strictEqual(debtors[0].phone, '01012345678', 'يجب إثراء الهاتف من فهرس المرضى');
    assert.strictEqual(debtors[0].totalDue, 150, 'المبلغ المتبقي يجب أن يكون 150 (200 - 50)');
    assert.strictEqual(debtors[0].totalPaid, 50, 'المبلغ المدفوع يجب أن يكون 50');
    console.log('✅ [اختبار 1] زيارة قديمة بحقل name ومطابقة الفهرس — نجح');
  }

  // 2. اختبار زيارة تحتوي على رقم ملف أو هاتف رقمي دون خطأ
  {
    const numericVisits = [
      { id: 'v201', patient: 'سارة علي', fileNo: 502, phone: 1012345678, total: 300, paid: 100, kind: 'عيادات', kindKey: 'visitsClinic' }
    ];
    assert.doesNotThrow(() => {
      const debtors = sb.groupPatients(numericVisits, []);
      assert.strictEqual(debtors.length, 1);
      assert.strictEqual(debtors[0].fileNo, '502', 'رقم الملف يجب أن يتحول لنص آمن');
      assert.strictEqual(debtors[0].phone, '1012345678', 'رقم الهاتف يجب أن يتحول لنص آمن');
      assert.strictEqual(debtors[0].totalDue, 200);
    }, 'يجب ألا يحدث خطأ عند وجود أرقام ملفات أو هواتف رقمية');
    console.log('✅ [اختبار 2] أرقام الملفات والهواتف الرقمية — نجح');
  }

  // 3. اختبار مريض لديه عدة زيارات ومدفوعات جزئية دون تكرار أو فقدان
  {
    const multiVisits = [
      { id: 'v301', patient: 'كريم خالد', phone: '0122222222', total: 100, paid: 40, kind: 'عيادات', kindKey: 'visitsClinic' },
      { id: 'v302', patient: 'كريم خالد', phone: '0122222222', total: 150, paid: 150, kind: 'عيادات', kindKey: 'visitsClinic' },
      { id: 'v303', patient: 'كريم خالد', phone: '0122222222', total: 200, paid: 50, kind: 'عيادات', kindKey: 'visitsClinic' }
    ];
    const debtors = sb.groupPatients(multiVisits, []);
    assert.strictEqual(debtors.length, 1, 'يجب تجميع الزيارات الثلاث لنفس المريض في مجموعة واحدة');
    assert.strictEqual(debtors[0].visits.length, 3, 'يجب الحفاظ على جميع الزيارات الثلاث');
    assert.strictEqual(debtors[0].totalPaid, 240, 'إجمالي المدفوع: 40 + 150 + 50 = 240');
    assert.strictEqual(debtors[0].totalDue, 210, 'إجمالي المتبقي: 60 + 0 + 150 = 210');
    console.log('✅ [اختبار 3] زيارات متعددة ومدفوعات جزئية — نجح');
  }

  // 4. وجود مريض في فهرس الملفات برصيد موجب دون زيارات مطابقة (اكتشاف عدم التطابق)
  {
    const emptyVisits = [];
    const patientIndex = [
      { id: 'F:999', fileNo: '999', name: 'مريض أرشيف', phone: '01111111111', totalDue: 450 }
    ];
    const debtors = sb.groupPatients(emptyVisits, patientIndex);
    assert.strictEqual(debtors.length, 0, 'المصدر المالي الحقيقي للديون لا يختلق زيارات وهمية');

    const mismatches = sb.getIndexReconciliationMismatches(debtors, patientIndex);
    assert.strictEqual(mismatches.length, 1, 'يجب اكتشاف مريض الفهرس في تقرير المصالحة');
    assert.strictEqual(mismatches[0].fileNo, '999');
    assert.strictEqual(mismatches[0].indexDue, 450);
    assert.strictEqual(mismatches[0].visitsDue, 0);
    assert.ok(mismatches[0].reason.includes('دون وجود سجلات زيارات'), 'يجب توضيح سبب عدم التطابق');
    console.log('✅ [اختبار 4] مصالحة رصيد موجب في الفهرس دون زيارات مطابقة — نجح');
  }

  // 5. اختبار مستقل لصفحات مستحقات الأقسام الخمسة (عيادات، أسنان، عمليات، تحاليل، أشعة)
  {
    const sections = ['clinic', 'dental', 'operations', 'labs', 'radiology'];
    for (const sec of sections) {
      const meta = sb.OUTSTANDING_SECTION_META[sec];
      assert.ok(meta, `بيانات القسم ${sec} يجب أن تكون معرّفة`);
      assert.ok(meta.listKey, `listKey للقسم ${sec} يجب أن يتوفر`);
      assert.ok(meta.csv, `اسم ملف CSV للقسم ${sec} يجب أن يتوفر`);

      const sampleVisits = [
        { id: `v_${sec}`, patient: `مريض ${meta.label}`, total: 100, paid: 30, kind: meta.kind, kindKey: meta.listKey }
      ];
      const debtors = sb.groupPatients(sampleVisits, []);
      assert.strictEqual(debtors.length, 1);
      assert.strictEqual(debtors[0].totalDue, 70);

      const info = sb.outstandingPageInfo(debtors, `outstanding_${meta.listKey}`);
      const html = sb.renderOutstandingCard(meta, debtors, info);
      assert.ok(html.includes(meta.label), `البطاقة يجب أن تحتوي عنوان القسم ${meta.label}`);
      assert.ok(html.includes('70'), 'البطاقة يجب أن تعرض المبلغ المتبقي 70');
      assert.ok(html.includes('رقم الملف'), 'البطاقة يجب أن تحتوي على عمود رقم الملف');
    }
    console.log('✅ [اختبار 5] الأقسام الخمسة والبطاقات والتصدير — نجح');
  }

  // 6. اختبار استمرار ظهور جميع السجلات عبر الصفحات بأكثر من 100 سجل اصطناعي
  {
    const largeList = Array.from({ length: 125 }, (_, i) => ({
      id: `v_bulk_${i}`,
      patient: `مريض تجريبي ${i + 1}`,
      fileNo: String(1000 + i),
      phone: `0100000${String(i).padStart(3, '0')}`,
      total: 100,
      paid: 20,
      kind: 'عيادات',
      kindKey: 'visitsClinic'
    }));

    const debtors = sb.groupPatients(largeList, []);
    assert.strictEqual(debtors.length, 125, 'جميع الـ 125 مريض يجب تجميعهم بدقة');

    const page1 = sb.outstandingPageInfo(debtors, 'outstanding_test');
    assert.strictEqual(page1.totalPages, 7, '125 سجل بحجم صفحة 20 ينتج 7 صفحات');
    assert.strictEqual(page1.pageItems.length, 20, 'الصفحة الأولى تحتوي على 20 عنصر');
    assert.strictEqual(page1.total, 125);

    sb.state.tablePage['outstanding_test'] = 7;
    const page7 = sb.outstandingPageInfo(debtors, 'outstanding_test');
    assert.strictEqual(page7.pageItems.length, 5, 'الصفحة الأخيرة السابعة تحتوي على المتبقي 5 عناصر');
    console.log('✅ [اختبار 6] استمرار ظهور كافة السجلات عبر الصفحات بأكثر من 100 سجل — نجح');
  }

  console.log('====================================================');
  console.log('🎉 نجحت جميع اختبارات صفحات المستحقات وربطها بملفات المرضى بنسبة 100%!');
  console.log('====================================================');
})().catch(err => {
  console.error('❌ فشل الاختبار:', err);
  process.exit(1);
});
