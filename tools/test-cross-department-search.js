const assert = require('assert');

// 1. Test periodMatches
function periodMatches(dateStr, granularity, value) {
  if (granularity === "all") return true;
  const d = String(dateStr || "").trim();
  if (!d) return false;
  const cleanDate = d.slice(0, 10);
  const cleanVal = String(value || "").trim();
  if (!cleanVal) return true;
  if (granularity === "day") return cleanDate === cleanVal.slice(0, 10);
  if (granularity === "year") return cleanDate.slice(0, 4) === cleanVal.slice(0, 4);
  return cleanDate.slice(0, 7) === cleanVal.slice(0, 7);
}

assert.strictEqual(periodMatches("2026-10-12", "day", "2026-10-12"), true);
assert.strictEqual(periodMatches("2026-10-12T14:30:00Z", "day", "2026-10-12"), true);
assert.strictEqual(periodMatches("2026-10-12", "month", "2026-10"), true);
assert.strictEqual(periodMatches("2026-10-12T14:30:00Z", "month", "2026-10"), true);
assert.strictEqual(periodMatches("2026-09-30", "month", "2026-10"), false);
assert.strictEqual(periodMatches("2026-10-12", "year", "2026"), true);
assert.strictEqual(periodMatches("2026-10-12", "all", null), true);
console.log('PASS: periodMatches tests');

// 2. Test unique income vouchers in syncVisitIncomeLink logic
const DB = { income: [] };
function syncVisitIncomeLinkTest(rec, kind) {
  const targetIncomeId = rec.linkedIncomeId || `visit-income-${kind}-${rec.id}`;
  const stableReceiptNo = rec.receiptNo || `V-${kind}-${rec.id}`;
  const linked = DB.income.find(x => x.id === targetIncomeId || (rec.linkedIncomeId && x.id === rec.linkedIncomeId));
  const paid = Number(rec.paid) || 0;
  if (paid > 0) {
    if (linked) {
      linked.amount = paid;
    } else {
      DB.income.push({
        id: targetIncomeId,
        receiptNo: stableReceiptNo,
        party: rec.patient,
        amount: paid
      });
    }
    rec.linkedIncomeId = targetIncomeId;
  }
}

// Two visits for same patient with same fileNo in different departments
const v1 = { id: "visit-1", fileNo: "100", patient: "تيست 6", paid: 300 };
const v2 = { id: "visit-2", fileNo: "100", patient: "تيست 6", paid: 50 };

syncVisitIncomeLinkTest(v1, "operations");
syncVisitIncomeLinkTest(v2, "clinic");

assert.strictEqual(DB.income.length, 2, "Must create 2 separate income vouchers");
assert.strictEqual(DB.income[0].id, "visit-income-operations-visit-1");
assert.strictEqual(DB.income[0].amount, 300);
assert.strictEqual(DB.income[1].id, "visit-income-clinic-visit-2");
assert.strictEqual(DB.income[1].amount, 50);
console.log('PASS: income voucher isolation tests');

console.log('ALL UNIT CHECKS PASSED!');
