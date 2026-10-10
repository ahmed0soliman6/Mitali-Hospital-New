const { getAdmin, userFromRequest, profile, publicProfile } = require('../_lib/supabase-admin');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });
  try {
    const admin = getAdmin(); const { user } = await userFromRequest(req, admin); const action = req.body?.action || 'get';
    let p = await profile(admin, user.id);
    if (!p) {
      const username = String(user.email || '').split('@')[0].replace(/^u-/, '') || user.id.slice(0, 8);
      const { data, error } = await admin.from('profiles').insert({ id: user.id, username, display_name: user.user_metadata?.display_name || username, role: 'موظف', status: 'نشط' }).select().single();
      if (error) throw error; p = data;
    }
    if (action === 'metadata') {
      const m = req.body?.metadata || {}; const allowed = {}; for (const k of ['lastLogin','securityVersion','lastPasswordChangeAt']) if (m[k] !== undefined) allowed[k === 'lastLogin' ? 'last_login' : k === 'securityVersion' ? 'security_version' : 'last_password_change_at'] = m[k];
      const { data, error } = await admin.from('profiles').update(allowed).eq('id', user.id).select().single(); if (error) throw error; p = data;
    }
    return res.status(200).json({ ok: true, profile: publicProfile(p) });
  } catch (e) { console.error('supabase-profile-error', e.code || e.message); return res.status(e.status || 500).json({ error: e.code || e.message || 'profile-operation-failed' }); }
};
