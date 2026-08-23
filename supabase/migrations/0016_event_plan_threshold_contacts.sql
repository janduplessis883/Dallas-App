alter table public.event_plans
  add column if not exists event_threshold_contacts jsonb not null default '[]'::jsonb;
