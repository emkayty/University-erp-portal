-- Migration 0015: Add uq_student_academic_history constraint
--
-- Deep-audit fix (Aug 2026), graduation-pipeline fix. student_academic_
-- history was declared in schema.prisma from the start but no code path
-- ever wrote to it (see docs/CHANGELOG.md finding 1.1) — in
-- part because there was no unique constraint on
-- (student_id, academic_year, level) for an upsert to target, which is
-- exactly what results.service.ts's recomputeAndApplyCgpa() and
-- students.service.ts's graduate() now use to write an interim snapshot
-- after every Senate publish/amend/withhold, and a final one at
-- graduation, respectively — one row per student per academic year/level,
-- updated in place rather than duplicated.
--
-- Safe without a backfill/dedup pass: this table has never been written
-- to by any code in this system's history, so it can be assumed empty in
-- any real deployment. If that assumption doesn't hold for a given
-- environment, deduplicate existing rows on (student_id, academic_year,
-- level) before applying.
ALTER TABLE student_academic_history
  ADD CONSTRAINT uq_student_academic_history UNIQUE (student_id, academic_year, level);
