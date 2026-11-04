CREATE TABLE IF NOT EXISTS community_reactions (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (emoji IN ('🍵', '❤️', '👏', '🔥', '😂')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, author_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON community_reactions(post_id, emoji);
