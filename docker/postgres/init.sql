-- UniPortal ERP — PostgreSQL init script
-- Runs once when the container is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Create test database
CREATE DATABASE uniportal_test
  WITH OWNER = uniportal
       ENCODING = 'UTF8'
       LC_COLLATE = 'en_US.utf8'
       LC_CTYPE = 'en_US.utf8';

GRANT ALL PRIVILEGES ON DATABASE uniportal_test TO uniportal;

-- Application roles (uniportal_app, uniportal_system) are created by
-- Prisma migrations 0011/0012, not here — see those migrations' header
-- comments for why. This file used to create five placeholder roles
-- (app_student/app_staff/app_hod/app_lecturer/app_clinic) "for RLS,
-- applied after Prisma migrations" — they were never granted any
-- privileges, never referenced by a policy, and migration 0011 drops them
-- for exactly that reason (see its own comment). Left here, they were
-- exactly the kind of unused scaffolding that implies a design that was
-- never built. Removed rather than reintroduced.
--
-- After running migrations, uniportal_app/uniportal_system exist but have
-- NO PASSWORD set (deliberately — see migration 0011/0012 comments, and
-- P0-3 in docs/CHANGELOG.md for why that broke a fresh clone
-- before this fix). Run `pnpm db:bootstrap-roles`
-- (scripts/db/bootstrap-local-roles.sh) once, after migrations, to set
-- both roles' local-dev passwords and CONNECT grants idempotently.
