-- 003_page_views_daily.sql
-- Privacy-first analytics: daily page view counts (no PII, no user_id).
-- ExtensionShield-original table; not part of ThreatXtension's upstream SQLite schema (which defines only scan_results and statistics).

create table if not exists public.page_views_daily (
  day text not null,
  path text not null,
  count integer not null default 0,  -- Default 0; backend always sets count=1 on insert
  primary key (day, path)
);

create index if not exists idx_page_views_day 
  on public.page_views_daily(day);

-- Enable RLS but create NO policies (backend uses service role key)
alter table public.page_views_daily enable row level security;

-- Note: No RLS policies - backend writes use service role key which bypasses RLS.
-- Tables are NOT accessible via Supabase API without explicit policies.
-- Backend always inserts with count=1 explicitly, so default 0 is fine.

-- No RLS policies needed: this table stores aggregated counts only (no PII).
-- Backend writes use service role key.
-- If you want to expose summary data to authenticated users, add a read-only policy:
-- 
-- alter table public.page_views_daily enable row level security;
-- 
-- create policy "page_views_daily_read_authenticated"
--   on public.page_views_daily
--   for select
--   using (auth.role() = 'authenticated');




