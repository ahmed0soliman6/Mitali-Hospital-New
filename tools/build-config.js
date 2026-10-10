/**
 * tools/build-config.js
 * Builds public runtime configuration for frontend deployment.
 * Strictly adheres to security rules:
 * - Injects ONLY public SUPABASE_URL and SUPABASE_ANON_KEY.
 * - NEVER injects SUPABASE_SERVICE_ROLE_KEY.
 * - Fails build in production if required public variables are missing.
 */
const fs = require('fs');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (isProd) {
  if (!url || !anonKey || url.includes('your-project') || anonKey.includes('your-anon-key')) {
    console.error('❌ خطأ فادح في البناء (Build Error):');
    console.error('متغيرات بيئة الإنتاج SUPABASE_URL و SUPABASE_ANON_KEY غير معرفة أو غير صالحة.');
    console.error('تأكد من إضافتها في لوحة تحكم Vercel (Environment Variables).');
    process.exit(1);
  }
  if (anonKey.length < 50 || anonKey.split('.').length !== 3) {
    console.error('❌ خطأ فادح في البناء (Build Error):');
    console.error('مفتاح SUPABASE_ANON_KEY يبدو مقطوعاً أو غير مكتمل (JWT غير صالح).');
    console.error('تأكد من نسخ المفتاح كاملاً من لوحة Supabase (يتكون من 3 أجزاء تفصلها نقاط . وطوله أكثر من 150 حرفاً).');
    process.exit(1);
  }
}

const configContent = `/* Generated configuration for Mitali Hospital */
(function() {
  window.SUPABASE_URL = ${JSON.stringify(url)};
  window.SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};
  window.MITALI_API_BASE = window.MITALI_API_BASE || "";
  window.MITALI_IS_PROD = ${isProd ? 'true' : 'false'};
})();
`;

const targetFile = path.resolve(__dirname, '..', 'supabase-config.js');
fs.writeFileSync(targetFile, configContent, 'utf8');
console.log(`✅ supabase-config.js generated successfully. (mode: ${isProd ? 'production' : 'development'}, url: ${url ? 'set' : 'empty'})`);
