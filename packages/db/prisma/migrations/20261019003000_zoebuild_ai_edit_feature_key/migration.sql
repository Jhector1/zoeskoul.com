-- ZoeBuild incremental source edits remain a separately granted capability.
ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'build_ai_edit';
