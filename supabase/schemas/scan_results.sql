-- Global scan results cache (RLS enabled, no policies - backend uses service role).
-- Schema ported from the ThreatXtension SQLite schema.
-- Column names/order are based on upstream, with Postgres/Supabase type changes.
-- MIT per upstream README; no separate upstream LICENSE file is published.
-- See docs/NOTICE.
-- Note: JSON fields stored as JSONB in Supabase (better than TEXT in SQLite).

create table "public"."scan_results" (
  "extension_id" text primary key,  -- Primary key (cache keyed by extension_id)
  "extension_name" text,
  "url" text,
  "scanned_at" timestamptz not null,
  "status" text not null,
  "security_score" integer,
  "risk_level" text,
  "total_findings" integer default 0,
  "total_files" integer default 0,
  "high_risk_count" integer default 0,
  "medium_risk_count" integer default 0,
  "low_risk_count" integer default 0,
  "metadata" jsonb,  -- TEXT in SQLite → JSONB in Supabase
  "manifest" jsonb,
  "permissions_analysis" jsonb,
  "sast_results" jsonb,
  "webstore_analysis" jsonb,
  "summary" jsonb,
  "extracted_path" text,
  "extracted_files" jsonb,
  "icon_path" text,  -- Relative path to icon (e.g., "icons/128.png")
  "error" text,
  "created_at" timestamptz default now(),
  "updated_at" timestamptz default now()
);

-- Indexes (PK extension_id is already indexed, so no idx_extension_id needed)
create index "idx_scanned_at" 
  on "public"."scan_results"("scanned_at" desc);

create index "idx_risk_level" 
  on "public"."scan_results"("risk_level");

-- Enable RLS but create NO policies (backend uses service role key)
alter table "public"."scan_results" enable row level security;

-- Trigger to auto-update updated_at on row changes
create trigger "scan_results_updated_at"
  before update on "public"."scan_results"
  for each row
  execute function update_updated_at_column();

-- Note: No RLS policies - this table is intentionally global/shared.
-- Backend writes use service role key which bypasses RLS.
-- Tables are NOT accessible via Supabase API without explicit policies.

