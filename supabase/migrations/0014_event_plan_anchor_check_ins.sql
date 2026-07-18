alter table public.event_plans
  add column if not exists anchor_1_questions text not null default '',
  add column if not exists anchor_1_response text not null default '',
  add column if not exists anchor_2_questions text not null default '',
  add column if not exists anchor_2_response text not null default '',
  add column if not exists arrival_check_in_time text not null default '',
  add column if not exists mid_event_check_in_time text not null default '',
  add column if not exists mid_boundaries text not null default '';
