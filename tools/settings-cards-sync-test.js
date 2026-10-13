const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting settings cards sync regression test...');

const indexPath = path.join(__dirname, '..', 'index.html');
const indexSrc = fs.readFileSync(indexPath, 'utf8');

const storePath = path.join(__dirname, '..', 'supabase-store.js');
const storeSrc = fs.readFileSync(storePath, 'utf8');

// 1. Check ensureValidCategories logic
assert.doesNotMatch(indexSrc, /defaultIncomeNames\.forEach\(name => \{\s*if \(!DB\.categories\.income\.some/,
  'ensureValidCategories must not forcibly re-inject deleted categories on every call');

// 2. Check doctor and employee forms await persist before route()
assert.match(indexSrc, /await persist\("doctors"\);\s*route\(\);/,
  'doctorForm must await persist before route()');

assert.match(indexSrc, /await persist\("employees"\);\s*route\(\);/,
  'empForm must await persist before route()');

// 3. Check specialties and settings test types await persist before route()
assert.match(indexSrc, /await persist\("specialties"\); showToast\("تمت إضافة التخصص"\); route\(\);/,
  'specAddForm must await persist before route()');

assert.match(indexSrc, /await persist\("specialties"\); showToast\("تم الحذف"\); route\(\);/,
  'specdel must await persist before route()');

assert.match(indexSrc, /await persist\("settings"\); showToast\("تمت الإضافة"\); route\(\);/,
  'xray/lab test add forms must await persist before route()');

// 4. Check category delete awaits persist before route()
assert.match(indexSrc, /await persist\("categories"\);\s*showToast\(`تم نقل العمليات إلى "\$\{target\}" وحذف التصنيف`\); route\(\);/,
  'category delete with transfer must await persist');

assert.match(indexSrc, /await persist\("categories"\); showToast\("تم الحذف"\); route\(\);/,
  'category delete must await persist');

// 5. Check supabase-store.js clean setValue for categories, specialties, and settings
assert.match(storeSrc, /delete cleanSettings\.value;/,
  'setValue("settings") must delete nested stale .value');

assert.match(storeSrc, /const cleanCats = \{ id: "app", income: inc, expense: exp \};/,
  'setValue("categories") must clean payload');

assert.match(storeSrc, /const cleanSpecs = \{ id: "app", value: list \};/,
  'setValue("specialties") must clean payload');

// 6. Check employee mapping
assert.match(storeSrc, /role: payload\.role \|\| payload\.job \|\| null/,
  'explicitRowFromRecord must map both role and job');

console.log('✅ ALL SETTINGS CARDS REGRESSION CHECKS PASSED SUCCESSFULLY!');
