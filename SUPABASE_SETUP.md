# Mitali Hospital — إعداد قاعدة بيانات Supabase (الجداول العلائقية الصريحة)

## الهيكلية المعمارية الجديدة

تم تحويل النظام بالكامل من مخزن المستندات القديم إلى **قاعدة بيانات PostgreSQL علائقية صريحة (Explicit Relational Schema)** على Supabase:
- **جداول علائقية منفصلة لكل كيان طبي وإداري**:
  - الزيارات: `visits_clinic`, `visits_dental`, `visits_operations`, `visits_labs`, `visits_radiology`
  - المعاملات المالية: `income`, `expense`, `lab_expenses`
  - الموارد البشرية: `payroll`, `doctors`, `employees`
  - فهارس المرضى: `patient_file_index_clinic`, `patient_file_index_dental`, `patient_file_index`
  - الإعدادات: `settings`, `categories`, `specialties`
  - الرقابة والنشاط: `audit_log`
- **الحسابات والأمان**: جدول `profiles` مرتبط بـ `auth.users`، وسياسات أمان صفوف (RLS) محسّنة الأداء تستخدم `(SELECT public.has_permission(table, action))` لمنع التقييم المتكرر لكل صف.
- **التحديث المباشر (Realtime)**: قنوات Supabase Realtime مخصصة لكل جدول عند فتحه فقط لترشيد موارد الباقة المجانية.
- **المزامنة والعمل بدون اتصال**: تخزين محلي IDB مع طابور رفع للسجلات المعلقة `PENDING_UPSERT_IDS`، مع حماية ضد ازدواجية العد وضمان سلامة الترقيم والفلاتر.

---

## خطوات التثبيت وتطبيق الهجرة

### 1. إعداد المشروع في Supabase
1. أنشئ مشروعًا جديدًا على [Supabase](https://supabase.com).
2. افتح **SQL Editor** ونفّذ ملفات الهجرة بالترتيب:
   - `supabase/migrations/001_initial_schema.sql` (إنشاء الحسابات والصلاحيات والدوال الأساسية).
   - `supabase/migrations/002_data_integrity_indexes.sql` (فهارس البحث والترقيم).
   - `supabase/migrations/003_explicit_relational_tables.sql` (إنشاء الجداول العلائقية وترحيل أي بيانات سابقة بشكل آمن داخل معاملة ذرية).

### 2. إعداد المتغيرات البيئية
في استضافة **Vercel** أو ملف `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

وفي واجهة المتصفح (`supabase-config.js`):
```javascript
window.MITALI_SUPABASE_CONFIG = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-public-key"
};
```

---

## سياسة الأمان والنسخ الاحتياطي
- جميع العمليات على الجداول مشمولة بـ Row-Level Security (RLS).
- سكريبت الهجرة `003_explicit_relational_tables.sql` لا يقوم بأي حذف مدمر لجدول `data_records` القديم، بل يقوم بإعادة تسميته إلى `data_records_legacy_YYYYMMDD` وتفعيل RLS عليه كنسخة احتياطية دائمة.
- المستودع خاص (Private) ولا يجوز وضع مفتاح `SUPABASE_SERVICE_ROLE_KEY` في الكود الأمامي للعميل.
