-- Keep existing book-list records while extending the schema to albums.
ALTER TABLE books RENAME TO items;
ALTER TABLE items RENAME COLUMN author TO creator;
ALTER TABLE items RENAME COLUMN normalized_author TO normalized_creator;
ALTER TABLE items ADD COLUMN kind TEXT NOT NULL DEFAULT 'book' CHECK(kind IN ('book','album'));
ALTER TABLE list_books RENAME TO list_items;
ALTER TABLE list_items RENAME COLUMN book_id TO item_id;
CREATE TABLE readers (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
ALTER TABLE lists ADD COLUMN kind TEXT NOT NULL DEFAULT 'book' CHECK(kind IN ('book','album'));
ALTER TABLE lists ADD COLUMN reader_id TEXT REFERENCES readers(id);
CREATE INDEX lists_reader ON lists(reader_id);
CREATE INDEX items_kind ON items(kind);
CREATE INDEX lists_kind ON lists(kind, seq);
