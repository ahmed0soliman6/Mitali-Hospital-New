/**
 * tools/legacy-deferred-status-test.js
 * Independent regression test for legacy Firebase imported visits with status "مؤجل",
 * status "غير مدفوع", modern visit remaining calculations, and totalAmount/paidAmount fields.
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

  // Extract function visitRemaining from index.html
  const extractFn = (name) => {
    const start = indexHtml.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Function ${name} not found in index.html`);
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
    extractFn('sortByEntryOrderDesc'),
    extractFn('getPatientFields'),
    extractFn('patientKey'),
    extractFn('visitRemaining'),
    extractFn('buildPatientIndexLookups'),
    extractFn('matchVisitToPatientIndex'),
    extractFn('groupPatients')
  ].join('\n\n');

  vm.runInContext(code, sandbox);
  return sandbox;
}

(() => {
  console.log('🧪 بدء تشغيل اختبار انحدار الحالات القديمة ومستحقات "مؤجل"...');
  const sb = setupSandbox();

  // Test 1: Legacy record { amount: 1500, status: "مؤجل" } -> remaining = 1500
  {
    const legacyDeferred = { amount: 1500, status: 'مؤجل' };
    const remaining = sb.visitRemaining(legacyDeferred);
    assert.strictEqual(remaining, 1500, 'السجل القديم بحالة "مؤجل" يجب أن يكون المتبقي 1500');
    console.log('✅ [تست 1] سجل قديم { amount: 1500, status: "مؤجل" } -> متبقي 1500 — نجح');
  }

  // Test 1b: Legacy record with spaces { amount: 1500, status: " مؤجل " } -> remaining = 1500
  {
    const legacySpaced = { amount: 1500, status: ' مؤجل ' };
    const remaining = sb.visitRemaining(legacySpaced);
    assert.strictEqual(remaining, 1500, 'السجل القديم بحالة تحتوي على مسافات يجب أن يتطابق بعد trim');
    console.log('✅ [تست 1b] سجل قديم { amount: 1500, status: " مؤجل " } بحسب الجودة — نجح');
  }

  // Test 2: Legacy record { amount: 1200, status: "غير مدفوع" } -> remaining = 1200
  {
    const legacyUnpaid = { amount: 1200, status: 'غير مدفوع' };
    const remaining = sb.visitRemaining(legacyUnpaid);
    assert.strictEqual(remaining, 1200, 'السجل القديم بحالة "غير مدفوع" يجب أن يكون المتبقي 1200');
    console.log('✅ [تست 2] سجل قديم بحالة "غير مدفوع" { amount: 1200 } -> متبقي 1200 — نجح');
  }

  // Test 3: Modern record { total: 1500, paid: 1500 } -> remaining = 0
  {
    const modernPaid = { total: 1500, paid: 1500 };
    const remaining = sb.visitRemaining(modernPaid);
    assert.strictEqual(remaining, 0, 'السجل الحديث المسدد بالكامل يجب أن يكون المتبقي صفرًا');
    console.log('✅ [تست 3] سجل حديث إجماليه 1500 ومدفوعه 1500 -> متبقي 0 — نجح');
  }

  // Test 4: Modern record { total: 1500, paid: 400 } -> remaining = 1100
  {
    const modernPartial = { total: 1500, paid: 400 };
    const remaining = sb.visitRemaining(modernPartial);
    assert.strictEqual(remaining, 1100, 'السجل الحديث المسدد جزئيًا (400) يجب أن يكون المتبقي 1100');
    console.log('✅ [تست 4] سجل حديث إجماليه 1500 ومدفوعه 400 -> متبقي 1100 — نجح');
  }

  // Test 5: Record using totalAmount and paidAmount { totalAmount: 1500, paidAmount: 400 } -> remaining = 1100
  {
    const customFields = { totalAmount: 1500, paidAmount: 400 };
    const remaining = sb.visitRemaining(customFields);
    assert.strictEqual(remaining, 1100, 'السجل بحقول totalAmount و paidAmount يجب أن يحسب المتبقي 1100');
    console.log('✅ [تست 5] سجل يستخدم totalAmount و paidAmount -> متبقي 1100 — نجح');
  }

  // Test 6: Verify groupPatients correctly aggregates legacy deferred visit into outstanding debtors
  {
    const legacyVisits = [
      { id: 'v_def_1', patient: 'ياسر الإسناوي', phone: '01199887766', fileNo: '552', amount: 1500, status: 'مؤجل', kind: 'أسنان', kindKey: 'visitsDental' }
    ];
    const debtors = sb.groupPatients(legacyVisits, []);
    assert.strictEqual(debtors.length, 1, 'يجب تجميع مريض السجل القديم المؤجل');
    assert.strictEqual(debtors[0].name, 'ياسر الإسناوي');
    assert.strictEqual(debtors[0].totalDue, 1500, 'المستحق الكلي يجب أن يظهر 1500');
    console.log('✅ [تست 6] إظهار السجل القديم بحالة "مؤجل" داخل قائمة المستحقين (groupPatients) — نجح');
  }

  console.log('🎉 جميع اختبارات الحالات القديمة ومستحقات "مؤجل" نجحت بنجاح تام!');
})();
