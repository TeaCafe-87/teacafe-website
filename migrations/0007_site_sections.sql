-- Admin-created Wiki and Rules sections. Existing static content and overrides stay intact.
CREATE TABLE IF NOT EXISTS site_copy_sections (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL CHECK (page IN ('wiki', 'rules')),
  anchor TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_site_copy_sections_public
  ON site_copy_sections (page, anchor, sort_order, created_at)
  WHERE deleted_at IS NULL;
