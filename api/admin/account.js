const crypto = require('crypto');
const { getAdmin, requireManager, userFromRequest, profile, publicProfile, fullPermissions, cleanPermissions, mockStore } = require('../_lib/supabase-admin');
function emailFor(username) { const b = Buffer.from(String(username || '').trim().toLowerCase(), 'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); return `u-${b}@accounts.mitali-hospital.internal`; }
function json(res, code, body) { return res.status(code).setHeader('Cache-Control','no-store').json(body); }
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

async function create(admin, input) {
  const username = String(input.username || '').trim().toLowerCase(), password = String(input.password || '');
  if (!username || !input.displayName || password.length < 6) throw Object.assign(new Error('missing-or-invalid-account-fields'), { status: 400 });
  let auId = `user-${Date.now()}`;
  try {
    const { data: au, error: ae } = await admin.auth.admin.createUser({ email: emailFor(username), password, email_confirm: true, user_metadata: { display_name: input.displayName } });
    if (ae) throw ae;
    if (au?.user?.id) auId = au.user.id;
  } catch (err) {
    console.error("Auth createUser error:", err.message || err);
    if (isProd) throw Object.assign(new Error(err.message || 'auth-create-user-failed'), { status: 400 });
  }
  const row = { id: auId, username, display_name: String(input.displayName), role: input.role === 'مدير' ? 'مدير' : 'موظف', status: input.status === 'موقوف' ? 'موقوف' : 'نشط', permissions: input.role === 'مدير' ? fullPermissions() : cleanPermissions(input.permissions), credential_version: 1, security_version: 1, created_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() };
  try {
    const { data, error } = await admin.from('profiles').insert(row).select().single();
    if (error) throw error;
    try {
      await admin.from('staff_accounts').upsert({ ...row, id: String(row.id), payload: row });
    } catch (_saErr) {}
    if (data) return publicProfile(data);
  } catch (err) {
    console.error("Profiles insert error:", err.message || err);
    if (isProd) throw Object.assign(new Error(err.message || 'profile-insert-failed'), { status: 500 });
  }
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
  try {
    const { error: authErr } = await admin.auth.admin.updateUserById(uid, authPatch);
    if (authErr) console.error("Auth updateUserById error:", authErr.message || authErr);
  } catch (err) {
    console.error("Auth updateUserById exception:", err.message || err);
  }
  try {
    const { data, error } = await admin.from('profiles').update(patch).eq('id', uid).select().single();
    if (error) throw error;
    try {
      await admin.from('staff_accounts').update({ ...patch, payload: { ...current, ...patch } }).eq('id', uid);
    } catch (_saErr) {}
    if (data) return publicProfile(data);
  } catch (err) {
    console.error("Profiles update error:", err.message || err);
    if (isProd) throw Object.assign(new Error(err.message || 'profile-update-failed'), { status: 500 });
  }
  const merged = Object.assign(current, patch);
  mockStore.profiles.set(uid, merged);
  return publicProfile(merged);
}
module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { admin } = await requireManager(req);
      try {
        const { data: profData, error: profErr } = await admin.from('profiles').select('*').order('created_at');
        if (!profErr && Array.isArray(profData) && profData.length > 0) {
          return json(res, 200, { accounts: profData.map(publicProfile) });
        }
        const { data: staffData, error: staffErr } = await admin.from('staff_accounts').select('*').order('created_at');
        if (!staffErr && Array.isArray(staffData) && staffData.length > 0) {
          return json(res, 200, { accounts: staffData.map(publicProfile) });
        }
      } catch (err) {
        console.error("Profiles fetch error:", err.message || err);
        if (isProd) throw Object.assign(new Error(err.message || 'profiles-fetch-failed'), { status: 500 });
      }
      const accounts = Array.from(mockStore.profiles.values()).map(publicProfile);
      return json(res, 200, { accounts });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method-not-allowed' });
    const input = req.body || {};
    if (input.action === 'recoverManagerPassword') {
      const username = String(input.username || '').trim().toLowerCase();
      const recoveryCode = String(input.recoveryCode || '').trim();
      const newPassword = String(input.newPassword || '');
      if (username !== 'admin') throw Object.assign(new Error('only-admin-can-recover'), { status: 400 });
      if (!recoveryCode) throw Object.assign(new Error('missing-recovery-code'), { status: 400 });
      if (newPassword.length < 6) throw Object.assign(new Error('auth/weak-password'), { status: 400 });

      const admin = getAdmin();
      let recovery = null;

      try {
        const { data: scData } = await admin.from('system_control').select('value,payload').eq('id', 'manager_recovery').maybeSingle();
        if (scData) recovery = scData.value || scData.payload;
      } catch (_scErr) {}

      let adminProfile = null;
      try {
        const { data: pData } = await admin.from('profiles').select('*').eq('username', 'admin').maybeSingle();
        if (pData) {
          adminProfile = pData;
          if (!recovery && pData.permissions?._manager_recovery) {
            recovery = pData.permissions._manager_recovery;
          }
        }
      } catch (_pErr) {}

      const email = emailFor('admin');
      let adminAuthUser = null;
      try {
        const { data: usersData } = await admin.auth.admin.listUsers();
        adminAuthUser = (usersData?.users || []).find(u => u.email === email || u.user_metadata?.username === 'admin');
      } catch (_auErr) {}

      if (!recovery && adminAuthUser?.user_metadata?.manager_recovery) {
        recovery = adminAuthUser.user_metadata.manager_recovery;
      }
      if (!recovery && mockStore.manager_recovery) {
        recovery = mockStore.manager_recovery;
      }

      if (!recovery || !recovery.hash || !recovery.salt) {
        throw Object.assign(new Error('recovery-not-configured'), { status: 400 });
      }

      const computedHash = crypto.pbkdf2Sync(recoveryCode, recovery.salt, 100000, 32, 'sha256').toString('hex');
      if (computedHash !== recovery.hash) {
        throw Object.assign(new Error('invalid-recovery-code'), { status: 400 });
      }

      const targetUid = adminAuthUser?.id || adminProfile?.id;
      if (targetUid) {
        const { error: resetErr } = await admin.auth.admin.updateUserById(targetUid, { password: newPassword });
        if (resetErr) {
          console.error("Auth password reset error:", resetErr);
          throw Object.assign(new Error(resetErr.message || 'auth-password-update-failed'), { status: 500 });
        }
      } else {
        const mockAdmin = mockStore.users.get('supabase-admin');
        if (mockAdmin) mockAdmin.password = newPassword;
      }

      try {
        await admin.from('profiles').update({
          credential_version: 1,
          last_password_change_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('username', 'admin');
      } catch (_pErr) {}

      return json(res, 200, { ok: true, message: 'password-reset-success' });
    }
    const { admin, user, profile: p } = await requireManager(req);
    if (input.action === 'configureManagerRecovery') {
      const code = String(input.recoveryCode || '').trim();
      if (code.length < 10) throw Object.assign(new Error('recovery-code-too-short'), { status: 400 });

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256').toString('hex');
      const recoveryData = { hash, salt, configured_at: new Date().toISOString() };

      mockStore.manager_recovery = recoveryData;

      if (user?.id) {
        try {
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: { ...(user.user_metadata || {}), manager_recovery: recoveryData }
          });
        } catch (authErr) {
          console.warn("Save manager_recovery to auth user_metadata failed:", authErr.message || authErr);
        }

        try {
          const currentPerms = (p && p.permissions && typeof p.permissions === 'object') ? p.permissions : {};
          await admin.from('profiles').update({
            permissions: { ...currentPerms, _manager_recovery: recoveryData },
            updated_at: new Date().toISOString()
          }).eq('id', user.id);
        } catch (profErr) {
          console.warn("Save manager_recovery to profiles failed:", profErr.message || profErr);
        }
      }

      try {
        await admin.from('system_control').upsert({
          id: 'manager_recovery',
          value: recoveryData,
          payload: recoveryData,
          updated_at: new Date().toISOString()
        });
      } catch (_scErr) {}

      return json(res, 200, { ok: true, configured: true });
    }
    if (input.action === 'create') return json(res, 200, { ok: true, account: await create(admin, input) });
    if (input.action === 'delete') {
      const uid = String(input.uid || '');
      if (!uid) throw Object.assign(new Error('missing-uid'), { status: 400 });
      try {
        await admin.from('staff_accounts').delete().or(`id.eq.${uid},payload->>firebaseUid.eq.${uid}`);
      } catch (delStaffErr) {
        console.error("Staff accounts delete error:", delStaffErr.message || delStaffErr);
      }
      try {
        const { error: delProfileErr } = await admin.from('profiles').delete().eq('id', uid);
        if (delProfileErr) console.error("Profiles delete error:", delProfileErr.message || delProfileErr);
      } catch (delErr) {
        console.error("Profiles delete exception:", delErr.message || delErr);
        if (isProd) throw Object.assign(new Error(delErr.message || 'profile-delete-failed'), { status: 500 });
      }
      mockStore.profiles.delete(uid);
      try {
        const { error: delAuthErr } = await admin.auth.admin.deleteUser(uid);
        if (delAuthErr) console.error("Auth deleteUser error:", delAuthErr.message || delAuthErr);
      } catch (delAuthEx) {
        console.error("Auth deleteUser exception:", delAuthEx.message || delAuthEx);
      }
      return json(res, 200, { ok: true, deleted: { id: uid } });
    }
    if (input.action === 'wipeBusinessData') return require('./data')(req, res);
    if (['update','resetPassword','toggleStatus','permissions'].includes(input.action)) return json(res, 200, { ok: true, account: await update(admin, input) });
    throw Object.assign(new Error('unknown-action'), { status: 400 });
  } catch (e) {
    console.error('supabase-account-error', e.code || e.message);
    return json(res, e.status || 500, { error: e.code || e.message || 'account-operation-failed' });
  }
};
module.exports.authEmailForUsername = emailFor;
