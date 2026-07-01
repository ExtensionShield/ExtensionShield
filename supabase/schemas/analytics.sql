-- Privacy-first analytics: daily page view counts (no PII, no user_id).
-- ExtensionShield-original table; not part of ThreatXtension's upstream SQLite schema (which defines only scan_results and statistics).

create table "public"."page_views_daily" (
  "day" text not null,
  "path" text not null,
  "count" integer not null default 0,  -- Default 0; backend always sets count=1 on insert
  primary key ("day", "path")
);

create index "idx_page_views_day" 
  on "public"."page_views_daily"("day");

-- Enable RLS but create NO policies (backend uses service role key)
alter table "public"."page_views_daily" enable row level security;

-- Atomic RPC function for incrementing page views (prevents lost updates).
-- Uses INSERT ... ON CONFLICT ... DO UPDATE for atomic increment.
create or replace function "public"."increment_page_view"(
  p_day text,
  p_path text
)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- Atomic upsert: insert with count=1 or increment existing count
  insert into "public"."page_views_daily" ("day", "path", "count")
  values (p_day, p_path, 1)
  on conflict ("day", "path") 
  do update set "count" = "page_views_daily"."count" + 1
  returning "count" into v_count;
  
  return v_count;
end;
$$;

-- Grant execute permission to service role (backend uses service role key)
grant execute on function "public"."increment_page_view"(text, text) to service_role;

-- Note: No RLS policies - backend writes use service role key which bypasses RLS.
-- Tables are NOT accessible via Supabase API without explicit policies.
-- Backend always inserts with count=1 explicitly, so default 0 is fine.
-- This function is atomic and prevents race conditions.
-- Multiple concurrent calls will correctly increment the count.

