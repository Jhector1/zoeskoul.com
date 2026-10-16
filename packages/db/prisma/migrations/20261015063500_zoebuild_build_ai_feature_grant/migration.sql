-- ZoeBuild AI entitlement grant vocabulary.
-- This only extends the existing canonical FeatureGrant FeatureKey enum.
-- It creates no grants and does not change subscription state.

ALTER TYPE "FeatureKey" ADD VALUE 'build_ai_generate';
