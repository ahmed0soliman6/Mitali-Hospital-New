-- ==============================================================================
-- Clean Orphaned Patient Index Records
-- Version: 012_clean_orphan_patient_indexes
-- Description: Removes index rows from patient_file_index_clinic and patient_file_index_dental
-- that have 0 remaining visits in visits_clinic and visits_dental.
-- ==============================================================================

-- 1. Remove orphaned clinic patient file index records
DELETE FROM public.patient_file_index_clinic p
WHERE NOT EXISTS (
  SELECT 1 FROM public.visits_clinic v
  WHERE (p.file_no IS NOT NULL AND p.file_no <> '' AND v.file_no = p.file_no)
     OR (p.name IS NOT NULL AND p.name <> '' AND (v.patient = p.name OR v.payload->>'patient' = p.name OR v.payload->>'name' = p.name))
);

-- 2. Remove orphaned dental patient file index records
DELETE FROM public.patient_file_index_dental p
WHERE NOT EXISTS (
  SELECT 1 FROM public.visits_dental v
  WHERE (p.file_no IS NOT NULL AND p.file_no <> '' AND v.file_no = p.file_no)
     OR (p.name IS NOT NULL AND p.name <> '' AND (v.patient = p.name OR v.payload->>'patient' = p.name OR v.payload->>'name' = p.name))
);
