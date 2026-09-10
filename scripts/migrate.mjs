import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_DATABASE_URL ou DATABASE_URL est requis.");

const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-migrations" });

async function apply(file) {
  console.log(`[migrate] Applying ${file}...`);
  await pool.query(await readFile(resolve("db/migrations", file), "utf8"));
}

try {
  const { rows } = await pool.query("SELECT to_regclass('public.users') AS users_table");
  const hasUsers = Boolean(rows[0]?.users_table);

  // 001 is historical bootstrap SQL and contains DROP statements. It is safe
  // only when the database has never been initialized.
  if (!hasUsers) {
    console.log("[migrate] Empty database detected: applying 001_neon.sql bootstrap.");
    await apply("001_neon.sql");
  } else {
    console.log("[migrate] Existing database detected: skipping destructive 001_neon.sql.");
  }

  // Keep these migrations idempotent so deploys can safely be repeated.
  await apply("002_user_settings.sql");
  await apply("002_production_safety.sql");
  await apply("003_zakapro_prices.sql");
  console.log("[migrate] Production-safe migrations completed.");
} finally {
  await pool.end();
}
