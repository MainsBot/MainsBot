-- Run as a Postgres superuser (or a role with CREATEROLE/CREATEDB).
-- Creates a dedicated role + database for MainsBot.
--
-- Usage:
--   psql -f deploy/sql/00-create-role-and-db.sql
--
-- Notes:
-- - `CREATE DATABASE` cannot run inside a transaction/function, so this script uses
--   psql's `\gexec` to conditionally execute the statement.
-- - This creates a LOGIN role with no password.
--   That only works if your `pg_hba.conf` allows local/peer/trust auth for this role.
--   For Windows TCP local testing, it's usually easiest to set a password after.
--
-- Then set DATABASE_URL like:
--   postgresql://mainsbot@127.0.0.1:5432/mainsbot

select 'create role mainsbot login'
where not exists (select 1 from pg_roles where rolname = 'mainsbot')
\gexec

select 'create database mainsbot owner mainsbot'
where not exists (select 1 from pg_database where datname = 'mainsbot')
\gexec
