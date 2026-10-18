-- Migration 005: Create profile_scans and repo_scan_cache tables
-- Enables multi-repo profile scanning and per-repo evidence caching.
-- Backward-compatible with all existing single-repo assessments and migrations.

CREATE TABLE IF NOT EXISTS repo_scan_cache (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  pushed_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(repo_full_name, pushed_at)
);

CREATE INDEX IF NOT EXISTS idx_repo_scan_cache_lookup ON repo_scan_cache(repo_full_name, pushed_at);

CREATE TABLE IF NOT EXISTS profile_scans (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  internship_id TEXT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  assessment_id TEXT REFERENCES assessments(id) ON DELETE SET NULL,
  scanned_repos_json TEXT NOT NULL,
  best_evidence_json TEXT NOT NULL,
  suggested_roles_json TEXT,
  status TEXT NOT NULL, -- 'scanning' | 'completed' | 'partial' | 'failed'
  progress_message TEXT,
  error_message TEXT,
  is_partial INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_scans_user ON profile_scans(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_scans_status ON profile_scans(status);
CREATE INDEX IF NOT EXISTS idx_profile_scans_assessment ON profile_scans(assessment_id);
