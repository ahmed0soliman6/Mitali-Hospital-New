const { getAdmin, requireManager, userFromRequest, profile, publicProfile, fullPermissions, cleanPermissions, mockStore } = require('../_lib/supabase-admin');
function emailFor(username) { const b = Buffer.from(String(username || '').trim().toLowerCase(), 'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); return `u-${b}@accounts.mitali-hospital.internal`; }
function json(res, code, body) { return res.status(code).setHeader('Cache-Control','no-store').json(body); }
async function create(admin, input) {
  const username = String(input.username || '').trim().toLowerCase(), password = String(input.password || '');
  if (!username || !input.displayName || password.length < 6) throw Object.assign(new Error('missing-or-invalid-account-fields'), { status: 400 });
  let auId = `user-${Date.now()}`;
  try {
    const { data: au, error: ae } = await admin.auth.admin.createUser({ email: emailFor(username), password, email_confirm: true, user_metadata: { display_name: input.displayName } });
    if (!ae && au?.user?.id) auId = au.user.id;
  } catch (_e) {}
  const row = { id: auId, username, display_name: String(input.displayName), role: input.role === 'مدير' ? 'مدير' : 'موظف', status: input.status === 'موقوف' ? 'موقوف' : 'نشط', permissions: input.role === 'مدير' ? fullPermissions() : cleanPermissions(input.permissions), credential_version: 1, security_version: 1, created_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() };
  try {
    const { data, error } = await admin.from('profiles').insert(row).select().single();
    if (!error && data) return publicProfile(data);
  } catch (_e) {}
  mockStore.profiles.set(row.id, row);
  return publicProfile(row);
}
async function update(admin, input) {
  const uid = String(input.uid || '');
  const current = await profile(admin, uid);
  if (!current) throw Object.assign(new Error('account-not-found'), { status: 404 });
  const nextRole = input.role === 'مدير' ? 'مدير' : input.role === 'موظف' ? 'موظف' : current.role, nextStatus = input.status === 'موقوف' ? 'موقوف' : input.status === 'نشط' ? 'نشط' : current.status;
  const patch = { display_name: String(input.displayName || current.display_name), username: String(input.username || current.username).trim().toLowerCase(), role: nextRole, status: nextStatus, permissions: nextRole === 'مدير' ? fullPermissions() : cleanPermissions(input.permissions || current.permissions), credential_version: Number(current.credential_version || 1) + 1, security_version: Number(current.security_version || 1) + 1, updated_at: new Date().toISOString() };
  const authPatch = { user_metadata: { display_name: patch.display_name }, ban_duration: nextStatus === 'موقوف' ? '876000h' : 'none' };
  if (input.password) {
    if (String(input.password).length < 6) throw Object.assign(new Error('auth/weak-password'), { status: 400 });
    authPatch.password = String(input.password);
    patch.last_password_change_at = new Date().toISOString();
  }
  try { await admin.auth.admin.updateUserById(uid, authPatch); } catch (_e) {}
  try {
    const { data, error } = await admin.from('profiles').update(patch).eq('id', uid).select().single();
    if (!error && data) return publicProfile(data);
  } catch (_e) {}
  const merged = Object.assign(current, patch);
  mockStore.profiles.set(uid, merged);
  return publicProfile(merged);
}
module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { admin } = await requireManager(req);
      try {
        const { data, error } = await admin.from('profiles').select('*').order('created_at');
        if (!error && Array.isArray(data)) return json(res, 200, { accounts: data.map(publicProfile) });
      } catch (_e) {}
      const accounts = Array.from(mockStore.profiles.values()).map(publicProfile);
      return json(res, 200, { accounts });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method-not-allowed' });
    const input = req.body || {};
    if (input.action === 'recoverManagerPassword') return json(res, 501, { error: 'recovery-requires-configured-recovery-flow' });
    const { admin } = await requireManager(req);
    if (input.action === 'create') return json(res, 200, { ok: true, account: await create(admin, input) });
    if (input.action === 'delete') {
      const uid = String(input.uid || '');
      if (!uid) throw Object.assign(new Error('missing-uid'), { status: 400 });
      try { await admin.from('profiles').delete().eq('id', uid); } catch (_e) {}
      mockStore.profiles.delete(uid);
      try { await admin.auth.admin.deleteUser(uid); } catch (_e) {}
      return json(res, 200, { ok: true, deleted: { id: uid } });
    }
    if (['update','resetPassword','toggleStatus','permissions'].includes(input.action)) return json(res, 200, { ok: true, account: await update(admin, input) });
    throw Object.assign(new Error('unknown-action'), { status: 400 });
  } catch (e) {
    console.error('supabase-account-error', e.code || e.message);
    return json(res, e.status || 500, { error: e.code || e.message || 'account-operation-failed' });
  }
};
module.exports.authEmailForUsername = emailFor;
