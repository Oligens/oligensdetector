import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_DATABASE_URL ou DATABASE_URL est requis.");

const pool = new Pool({ connectionString, max: 1, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-migrations" });

try {
  const { rows } = await pool.query("SELECT to_regclass('public.users') AS users_table");
  const hasUsers = Boolean(rows[0]?.users_table);

  // 001 is the historical bootstrap migration and contains DROP statements.
  // It is allowed only on a database that has not been initialized yet.
  if (!hasUsers) {
    console.log("[migrate] Empty database detected: applying 001_neon.sql bootstrap.");
    await pool.query(await readFile(resolve("db/migrations/001_neon.sql"), "utf8"));
  } else {
    console.log("[migrate] Existing database detected: skipping destructive 001_neon.sql.");
  }

  await pool.query(await readFile(resolve("db/migrations/002_production_safety.sql"), "utf8"));
  console.log("[migrate] Production-safe migrations completed.");
} finally {
  await pool.end();
}
