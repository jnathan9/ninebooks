PRAGMA foreign_keys = ON;
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  normalized_author TEXT NOT NULL
);
CREATE TABLE lists (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  image_hash TEXT NOT NULL UNIQUE,
  review_nonce TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE list_books (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id),
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 9),
  PRIMARY KEY(list_id, position),
  UNIQUE(list_id, book_id)
);
CREATE INDEX list_books_book ON list_books(book_id, list_id);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
