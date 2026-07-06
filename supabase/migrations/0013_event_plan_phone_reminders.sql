alter table public.event_plans
  add column if not exists event_reminders jsonb not null default '[]'::jsonb;
