create table if not exists agent_runs (
  id bigserial primary key,
  scenario text,
  started_at timestamptz default now(),
  ms int,
  prompt_tokens int,
  completion_tokens int,
  cost_krw numeric,
  status text,
  note text
);
create table if not exists agent_reports (
  id bigserial primary key,
  run_id bigint,
  region text,
  payload jsonb,
  draft text,
  final text,
  status text default 'pending',
  created_at timestamptz default now()
);
