alter table public.accountability_planned_check_ins
  add column if not exists notification_id text;
