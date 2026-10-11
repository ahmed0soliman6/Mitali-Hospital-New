const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const assert = require('assert');

async function test() {
  console.log('Testing migration with PGlite (PostgreSQL 16+ WASM)...');
  const pg = new PGlite();

  // Ensure auth schema exists (in Supabase this is provided by Supabase Auth)
  await pg.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid; $$;
    CREATE PUBLICATION supabase_realtime;
  `);

  // 1. Run 001_initial_schema.sql (without pgcrypto extension create for PGlite)
  let initSql = fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
  initSql = initSql.replace(/create extension if not exists pgcrypto;/gi, '-- pgcrypto');
  await pg.exec(initSql);
  console.log('001_initial_schema.sql executed successfully.');

  // 2. Insert sample test data into data_records
  await pg.exec(`
    INSERT INTO public.data_records (collection, id, payload, date_text, month_text) VALUES
    ('doctors', 'doc-1', '{"id": "doc-1", "name": "د. أحمد علي", "specialty": "باطنة", "docPct": 70, "clinicPct": 30}'::jsonb, '2026-09-01', '2026-09'),
    ('doctors', 'doc-2', '{"id": "doc-2", "name": "د. سارة محمود", "specialty": "أسنان", "feeMode": "fixed_visit", "checkupClinicFee": 50}'::jsonb, '2026-09-01', '2026-09'),
    ('visits_clinic', 'vis-1', '{"id": "vis-1", "patient": "محمد خالد", "phone": "01000000001", "doctorId": "doc-1", "doctorName": "د. أحمد علي", "date": "2026-09-15", "total": 900, "paid": 900, "status": "تم"}'::jsonb, '2026-09-15', '2026-09'),
    ('visits_clinic', 'vis-2', '{"id": "vis-2", "patient": "علي حسن", "phone": "01000000002", "doctorId": "", "doctorName": "د. أحمد علي", "doctor": "د. أحمد علي", "date": "2026-09-16", "total": "500", "paid": "300", "status": "متبقي"}'::jsonb, '2026-09-16', '2026-09'),
    ('income', 'inc-1', '{"id": "inc-1", "party": "محمد خالد", "category": "عيادات", "amount": 900, "date": "2026-09-15"}'::jsonb, '2026-09-15', '2026-09'),
    ('expense', 'exp-1', '{"id": "exp-1", "party": "شركة النظافة", "category": "نظافة", "amount": 150, "date": "2026-09-15"}'::jsonb, '2026-09-15', '2026-09'),
    ('settings', 'app', '{"openingBalance": 1000}'::jsonb, NULL, NULL);
  `);
  console.log('Sample data inserted into data_records.');

  // Pre-migration checks
  const preDocVis = await pg.query("SELECT COUNT(*) as c, SUM((payload->>'total')::numeric) as total, SUM((payload->>'paid')::numeric) as paid FROM public.data_records WHERE collection = 'visits_clinic'");
  const origCount = Number(preDocVis.rows[0].c);
  const origTotal = Number(preDocVis.rows[0].total);
  const origPaid = Number(preDocVis.rows[0].paid);
  console.log(`Pre-migration visits: count=${origCount}, total=${origTotal}, paid=${origPaid}`);

  // Measure payload size of doc-1 in data_records
  const preDocPayload = await pg.query("SELECT length(payload::text) as len FROM public.data_records WHERE collection = 'doctors' AND id = 'doc-1'");
  const origDocPayloadLen = Number(preDocPayload.rows[0].len);
  console.log(`Original doctor payload length: ${origDocPayloadLen} chars`);

  // Load and execute 003 migration script
  let migSql = fs.readFileSync('003_explicit_relational_tables.sql', 'utf8');
  migSql = migSql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/gi, '-- pgcrypto');
  await pg.exec(migSql);
  console.log('Migration 003 executed without errors!');

  // Post-migration checks
  const postVis = await pg.query("SELECT COUNT(*) as c, SUM(total) as total, SUM(paid) as paid FROM public.visits_clinic");
  const newCount = Number(postVis.rows[0].c);
  const newTotal = Number(postVis.rows[0].total);
  const newPaid = Number(postVis.rows[0].paid);
  console.log(`Post-migration visits: count=${newCount}, total=${newTotal}, paid=${newPaid}`);

  assert.strictEqual(newCount, origCount, 'Visit count must match');
  assert.strictEqual(newTotal, origTotal, 'Total amount must match (no zeroing out!)');
  assert.strictEqual(newPaid, origPaid, 'Paid amount must match (no zeroing out!)');

  // Verify doctor-linking for vis-2 (was orphan with doctorId='')
  const vis2 = await pg.query("SELECT doctor_id FROM public.visits_clinic WHERE id = 'vis-2'");
  assert.strictEqual(vis2.rows[0].doctor_id, 'doc-1', 'Orphan visit must be linked to doc-1 by name');

  // Verify doctor payload size did NOT explode
  const postDocPayload = await pg.query("SELECT length(payload::text) as len, payload FROM public.doctors WHERE id = 'doc-1'");
  const newDocPayloadLen = Number(postDocPayload.rows[0].len);
  console.log(`New doctor payload length: ${newDocPayloadLen} chars`);
  assert.ok(newDocPayloadLen <= origDocPayloadLen, `Doctor payload length must not grow! (${newDocPayloadLen} vs ${origDocPayloadLen})`);
  assert.strictEqual(postDocPayload.rows[0].payload.patient, undefined, 'Doctor payload must NOT contain patient key!');

  // Verify legacy table exists and was renamed
  const legacyTableRes = await pg.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'data_records_legacy_%'");
  assert.strictEqual(legacyTableRes.rows.length, 1, 'data_records must be renamed to data_records_legacy_YYYYMMDD');
  console.log(`Legacy table found: ${legacyTableRes.rows[0].tablename}`);

  console.log('\n ALL CHECKS PASSED SUCCESSFULLY ON POSTGRES 16+ WASM!\n');
}

test().catch(err => {
  console.error('Migration test error message:', err.message);
  console.error('Migration test error detail:', err.detail || err.hint || err);
  if (err.cause) console.error('Cause:', err.cause);
  process.exit(1);
});
