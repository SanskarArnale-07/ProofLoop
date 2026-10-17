-- Migration 002: Create indexes for assessment lookup, revision history, activity queries, and webhook delivery deduplication

-- Assessment lookup indexes
CREATE INDEX IF NOT EXISTS idx_assessments_internship_id ON assessments(internship_id);
CREATE INDEX IF NOT EXISTS idx_assessments_repo_full_name ON assessments(LOWER(repo_full_name));
CREATE INDEX IF NOT EXISTS idx_assessments_updated_at ON assessments(updated_at DESC);

-- Revision history indexes
CREATE INDEX IF NOT EXISTS idx_revisions_assessment_id ON revisions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_revisions_assessment_revision ON revisions(assessment_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_commit_sha ON revisions(assessment_id, commit_sha);

-- Roadmap tasks index
CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_assessment_id ON roadmap_tasks(assessment_id);

-- Activity queries index
CREATE INDEX IF NOT EXISTS idx_activity_events_assessment_timestamp ON activity_events(assessment_id, timestamp DESC);

-- Webhook delivery deduplication index
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivery_id ON webhook_deliveries(delivery_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
