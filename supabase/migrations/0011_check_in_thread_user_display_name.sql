alter table public.accountability_check_in_threads
  add column if not exists user_display_name text;
