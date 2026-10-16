-- Run after 0001 and 0002. If 0003 was applied, hide only its sample posts.
UPDATE community_posts
SET status = 'hidden', updated_at = datetime('now')
WHERE author_id = 'teacafe-system'
  AND id IN (
    'discussion-professions', 'discussion-homes', 'discussion-waystones',
    'discussion-pass', 'discussion-trade', 'discussion-pets',
    'discussion-build-tools', 'discussion-parkour'
  );

CREATE TABLE IF NOT EXISTS site_members (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  global_name TEXT,
  avatar_url TEXT,
  first_login_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  login_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_site_members_last_login ON site_members(last_login_at DESC);

-- Players who have already posted are known members even if their first login predates this migration.
INSERT OR IGNORE INTO site_members
  (discord_id,username,global_name,avatar_url,first_login_at,last_login_at,login_count)
SELECT author_id,MAX(author_username),MAX(author_name),MAX(author_avatar_url),MIN(created_at),MAX(created_at),0
FROM community_posts
WHERE author_id <> 'teacafe-system'
GROUP BY author_id;
