/**
 * tools/reconstruct-visits-from-income.js
 * Reconstructs all hospital visit records from existing visit-income records in Supabase.
 */

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function run() {
  console.log("Fetching all income records...");
  let allIncome = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("data_records")
      .select("id, payload")
      .eq("collection", "income")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("Error fetching income:", error);
      process.exit(1);
    }
    allIncome = allIncome.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${allIncome.length} total income records.`);

  const visitsByCollection = {
    visits_clinic: [],
    visits_dental: [],
    visits_operations: [],
    visits_labs: [],
    visits_radiology: []
  };

  for (const item of allIncome) {
    const incomeId = item.id;
    const p = item.payload || {};
    if (!incomeId.startsWith("visit-income-")) continue;

    let targetCollection = null;
    let visitId = null;
    let defaultServiceLabel = "كشف";

    if (incomeId.startsWith("visit-income-clinic-")) {
      targetCollection = "visits_clinic";
      visitId = incomeId.replace("visit-income-clinic-", "");
      defaultServiceLabel = "كشف";
    } else if (incomeId.startsWith("visit-income-dental-")) {
      targetCollection = "visits_dental";
      visitId = incomeId.replace("visit-income-dental-", "");
      defaultServiceLabel = "كشف";
    } else if (incomeId.startsWith("visit-income-visitsDental-")) {
      targetCollection = "visits_dental";
      visitId = incomeId.replace("visit-income-visitsDental-", "");
      defaultServiceLabel = "كشف";
    } else if (incomeId.startsWith("visit-income-operations-")) {
      targetCollection = "visits_operations";
      visitId = incomeId.replace("visit-income-operations-", "");
      defaultServiceLabel = "عملية";
    } else if (incomeId.startsWith("visit-income-labs-")) {
      targetCollection = "visits_labs";
      visitId = incomeId.replace("visit-income-labs-", "");
      defaultServiceLabel = "تحليل";
    } else if (incomeId.startsWith("visit-income-radiology-")) {
      targetCollection = "visits_radiology";
      visitId = incomeId.replace("visit-income-radiology-", "");
      defaultServiceLabel = "أشعة";
    }

    if (!targetCollection || !visitId) continue;

    let patientName = p.party || "";
    if (!patientName && p.desc) {
      const match = p.desc.match(/—\s*([^()]+)/);
      if (match) patientName = match[1].trim();
    }
    if (!patientName) patientName = "مريض";

    const amount = Number(p.amount) || 0;
    const fileNo = (p.receiptNo && !p.receiptNo.startsWith("V-m")) ? p.receiptNo.replace(/^V-/, "") : "";
    const date = p.date || (p.createdAt ? p.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    const createdAt = p.createdAt || (date + "T12:00:00.000Z");
    const updatedAt = p.updatedAt || createdAt;

    const payload = {
      id: visitId,
      date: date,
      patient: patientName,
      fileNo: fileNo,
      phone: "",
      doctorId: p.doctorId || "",
      total: amount,
      paid: amount,
      status: "تم",
      paymentMethod: p.paymentMethod || "نقدي",
      notes: (p.notes && p.notes !== "تم إنشاؤه تلقائيًا من سجل الزيارات") ? p.notes : "",
      linkedIncomeId: incomeId,
      createdAt: createdAt,
      updatedAt: updatedAt
    };

    if (targetCollection === "visits_clinic" || targetCollection === "visits_dental") {
      payload.examType = "كشف";
    } else {
      payload.serviceName = defaultServiceLabel;
    }

    visitsByCollection[targetCollection].push({
      collection: targetCollection,
      id: visitId,
      payload: payload,
      date_text: date,
      month_text: date.slice(0, 7),
      updated_at: updatedAt,
      created_at: createdAt
    });
  }

  for (const [coll, list] of Object.entries(visitsByCollection)) {
    console.log(`Reconstructing ${list.length} records for ${coll}...`);
    // Upsert in batches of 200
    const batchSize = 200;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const { error } = await supabase.from("data_records").upsert(batch, { onConflict: "collection,id" });
      if (error) {
        console.error(`Error upserting batch into ${coll}:`, error);
      }
    }
    console.log(`Done upserting ${list.length} records into ${coll}.`);
  }

  console.log("All visits successfully reconstructed and saved into Supabase!");
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
