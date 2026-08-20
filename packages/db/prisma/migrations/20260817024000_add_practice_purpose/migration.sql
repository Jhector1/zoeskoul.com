-- Make independently authored Practice exercises first-class in persisted runs.
ALTER TYPE "PracticePurpose" ADD VALUE IF NOT EXISTS 'practice';
