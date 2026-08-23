alter table public.event_plans
  add column if not exists alignment_warning_sign text not null default '';
