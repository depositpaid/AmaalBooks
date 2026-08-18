/*
# Create tables for the Books Reader App (single-tenant, no auth)

## Overview
Creates the core tables for a personal book reader application:
- books: book metadata (title, author, cover, total pages)
- pages: individual page content per book (page number + text content)
- bookmarks: saved bookmarks with page references and notes
- reading_progress: current page and scroll position per book
- search_history: recent search queries

## New Tables

### books
- id (uuid, primary key)
- title (text, not null) - book title
- author (text) - author name
- cover_url (text) - URL to cover image
- total_pages (int, default 0) - total number of pages
- description (text) - book description
- color_accent (text) - accent color for the book cover in the library
- sort_order (int, default 0) - display order in library
- created_at (timestamp)

### pages
- id (uuid, primary key)
- book_id (uuid, FK to books, cascade delete)
- page_number (int, not null) - 1-indexed page number
- content (text, not null) - the text content of the page
- chapter_title (text) - optional chapter heading for this page
- created_at (timestamp)
- Unique constraint on (book_id, page_number)

### bookmarks
- id (uuid, primary key)
- book_id (uuid, FK to books, cascade delete)
- page_number (int, not null) - the page the bookmark is on
- note (text) - optional user note for the bookmark
- created_at (timestamp)

### reading_progress
- id (uuid, primary key)
- book_id (uuid, FK to books, cascade delete, unique)
- current_page (int, default 1)
- scroll_offset (float, default 0) - vertical scroll position
- updated_at (timestamp)

### search_history
- id (uuid, primary key)
- query (text, not null)
- book_id (uuid, FK to books, cascade delete, nullable - null means all books)
- created_at (timestamp)

## Security
- Enable RLS on all tables.
- Allow anon + authenticated CRUD on all tables (single-tenant, no sign-in).
- USING (true) is acceptable because this is an intentionally shared single-user app.
*/

CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  cover_url text,
  total_pages int NOT NULL DEFAULT 0,
  description text,
  color_accent text DEFAULT '#C41E3A',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  content text NOT NULL,
  chapter_title text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_book_page UNIQUE (book_id, page_number)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  current_page int NOT NULL DEFAULT 1,
  scroll_offset float NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_progress_book UNIQUE (book_id)
);

CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Books policies (anon + authenticated, single-tenant)
DROP POLICY IF EXISTS "anon_select_books" ON books;
CREATE POLICY "anon_select_books" ON books FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_books" ON books;
CREATE POLICY "anon_insert_books" ON books FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_books" ON books;
CREATE POLICY "anon_update_books" ON books FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_books" ON books;
CREATE POLICY "anon_delete_books" ON books FOR DELETE
  TO anon, authenticated USING (true);

-- Pages policies
DROP POLICY IF EXISTS "anon_select_pages" ON pages;
CREATE POLICY "anon_select_pages" ON pages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pages" ON pages;
CREATE POLICY "anon_insert_pages" ON pages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pages" ON pages;
CREATE POLICY "anon_update_pages" ON pages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pages" ON pages;
CREATE POLICY "anon_delete_pages" ON pages FOR DELETE
  TO anon, authenticated USING (true);

-- Bookmarks policies
DROP POLICY IF EXISTS "anon_select_bookmarks" ON bookmarks;
CREATE POLICY "anon_select_bookmarks" ON bookmarks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bookmarks" ON bookmarks;
CREATE POLICY "anon_insert_bookmarks" ON bookmarks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bookmarks" ON bookmarks;
CREATE POLICY "anon_update_bookmarks" ON bookmarks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bookmarks" ON bookmarks;
CREATE POLICY "anon_delete_bookmarks" ON bookmarks FOR DELETE
  TO anon, authenticated USING (true);

-- Reading progress policies
DROP POLICY IF EXISTS "anon_select_progress" ON reading_progress;
CREATE POLICY "anon_select_progress" ON reading_progress FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_progress" ON reading_progress;
CREATE POLICY "anon_insert_progress" ON reading_progress FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_progress" ON reading_progress;
CREATE POLICY "anon_update_progress" ON reading_progress FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_progress" ON reading_progress;
CREATE POLICY "anon_delete_progress" ON reading_progress FOR DELETE
  TO anon, authenticated USING (true);

-- Search history policies
DROP POLICY IF EXISTS "anon_select_search" ON search_history;
CREATE POLICY "anon_select_search" ON search_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_search" ON search_history;
CREATE POLICY "anon_insert_search" ON search_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_search" ON search_history;
CREATE POLICY "anon_delete_search" ON search_history FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pages_book_id ON pages(book_id);
CREATE INDEX IF NOT EXISTS idx_pages_book_page ON pages(book_id, page_number);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks(book_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC);
