# Mitali Hospital — Supabase setup

## ما تم تحويله

- المصادقة: **Supabase Auth** باستخدام بريد داخلي مشتق من اسم المستخدم، مثل `admin`.
- البيانات التشغيلية: جدول PostgreSQL موحّد `data_records` يحفظ اسم المجموعة ومعرّف السجل و`payload` JSONB، مع فهارس للتاريخ والشهر والتحديث.
- الحسابات والصلاحيات: جدول `profiles` منفصل عن `auth.users`، ولا تُحفظ كلمات المرور في التطبيق أو PostgreSQL.
- المزامنة: عمليات الكتابة المحلية الحالية وOutbox في `index.html` ما زالت المصدر الأول، ثم ترفع إلى Supabase عند الاتصال. الاشتراكات تستخدم Supabase Realtime على `data_records`.
- API الخادمي: مسارات Vercel تحت `api/` تستخدم `SUPABASE_SERVICE_ROLE_KEY` فقط في الخادم لإدارة الحسابات والتقارير والحذف التجاري.

## خطوات الإعداد

1. أنشئ مشروع Supabase جديدًا.
2. نفّذ الملف `supabase/migrations/001_initial_schema.sql` في SQL Editor.
3. فعّل Realtime لجدول `public.data_records` إذا لم يفعّله أمر SQL تلقائيًا.
4. انسخ `supabase-config.js` إلى إعدادات النشر أو عدّل القيم وقت البناء:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. أضف في Vercel، كمتغيرات **Server-only**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. أعد النشر.
7. أنشئ أول مدير من Supabase Dashboard > Authentication > Users، ثم أنشئ صفه في `profiles` عبر SQL، أو استخدم API بعد وجود مدير أول:

```sql
insert into public.profiles (id, username, display_name, role, status, permissions)
select id, 'admin', 'مدير النظام', 'مدير', 'نشط', '{}'::jsonb
from auth.users
where email like 'u-YWRtaW4@accounts.mitali-hospital.internal';
```

## نقل البيانات

هذا الإصدار **لا يتصل بمشروع Firebase القديم ولا ينقل بياناته تلقائيًا**. بعد إنشاء المشروع الجديد، استخدم تصديرًا مستقلًا ثم حوّل كل سجل إلى الشكل التالي:

```json
{
  "collection": "visits_clinic",
  "id": "visit-123",
  "payload": { "patient": "...", "date": "2026-10-01", "paid": 100 }
}
```

ثم ارفع الصفوف إلى `data_records` بواسطة أداة إدارية آمنة. لا تضع `SUPABASE_SERVICE_ROLE_KEY` في المتصفح أو ZIP أو GitHub.

## حدود مهمة قبل الإنتاج

- لم يتم اختبار المصادقة أو التقارير ضد مشروع Supabase حقيقي في هذه الجلسة لعدم توفر URL ومفاتيح المشروع.
- كلمات مرور ومستخدمي Firebase الحاليين **لن يعملوا تلقائيًا** في Supabase Auth؛ يجب إنشاء مستخدمي Auth الجدد أو تنفيذ ترحيل كلمات المرور عبر مسار رسمي.
- سياسة RLS تطبق صلاحيات الأقسام للبيانات العامة، بينما إدارة الحسابات وتغيير كلمة المرور تمر عبر API الخادمي.
- رفع ملفات المرضى الثنائية لم يُنقل إلى Supabase Storage بعد؛ الفهرس النصي موجود، أما الملفات الفعلية فتحتاج bucket وسياسة Storage منفصلة قبل استخدامها.
- تقارير السنة الكاملة في API الجديد لا تُحمّل افتراضيًا لتقليل القراءة؛ يجب طلبها صراحة بعد تفعيل البيانات.
