const { getAdmin, userFromRequest, profile } = require('../_lib/supabase-admin');
const VISITS = [
  ['visits_clinic', 'عيادات', 'clinic'],
  ['visits_dental', 'أسنان', 'dental'],
  ['visits_operations', 'عمليات', 'operations'],
  ['visits_labs', 'تحاليل', 'labs'],
  ['visits_radiology', 'أشعة', 'radiology']
];

async function rows(db, table, month) {
  let all = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    let q = db.from(table).select('*').range(from, from + batchSize - 1);
    if (/^\d{4}-\d{2}$/.test(month)) {
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      q = q.gte('date', `${month}-01`).lte('date', `${month}-${String(last).padStart(2, '0')}`);
    }
    const { data, error } = await q;
    if (error) {
      throw Object.assign(new Error(`Failed to query table ${table}: ${error.message || error}`), { status: 500, code: error.code || 'database-error' });
    }
    if (!Array.isArray(data)) {
      throw Object.assign(new Error(`Invalid response format from database for ${table}`), { status: 500 });
    }
    all = all.concat(data);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return all.map(x => {
    const p = x.payload || {};
    return {
      ...p,
      id: x.id,
      date: x.date || p.date || '',
      month: x.month || p.month || '',
      patient: x.patient || p.patient || '',
      doctorId: x.doctor_id || p.doctorId || p.docId || '',
      doctorName: x.doctor_name || p.doctorName || '',
      paid: x.paid != null && x.paid !== '' ? Number(x.paid) : (p.paid != null ? Number(p.paid) : (p.amount != null ? Number(p.amount) : 0)),
      total: x.total != null && x.total !== '' ? Number(x.total) : (p.total != null ? Number(p.total) : 0),
      amount: x.amount != null && x.amount !== '' ? Number(x.amount) : (p.amount != null ? Number(p.amount) : (x.paid != null ? Number(x.paid) : 0)),
      feeMode: x.fee_mode || p.feeMode || 'percent',
      docPct: x.doc_pct != null && x.doc_pct !== '' ? Number(x.doc_pct) : (p.docPct != null ? Number(p.docPct) : 0),
      clinicPct: x.clinic_pct != null && x.clinic_pct !== '' ? Number(x.clinic_pct) : (p.clinicPct != null ? Number(p.clinicPct) : 0),
      docFollowupPct: x.doc_followup_pct != null && x.doc_followup_pct !== '' ? Number(x.doc_followup_pct) : (p.docFollowupPct != null ? Number(p.docFollowupPct) : undefined),
      clinicFollowupPct: x.clinic_followup_pct != null && x.clinic_followup_pct !== '' ? Number(x.clinic_followup_pct) : (p.clinicFollowupPct != null ? Number(p.clinicFollowupPct) : undefined),
      checkupClinicFee: x.checkup_clinic_fee != null && x.checkup_clinic_fee !== '' ? Number(x.checkup_clinic_fee) : (p.checkupClinicFee != null ? Number(p.checkupClinicFee) : 0),
      dailyFixedAmount: x.daily_fixed_amount != null && x.daily_fixed_amount !== '' ? Number(x.daily_fixed_amount) : (p.dailyFixedAmount != null ? Number(p.dailyFixedAmount) : 0),
      specialty: x.specialty || p.specialty || '',
      type: x.type || p.type || '',
      status: x.status || p.status || '',
      name: x.name || p.name || ''
    };
  });
}

