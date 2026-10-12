-- ======================================================================
-- 013_fix_misplaced_dental_visits_and_income.sql
-- تصحيح زيارات الأسنان وبنود الوارد التي تسرّبت إلى العيادات الخارجية
-- وتحديث مجاميع ملفات مرضى الأسنان
-- ======================================================================

BEGIN;

-- 1. نقل أي زيارات أسنان تسربت إلى جدول عيادات خارجية visits_clinic
--    (بسبب خطأ سابق في تحصيل الدفعات من ملفات مرضى الأسنان)
INSERT INTO public.visits_dental (
    id, date, month, file_no, patient, phone, doctor_id, doctor_name,
    exam_type, services, total, paid, payment_method, status, notes,
    linked_income_id, next_visit_date, payload, updated_at
)
SELECT 
    vc.id, vc.date, vc.month, vc.file_no, vc.patient, vc.phone, vc.doctor_id, vc.doctor_name,
    vc.exam_type, vc.services, vc.total, 
    GREATEST(COALESCE(vc.paid, 0), COALESCE(vd.paid, 0)),
    COALESCE(vc.payment_method, vd.payment_method, 'نقدي'),
    CASE 
        WHEN (COALESCE(vc.total, 0) - GREATEST(COALESCE(vc.paid, 0), COALESCE(vd.paid, 0))) <= 0.009 THEN 'تم'
        WHEN GREATEST(COALESCE(vc.paid, 0), COALESCE(vd.paid, 0)) > 0 THEN 'جزئي'
        ELSE 'مؤجل'
    END,
    COALESCE(vc.notes, vd.notes),
    COALESCE(vc.linked_income_id, vd.linked_income_id),
    COALESCE(vc.next_visit_date, vd.next_visit_date),
    vc.payload,
    NOW()
FROM public.visits_clinic vc
LEFT JOIN public.visits_dental vd ON vd.id = vc.id
WHERE vc.doctor_id IN (SELECT id FROM public.doctors WHERE type = 'أسنان' OR specialty = 'أسنان')
   OR vc.id IN (SELECT id FROM public.visits_dental)
   OR vc.exam_type IN ('حشو', 'خلع', 'تنظيف', 'تركيب', 'تبييض', 'كشف أسنان')
ON CONFLICT (id) DO UPDATE SET
    paid = GREATEST(visits_dental.paid, EXCLUDED.paid),
    status = CASE 
        WHEN (visits_dental.total - GREATEST(visits_dental.paid, EXCLUDED.paid)) <= 0.009 THEN 'تم'
        WHEN GREATEST(visits_dental.paid, EXCLUDED.paid) > 0 THEN 'جزئي'
        ELSE 'مؤجل'
    END,
    updated_at = NOW();

-- 2. حذف الزيارات الخاطئة من جدول عيادات خارجية visits_clinic
DELETE FROM public.visits_clinic
WHERE doctor_id IN (SELECT id FROM public.doctors WHERE type = 'أسنان' OR specialty = 'أسنان')
   OR id IN (SELECT id FROM public.visits_dental)
   OR exam_type IN ('حشو', 'خلع', 'تنظيف', 'تركيب', 'تبييض', 'كشف أسنان');

-- 3. تصحيح تصنيف بنود الوارد (income) لتصبح "أسنان" بدلاً من "عيادات خارجية" أو "عيادة الأسنان"
UPDATE public.income
SET category = 'أسنان',
    updated_at = NOW()
WHERE category IN ('عيادات خارجية', 'عيادة الأسنان')
  AND (
      linked_visit_id IN (SELECT id FROM public.visits_dental)
      OR doctor_id IN (SELECT id FROM public.doctors WHERE type = 'أسنان' OR specialty = 'أسنان')
      OR description ILIKE '%أسنان%'
  );

-- 4. تنظيف فهرس مرضى العيادات الخارجية (patient_file_index_clinic) من أي مريض ليس له أي زيارات عيادات
DELETE FROM public.patient_file_index_clinic pfc
WHERE NOT EXISTS (
    SELECT 1 FROM public.visits_clinic vc 
    WHERE (vc.file_no IS NOT NULL AND vc.file_no = pfc.file_no)
       OR (vc.phone IS NOT NULL AND vc.phone = pfc.phone)
       OR (vc.patient IS NOT NULL AND LOWER(TRIM(vc.patient)) = LOWER(TRIM(pfc.patient)))
);

-- 5. تحديث وإعادة حساب إجمالي المدفوع والمتبقي وعدد الزيارات في فهرس مرضى الأسنان (patient_file_index_dental)
WITH dental_stats AS (
    SELECT 
        COALESCE(NULLIF(file_no, ''), CONCAT('N:', LOWER(TRIM(patient)), '|', TRIM(phone))) AS computed_key,
        MAX(patient) AS patient_name,
        MAX(phone) AS patient_phone,
        MAX(NULLIF(file_no, '')) AS p_file_no,
        COUNT(*) AS v_count,
        SUM(COALESCE(paid, 0)) AS v_paid,
        SUM(GREATEST(0, COALESCE(total, 0) - COALESCE(paid, 0))) AS v_due,
        MAX(date) AS last_date,
        MAX(updated_at) AS last_updated
    FROM public.visits_dental
    GROUP BY computed_key
)
INSERT INTO public.patient_file_index_dental (
    id, patient, phone, file_no, visits_count, total_paid, total_due, last_visit_date, updated_at
)
SELECT 
    CASE WHEN p_file_no IS NOT NULL THEN CONCAT('F:', p_file_no) ELSE computed_key END,
    patient_name,
    patient_phone,
    p_file_no,
    v_count,
    v_paid,
    v_due,
    last_date,
    NOW()
FROM dental_stats
ON CONFLICT (id) DO UPDATE SET
    visits_count = EXCLUDED.visits_count,
    total_paid = EXCLUDED.total_paid,
    total_due = EXCLUDED.total_due,
    last_visit_date = EXCLUDED.last_visit_date,
    updated_at = NOW();

COMMIT;
