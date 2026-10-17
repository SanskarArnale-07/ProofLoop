-- Migration 001: Create core ProofLoop tables
-- Tracks schema versioning and preserves original table structure and constraints

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internships (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  source_url TEXT NOT NULL,
  raw_text TEXT,
  requirements_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  internship_id TEXT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  latest_commit_sha TEXT NOT NULL,
  current_revision_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  analysis_scope_json TEXT,
  ai_signals_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  demonstrated_count INTEGER NOT NULL,
  partial_count INTEGER NOT NULL,
  not_demonstrated_count INTEGER NOT NULL,
  scoring_rule_version TEXT,
  analysis_scope_json TEXT,
  ai_signals_json TEXT,
  score_breakdown_summary_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  task_data_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  commit_sha TEXT,
  commit_message TEXT,
  affected_skills_json TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  delivery_id TEXT UNIQUE,
  repo_full_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  commit_sha TEXT,
  commit_message TEXT,
  author TEXT,
  files_changed_json TEXT,
  signature_valid INTEGER NOT NULL,
  affected_requirements_json TEXT,
  created_at TEXT NOT NULL
);
