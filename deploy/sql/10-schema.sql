-- Run inside the mainsbot database as the mainsbot role:
--   psql -d mainsbot -U mainsbot -f deploy/sql/10-schema.sql
--
-- Per-instance schema:
--   psql -d mainsbot -U mainsbot -v schema=mainsbot_tibb12 -f deploy/sql/10-schema.sql
--
-- If `-v schema=...` is omitted, defaults to `mainsbot_streamername`.

\if :{?schema}
\else
\set schema mainsbot_streamername
\endif

create schema if not exists :"schema";

create table if not exists :"schema".mainsbot_state (
  instance text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (instance, key)
);

-- Helpful for debugging/admin queries across instances.
create index if not exists mainsbot_state_updated_at_idx
  on :"schema".mainsbot_state (updated_at desc);
