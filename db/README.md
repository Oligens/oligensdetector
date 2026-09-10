# Migrations Oligens Detector

## Production

Do **not** run `db/migrations/001_neon.sql` directly against an existing database. The file is a historical bootstrap and contains destructive `DROP` statements. It now contains a safety guard and will abort when `public.users` already exists.

Use the safe runner instead:

```bash
node scripts/migrate.mjs
```

The runner:

1. Checks whether `public.users` already exists.
2. Runs `001_neon.sql` only for an empty database.
3. Runs `002_production_safety.sql` for both fresh and existing databases.
4. Never intentionally drops an initialized production database.

Set `DIRECT_DATABASE_URL` (preferred) or `DATABASE_URL` before running it.