function share(v, d) {
  const paid = Number(v.paid) || 0;
  if (!d) return { doc: 0, clinic: paid };
  const type = d.type || (d.specialty === 'أسنان' ? 'أسنان' : (d.specialty === 'تحاليل' ? 'تحاليل' : (d.specialty === 'اشعة' || d.specialty === 'أشعة' ? 'أشعة' : 'عيادات')));
  const isPercent = type === 'أسنان' || (d.feeMode || '') === 'percent';
  if (!isPercent && (d.feeMode || '') === 'fixed_visit') {
    const c = Math.min(Math.max(Number(v.clinicFeeSnapshot ?? d.checkupClinicFee) || 0, 0), paid);
    return { doc: paid - c, clinic: c };
  }
  if (!isPercent && (d.feeMode || '') === 'fixed_daily') {
    return { doc: 0, clinic: paid };
  }
  const isFollowup = v.examType === 'متابعة';
  const dpRaw = Number(isFollowup ? (d.docFollowupPct ?? d.docPct) : d.docPct) || 0;
  const cpRaw = Number(isFollowup ? (d.clinicFollowupPct ?? d.clinicPct) : d.clinicPct) || 0;
  const docRatio = dpRaw > 1 ? dpRaw / 100 : dpRaw;
  const clinicRatio = cpRaw > 1 ? cpRaw / 100 : cpRaw;
  return { doc: paid * docRatio, clinic: paid * clinicRatio };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const db = getAdmin();
    const { user } = await userFromRequest(req, db);
    const p = await profile(db, user.id);
    if (!p || p.status === 'موقوف') return res.status(403).json({ error: 'inactive-user' });

    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = /^\d{4}-\d{2}$/.test(req.query?.doctorMonth || req.query?.closingMonth)
      ? (req.query.doctorMonth || req.query.closingMonth)
      : current;

    const doctors = await rows(db, 'doctors', 'all');
    const doctorMap = new Map(doctors.map(d => [String(d.id), d]));

    const visitRows = (await Promise.all(VISITS.map(async ([c, kind, kindKey]) => (await rows(db, c, month)).map(v => ({ ...v, kind, kindKey }))))).flat();
    const income = await rows(db, 'income', month);
    const expense = await rows(db, 'expense', month);
    const payroll = await rows(db, 'payroll', month);
    const labs = await rows(db, 'lab_expenses', month);

    const byDoctor = doctors.map(d => {
      const vs = visitRows.filter(v => String(v.doctorId || '') === String(d.id));
      const docIncome = income.filter(r => String(r.doctorId || '') === String(d.id));
      const amount = vs.reduce((s, v) => s + (Number(v.paid) || 0), 0) + docIncome.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const doctorType = d.type || (d.specialty === 'أسنان' ? 'أسنان' : (d.specialty === 'تحاليل' ? 'تحاليل' : (d.specialty === 'اشعة' || d.specialty === 'أشعة' ? 'أشعة' : 'عيادات')));
      const isPercent = doctorType === 'أسنان' || (d.feeMode || '') === 'percent';
      const mode = isPercent ? 'percent' : (d.feeMode || 'fixed_visit');

      let docShare = 0;
      let clinicShare = 0;

      if (mode === 'fixed_daily') {
        const activeDays = new Set([
          ...vs.map(v => v.date).filter(Boolean),
          ...docIncome.map(r => r.date).filter(Boolean)
        ]);
        const dailyRate = Number(d.dailyFixedAmount || d.daily_fixed_amount) || 0;
        docShare = Math.max(0, dailyRate) * activeDays.size;
        clinicShare = amount - docShare;
      } else {
        const visitShares = vs.reduce((s, v) => {
          const x = share(v, d);
          return { doc: s.doc + x.doc, clinic: s.clinic + x.clinic };
        }, { doc: 0, clinic: 0 });

        const incomeShares = docIncome.reduce((s, r) => {
          const amt = Number(r.amount) || 0;
          if (r.docShare != null && r.clinicShare != null) {
            return { doc: s.doc + (Number(r.docShare) || 0), clinic: s.clinic + (Number(r.clinicShare) || 0) };
          }
          if (mode === 'fixed_visit') return { doc: s.doc, clinic: s.clinic + amt };
          const dpRaw = Number(d.docPct) || 0;
          const cpRaw = Number(d.clinicPct) || 0;
          const docRatio = dpRaw > 1 ? dpRaw / 100 : dpRaw;
          const clinicRatio = cpRaw > 1 ? cpRaw / 100 : cpRaw;
          return { doc: s.doc + (amt * docRatio), clinic: s.clinic + (amt * clinicRatio) };
        }, { doc: 0, clinic: 0 });

        docShare = visitShares.doc + incomeShares.doc;
        clinicShare = visitShares.clinic + incomeShares.clinic;
      }

      const docLabs = labs.filter(x => String(x.doctorId || x.doctor_id || '') === String(d.id));
      const labExpense = docLabs.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const netRevenue = amount - labExpense;
      clinicShare = netRevenue - docShare;

      return {
        doctorId: d.id,
        name: d.name,
        specialty: d.specialty || '',
        type: doctorType,
        count: vs.length + docIncome.length,
        rev: amount,
        grossRevenue: amount,
        labExpense,
        netRevenue,
        doc: docShare,
        docShare: docShare,
        clinic: clinicShare,
        clinicShare: clinicShare,
        mode
      };
    }).filter(x => x.count > 0 || (x.labExpense || 0) > 0).sort((a, b) => b.rev - a.rev);

    const totalIncome = income.reduce((s, x) => s + (Number(x.amount || x.total || 0) || 0), 0);
    const totalExpense = expense.reduce((s, x) => s + (Number(x.amount || x.total || 0) || 0), 0);
    const visitRevenue = visitRows.reduce((s, x) => s + (Number(x.paid) || 0), 0);

    const bySpecialty = {};
    visitRows.forEach(v => {
      const d = doctorMap.get(String(v.doctorId || ''));
      const k = d?.specialty || v.kind || 'غير محدد';
      bySpecialty[k] = (bySpecialty[k] || 0) + (Number(v.paid) || 0);
    });

    const annual = {
      year: String(req.query?.annualYear || now.getFullYear()),
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      uniquePatients: 0,
      clinicVisitsCount: 0,
      dentalVisitsCount: 0,
      byCategorySorted: [],
      byDoctorYear: [],
      availableYears: [String(now.getFullYear()), String(now.getFullYear() - 1)],
      loaded: false
    };

    const totalDocShare = byDoctor.reduce((s, x) => s + x.doc, 0);
    const assignedClinicShare = byDoctor.reduce((s, x) => s + x.clinic, 0);
    const totalClinicShare = visitRevenue > 0 ? (visitRevenue - totalDocShare) : assignedClinicShare;

    return res.status(200).json({
      range: req.query?.range || '6',
      closingMonth: month,
      annualYear: annual.year,
      doctorMonth: month,
      availableYears: annual.availableYears,
      monthlyRows: [],
      byDoctor,
      bySpecialty,
      closing: {
        ym: month,
        visitCount: visitRows.length,
        visitRevenue,
        docShare: totalDocShare,
        clinicShare: totalClinicShare,
        incomeByCat: {},
        expenseByCat: {},
        totalIncome,
        totalExpense,
        openingOfMonth: 0,
        closingBalance: totalIncome - totalExpense,
        net: totalIncome - totalExpense,
        payrollPaid: payroll.filter(x => x.status === 'تم').reduce((s, x) => s + (Number(x.amount || x.net_salary || 0) || 0), 0),
        payrollDue: payroll.filter(x => x.status !== 'تم').reduce((s, x) => s + (Number(x.amount || x.net_salary || 0) || 0), 0),
        payrollCount: payroll.length
      },
      annual
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.code || e.message || 'financial-reports-failed' });
  }
};
