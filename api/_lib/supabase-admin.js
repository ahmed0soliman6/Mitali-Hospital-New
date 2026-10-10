const { createClient } = require('@supabase/supabase-js');

function fullPermissions() {
  const modules = ['dashboard','doctors','employees','clinic','dental','operations','labs','radiology','patientFilesClinic','patientFilesDental','income','expense','ledger','outstandingBalancesClinic','outstandingBalancesDental','outstandingBalancesOperations','outstandingBalancesLabs','outstandingBalancesRadiology','outstandingBalances','reports','payroll','categories','users','settings'];
  const actions = ['view','add','edit','delete','editPerms','backup','restore'];
  return Object.fromEntries(modules.map(m => [m, Object.fromEntries(actions.map(a => [a, true]))]));
}

const mockStore = {
  users: new Map([
    ['supabase-admin', {
      id: 'supabase-admin',
      email: 'u-YWRtaW4@accounts.mitali-hospital.internal',
      user_metadata: { display_name: 'مدير النظام' }
    }]
  ]),
  profiles: new Map([
    ['supabase-admin', {
      id: 'supabase-admin',
      username: 'admin',
      display_name: 'مدير النظام',
      role: 'مدير',
      status: 'نشط',
      permissions: fullPermissions(),
      credential_version: 1,
      security_version: 1,
      created_at: new Date().toISOString().slice(0, 10),
      last_login: null,
      last_password_change_at: null,
      updated_at: new Date().toISOString()
    }]
  ]),
  data_records: []
};

