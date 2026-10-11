const fs = require('fs');
const { PGlite } = require('@electric-sql/pglite');

async function testMigration() {
  const db = new PGlite();
  await db.query(fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, ''));
  await db.query(fs.readFileSync('003_explicit_relational_tables.sql', 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, ''));
  
  console.log('Running 004_fix_rls_and_staff_accounts.sql...');
  await db.query(fs.readFileSync('004_fix_rls_and_staff_accounts.sql', 'utf8'));
  console.log('004 Migration SUCCESSFUL!');

  // Test inserting visit
  await db.query(`INSERT INTO public.visits_dental (id, patient, total, paid, status) VALUES ('test-1', 'test 1', 1000, 100, 'تم');`);
  const res = await db.query(`SELECT id, patient, total, paid FROM public.visits_dental WHERE id = 'test-1';`);
  console.log('Inserted visit:', res.rows);

  // Test inserting staff account with Firebase UID (non-UUID text id)
  await db.query(`INSERT INTO public.staff_accounts (id, username, display_name, role) VALUES ('akvBRlYmxveNlqrSWAbzLlkXIIR2', 'admin', 'مدير النظام', 'مدير');`);
  const accRes = await db.query(`SELECT id, username, display_name, role FROM public.staff_accounts;`);
  console.log('Inserted staff account:', accRes.rows);
}
testMigration().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
