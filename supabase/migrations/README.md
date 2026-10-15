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

Seed and transfer operations are always unavailable when
`NODE_ENV=production`. Non-production seed/transfer commands also require an
explicit `DB_ALLOW_DESTRUCTIVE_NONPROD=true` opt-in.

Production backend startup requires `SUPABASE_EXPECTED_PROJECT_REF` to be set
to the intended Supabase project reference. Startup compares it with
`SUPABASE_URL` and exits before serving requests if they differ. Production must
also provide the server-only `SUPABASE_SERVICE_ROLE_KEY` or
`SUPABASE_SECRET_KEY`; never provide either key as a `VITE_*` variable.

Vercel API and socket routing is configured through build-time environment
variables, not hard-coded production rewrites. Set `VITE_API_URL` for each
Vercel environment. Production uses the production API. Preview deployments
must set `VITE_DEPLOYMENT_TIER=staging` and point `VITE_API_URL` and
`VITE_SOCKET_URL` at an isolated staging backend connected to a staging
Supabase project. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_EXPECTED_PROJECT_REF` to that same staging project. Production
uses `VITE_DEPLOYMENT_TIER=production` and must configure the matching
production Supabase values. Configure
the staging backend's `SUPABASE_EXPECTED_PROJECT_REF` to the staging project
and its `FRONTEND_URLS` to the allowed Vercel preview origins.

Before and after a deployment, run `npm --prefix backend run db:check` with
read-only credentials/permissions where available and save its per-table counts.
It validates the configured project identity and reads counts for core tables;
it never writes rows or runs migrations. Run the same command against the same
staging project before and after staging deploy/restart checks.

Before any migration that changes an existing column, table, constraint, or
relationship, verify the live schema and confirm that a current Supabase backup
or point-in-time recovery window is available. After deployment, verify the
database health endpoint, login, existing assessments/questions, submissions,
scores, rankings, reports, and audit records.
