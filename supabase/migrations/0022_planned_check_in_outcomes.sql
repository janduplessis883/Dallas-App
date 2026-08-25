alter table public.accountability_planned_check_ins
  add column if not exists status text not null default 'planned'
    check (status in ('planned', 'missed')),
  add column if not exists outcome_at timestamptz;

create index if not exists accountability_planned_check_ins_user_partner_status_scheduled_at_idx
  on public.accountability_planned_check_ins (user_id, partner_id, status, scheduled_at);
