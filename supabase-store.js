/* Mitali Hospital — Supabase adapter
 * Keeps the public MitaliFirebase API name temporarily for backward-compatible UI calls.
 * No Firebase SDK, project id, or Firebase credential is used here.
 */
(function () {
  "use strict";
  const COLLECTIONS = Object.freeze({
    doctors: "doctors", employees: "employees", visitsClinic: "visits_clinic", visitsDental: "visits_dental",
    visitsOperations: "visits_operations", visitsLabs: "visits_labs", visitsRadiology: "visits_radiology",
    income: "income", expense: "expense", payroll: "payroll", staffAccounts: "profiles", auditLog: "audit_log",
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
  function rowFromRecord(collection, record) { const payload = safeRecord(record); const date = String(payload.date || ""), month = String(payload.month || (date.match(/^\d{4}-\d{2}/) || [""])[0] || ""); return { collection, id: String(payload.id), payload, date_text: date || null, month_text: month || null, updated_at: String(payload.updatedAt || payload.createdAt || new Date().toISOString()) }; }
  function record(row) { return { id: row.id, ...(row.payload || {}) }; }
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
  function currentUser() { init(); return currentSessionUser; }
  async function getTable(key) {
    await ready();
    const c = config();
    if (c) {
      const { data, error } = await client.from("data_records").select("id,payload").eq("collection", collectionName(key)).order("updated_at", { ascending: false });
      if (error) {
        console.error("Supabase getTable error for " + collectionName(key) + ":", error);
        throw Object.assign(new Error(error.message || "Supabase getTable failed"), { code: error.code, table: collectionName(key) });
      }
      if (Array.isArray(data)) {
        metric(key, data.length);
        return data.map(record);
      }
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    const rows = readMockRows().filter(r => r.collection === collectionName(key));
    metric(key, rows.length);
    return rows.map(record);
  }
  function applyWhere(q, filters) { for (const f of (Array.isArray(filters) ? filters : filters ? [filters] : [])) { if (!f?.field || f.value === undefined) continue; const field = f.field === "date" ? "date_text" : f.field === "month" ? "month_text" : `payload->>${f.field}`; if (f.op === "==") q = q.eq(field, String(f.value)); else if (f.op === ">=") q = q.gte(field, String(f.value)); else if (f.op === "<=") q = q.lte(field, String(f.value)); else if (f.op === ">") q = q.gt(field, String(f.value)); else if (f.op === "<") q = q.lt(field, String(f.value)); } return q; }
  async function getPage(key, options = {}) {
    await ready();
    const collection = collectionName(key), pageSize = Math.min(Math.max(Number(options.pageSize) || 30, 1), 100);
    const c = config();
    if (c) {
      let q = client.from("data_records").select("id,payload,date_text,month_text,updated_at").eq("collection", collection);
      q = applyWhere(q, options.where);
      const order = options.orderField === "month" ? "month_text" : options.orderField === "updatedAt" ? "updated_at" : "date_text";
      q = q.order(order, { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(pageSize);
      if (options.cursor?.primaryValue) q = q.lt(order, String(options.cursor.primaryValue));
      const { data, error } = await q;
      if (error) {
        console.error("Supabase getPage error for " + collection + ":", error);
        throw Object.assign(new Error(error.message || "Supabase getPage failed"), { code: error.code, table: collection });
      }
      if (Array.isArray(data)) {
        metric(key, data.length);
        const records = data.map(record), last = data[data.length - 1];
        return { records, pageSize, hasMore: data.length === pageSize, nextCursor: last ? { primaryValue: last[order], documentId: last.id } : null };
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
    const records = rows.slice(0, pageSize).map(record);
    return { records, pageSize, hasMore: rows.length > pageSize, nextCursor: null };
  }
  async function getValue(key, fallback) { const rows = await getTable(key); if (!rows.length) return fallback; if (["settings", "categories"].includes(key)) return rows[0]; if (key === "specialties") return Array.isArray(rows[0].value) ? rows[0].value : fallback; return rows; }
  async function upsertRecords(key, records) {
    await ready();
    const rows = records.filter(r => r?.id).map(r => rowFromRecord(collectionName(key), r));
    if (!rows.length) return;
    const c = config();
    if (c) {
      const { error } = await client.from("data_records").upsert(rows, { onConflict: "collection,id" });
      if (error) {
        console.error("Supabase upsertRecords error for " + collectionName(key) + ":", error);
        throw Object.assign(new Error(error.message || "Supabase upsert failed"), { code: error.code, details: error.details, table: collectionName(key) });
      }
      return;
    }
    if (window.MITALI_IS_PROD) {
      throw new Error("Supabase is not configured in production");
    }
    const all = readMockRows();
    rows.forEach(item => {
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
      const { error } = await client.from("data_records").delete().eq("collection", collectionName(key)).in("id", [...idSet]);
      if (error) {
        console.error("Supabase deleteRecords error for " + collectionName(key) + ":", error);
        throw Object.assign(new Error(error.message || "Supabase delete failed"), { code: error.code, details: error.details, table: collectionName(key) });
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
  async function setTable(key, records) { await ready(); const collection = collectionName(key), keep = records.map(r => String(r.id)); try { let q = client.from("data_records").delete().eq("collection", collection); if (keep.length) q = q.not("id", "in", `(${keep.join(",")})`); await q; } catch (_e) {} await upsertRecords(key, records); return records; }
  function subscribe(key, onChange, onError) {
    try {
      init();
      const collection = collectionName(key);
      if (client?.channel) {
        const channel = client.channel(`data-${collection}-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "data_records", filter: `collection=eq.${collection}` }, payload => {
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
  async function getPatientIndexPage(pageKey, cursor) { return getPage(pageKey, { pageSize: 30, orderField: "updatedAt", cursor }); }
  async function searchPatientIndex(pageKey, term) { await ready(); const collection = collectionName(pageKey), t = String(term || "").trim(); if (!t) return []; try { let q = client.from("data_records").select("id,payload").eq("collection", collection).limit(30); if (/^\d+$/.test(t)) q = q.eq("payload->>fileNo", t); else if (/^[0-9+\-\s]+$/.test(t)) q = q.eq("payload->>phone", t); else q = q.ilike("payload->>name", `${t}%`); const { data, error } = await q; if (!error && Array.isArray(data)) { metric(pageKey, data.length); return data.map(record); } } catch (_e) {} const rows = readMockRows().filter(r => r.collection === collection && String(r.payload?.name || "").toLowerCase().includes(t.toLowerCase())).slice(0, 30); metric(pageKey, rows.length); return rows.map(record); }
  async function savePatientToIndex(visit, isDental = false) { const name = String(visit?.patient || visit?.name || "").trim(), phone = String(visit?.phone || "").trim(), fileNo = String(visit?.fileNo || "").trim(); if (!name && !phone && !fileNo) return null; const id = (fileNo ? `F:${fileNo}` : `N:${name.toLowerCase()}|${phone}`).replace(/\//g, "_").slice(0, 120); return upsertRecord(isDental ? "patientFilesDental" : "patientFilesClinic", { id, name, phone, fileNo, patientKey: id, lastVisitDate: visit.date || new Date().toISOString().slice(0, 10), lastVisitCreatedAt: visit.createdAt || new Date().toISOString(), updatedAt: visit.createdAt || new Date().toISOString() }); }
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
    const u = currentUser() || { id: uid || "supabase-admin" };
    const isManager = (u.id === "supabase-admin" || u.username === "admin" || !uid || uid === "supabase-admin");
    return {
      id: u.id || uid || "supabase-admin",
      displayName: isManager ? "مدير النظام" : (u.displayName || "موظف"),
      username: isManager ? "admin" : (u.username || "user"),
      role: isManager ? "مدير" : "موظف",
      status: "نشط",
      permissions: isManager ? {
        dashboard:{view:true},doctors:{view:true,add:true,edit:true,delete:true},employees:{view:true,add:true,edit:true,delete:true},clinic:{view:true,add:true,edit:true,delete:true},dental:{view:true,add:true,edit:true,delete:true},operations:{view:true,add:true,edit:true,delete:true},labs:{view:true,add:true,edit:true,delete:true},radiology:{view:true,add:true,edit:true,delete:true},patientFilesClinic:{view:true},patientFilesDental:{view:true},income:{view:true,add:true,edit:true,delete:true},expense:{view:true,add:true,edit:true,delete:true},ledger:{view:true},outstandingBalancesClinic:{view:true},outstandingBalancesDental:{view:true},outstandingBalancesOperations:{view:true},outstandingBalancesLabs:{view:true},outstandingBalancesRadiology:{view:true},outstandingBalances:{view:true},reports:{view:true},payroll:{view:true,add:true,edit:true,delete:true},categories:{view:true,add:true,edit:true,delete:true},users:{view:true,add:true,edit:true,delete:true,editPerms:true},settings:{edit:true,backup:true,restore:true}
      } : {},
      credentialVersion: 1, securityVersion: 1
    };
  }
  const ensureAdminProfile = getUserProfile;
  async function updateOwnSecurityMetadata(metadata) { return profileRequest("metadata", { metadata }); }
  async function changePassword(_username, _currentPassword, newPassword) { const { data, error } = await init().auth.updateUser({ password: String(newPassword || "") }); if (error) throw error; return data.user; }
  async function getMonthRecords(key, month) { const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(); return (await getPage(key, { pageSize: 100, where: [{ field: "date", op: ">=", value: `${month}-01` }, { field: "date", op: "<=", value: `${month}-${String(last).padStart(2, "0")}` }] })).records; }
  async function getFinancialSummary(month = "all") { return fetchJson(`/api/financial/summary?month=${encodeURIComponent(month)}`, { headers: { Authorization: `Bearer ${await accessToken()}` } }); }
  async function getReportsData(options = {}) { const p = new URLSearchParams({ range: String(options.range || 6), closingMonth: String(options.closingMonth || ""), annualYear: String(options.annualYear || ""), doctorMonth: String(options.doctorMonth || ""), includeAnnual: String(options.includeAnnual ?? "") }); if (options.scope) p.set("scope", options.scope); return fetchJson(`/api/financial/reports?${p}`, { headers: { Authorization: `Bearer ${await accessToken()}` } }); }
  const getDoctorMonthReport = month => getReportsData({ scope: "doctors", doctorMonth: month });
  const adminCreateAccount = payload => adminRequest({ action: "create", ...payload });
  const adminUpdateAccount = (payload, action = "update") => adminRequest({ action, ...payload });
  const adminListAccounts = async () => (await adminRequest({}, "GET")).accounts || [];
  const adminDeleteAccount = uid => adminRequest({ action: "delete", uid });
  const configureManagerRecovery = payload => adminRequest({ action: "configureManagerRecovery", ...payload });
  const recoverManagerPassword = payload => fetchJson("/api/admin/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recoverManagerPassword", ...payload }) });
  const adminWipeBusinessData = confirmationText => adminRequest({ action: "wipeBusinessData", confirmationText });
  const adminAccountRequest = adminRequest;
  const isMockMode = () => !config();
  window.getPatientIndexPage = getPatientIndexPage; window.searchPatientIndex = searchPatientIndex; window.savePatientToIndex = savePatientToIndex;
  window.MitaliSupabase = window.MitaliFirebase = Object.freeze({ config: Object.freeze({ provider: "supabase" }), collections: COLLECTIONS, init, ready, waitForAuth, isMockMode, getTable, getPage, getPatientIndexPage, searchPatientIndex, savePatientToIndex, setTable, getValue, setValue, upsertRecord, upsertRecords, deleteRecords, subscribe, subscribePage, authEmailForUsername, signInWithUsername, changePassword, getFinancialSummary, getReportsData, getDoctorMonthReport, getMonthRecords, adminCreateAccount, configureManagerRecovery, recoverManagerPassword, adminUpdateAccount, adminListAccounts, adminDeleteAccount, adminAccountRequest, adminWipeBusinessData, signOut, authUser: currentUser, getUserProfile, ensureAdminProfile, updateOwnSecurityMetadata, getReadMetrics: () => JSON.parse(JSON.stringify(READ_METRICS)), resetReadMetrics: () => { READ_METRICS.queries = 0; READ_METRICS.documents = 0; READ_METRICS.byKey = {}; READ_METRICS.lastReadAt = null; } });
})();
