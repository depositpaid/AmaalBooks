/*
  Insert-only atomic structured-page import support.

  The original import_structured_page_v1 RPC intentionally requires an existing
  page. New source-faithful pages need a page UUID and book-part ownership, but
  must never be left as empty/partial structured pages if block validation fails.
  This wrapper inserts the compatibility page row and invokes the existing RPC
  in the same PostgreSQL transaction. Any failure rolls back both operations.

  This migration changes no existing page, content block, or structural node.
*/

CREATE OR REPLACE FUNCTION import_new_structured_page_v1(
  p_book_id uuid,
  p_book_part_id uuid,
  p_edition_id uuid,
  p_source_document_id uuid,
  p_import_batch_id uuid,
  p_page jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_id uuid;
  v_page_number integer;
  v_pdf_page_number integer;
BEGIN
  IF jsonb_typeof(p_page) <> 'object' THEN
    RAISE EXCEPTION 'Page payload must be a JSON object';
  END IF;

  v_page_id := (p_page->>'pageId')::uuid;
  v_page_number := (p_page->>'pageNumber')::integer;
  v_pdf_page_number := (p_page->>'pdfPageNumber')::integer;

  IF (p_page->>'bookPartId')::uuid IS DISTINCT FROM p_book_part_id THEN
    RAISE EXCEPTION 'Payload bookPartId does not match requested book part';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM book_parts
    WHERE id = p_book_part_id AND book_id = p_book_id
  ) THEN
    RAISE EXCEPTION 'Book part % does not belong to book %', p_book_part_id, p_book_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pages WHERE id = v_page_id) THEN
    RAISE EXCEPTION 'Page UUID % already exists; insert-only import will not overwrite it', v_page_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pages
    WHERE book_id = p_book_id
      AND book_part_id = p_book_part_id
      AND page_number = v_page_number
  ) THEN
    RAISE EXCEPTION 'Structured page locator (book, part, page_number) already exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pages
    WHERE source_document_id = p_source_document_id
      AND pdf_page_number = v_pdf_page_number
  ) THEN
    RAISE EXCEPTION 'Source PDF page % already has a page row', v_pdf_page_number;
  END IF;

  INSERT INTO pages (
    id,
    book_id,
    book_part_id,
    page_number,
    content,
    chapter_title,
    edition_id,
    source_document_id,
    printed_page_label,
    printed_page_number,
    pdf_page_number,
    sequence_index,
    verification_status,
    verified_at
  ) VALUES (
    v_page_id,
    p_book_id,
    p_book_part_id,
    v_page_number,
    '',
    NULL,
    p_edition_id,
    p_source_document_id,
    p_page->>'printedPageLabel',
    NULLIF(p_page->>'printedPageNumber', '')::integer,
    v_pdf_page_number,
    (p_page->>'sequenceIndex')::integer,
    p_page->>'verificationStatus',
    NULL
  );

  PERFORM import_structured_page_v1(
    p_book_id,
    p_edition_id,
    p_source_document_id,
    p_import_batch_id,
    p_page
  );

  RETURN v_page_id;
END;
$$;

REVOKE ALL ON FUNCTION import_new_structured_page_v1(uuid, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION import_new_structured_page_v1(uuid, uuid, uuid, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION import_new_structured_page_v1(uuid, uuid, uuid, uuid, uuid, jsonb)
  TO service_role;

COMMENT ON FUNCTION import_new_structured_page_v1(uuid, uuid, uuid, uuid, uuid, jsonb) IS
  'Insert-only administrative import for one complete structured page. Page, nodes, and blocks commit atomically; collisions fail without overwriting existing data.';
