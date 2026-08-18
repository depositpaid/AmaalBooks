/*
# Scope page-number and sequence uniqueness by constituent book part

Printed page numbering restarts within Faza'il-e-A'maal's constituent works.
The legacy pages.page_number column remains a compatibility locator, while
pages.printed_page_label remains the source-faithful reader-facing label.

This migration changes constraints only. It performs no page updates, deletes,
OCR changes, content changes, or other row mutations.
*/

ALTER TABLE pages
  DROP CONSTRAINT unique_book_page;

CREATE UNIQUE INDEX unique_legacy_book_page_number
  ON pages(book_id, page_number)
  WHERE book_part_id IS NULL;

CREATE UNIQUE INDEX unique_structured_book_part_page_number
  ON pages(book_id, book_part_id, page_number)
  WHERE book_part_id IS NOT NULL;

-- The structured-content foundation originally made sequence_index unique
-- across an entire publication. Constituent works are imported independently,
-- so each part must be allowed to start its own ordered sequence at zero.
DROP INDEX idx_pages_book_sequence_unique;

-- Preserve the existing publication-wide compatibility rule for legacy pages
-- that have no constituent assignment.
CREATE UNIQUE INDEX unique_legacy_book_page_sequence
  ON pages(book_id, sequence_index)
  WHERE book_part_id IS NULL AND sequence_index IS NOT NULL;

-- Structured ordering is authoritative only within its constituent part.
CREATE UNIQUE INDEX unique_structured_book_part_page_sequence
  ON pages(book_id, book_part_id, sequence_index)
  WHERE book_part_id IS NOT NULL AND sequence_index IS NOT NULL;
