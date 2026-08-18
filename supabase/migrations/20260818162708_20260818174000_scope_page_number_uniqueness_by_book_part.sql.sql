/*
# Scope page_number and sequence_index uniqueness by book_part

Faza'il-e-A'maal is a compilation of several constituent works. Each constituent
restarts its own printed page numbering, so the same printed page number can
legitimately appear in multiple parts of the same publication.

The original schema enforced UNIQUE(book_id, page_number) across all pages in a
book. That constraint is correct for legacy pages (no book_part_id) but prevents
structured pages from two different parts of the same book from sharing a page
number.

This migration replaces the single broad constraint with two partial unique
indexes that scope uniqueness correctly:

  - Legacy pages (book_part_id IS NULL):
      UNIQUE (book_id, page_number) WHERE book_part_id IS NULL

  - Structured pages (book_part_id IS NOT NULL):
      UNIQUE (book_id, book_part_id, page_number) WHERE book_part_id IS NOT NULL

The same split is applied to sequence_index uniqueness:

  - Legacy pages: UNIQUE (book_id, sequence_index) WHERE book_part_id IS NULL
  - Structured pages: UNIQUE (book_part_id, sequence_index) WHERE book_part_id IS NOT NULL

No row data is inserted, updated, or deleted. The redundant non-unique index
idx_pages_book_page is dropped because the two partial unique indexes fully
cover those lookups.
*/

-- 1. Drop the old broad UNIQUE constraint on (book_id, page_number)
ALTER TABLE public.pages DROP CONSTRAINT IF EXISTS unique_book_page;

-- 2. Drop the redundant non-unique index on (book_id, page_number)
DROP INDEX IF EXISTS public.idx_pages_book_page;

-- 3. Legacy pages: unique by (book_id, page_number) only when book_part_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_legacy_book_page_unique
  ON public.pages (book_id, page_number)
  WHERE book_part_id IS NULL;

-- 4. Structured pages: unique by (book_id, book_part_id, page_number) when book_part_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_part_book_page_unique
  ON public.pages (book_id, book_part_id, page_number)
  WHERE book_part_id IS NOT NULL;

-- 5. Drop the old broad sequence_index unique index
DROP INDEX IF EXISTS public.idx_pages_book_sequence_unique;

-- 6. Legacy pages: unique by (book_id, sequence_index) only when book_part_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_legacy_sequence_unique
  ON public.pages (book_id, sequence_index)
  WHERE book_part_id IS NULL AND sequence_index IS NOT NULL;

-- 7. Structured pages: unique by (book_part_id, sequence_index) when book_part_id IS NOT NULL
DROP INDEX IF EXISTS public.idx_pages_book_part_order;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_part_sequence_unique
  ON public.pages (book_part_id, sequence_index)
  WHERE book_part_id IS NOT NULL AND sequence_index IS NOT NULL;
