-- P5 admissions reference-data repair: NBAIS is a supported O'Level authority.
ALTER TYPE "OLevelExamType" ADD VALUE IF NOT EXISTS 'NBAIS';
