-- Migration 003: Create developer_verifications table for practical understanding assessments
-- Supports repository-grounded tasks, deterministic evaluation, adaptive reasoning,
-- and multidimensional verification records linked to assessments and revisions.

CREATE TABLE IF NOT EXISTS developer_verifications (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  revision_id TEXT REFERENCES revisions(id) ON DELETE SET NULL,
  requirement_id TEXT NOT NULL,
  requirement_title TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  task_type TEXT NOT NULL,
  code_reference_json TEXT NOT NULL,
  assessment_conditions_json TEXT NOT NULL,
  practical_solution TEXT NOT NULL,
  practical_evaluation_json TEXT NOT NULL,
  followup_question TEXT NOT NULL,
  reasoning_response TEXT NOT NULL,
  reasoning_evaluation_json TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  status TEXT NOT NULL,
  overall_verdict TEXT NOT NULL,
  confidence_score INTEGER NOT NULL,
  limitations_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_verifications_assessment_id ON developer_verifications(assessment_id);
CREATE INDEX IF NOT EXISTS idx_verifications_requirement_id ON developer_verifications(assessment_id, requirement_id);
CREATE INDEX IF NOT EXISTS idx_verifications_created_at ON developer_verifications(created_at DESC);
