# Supabase migrations

Production database changes are manual, versioned operations. They are not imported
by `backend/server.js`, the frontend build, or any deployment hook.

Use a new numbered SQL migration for each schema change, for example:

```text
0002_add_attempt_metadata.sql
```

Migrations must be idempotent (`IF NOT EXISTS`, guarded updates, or equivalent)
and must not reset existing records. Run them explicitly against the intended
Supabase project after reviewing the SQL. The root `supabase_schema.sql` is the
initial idempotent schema reference for provisioning a new environment; it is
not a startup script.

Seed and transfer operations are unavailable when `NODE_ENV=production`.

Before any migration that changes an existing column, table, constraint, or
relationship, verify the live schema and confirm that a current Supabase backup
or point-in-time recovery window is available. After deployment, verify the
database health endpoint, login, existing assessments/questions, submissions,
scores, rankings, reports, and audit records.
