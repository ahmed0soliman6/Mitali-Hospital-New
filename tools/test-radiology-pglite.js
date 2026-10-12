const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');

async function test() {
  const pg = new PGlite();
  console.log('PGlite started');
  await pg.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid; $$;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE PUBLICATION supabase_realtime;
  `);

  let initSql = fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
  initSql = initSql.replace(/create extension if not exists pgcrypto;/gi, '-- pgcrypto');
  await pg.exec(initSql);
  console.log('001 executed');

  let sql003 = fs.readFileSync('003_explicit_relational_tables.sql', 'utf8');
  sql003 = sql003.replace(/create extension if not exists pgcrypto;/gi, '-- pgcrypto');
  await pg.exec(sql003);
  console.log('003 executed');

  const sql004 = fs.readFileSync('004_fix_rls_and_staff_accounts.sql', 'utf8');
  await pg.exec(sql004);
  console.log('004 executed');

  const sql013 = fs.readFileSync('013_fix_misplaced_dental_visits_and_income.sql', 'utf8');
  await pg.exec(sql013);
  console.log('013 executed');

  // Test inserting into visits_radiology
  try {
    const res = await pg.query(`
      INSERT INTO visits_radiology (id, date, month, file_no, patient, phone, doctor_id, doctor_name, exam_type, services, total, paid, payment_method, status, notes, linked_income_id, next_visit_date, payload, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *;
    `, [
      'rad-1', '2026-10-12', '2026-10', null, 'تيست 5', null, 'doc-1', 'احمد مشعل', 'كشف', JSON.stringify([]), 100, 100, 'نقدي', 'تم', null, 'visit-income-radiology-rad-1', null, JSON.stringify({ id: 'rad-1', patient: 'تيست 5' }), new Date().toISOString()
    ]);
    console.log('Insert visits_radiology SUCCESS:', res.rows.length);
  } catch (err) {
    console.error('Insert visits_radiology ERROR:', err);
  }

  // Test querying getPage for visits_radiology
  try {
    const res = await pg.query(`
      SELECT * FROM visits_radiology
      WHERE date >= '2026-10-01' AND date <= '2026-10-31'
      ORDER BY date DESC, updated_at DESC, id DESC
      LIMIT 30;
    `);
    console.log('Query visits_radiology SUCCESS:', res.rows.length, res.rows[0]);
  } catch (err) {
    console.error('Query visits_radiology ERROR:', err);
  }
}
test().catch(console.error);
