const { createClient } = require('@supabase/supabase-js');
function getAdmin() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw Object.assign(new Error('supabase-server-misconfigured'), { code: 'server-misconfigured', status: 503 });
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function bearer(req) { const h = String(req.headers?.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7) : ''; }
async function userFromRequest(req, admin = getAdmin()) { const token = bearer(req); if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 }); const { data, error } = await admin.auth.getUser(token); if (error || !data.user) throw Object.assign(new Error('invalid-token'), { status: 401 }); return { admin, user: data.user }; }
async function profile(admin, uid) { const { data, error } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle(); if (error) throw error; return data; }
function permissions(value) { return value && typeof value === 'object' ? value : {}; }
function publicProfile(p) { if (!p) return null; return { id: p.id, firebaseUid: p.id, displayName: p.display_name || '', username: p.username || '', role: p.role || 'موظف', status: p.status || 'نشط', permissions: permissions(p.permissions), credentialVersion: p.credential_version || 1, securityVersion: p.security_version || 1, createdAt: p.created_at, lastLogin: p.last_login, lastPasswordChangeAt: p.last_password_change_at, updatedAt: p.updated_at }; }
function fullPermissions() { const modules = ['dashboard','doctors','employees','clinic','dental','operations','labs','radiology','patientFilesClinic','patientFilesDental','income','expense','ledger','outstandingBalancesClinic','outstandingBalancesDental','outstandingBalancesOperations','outstandingBalancesLabs','outstandingBalancesRadiology','outstandingBalances','reports','payroll','categories','users','settings']; const actions = ['view','add','edit','delete','editPerms','backup','restore']; return Object.fromEntries(modules.map(m => [m, Object.fromEntries(actions.map(a => [a, true]))])); }
function cleanPermissions(value) { return permissions(value); }
async function requireManager(req) { const { admin, user } = await userFromRequest(req); const p = await profile(admin, user.id); if (!p || p.status === 'موقوف' || p.role !== 'مدير') throw Object.assign(new Error('Manager access required'), { status: 403 }); return { admin, user, profile: p }; }
module.exports = { getAdmin, bearer, userFromRequest, profile, publicProfile, fullPermissions, cleanPermissions, requireManager };