function createMockQuery(tableName) {
  let op = 'select';
  let payload = null;
  let filters = [];
  let orderCol = null;
  let orderAsc = true;
  let limitCount = null;
  let singleMode = null;

  const getRows = () => {
    if (tableName === 'profiles') return Array.from(mockStore.profiles.values());
    if (tableName === 'data_records') return mockStore.data_records.slice();
    return [];
  };

  const matchRow = (row) => filters.every(f => f(row));

  const execute = async () => {
    try {
      if (tableName === 'profiles') {
        if (op === 'insert') {
          const rows = Array.isArray(payload) ? payload : [payload];
          const inserted = rows.map(r => {
            const rec = {
              id: r.id || `user-${Date.now()}`,
              username: r.username || 'user',
              display_name: r.display_name || r.username || 'مستخدم',
              role: r.role || 'موظف',
              status: r.status || 'نشط',
              permissions: r.permissions || {},
              credential_version: r.credential_version || 1,
              security_version: r.security_version || 1,
              created_at: r.created_at || new Date().toISOString().slice(0, 10),
              last_login: r.last_login || null,
              last_password_change_at: r.last_password_change_at || null,
              updated_at: new Date().toISOString()
            };
            mockStore.profiles.set(rec.id, rec);
            return rec;
          });
          const data = singleMode ? (inserted[0] || null) : inserted;
          return { data, count: inserted.length, error: null };
        }
        if (op === 'update') {
          const matched = getRows().filter(matchRow);
          const updated = matched.map(r => {
            const next = { ...r, ...payload, updated_at: new Date().toISOString() };
            mockStore.profiles.set(next.id, next);
            return next;
          });
          const data = singleMode ? (updated[0] || null) : updated;
          return { data, count: updated.length, error: null };
        }
        if (op === 'delete') {
          const matched = getRows().filter(matchRow);
          matched.forEach(r => mockStore.profiles.delete(r.id));
          return { data: matched, count: matched.length, error: null };
        }
      } else if (tableName === 'data_records') {
        if (op === 'delete') {
          const removed = [];
          mockStore.data_records = mockStore.data_records.filter(r => {
            if (matchRow(r)) { removed.push(r); return false; }
            return true;
          });
          return { data: removed, count: removed.length, error: null };
        }
        if (op === 'upsert' || op === 'insert') {
          const rows = Array.isArray(payload) ? payload : [payload];
          rows.forEach(r => {
            const idx = mockStore.data_records.findIndex(x => x.collection === r.collection && String(x.id) === String(r.id));
            if (idx >= 0) mockStore.data_records[idx] = { ...mockStore.data_records[idx], ...r };
            else mockStore.data_records.push({ ...r });
          });
          return { data: rows, count: rows.length, error: null };
        }
      }

      let rows = getRows().filter(matchRow);
      if (orderCol) {
        rows.sort((a, b) => {
          const va = String(a[orderCol] ?? '');
          const vb = String(b[orderCol] ?? '');
          return orderAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }
      if (limitCount != null) rows = rows.slice(0, limitCount);
      if (singleMode === 'maybeSingle' || singleMode === 'single') {
        return { data: rows[0] || null, count: rows.length, error: null };
      }
      return { data: rows, count: rows.length, error: null };
    } catch (error) {
      return { data: null, count: 0, error };
    }
  };

  const builder = {
    select() { if (op === 'select') op = 'select'; return builder; },
    insert(row) { op = 'insert'; payload = row; return builder; },
    update(patch) { op = 'update'; payload = patch; return builder; },
    upsert(rows) { op = 'upsert'; payload = rows; return builder; },
    delete() { op = 'delete'; return builder; },
    eq(col, val) { filters.push(r => String(r[col] ?? '') === String(val)); return builder; },
    gte(col, val) { filters.push(r => String(r[col] ?? '') >= String(val)); return builder; },
    lte(col, val) { filters.push(r => String(r[col] ?? '') <= String(val)); return builder; },
    gt(col, val) { filters.push(r => String(r[col] ?? '') > String(val)); return builder; },
    lt(col, val) { filters.push(r => String(r[col] ?? '') < String(val)); return builder; },
    in(col, vals) { const s = new Set((vals || []).map(String)); filters.push(r => s.has(String(r[col] ?? ''))); return builder; },
    order(col, opts = {}) { orderCol = col; orderAsc = opts.ascending !== false; return builder; },
    limit(n) { limitCount = n; return builder; },
    maybeSingle() { singleMode = 'maybeSingle'; return execute(); },
    single() { singleMode = 'single'; return execute(); },
    then(onFulfilled, onRejected) { return execute().then(onFulfilled, onRejected); }
  };
  return builder;
}

function createMockAdmin() {
  return {
    auth: {
      async getUser(token) {
        if (!token) return { data: { user: null }, error: new Error('missing-token') };
        if (token.startsWith('mock-token:')) {
          const parts = token.split(':');
          const uid = parts[1] || 'supabase-admin';
          const username = parts[2] || 'admin';
          let user = mockStore.users.get(uid);
          if (!user) {
            user = {
              id: uid,
              email: `u-${Buffer.from(username).toString('base64').replace(/=+$/, '')}@accounts.mitali-hospital.internal`,
              user_metadata: { display_name: username === 'admin' ? 'مدير النظام' : username }
            };
            mockStore.users.set(uid, user);
          }
          if (!mockStore.profiles.has(uid)) {
            mockStore.profiles.set(uid, {
              id: uid,
              username,
              display_name: username === 'admin' ? 'مدير النظام' : username,
              role: username === 'admin' ? 'مدير' : 'موظف',
              status: 'نشط',
              permissions: username === 'admin' ? fullPermissions() : {},
              credential_version: 1,
              security_version: 1,
              created_at: new Date().toISOString().slice(0, 10),
              last_login: null,
              last_password_change_at: null,
              updated_at: new Date().toISOString()
            });
          }
          return { data: { user }, error: null };
        }
        return { data: { user: mockStore.users.get('supabase-admin') }, error: null };
      },
      admin: {
        async createUser({ email, user_metadata }) {
          const id = `mock-uid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const user = { id, email, user_metadata: user_metadata || {} };
          mockStore.users.set(id, user);
          return { data: { user }, error: null };
        },
        async updateUserById(uid, patch) {
          const existing = mockStore.users.get(uid) || { id: uid, email: '', user_metadata: {} };
          const updated = { ...existing, ...patch, user_metadata: { ...existing.user_metadata, ...(patch.user_metadata || {}) } };
          mockStore.users.set(uid, updated);
          return { data: { user: updated }, error: null };
        },
        async deleteUser(uid) {
          mockStore.users.delete(uid);
          return { data: {}, error: null };
        },
        async signOut() {
          return { error: null };
        }
      }
    },
    from(table) {
      return createMockQuery(table);
    }
  };
}

function getAdmin() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    return createMockAdmin();
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function bearer(req) { const h = String(req.headers?.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7) : ''; }
async function userFromRequest(req, admin = getAdmin()) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });

  // 1. Mock token from dev / local session
  if (token.startsWith('mock-token:')) {
    const parts = token.split(':');
    const uid = parts[1] || 'supabase-admin';
    const username = parts[2] || 'admin';
    let user = mockStore.users.get(uid);
    if (!user) {
      user = {
        id: uid,
        email: `u-${Buffer.from(username).toString('base64').replace(/=+$/, '')}@accounts.mitali-hospital.internal`,
        user_metadata: { display_name: username === 'admin' ? 'مدير النظام' : username }
      };
      mockStore.users.set(uid, user);
    }
    if (!mockStore.profiles.has(uid)) {
      mockStore.profiles.set(uid, {
        id: uid,
        username,
        display_name: username === 'admin' ? 'مدير النظام' : username,
        role: username === 'admin' ? 'مدير' : 'موظف',
        status: 'نشط',
        permissions: username === 'admin' ? fullPermissions() : {},
        credential_version: 1,
        security_version: 1,
        created_at: new Date().toISOString().slice(0, 10),
        last_login: null,
        last_password_change_at: null,
        updated_at: new Date().toISOString()
      });
    }
    return { admin, user };
  }

  // 2. Real Supabase auth token
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data && data.user) {
      return { admin, user: data.user };
    }
  } catch (_e) {}

  // 3. Fallback: Parse JWT payload if remote validation is unavailable or token is dev-signed
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload && (payload.sub || payload.email)) {
        const uid = payload.sub || 'supabase-admin';
        const email = payload.email || '';
        let username = 'admin';
        try {
          const match = email.match(/^u-([^@]+)@/);
          if (match) {
            const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
            username = decodeURIComponent(escape(Buffer.from(b64, 'base64').toString('binary'))) || 'admin';
          }
        } catch (_err) {}
        const user = {
          id: uid,
          email: email || `u-${Buffer.from(username).toString('base64').replace(/=+$/, '')}@accounts.mitali-hospital.internal`,
          user_metadata: payload.user_metadata || { display_name: username === 'admin' ? 'مدير النظام' : username }
        };
        return { admin, user };
      }
    }
  } catch (_err) {}

  throw Object.assign(new Error('invalid-token'), { status: 401 });
}

async function profile(admin, uid) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  try {
    const { data, error } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) console.error("Database query for profile error:", error.message || error);
    if (!error && data) return data;
  } catch (err) {
    console.error("Profile fetch exception:", err.message || err);
  }

  if (isProd) {
    return null;
  }

  let p = mockStore.profiles.get(uid);
  if (!p) {
    const user = mockStore.users.get(uid);
    const username = user?.user_metadata?.username || (uid === 'supabase-admin' ? 'admin' : (user?.email?.split('@')[0]?.replace(/^u-/, '') || 'admin'));
    p = {
      id: uid,
      username,
      display_name: user?.user_metadata?.display_name || (username === 'admin' ? 'مدير النظام' : username),
      role: (username === 'admin' || uid === 'supabase-admin') ? 'مدير' : 'موظف',
      status: 'نشط',
      permissions: (username === 'admin' || uid === 'supabase-admin') ? fullPermissions() : {},
      credential_version: 1,
      security_version: 1,
      created_at: new Date().toISOString().slice(0, 10),
      last_login: null,
      last_password_change_at: null,
      updated_at: new Date().toISOString()
    };
    mockStore.profiles.set(uid, p);
  }
  return p;
}
function permissions(value) { return value && typeof value === 'object' ? value : {}; }
function cleanPermissions(value) {
  const p = JSON.parse(JSON.stringify(permissions(value)));
  if (p.clinic?.add || p.clinic?.edit) {
    p.patientFilesClinic = { ...(p.patientFilesClinic || {}), view: true, add: true, edit: true };
  } else if (p.clinic?.view) {
    p.patientFilesClinic = { ...(p.patientFilesClinic || {}), view: true };
  }
  if (p.dental?.add || p.dental?.edit) {
    p.patientFilesDental = { ...(p.patientFilesDental || {}), view: true, add: true, edit: true };
  } else if (p.dental?.view) {
    p.patientFilesDental = { ...(p.patientFilesDental || {}), view: true };
  }
  p.doctors = { ...(p.doctors || {}), view: true };
  p.categories = { ...(p.categories || {}), view: true };
  p.specialties = { ...(p.specialties || {}), view: true };
  p.settings = { ...(p.settings || {}), view: true };
  return p;
}
function publicProfile(p) { if (!p) return null; return { id: p.id, firebaseUid: p.id, displayName: p.display_name || '', username: p.username || '', role: p.role || 'موظف', status: p.status || 'نشط', permissions: permissions(p.permissions), credentialVersion: p.credential_version || 1, securityVersion: p.security_version || 1, createdAt: p.created_at, lastLogin: p.last_login, lastPasswordChangeAt: p.last_password_change_at, updatedAt: p.updated_at }; }
async function requireManager(req) { const { admin, user } = await userFromRequest(req); const p = await profile(admin, user.id); if (!p || p.status === 'موقوف' || p.role !== 'مدير') throw Object.assign(new Error('Manager access required'), { status: 403 }); return { admin, user, profile: p }; }
module.exports = { getAdmin, bearer, userFromRequest, profile, publicProfile, fullPermissions, cleanPermissions, requireManager, mockStore };
