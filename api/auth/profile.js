const { getAdmin, userFromRequest, profile, publicProfile, fullPermissions } = require('../_lib/supabase-admin');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const admin = getAdmin();
    const { user } = await userFromRequest(req, admin);
    const action = req.body?.action || 'get';
    let p = await profile(admin, user.id);
    if (!p) {
      const username = String(user.email || '').split('@')[0].replace(/^u-/, '') || user.id.slice(0, 8);
      const isManager = username.toLowerCase() === 'admin' || user.id === 'supabase-admin';
      try {
        const { data, error } = await admin.from('profiles').insert({
          id: user.id,
          username,
          display_name: user.user_metadata?.display_name || username,
          role: isManager ? 'مدير' : 'موظف',
          status: 'نشط',
          permissions: isManager ? fullPermissions() : {}
        }).select().single();
        if (!error && data) p = data;
      } catch (_insertErr) {}
      if (!p) {
        p = await profile(admin, user.id);
      }
    }
    if (action === 'metadata' && p) {
      const m = req.body?.metadata || {};
      const allowed = {};
      for (const k of ['lastLogin','securityVersion','lastPasswordChangeAt']) {
        if (m[k] !== undefined) allowed[k === 'lastLogin' ? 'last_login' : k === 'securityVersion' ? 'security_version' : 'last_password_change_at'] = m[k];
      }
      try {
        const { data, error } = await admin.from('profiles').update(allowed).eq('id', user.id).select().single();
        if (!error && data) p = data;
      } catch (_updateErr) {}
      Object.assign(p, allowed);
    }
    return res.status(200).json({ ok: true, profile: publicProfile(p) });
  } catch (e) {
    console.error('supabase-profile-error', e.code || e.message);
    return res.status(e.status || 500).json({ error: e.code || e.message || 'profile-operation-failed' });
  }
};
