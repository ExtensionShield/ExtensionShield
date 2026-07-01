-- Statistics table for aggregated metrics.
-- Schema ported from the ThreatXtension SQLite schema.
-- Column names/order are based on upstream, with Postgres/Supabase type changes.
-- MIT per upstream README; no separate upstream LICENSE file is published.
-- See docs/NOTICE.

create table "public"."statistics" (
  "id" bigserial primary key,
  "metric_name" text unique not null,
  "metric_value" integer default 0,
  "updated_at" timestamptz default now()
);

-- Initialize default statistics (matching SQLite defaults)
insert into "public"."statistics" ("metric_name", "metric_value")
values 
  ('total_scans', 0),
  ('high_risk_extensions', 0),
  ('total_files_analyzed', 0),
  ('total_vulnerabilities', 0)
on conflict ("metric_name") do nothing;

