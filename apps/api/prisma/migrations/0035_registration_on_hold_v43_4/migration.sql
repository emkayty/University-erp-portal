-- V43.4: reversible registration hold for suspension/deferment workflows
ALTER TYPE "CourseRegStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
