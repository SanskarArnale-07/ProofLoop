-- Migration 004: Create ai_gap_reports table for AI Gap Coach feature
-- Stores plain-English advice and prioritized next steps keyed by revision and scoring rule version.
-- Advisory only: never modifies deterministic scoring or ranking.

CREATE TABLE IF NOT EXISTS ai_gap_reports (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  scoring_rule_version TEXT NOT NULL,
  generated_by TEXT NOT NULL, -- 'ai' | 'rule_based'
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_ai_gap_reports_assessment_created ON ai_gap_reports(assessment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gap_reports_revision_rule ON ai_gap_reports(revision_id, scoring_rule_version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_gap_reports_revision_rule ON ai_gap_reports(revision_id, scoring_rule_version);
