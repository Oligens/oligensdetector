CREATE TABLE IF NOT EXISTS web_sources (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  snippet TEXT,
  domain TEXT,
  source_type TEXT NOT NULL DEFAULT 'web',
  search_query TEXT,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id, url)
);

CREATE INDEX IF NOT EXISTS web_sources_user_idx ON web_sources(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS web_sources_hash_idx ON web_sources(user_id, content_hash);
