/* Mitali Hospital — Supabase adapter
 * Keeps the public MitaliFirebase API name temporarily for backward-compatible UI calls.
 * No Firebase SDK, project id, or Firebase credential is used here.
 */
(function () {
  "use strict";
  const COLLECTIONS = Object.freeze({
    doctors: "doctors", employees: "employees", visitsClinic: "visits_clinic", visitsDental: "visits_dental",
    visitsOperations: "visits_operations", visitsLabs: "visits_labs", visitsRadiology: "visits_radiology",
    income: "income", expense: "expense", payroll: "payroll", staffAccounts: "staff_accounts", auditLog: "audit_log",
    labExpenses: "lab_expenses", categories: "categories", specialties: "specialties", settings: "settings",
    patientFilesClinic: "patient_file_index_clinic", patientFilesDental: "patient_file_index_dental",
    patientFileIndexClinic: "patient_file_index_clinic", patientFileIndexDental: "patient_file_index_dental",
    systemControl: "system_control"
  });
  const TABLES = new Set(Object.values(COLLECTIONS));
  let client = null;
  let authReadyPromise = null;
  let currentSessionUser = null;
  const READ_METRICS = { queries: 0, documents: 0, byKey: {}, lastReadAt: null };
  const API_BASE = String(window.MITALI_API_BASE || "").replace(/\/$/, "");
  const MOCK_STORAGE_KEY = "mitali_zakat_hospital_mock_supabase_records";
  const MOCK_SESSION_KEY = "mitali_zakat_hospital_mock_supabase_session";
  function readMockRows() {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) { return []; }
  }
  function writeMockRows(rows) {
    try { localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(rows)); } catch (_e) { /* ignore */ }
  }
  function getRowField(row, field) {
    if (field.startsWith("payload->>")) {
      const key = field.slice("payload->>".length);
      return row.payload && row.payload[key] != null ? String(row.payload[key]) : "";
    }
    return row[field] != null ? String(row[field]) : "";
  }
  function createMockBrowserClient() {
    const authListeners = new Set();
    const readSession = () => {
      try {
        const raw = localStorage.getItem(MOCK_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_e) { return null; }
    };
    const writeSession = (session) => {
      try {
        if (session) localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
        else localStorage.removeItem(MOCK_SESSION_KEY);
      } catch (_e) { /* ignore */ }
      authListeners.forEach(cb => { try { cb(session ? "SIGNED_IN" : "SIGNED_OUT", session); } catch (_err) {} });
    };
    return {
      auth: {
        async getSession() {
          return { data: { session: readSession() }, error: null };
        },
        onAuthStateChange(cb) {
          authListeners.add(cb);
          return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
        },
        async signInWithPassword({ email, password }) {
          if (!password) return { data: { user: null, session: null }, error: Object.assign(new Error("Invalid login credentials"), { code: "auth/invalid-credentials" }) };
          let username = "admin";
          try {
            const match = String(email || "").match(/^u-([^@]+)@/);
            if (match) {
              const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
              username = decodeURIComponent(escape(atob(b64))) || "admin";
            }
          } catch (_e) {}
          const uid = username === "admin" ? "supabase-admin" : `user-${username}`;
          const user = { id: uid, uid, email };
          const session = { access_token: `mock-token:${uid}:${username}`, user };
          writeSession(session);
          return { data: { user, session }, error: null };
        },
        async signOut() {
          writeSession(null);
          return { error: null };
        },
        async updateUser() {
          const s = readSession();
          return { data: { user: s ? s.user : null }, error: null };
        }
      },
      from(_table) {
        let op = "select";
        let payloadData = null;
        let filters = [];
        let orders = [];
        let limitCount = null;
        const execute = async () => {
          let rows = readMockRows();
          if (op === "upsert") {
            const items = Array.isArray(payloadData) ? payloadData : [payloadData];
            items.forEach(item => {
              const idx = rows.findIndex(r => r.collection === item.collection && String(r.id) === String(item.id));
              if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
              else rows.push({ ...item });
            });
            writeMockRows(rows);
            return { data: items, error: null };
          }
          if (op === "delete") {
            const kept = rows.filter(r => !filters.every(fn => fn(r)));
            writeMockRows(kept);
            return { data: [], error: null };
          }
          let result = rows.filter(r => filters.every(fn => fn(r)));
          if (orders.length) {
            result.sort((a, b) => {
              for (const o of orders) {
                const va = getRowField(a, o.col);
                const vb = getRowField(b, o.col);
                if (va !== vb) return o.asc ? va.localeCompare(vb) : vb.localeCompare(va);
              }
              return 0;
            });
          }
          if (limitCount != null) result = result.slice(0, limitCount);
          return { data: result, error: null };
        };
        const q = {
          select() { op = "select"; return q; },
          upsert(rows) { op = "upsert"; payloadData = rows; return q; },
          delete() { op = "delete"; return q; },
          eq(field, val) { filters.push(r => getRowField(r, field) === String(val)); return q; },
          gte(field, val) { filters.push(r => getRowField(r, field) >= String(val)); return q; },
          lte(field, val) { filters.push(r => getRowField(r, field) <= String(val)); return q; },
          gt(field, val) { filters.push(r => getRowField(r, field) > String(val)); return q; },
          lt(field, val) { filters.push(r => getRowField(r, field) < String(val)); return q; },
          ilike(field, pattern) {
            const prefix = String(pattern || "").replace(/%+$/, "").toLowerCase();
            filters.push(r => getRowField(r, field).toLowerCase().startsWith(prefix));
            return q;
          },
          in(field, vals) {
            const set = new Set((vals || []).map(String));
            filters.push(r => set.has(getRowField(r, field)));
            return q;
          },
          not(field, operator, val) {
            if (operator === "in") {
              const inner = String(val || "").replace(/^\(|\)$/g, "");
              const set = new Set(inner ? inner.split(",").map(String) : []);
              filters.push(r => !set.has(getRowField(r, field)));
            }
            return q;
          },
          order(col, opts = {}) { orders.push({ col, asc: opts.ascending !== false }); return q; },
          limit(n) { limitCount = n; return q; },
          then(onFulfilled, onRejected) { return execute().then(onFulfilled, onRejected); }
        };
        return q;
      },
      channel() {
        const ch = {
          on() { return ch; },
          subscribe(cb) { if (cb) setTimeout(() => cb("SUBSCRIBED"), 0); return ch; }
        };
        return ch;
      },
      removeChannel() {}
    };
  }
  function config() { const url = String(window.SUPABASE_URL || "").trim(), key = String(window.SUPABASE_ANON_KEY || "").trim(); if (!url || !key || url.includes("your-project")) return null; return { url, key }; }
  function init() { if (client) return client; const c = config(); if (!c) { client = createMockBrowserClient(); } else { if (!window.supabase?.createClient) throw new Error("Supabase browser SDK is not loaded"); client = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); } authReadyPromise = client.auth.getSession().then(({ data }) => { currentSessionUser = data.session?.user || null; return currentSessionUser; }); client.auth.onAuthStateChange((_event, session) => { currentSessionUser = session?.user || null; authReadyPromise = Promise.resolve(currentSessionUser); }); return client; }
  async function ready() { init(); await authReadyPromise; return true; }
  async function waitForAuth(timeoutMs = 5000) { init(); return Promise.race([authReadyPromise || Promise.resolve(null), new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))]); }
  function collectionName(key) { const name = COLLECTIONS[key] || (TABLES.has(key) ? key : null) || (key ? String(key).replace(/([A-Z])/g, "_$1").toLowerCase() : null) || key; return name; }
  function clean(value) { if (Array.isArray(value)) return value.map(clean); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)])); }
  function safeRecord(record) { const out = clean({ ...(record || {}) }); delete out.password; delete out.passwordHash; return out; }
  function rowFromRecord(collection, record) { const payload = safeRecord(record); const date = String(payload.date || payload.lastVisitDate || ""), month = String(payload.month || (date.match(/^\d{4}-\d{2}/) || [""])[0] || ""); return { collection, id: String(payload.id), payload, date_text: date || null, month_text: month || null, updated_at: String(payload.updatedAt || payload.createdAt || new Date().toISOString()) }; }
  function explicitRowFromRecord(collection, record) {
    const payload = safeRecord(record);
    const date = String(payload.date || payload.lastVisitDate || ""), month = String(payload.month || (date.match(/^\d{4}-\d{2}/) || [""])[0] || "");
    const updated_at = String(payload.updatedAt || payload.createdAt || new Date().toISOString());

    if (collection.startsWith("visits_")) {
      return {
        id: String(payload.id),
        date: date || null,
        month: month || null,
        file_no: payload.fileNo || null,
        patient: payload.patient || payload.name || null,
        phone: payload.phone || null,
        doctor_id: payload.doctorId || payload.docId || null,
        doctor_name: payload.doctorName || null,
        exam_type: payload.examType || payload.type || null,
        services: Array.isArray(payload.services) ? payload.services : [],
        total: Number(payload.total || payload.amount || 0),
        paid: Number(payload.paid || payload.paidAmount || 0),
        payment_method: payload.paymentMethod || null,
        status: payload.status || null,
        notes: payload.notes || null,
        linked_income_id: payload.linkedIncomeId || null,
        next_visit_date: payload.nextVisitDate || null,
        payload,
        updated_at
      };
    }

    if (collection === "income" || collection === "expense" || collection === "lab_expenses") {
      return {
        id: String(payload.id),
        date: date || null,
        month: month || null,
        party: payload.party || null,
        category: payload.category || null,
        description: payload.description || payload.desc || null,
        amount: Number(payload.amount || payload.total || 0),
        payment_method: payload.paymentMethod || null,
        receipt_no: payload.receiptNo || payload.voucherNo || null,
        notes: payload.notes || null,
        linked_visit_id: payload.linkedVisitId || null,
        payload,
        updated_at
      };
    }

    if (collection === "payroll") {
      return {
        id: String(payload.id),
        month: month || null,
        date: date || null,
        employee_id: payload.employeeId || null,
        employee_name: payload.employeeName || null,
        role: payload.role || null,
        amount: Number(payload.amount || payload.netSalary || payload.salary || 0),
        salary: Number(payload.salary || payload.baseSalary || 0),
        bonus: Number(payload.bonus || 0),
        deductions: Number(payload.deductions || 0),
        net_salary: Number(payload.netSalary || payload.amount || 0),
        status: payload.status || null,
        payment_method: payload.paymentMethod || null,
        notes: payload.notes || null,
        payload,
        updated_at
      };
    }

    if (collection === "doctors") {
      return {
        id: String(payload.id),
        name: payload.name || null,
        specialty: payload.specialty || null,
        type: payload.type || null,
        phone: payload.phone || null,
        fee_mode: payload.feeMode || null,
        clinic_pct: payload.clinicPct != null ? Number(payload.clinicPct) : null,
        doc_pct: payload.docPct != null ? Number(payload.docPct) : null,
        checkup_clinic_fee: payload.checkupClinicFee != null ? Number(payload.checkupClinicFee) : null,
        status: payload.status || null,
        payload,
        updated_at
      };
    }

    if (collection === "employees") {
      return {
        id: String(payload.id),
        name: payload.name || null,
        role: payload.role || null,
        phone: payload.phone || null,
        base_salary: payload.baseSalary != null ? Number(payload.baseSalary) : null,
        status: payload.status || null,
        payload,
        updated_at
      };
    }

    if (collection.startsWith("patient_file_index_")) {
      return {
        id: String(payload.id),
        name: payload.name || null,
        phone: payload.phone || null,
        file_no: payload.fileNo || null,
        patient_key: payload.patientKey || null,
        last_visit_date: payload.lastVisitDate || null,
        visits_count: payload.visitsCount != null ? Number(payload.visitsCount) : null,
        total_paid: payload.totalPaid != null ? Number(payload.totalPaid) : null,
        total_due: payload.totalDue != null ? Number(payload.totalDue) : null,
        payload,
        updated_at
      };
    }

    if (collection === "staff_accounts") {
      return {
        id: String(payload.id),
        username: payload.username || null,
        display_name: payload.displayName || payload.display_name || payload.name || null,
        role: payload.role || "موظف",
        status: payload.status || "نشط",
        permissions: payload.permissions || {},
        credential_version: payload.credentialVersion != null ? Number(payload.credentialVersion) : 1,
        security_version: payload.securityVersion != null ? Number(payload.securityVersion) : 1,
        payload,
        updated_at
      };
    }

    if (["settings", "categories", "specialties", "system_control"].includes(collection)) {
      return {
        id: String(payload.id || collection),
        value: payload.value !== undefined ? payload.value : payload,
        payload,
        updated_at
      };
    }

    return {
      id: String(payload.id),
      payload,
      updated_at
    };
  }
  function record(row) {
    if (!row) return {};
    const payload = row.payload || {};
    const res = {
      ...payload,
      id: String(row.id || payload.id || ""),
      updatedAt: row.updated_at || payload.updatedAt || payload.createdAt || ""
    };
    if (row.date !== undefined && row.date !== null) res.date = row.date;
    if (row.month !== undefined && row.month !== null) res.month = row.month;
    if (row.file_no !== undefined && row.file_no !== null) res.fileNo = row.file_no;
    if (row.patient !== undefined && row.patient !== null) res.patient = row.patient;
    if (row.phone !== undefined && row.phone !== null) res.phone = row.phone;
    if (row.doctor_id !== undefined && row.doctor_id !== null) res.doctorId = row.doctor_id;
    if (row.doctor_name !== undefined && row.doctor_name !== null) res.doctorName = row.doctor_name;
    if (row.exam_type !== undefined && row.exam_type !== null) res.examType = row.exam_type;
    if (row.services !== undefined && row.services !== null) res.services = row.services;
    if (row.total !== undefined && row.total !== null && row.total !== "") res.total = Number(row.total);
    if (row.paid !== undefined && row.paid !== null && row.paid !== "") res.paid = Number(row.paid);
    if (row.payment_method !== undefined && row.payment_method !== null) res.paymentMethod = row.payment_method;
    if (row.status !== undefined && row.status !== null) res.status = row.status;
    if (row.notes !== undefined && row.notes !== null) res.notes = row.notes;
    if (row.linked_income_id !== undefined && row.linked_income_id !== null) res.linkedIncomeId = row.linked_income_id;
    if (row.next_visit_date !== undefined && row.next_visit_date !== null) res.nextVisitDate = row.next_visit_date;

    // Doctor & Employee fields
    if (row.name !== undefined && row.name !== null && !res.name) res.name = row.name;
    if (row.specialty !== undefined && row.specialty !== null) res.specialty = row.specialty;
    if (row.type !== undefined && row.type !== null) res.type = row.type;
    if (row.fee_mode !== undefined && row.fee_mode !== null) res.feeMode = row.fee_mode;
    if (row.clinic_pct !== undefined && row.clinic_pct !== null) res.clinicPct = Number(row.clinic_pct);
    if (row.doc_pct !== undefined && row.doc_pct !== null) res.docPct = Number(row.doc_pct);
    if (row.checkup_clinic_fee !== undefined && row.checkup_clinic_fee !== null) res.checkupClinicFee = Number(row.checkup_clinic_fee);
    if (row.role !== undefined && row.role !== null) res.role = row.role;
    if (row.base_salary !== undefined && row.base_salary !== null) res.baseSalary = Number(row.base_salary);

    // Finance (income / expense) fields
    if (row.party !== undefined && row.party !== null) res.party = row.party;
    if (row.category !== undefined && row.category !== null) res.category = row.category;
    if (row.description !== undefined && row.description !== null) {
      res.description = row.description;
      if (!res.desc) res.desc = row.description;
    }
    if (row.amount !== undefined && row.amount !== null && row.amount !== "") res.amount = Number(row.amount);
    if (row.receipt_no !== undefined && row.receipt_no !== null) res.receiptNo = row.receipt_no;
    if (row.linked_visit_id !== undefined && row.linked_visit_id !== null) res.linkedVisitId = row.linked_visit_id;

    // Payroll fields
    if (row.employee_id !== undefined && row.employee_id !== null) res.employeeId = row.employee_id;
    if (row.employee_name !== undefined && row.employee_name !== null) res.employeeName = row.employee_name;
    if (row.salary !== undefined && row.salary !== null && row.salary !== "") res.salary = Number(row.salary);
    if (row.bonus !== undefined && row.bonus !== null && row.bonus !== "") res.bonus = Number(row.bonus);
    if (row.deductions !== undefined && row.deductions !== null && row.deductions !== "") res.deductions = Number(row.deductions);
    if (row.net_salary !== undefined && row.net_salary !== null && row.net_salary !== "") res.netSalary = Number(row.net_salary);

    // Staff Accounts fields
    if (row.username !== undefined && row.username !== null) res.username = row.username;
    if (row.display_name !== undefined && row.display_name !== null) {
      res.displayName = row.display_name;
      if (!res.name) res.name = row.display_name;
    }
    if (row.permissions !== undefined && row.permissions !== null) res.permissions = row.permissions;
    if (row.credential_version !== undefined && row.credential_version !== null) res.credentialVersion = Number(row.credential_version);
    if (row.security_version !== undefined && row.security_version !== null) res.securityVersion = Number(row.security_version);

    return res;
  }
  function metric(key, count) { READ_METRICS.queries++; READ_METRICS.documents += Number(count || 0); READ_METRICS.byKey[key] = (READ_METRICS.byKey[key] || 0) + Number(count || 0); READ_METRICS.lastReadAt = new Date().toISOString(); }
  function apiUrl(path) { return API_BASE + path; }
  async function accessToken() {
    try {
      const { data } = await init().auth.getSession();
      if (data?.session?.access_token) return data.session.access_token;
    } catch (_e) {}
    try {
      const raw = localStorage.getItem(MOCK_SESSION_KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (s?.access_token) return s.access_token;
    } catch (_e) {}
    if (currentSessionUser) {
      const uid = currentSessionUser.id || currentSessionUser.uid || "supabase-admin";
      const uname = currentSessionUser.username || "admin";
      return `mock-token:${uid}:${uname}`;
    }
    throw Object.assign(new Error("auth/not-authenticated"), { code: "auth/not-authenticated" });
  }
  async function fetchJson(path, options = {}, timeoutMs = 15000) { const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs); try { const r = await fetch(apiUrl(path), { ...options, signal: controller.signal }); const body = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(body.error || `api-${r.status}`), { code: body.error || `api-${r.status}`, status: r.status }); return body; } finally { clearTimeout(timer); } }
  async function adminRequest(payload, method = "POST") { const token = await accessToken(); return fetchJson("/api/admin/account", { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: method === "GET" ? undefined : JSON.stringify(payload || {}) }); }
  function authEmailForUsername(username) { const encoded = btoa(unescape(encodeURIComponent(String(username || "").trim().toLowerCase()))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); return `u-${encoded}@accounts.mitali-hospital.internal`; }
  async function signInWithUsername(username, password) {
    const c = config();
    if (c) {
      const email = authEmailForUsername(username);
      const { data, error } = await init().auth.signInWithPassword({ email, password });
      if (error) {
        console.warn("Supabase Auth signInWithPassword:", error.message || error);
        throw Object.assign(new Error(error.message || "اسم المستخدم أو كلمة المرور غير صحيحة"), {
          code: error.code || "auth/invalid-credential"
        });
      }
      if (data?.user) {
        currentSessionUser = data.user;
        return data.user;
      }
      throw new Error("فشل استلام بيانات المستخدم من Supabase");
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    const uname = String(username || "").trim().toLowerCase();
    const uid = uname === "admin" ? "supabase-admin" : `user-${uname}`;
    const user = { id: uid, uid, email: authEmailForUsername(username) };
    const session = { access_token: `mock-token:${uid}:${uname}`, user };
    try { localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session)); } catch (_e) {}
    currentSessionUser = user;
    authReadyPromise = Promise.resolve(user);
    return user;
  }
  async function signOut() {
    try { localStorage.removeItem(MOCK_SESSION_KEY); } catch (_e) {}
    currentSessionUser = null;
    try { await init().auth.signOut(); } catch (_e) {}
  }
  function currentUser() {
    init();
    if (!currentSessionUser) return null;
    return Object.assign({}, currentSessionUser, {
      uid: currentSessionUser.uid || currentSessionUser.id || ""
    });
  }
  async function getTable(key) {
    await ready();
    const c = config();
    if (c) {
      const col = collectionName(key);
      let allData = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const res = await client.from(col).select("*").order("updated_at", { ascending: false }).range(from, from + batchSize - 1);
        if (res.error) {
          console.error("Supabase getTable error for " + col + ":", res.error);
          throw Object.assign(new Error(res.error.message || "Supabase getTable failed"), { code: res.error.code, table: col });
        }
        if (Array.isArray(res.data)) {
          allData = allData.concat(res.data);
          if (res.data.length < batchSize) break;
          from += batchSize;
        } else {
          break;
        }
      }
      metric(key, allData.length);
      return allData.map(record);
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    const rows = readMockRows().filter(r => r.collection === collectionName(key));
    metric(key, rows.length);
    return rows.map(record);
  }
  function applyWhere(q, filters, isExplicit = true) {
    for (const f of (Array.isArray(filters) ? filters : filters ? [filters] : [])) {
      if (!f?.field || f.value === undefined) continue;
      const colField = f.field === "date" ? "date" : f.field === "month" ? "month" : f.field === "patient" ? "patient" : f.field === "fileNo" ? "file_no" : f.field;
      if (f.op === "==") q = q.eq(colField, String(f.value));
      else if (f.op === ">=") q = q.gte(colField, String(f.value));
      else if (f.op === "<=") q = q.lte(colField, String(f.value));
      else if (f.op === ">") q = q.gt(colField, String(f.value));
      else if (f.op === "<") q = q.lt(colField, String(f.value));
    }
    return q;
  }
  async function getPage(key, options = {}) {
    await ready();
    const collection = collectionName(key), pageSize = Math.min(Math.max(Number(options.pageSize) || 30, 1), 100);
    const targetPage = Math.max(Number(options.page) || 1, 1);
    const c = config();
    if (c) {
      let q = client.from(collection).select("*");
      q = applyWhere(q, options.where, true);
      const order = options.orderField === "month" ? "month" : options.orderField === "updatedAt" ? "updated_at" : "date";
      q = q.order(order, { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).order("id", { ascending: false });
      if (options.cursor && options.cursor.primaryValue !== undefined && options.cursor.documentId && !options.page) {
        const pv = String(options.cursor.primaryValue);
        const docId = String(options.cursor.documentId);
        q = q.or(`${order}.lt."${pv}",and(${order}.eq."${pv}",id.lt."${docId}")`).limit(pageSize);
      } else {
        const from = (targetPage - 1) * pageSize;
        q = q.range(from, from + pageSize - 1);
      }
      const { data, error } = await q;
      if (error) {
        console.error("Supabase getPage error for " + collection + ":", error);
        throw Object.assign(new Error(error.message || "Supabase getPage failed"), { code: error.code, table: collection });
      }
      if (Array.isArray(data)) {
        metric(key, data.length);
        const records = data.map(record), last = data[data.length - 1];
        return { records, pageSize, hasMore: data.length === pageSize, nextCursor: last ? { primaryValue: last[order] || "", documentId: last.id } : null };
      }
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    let rows = readMockRows().filter(r => r.collection === collection);
    for (const f of (Array.isArray(options.where) ? options.where : options.where ? [options.where] : [])) {
      if (!f?.field || f.value === undefined) continue;
      const field = f.field === "date" ? "date_text" : f.field === "month" ? "month_text" : `payload->>${f.field}`;
      if (f.op === "==") rows = rows.filter(r => getRowField(r, field) === String(f.value));
      else if (f.op === ">=") rows = rows.filter(r => getRowField(r, field) >= String(f.value));
      else if (f.op === "<=") rows = rows.filter(r => getRowField(r, field) <= String(f.value));
      else if (f.op === ">") rows = rows.filter(r => getRowField(r, field) > String(f.value));
      else if (f.op === "<") rows = rows.filter(r => getRowField(r, field) < String(f.value));
    }
    const order = options.orderField === "month" ? "month_text" : options.orderField === "updatedAt" ? "updated_at" : "date_text";
    rows.sort((a, b) => getRowField(b, order).localeCompare(getRowField(a, order)));
    const from = (targetPage - 1) * pageSize;
    const records = rows.slice(from, from + pageSize).map(record);
    const last = records[records.length - 1];
    return { records, pageSize, hasMore: rows.length > from + pageSize, nextCursor: last ? { primaryValue: last[order] || "", documentId: last.id } : null };
  }
  async function getValue(key, fallback) { const rows = await getTable(key); if (!rows.length) return fallback; if (["settings", "categories"].includes(key)) return rows[0]; if (key === "specialties") return Array.isArray(rows[0].value) ? rows[0].value : fallback; return rows; }
  async function upsertRecords(key, records) {
    await ready();
    const validRecs = (records || []).filter(r => r?.id);
    if (!validRecs.length) return;
    const col = collectionName(key);
    const c = config();
    if (c) {
      const expRows = validRecs.map(r => explicitRowFromRecord(col, r));
      const chunkSize = 100;
      for (let i = 0; i < expRows.length; i += chunkSize) {
        const expChunk = expRows.slice(i, i + chunkSize);
        const { error: expErr } = await client.from(col).upsert(expChunk, { onConflict: "id" });
        if (expErr) {
          console.error("Supabase upsertRecords error for " + col + ":", expErr);
          throw Object.assign(new Error(expErr.message || "Supabase upsert failed"), { code: expErr.code, table: col });
        }
      }
      return;
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    const all = readMockRows();
    const legacyRows = validRecs.map(r => rowFromRecord(col, r));
    legacyRows.forEach(item => {
      const idx = all.findIndex(r => r.collection === item.collection && String(r.id) === String(item.id));
      if (idx >= 0) all[idx] = { ...all[idx], ...item };
      else all.push({ ...item });
    });
    writeMockRows(all);
  }
  async function upsertRecord(key, recordValue) { await upsertRecords(key, [recordValue]); return recordValue; }
  async function deleteRecords(key, ids) {
    await ready();
    const idSet = new Set((ids || []).map(String));
    if (!idSet.size) return;
    const c = config();
    if (c) {
      const col = collectionName(key);
      const idsArr = [...idSet];
      const chunkSize = 100;
      for (let i = 0; i < idsArr.length; i += chunkSize) {
        const chunk = idsArr.slice(i, i + chunkSize);
        const { error: expErr } = await client.from(col).delete().in("id", chunk);
        if (expErr) {
          console.error("Supabase deleteRecords error for " + col + ":", expErr);
          throw Object.assign(new Error(expErr.message || "Supabase delete failed"), { code: expErr.code, table: col });
        }
      }
      return;
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    const all = readMockRows().filter(r => !(r.collection === collectionName(key) && idSet.has(String(r.id))));
    writeMockRows(all);
  }
  async function setValue(key, value) { return upsertRecord(key, { id: "app", ...(Array.isArray(value) && key === "specialties" ? { value } : value || {}) }); }
  async function setTable(key, records) {
    await ready();
    const collection = collectionName(key), keep = records.map(r => String(r.id));
    if (keep.length) {
      const { error } = await client.from(collection).delete().not("id", "in", `(${keep.join(",")})`);
      if (error) console.warn("Supabase setTable delete extraneous error for " + collection + ":", error);
    }
    await upsertRecords(key, records);
    return records;
  }
  function subscribe(key, onChange, onError) {
    try {
      init();
      const collection = collectionName(key);
      if (client?.channel) {
        const channel = client.channel(`data-${collection}-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: collection }, payload => {
          const row = payload.new || payload.old;
          if (row) onChange([{ type: payload.eventType === "INSERT" ? "added" : payload.eventType === "DELETE" ? "removed" : "modified", record: record(row) }]);
        }).subscribe(status => {
          if (status === "CHANNEL_ERROR") onError?.(new Error("supabase-realtime-error"));
        });
        return () => { try { client.removeChannel?.(channel); } catch (_e) {} };
      }
    } catch (_e) {}
    return () => {};
  }
  const subscribePage = subscribe;
  async function getPatientIndexPage(pageKey, cursor, targetPage = 1) {
    return getPage(pageKey, { pageSize: 30, orderField: "date", cursor, page: targetPage });
  }
  async function searchPatientIndex(pageKey, term) {
    await ready();
    const collection = collectionName(pageKey), t = String(term || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    const c = config();
    if (c) {
      try {
        const queries = [];
        if (/^\d+$/.test(t)) {
          queries.push(client.from(collection).select("*").eq("file_no", t).limit(30));
        }
        if (/^[0-9+\-\s]+$/.test(t) && t.length >= 3) {
          queries.push(client.from(collection).select("*").ilike("phone", `%${t}%`).limit(30));
        }
        queries.push(client.from(collection).select("*").ilike("patient", `%${t}%`).limit(30));
        const alt = t.startsWith("ا") ? "أ" + t.slice(1) : t.startsWith("أ") ? "ا" + t.slice(1) : null;
        if (alt) {
          queries.push(client.from(collection).select("*").ilike("patient", `%${alt}%`).limit(30));
        }
        const snaps = await Promise.all(queries);
        const map = new Map();
        for (const snap of snaps) {
          if (snap.data && Array.isArray(snap.data)) {
            for (const row of snap.data) {
              if (!map.has(row.id)) map.set(row.id, record(row));
            }
          }
        }
        if (map.size) {
          metric(pageKey, map.size);
          return Array.from(map.values()).sort((a, b) => {
            const da = a.lastVisitDate || a.date || "";
            const db = b.lastVisitDate || b.date || "";
            return db.localeCompare(da);
          });
        }
      } catch (_e) {
        // Fallback to legacy data_records query
        try {
          const legQueries = [];
          if (/^\d+$/.test(t)) legQueries.push(client.from("data_records").select("id,payload,date_text,updated_at").eq("collection", collection).eq("payload->>fileNo", t).limit(30));
          if (/^[0-9+\-\s]+$/.test(t) && t.length >= 3) legQueries.push(client.from("data_records").select("id,payload,date_text,updated_at").eq("collection", collection).ilike("payload->>phone", `%${t}%`).limit(30));
          legQueries.push(client.from("data_records").select("id,payload,date_text,updated_at").eq("collection", collection).ilike("payload->>name", `%${t}%`).limit(30));
          const snaps = await Promise.all(legQueries);
          const map = new Map();
          for (const snap of snaps) {
            if (snap.data && Array.isArray(snap.data)) {
              for (const row of snap.data) {
                if (!map.has(row.id)) map.set(row.id, record(row));
              }
            }
          }
          if (map.size) return Array.from(map.values());
        } catch (_err) {}
      }
    }
    const rows = readMockRows().filter(r => r.collection === collection && String(r.payload?.name || "").toLowerCase().includes(t.toLowerCase())).slice(0, 30);
    metric(pageKey, rows.length);
    return rows.map(record);
  }
  async function savePatientToIndex(visit, isDental = false) {
    const rawName = String(visit?.patient || visit?.name || "").replace(/\s+/g, " ").trim();
    const phone = String(visit?.phone || "").trim();
    const fileNo = String(visit?.fileNo || "").trim();
    if (!rawName && !phone && !fileNo) return null;
    const id = (fileNo ? `F:${fileNo}` : `N:${rawName.toLowerCase()}|${phone}`).replace(/\//g, "_").slice(0, 120);
    const visitDate = visit.date || new Date().toISOString().slice(0, 10);
    const visitCreatedAt = visit.createdAt || new Date().toISOString();
    const collectionKey = isDental ? "patientFilesDental" : "patientFilesClinic";
    const collName = isDental ? "patient_file_index_dental" : "patient_file_index_clinic";

    let existing = null;
    const c = config();
    if (c) {
      try {
        const { data } = await client.from(collName).select("*").eq("id", id).maybeSingle();
        if (data) existing = record(data);
      } catch (_e) {}
    }

    const paid = Number(visit.paid || 0);
    const total = Number(visit.total || 0);
    const due = Math.max(0, total - paid);

    // حساب المجاميع والعدّاد من واقع زيارات المريض الفعلية بدلاً من الجمع الأعمى عند كل حفظ
    let visitsCount = 1;
    let totalPaid = paid;
    let totalDue = due;
    let lastVisitDate = visitDate;
    let lastVisitCreatedAt = visitCreatedAt;

    try {
      const patientVisits = await getPatientVisits(isDental ? "dental" : "clinic", { name: rawName, phone, fileNo });
      const vMap = new Map((patientVisits || []).map(v => [String(v.id), v]));
      if (visit && visit.id) vMap.set(String(visit.id), { ...(vMap.get(String(visit.id)) || {}), ...visit });
      const allList = Array.from(vMap.values());
      if (allList.length > 0) {
        visitsCount = allList.length;
        totalPaid = allList.reduce((s, v) => s + (Number(v.paid) || 0), 0);
        totalDue = Math.max(0, allList.reduce((s, v) => s + Math.max(0, (Number(v.total || v.amount || 0) - (Number(v.paid) || 0))), 0));
        allList.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
        if (allList[0]?.date) lastVisitDate = allList[0].date;
        if (allList[0]?.createdAt) lastVisitCreatedAt = allList[0].createdAt;
      }
    } catch (_err) {
      if (existing) {
        visitsCount = existing.visitsCount || 1;
        totalPaid = existing.totalPaid || paid;
        totalDue = existing.totalDue || due;
      }
    }

    const doc = {
      ...(existing || {}),
      id,
      name: rawName || existing?.name || "",
      phone: phone || existing?.phone || "",
      fileNo: fileNo || existing?.fileNo || "",
      patientKey: id,
      lastVisitDate,
      lastVisitCreatedAt,
      updatedAt: new Date().toISOString(),
      visitsCount,
      totalPaid,
      totalDue
    };
    return upsertRecord(collectionKey, doc);
  }
  async function getPatientVisits(kind, filter = {}) {
    await ready();
    const coll = (kind === "dental" || kind === "أسنان" || kind === "visitsDental" || kind === "patientFilesDental")
      ? "visits_dental"
      : "visits_clinic";
    const name = String(filter.name || filter.patient || "").replace(/\s+/g, " ").trim();
    const phone = String(filter.phone || "").trim();
    const fileNo = String(filter.fileNo || "").trim();
    const c = config();
    if (c) {
      try {
        const queries = [];
        if (fileNo) {
          queries.push(client.from(coll).select("*").eq("file_no", fileNo));
        }
        if (phone && phone.length >= 4) {
          queries.push(client.from(coll).select("*").eq("phone", phone));
        }
        if (name) {
          queries.push(client.from(coll).select("*").ilike("patient", `%${name}%`));
          const alt = name.startsWith("ا") ? "أ" + name.slice(1) : name.startsWith("أ") ? "ا" + name.slice(1) : null;
          if (alt) queries.push(client.from(coll).select("*").ilike("patient", `%${alt}%`));
        }
        if (queries.length) {
          const snaps = await Promise.all(queries);
          const map = new Map();
          for (const snap of snaps) {
            if (snap.data && Array.isArray(snap.data)) {
              for (const row of snap.data) {
                if (!map.has(row.id)) map.set(row.id, record(row));
              }
            }
          }
          const sorted = Array.from(map.values()).sort((a, b) => {
            const da = a.date || a.createdAt || "";
            const db = b.date || b.createdAt || "";
            return db.localeCompare(da);
          });
          metric(coll, sorted.length);
          return sorted;
        }
      } catch (_e) {
        console.warn("Supabase getPatientVisits failed:", _e);
      }
    }
    return [];
  }
  async function syncPatientIndexes(specificKind = null) {
    await ready();
    const c = config();
    if (!c) return { clinic: 0, dental: 0 };
    const targets = [];
    if (!specificKind || specificKind === "clinic" || specificKind === "عيادات") targets.push({ visitColl: "visits_clinic", indexColl: "patient_file_index_clinic" });
    if (!specificKind || specificKind === "dental" || specificKind === "أسنان") targets.push({ visitColl: "visits_dental", indexColl: "patient_file_index_dental" });

    const counts = {};
    for (const t of targets) {
      let allVisits = [];
      let from = 0;
      while (true) {
        let res = await client.from(t.visitColl).select("*").range(from, from + 999);
        if (res.error || !res.data) break;
        allVisits = allVisits.concat(res.data);
        if (res.data.length < 1000) break;
        from += 1000;
      }
      const indexMap = new Map();
      for (const row of allVisits) {
        const v = record(row);
        const rawName = String(v.patient || v.patientName || v.name || v.patient_name || "").replace(/\s+/g, " ").trim();
        const phone = String(v.phone ?? v.mobile ?? "").trim();
        const fileNo = String(v.fileNo ?? v.file_no ?? "").trim();
        if (!rawName && !phone && !fileNo) continue;
        const id = (fileNo ? `F:${fileNo}` : `N:${rawName.toLowerCase()}|${phone}`).replace(/\//g, "_").slice(0, 120);
        const visitDate = v.date || row.date || row.date_text || (row.created_at ? row.created_at.slice(0, 10) : "");
        const createdAt = v.createdAt || row.created_at || new Date().toISOString();
        const legacyAmount = Number(v.amount) || 0;
        const total = (v.total !== undefined && v.total !== null) ? (Number(v.total) || 0) : legacyAmount;
        let paid;
        if (v.paid !== undefined && v.paid !== null) {
          paid = Number(v.paid) || 0;
        } else if (v.status === "unpaid" || v.status === "غير مدفوع" || v.status === "متبقي" || v.status === "آجل") {
          paid = 0;
        } else if (v.amount !== undefined && v.amount !== null) {
          paid = legacyAmount;
        } else {
          paid = 0;
        }
        const due = Math.max(0, total - paid);
        const existing = indexMap.get(id);
        if (!existing) {
          indexMap.set(id, {
            id, name: rawName, phone, fileNo, patientKey: id,
            lastVisitDate: visitDate, lastVisitCreatedAt: createdAt, updatedAt: createdAt,
            visitsCount: 1, totalPaid: paid, totalDue: due
          });
        } else {
          existing.visitsCount += 1;
          existing.totalPaid += paid;
          existing.totalDue += due;
          if (!existing.lastVisitDate || (visitDate && visitDate > existing.lastVisitDate) || (visitDate === existing.lastVisitDate && createdAt > existing.lastVisitCreatedAt)) {
            existing.lastVisitDate = visitDate;
            existing.lastVisitCreatedAt = createdAt;
            existing.updatedAt = createdAt;
          }
          if (!existing.name && rawName) existing.name = rawName;
          if (!existing.phone && phone) existing.phone = phone;
          if (!existing.fileNo && fileNo) existing.fileNo = fileNo;
        }
      }
      const indexRecords = Array.from(indexMap.values());
      await upsertRecords(t.indexColl, indexRecords);
      counts[t.indexColl] = indexRecords.length;
    }
    return counts;
  }
  async function profileRequest(action, body = {}) {
    let token = "";
    try { token = await accessToken(); } catch (_e) {}
    if (!token && currentSessionUser) {
      const uid = currentSessionUser.id || currentSessionUser.uid || "supabase-admin";
      const uname = currentSessionUser.username || "admin";
      token = `mock-token:${uid}:${uname}`;
    }
    return fetchJson("/api/auth/profile", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  }
  async function getUserProfile(uid) {
    try {
      const res = await profileRequest("get");
      if (res?.profile) return res.profile;
    } catch (_e) {}
    const u = currentUser();
    const isDevAdmin = !window.MITALI_IS_PROD && ((u && (u.id === "supabase-admin" || u.username === "admin")) || uid === "supabase-admin");
    if (isDevAdmin) {
      return {
        id: "supabase-admin",
        displayName: "مدير النظام",
        username: "admin",
        role: "مدير",
        status: "نشط",
        permissions: {
          dashboard:{view:true},doctors:{view:true,add:true,edit:true,delete:true},employees:{view:true,add:true,edit:true,delete:true},clinic:{view:true,add:true,edit:true,delete:true},dental:{view:true,add:true,edit:true,delete:true},operations:{view:true,add:true,edit:true,delete:true},labs:{view:true,add:true,edit:true,delete:true},radiology:{view:true,add:true,edit:true,delete:true},patientFilesClinic:{view:true},patientFilesDental:{view:true},income:{view:true,add:true,edit:true,delete:true},expense:{view:true,add:true,edit:true,delete:true},ledger:{view:true},outstandingBalancesClinic:{view:true},outstandingBalancesDental:{view:true},outstandingBalancesOperations:{view:true},outstandingBalancesLabs:{view:true},outstandingBalancesRadiology:{view:true},outstandingBalances:{view:true},reports:{view:true},payroll:{view:true,add:true,edit:true,delete:true},categories:{view:true,add:true,edit:true,delete:true},users:{view:true,add:true,edit:true,delete:true,editPerms:true},settings:{edit:true,backup:true,restore:true}
        },
        credentialVersion: 1, securityVersion: 1
      };
    }
    return {
      id: u?.id || uid || "",
      displayName: u?.displayName || u?.user_metadata?.display_name || "",
      username: u?.username || "",
      role: "موظف",
      status: "نشط",
      permissions: {},
      credentialVersion: 1, securityVersion: 1
    };
  }
  const ensureAdminProfile = getUserProfile;
  async function updateOwnSecurityMetadata(metadata) { return profileRequest("metadata", { metadata }); }
  async function changePassword(_username, _currentPassword, newPassword) { const { data, error } = await init().auth.updateUser({ password: String(newPassword || "") }); if (error) throw error; return data.user; }
  async function getMonthRecords(key, month) { const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(); return (await getPage(key, { pageSize: 100, where: [{ field: "date", op: ">=", value: `${month}-01` }, { field: "date", op: "<=", value: `${month}-${String(last).padStart(2, "0")}` }] })).records; }
  async function getFinancialSummary(month = "all") {
    try {
      const token = await accessToken();
      const res = await fetchJson(`/api/financial/summary?month=${encodeURIComponent(month)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res && res.income && typeof res.income.total === "number" && (res.income.total > 0 || res.expense.total > 0 || !client)) {
        return res;
      }
    } catch (_e) {}
    if (client) {
      try {
        const { data: rpcData, error: rpcErr } = await client.rpc("get_financial_summary", { p_month: month });
        if (!rpcErr && rpcData && typeof rpcData.totalIncome === "number") {
          return rpcData;
        }
      } catch (_rpcE) {}
      try {
        async function fetchAll(table) {
          let rows = [];
          let from = 0;
          const batchSize = 1000;
          while (true) {
            let q = client.from(table).select("amount, date").range(from, from + batchSize - 1);
            if (month !== "all") {
              const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
              const start = `${month}-01`;
              const end = `${month}-${String(last).padStart(2, "0")}`;
              q = q.gte("date", start).lte("date", end);
            }
            const { data, error } = await q;
            if (error || !Array.isArray(data) || !data.length) break;
            rows = rows.concat(data);
            if (data.length < batchSize) break;
            from += batchSize;
          }
          return rows;
        }
        const [incRows, expRows] = await Promise.all([fetchAll("income"), fetchAll("expense")]);
        const totalIncome = incRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const totalExpense = expRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        return {
          month,
          income: { total: totalIncome, count: incRows.length },
          expense: { total: totalExpense, count: expRows.length },
          totalIncome,
          totalExpense,
          net: totalIncome - totalExpense
        };
      } catch (_clientErr) {}
    }
    return {
      month,
      income: { total: 0, count: 0 },
      expense: { total: 0, count: 0 },
      totalIncome: 0,
      totalExpense: 0,
      net: 0
    };
  }
  async function getReportsData(options = {}) { const p = new URLSearchParams({ range: String(options.range || 6), closingMonth: String(options.closingMonth || ""), annualYear: String(options.annualYear || ""), doctorMonth: String(options.doctorMonth || ""), includeAnnual: String(options.includeAnnual ?? "") }); if (options.scope) p.set("scope", options.scope); return fetchJson(`/api/financial/reports?${p}`, { headers: { Authorization: `Bearer ${await accessToken()}` } }); }
  const getDoctorMonthReport = month => getReportsData({ scope: "doctors", doctorMonth: month });
  const adminCreateAccount = payload => adminRequest({ action: "create", ...payload });
  const adminUpdateAccount = (payload, action = "update") => adminRequest({ action, ...payload });
  const adminListAccounts = async () => (await adminRequest({}, "GET")).accounts || [];
  const adminDeleteAccount = uid => adminRequest({ action: "delete", uid });
  const configureManagerRecovery = payload => adminRequest({ action: "configureManagerRecovery", ...payload });
  const recoverManagerPassword = payload => fetchJson("/api/admin/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recoverManagerPassword", ...payload }) });
  const adminWipeBusinessData = async confirmationText => fetchJson("/api/admin/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` }, body: JSON.stringify({ action: "wipeBusinessData", confirmationText }) });
  const adminAccountRequest = adminRequest;
  const isMockMode = () => !config();
  window.getPatientIndexPage = getPatientIndexPage; window.searchPatientIndex = searchPatientIndex; window.savePatientToIndex = savePatientToIndex; window.getPatientVisits = getPatientVisits; window.syncPatientIndexes = syncPatientIndexes;
  window.MitaliSupabase = window.MitaliFirebase = Object.freeze({ config: Object.freeze({ provider: "supabase" }), collections: COLLECTIONS, init, ready, waitForAuth, isMockMode, getTable, getPage, getPatientIndexPage, searchPatientIndex, savePatientToIndex, getPatientVisits, syncPatientIndexes, setTable, getValue, setValue, upsertRecord, upsertRecords, deleteRecords, subscribe, subscribePage, authEmailForUsername, signInWithUsername, changePassword, getFinancialSummary, getReportsData, getDoctorMonthReport, getMonthRecords, adminCreateAccount, configureManagerRecovery, recoverManagerPassword, adminUpdateAccount, adminListAccounts, adminDeleteAccount, adminAccountRequest, adminWipeBusinessData, signOut, authUser: currentUser, getUserProfile, ensureAdminProfile, updateOwnSecurityMetadata, getReadMetrics: () => JSON.parse(JSON.stringify(READ_METRICS)), resetReadMetrics: () => { READ_METRICS.queries = 0; READ_METRICS.documents = 0; READ_METRICS.byKey = {}; READ_METRICS.lastReadAt = null; } });
})();
