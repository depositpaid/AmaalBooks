/*
# Additive structured-content foundation

This migration prepares AmaalBooks for source-faithful digitisation while
preserving the legacy reader and all existing data. In particular:

- No existing table or column is removed or renamed.
- pages.page_number, pages.content, and pages.chapter_title retain their current
  meanings and remain the fields used by the existing application.
- New page identity fields are nullable. Existing page_number values are NOT
  copied into printed_page_number or printed_page_label because their meaning
  has not yet been verified book by book.
- Canonical structured text is plain Unicode text. Presentation HTML belongs in
  the legacy pages.content field only and must not be introduced into
  content_blocks.text_content.
- Existing anonymous access remains unchanged for compatibility. Authentication
  and stricter publishing/editor policies are intentionally deferred.
*/

-- A book edition identifies the exact publication represented by a constituent
-- book. More than one edition may eventually be attached to the same book.
CREATE TABLE IF NOT EXISTS book_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  edition_label text NOT NULL,
  publisher text,
  publication_label text,
  isbn text,
  language_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_editions_label_not_blank CHECK (btrim(edition_label) <> ''),
  CONSTRAINT unique_book_edition_label UNIQUE (book_id, edition_label)
);

-- A source document is the immutable PDF (or future scan package) used for
-- transcription and verification. sha256_checksum identifies exact file bytes
-- when known; storage_path may point at Supabase Storage or another managed URI.
CREATE TABLE IF NOT EXISTS source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'pdf',
  original_filename text,
  storage_path text,
  sha256_checksum text,
  pdf_page_count int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_documents_type_not_blank CHECK (btrim(document_type) <> ''),
  CONSTRAINT source_documents_page_count_positive CHECK (pdf_page_count IS NULL OR pdf_page_count > 0),
  CONSTRAINT source_documents_sha256_format CHECK (
    sha256_checksum IS NULL OR sha256_checksum ~* '^[0-9a-f]{64}$'
  ),
  CONSTRAINT unique_source_document_checksum UNIQUE (sha256_checksum)
);

-- Import batches group OCR/transcription work and preserve where and when text
-- entered the system. A batch is deliberately lightweight rather than a full
-- editorial workflow system.
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  edition_id uuid REFERENCES book_editions(id) ON DELETE RESTRICT,
  source_document_id uuid REFERENCES source_documents(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending',
  imported_by text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT import_batches_status_valid CHECK (
    status IN ('pending', 'imported', 'in_review', 'verified', 'rejected')
  ),
  CONSTRAINT import_batches_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- Extend pages without assigning meaning to any legacy page_number value.
-- The existing pages.id UUID is already the stable page identifier.
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS edition_id uuid REFERENCES book_editions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES source_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS printed_page_label text,
  ADD COLUMN IF NOT EXISTS printed_page_number int,
  ADD COLUMN IF NOT EXISTS pdf_page_number int,
  ADD COLUMN IF NOT EXISTS sequence_index int,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE pages
  ADD CONSTRAINT pages_printed_label_not_blank
    CHECK (printed_page_label IS NULL OR btrim(printed_page_label) <> ''),
  ADD CONSTRAINT pages_pdf_page_positive
    CHECK (pdf_page_number IS NULL OR pdf_page_number > 0),
  ADD CONSTRAINT pages_sequence_nonnegative
    CHECK (sequence_index IS NULL OR sequence_index >= 0),
  ADD CONSTRAINT pages_verification_status_valid
    CHECK (verification_status IN ('legacy_unverified', 'draft', 'in_review', 'verified', 'rejected'));

-- Structural nodes store source-exact labels and identifiers as TEXT. node_type
-- begins with chapter/section/hadith, but is intentionally not constrained to an
-- enum so future source structures can be added without rewriting old records.
CREATE TABLE IF NOT EXISTS structural_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  edition_id uuid REFERENCES book_editions(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES structural_nodes(id) ON DELETE RESTRICT,
  node_type text NOT NULL,
  source_label text,
  source_identifier text,
  title text,
  sequence_index int NOT NULL,
  start_page_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  end_page_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT structural_nodes_type_not_blank CHECK (btrim(node_type) <> ''),
  CONSTRAINT structural_nodes_source_label_not_blank CHECK (source_label IS NULL OR btrim(source_label) <> ''),
  CONSTRAINT structural_nodes_source_identifier_not_blank CHECK (source_identifier IS NULL OR btrim(source_identifier) <> ''),
  CONSTRAINT structural_nodes_sequence_nonnegative CHECK (sequence_index >= 0),
  CONSTRAINT structural_nodes_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT structural_nodes_verification_status_valid CHECK (
    verification_status IN ('draft', 'in_review', 'verified', 'rejected')
  ),
  CONSTRAINT unique_structural_node_sequence UNIQUE (book_id, sequence_index)
);

-- Ordered canonical source content. text_content is the corrected/published
-- Unicode transcription; raw_ocr_text retains machine output for comparison.
-- block_type initially uses english, arabic, translation, heading, and note,
-- but remains a non-empty text value so later types can be introduced safely.
CREATE TABLE IF NOT EXISTS content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  structural_node_id uuid REFERENCES structural_nodes(id) ON DELETE SET NULL,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  source_document_id uuid REFERENCES source_documents(id) ON DELETE RESTRICT,
  sequence_index int NOT NULL,
  block_type text NOT NULL,
  language_code text,
  direction text NOT NULL DEFAULT 'ltr',
  text_content text NOT NULL,
  raw_ocr_text text,
  tts_eligible boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'draft',
  source_page_region jsonb,
  provenance_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT content_blocks_type_not_blank CHECK (btrim(block_type) <> ''),
  CONSTRAINT content_blocks_language_not_blank CHECK (language_code IS NULL OR btrim(language_code) <> ''),
  CONSTRAINT content_blocks_direction_valid CHECK (direction IN ('ltr', 'rtl', 'auto')),
  CONSTRAINT content_blocks_sequence_nonnegative CHECK (sequence_index >= 0),
  CONSTRAINT content_blocks_verification_status_valid CHECK (
    verification_status IN ('draft', 'in_review', 'verified', 'rejected')
  ),
  CONSTRAINT content_blocks_source_region_object CHECK (
    source_page_region IS NULL OR jsonb_typeof(source_page_region) = 'object'
  ),
  CONSTRAINT unique_content_block_page_sequence UNIQUE (page_id, sequence_index)
);

-- Optional block anchors complete structural ranges after content_blocks exists.
ALTER TABLE structural_nodes
  ADD COLUMN IF NOT EXISTS start_block_id uuid REFERENCES content_blocks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS end_block_id uuid REFERENCES content_blocks(id) ON DELETE SET NULL;

-- Stable anchors are additive. Legacy page_number/current_page remain mandatory
-- compatibility fields and continue to drive the current reader.
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES content_blocks(id) ON DELETE SET NULL;

ALTER TABLE reading_progress
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES content_blocks(id) ON DELETE SET NULL;

-- Partial uniqueness allows all legacy rows to remain NULL while preventing
-- duplicate verified ordering once structured data is assigned.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_book_sequence_unique
  ON pages(book_id, sequence_index) WHERE sequence_index IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_source_pdf_page_unique
  ON pages(source_document_id, pdf_page_number)
  WHERE source_document_id IS NOT NULL AND pdf_page_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pages_edition ON pages(edition_id);
CREATE INDEX IF NOT EXISTS idx_pages_source_document ON pages(source_document_id);
CREATE INDEX IF NOT EXISTS idx_pages_printed_label ON pages(book_id, printed_page_label);
CREATE INDEX IF NOT EXISTS idx_book_editions_book ON book_editions(book_id);
CREATE INDEX IF NOT EXISTS idx_source_documents_edition ON source_documents(edition_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_book ON import_batches(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_source ON import_batches(source_document_id);
CREATE INDEX IF NOT EXISTS idx_structural_nodes_book_order ON structural_nodes(book_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_structural_nodes_parent ON structural_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_structural_nodes_source_identifier ON structural_nodes(book_id, source_identifier);
CREATE INDEX IF NOT EXISTS idx_content_blocks_book_order ON content_blocks(book_id, page_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_content_blocks_structure ON content_blocks(structural_node_id);
CREATE INDEX IF NOT EXISTS idx_content_blocks_import_batch ON content_blocks(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_content_blocks_language ON content_blocks(language_code);
CREATE INDEX IF NOT EXISTS idx_bookmarks_page_id ON bookmarks(page_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_block_id ON bookmarks(block_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_page_id ON reading_progress(page_id);

-- Match the current single-tenant policy model so the additive tables work with
-- existing anon/authenticated clients. Tightening authoring access requires a
-- separate authentication migration and is outside this compatibility stage.
ALTER TABLE book_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE structural_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_access_book_editions" ON book_editions FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_access_source_documents" ON source_documents FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_access_import_batches" ON import_batches FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_access_structural_nodes" ON structural_nodes FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_access_content_blocks" ON content_blocks FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

COMMENT ON COLUMN pages.page_number IS
  'Legacy application page number retained unchanged; do not assume it is a printed or PDF page number.';
COMMENT ON COLUMN pages.printed_page_label IS
  'Exact human-readable printed label, stored as text (for example iv, 12, or an unnumbered label).';
COMMENT ON COLUMN pages.printed_page_number IS
  'Optional numeric interpretation only when the printed page is explicitly an integer.';
COMMENT ON COLUMN pages.pdf_page_number IS
  'One-based page number within source_document_id, used for source verification.';
COMMENT ON COLUMN structural_nodes.source_identifier IS
  'Exact printed/source identifier. It must never be normalized, inferred, or regenerated.';
COMMENT ON COLUMN content_blocks.text_content IS
  'Canonical corrected Unicode transcription in source reading order; presentation HTML is not permitted as canonical content.';
COMMENT ON COLUMN content_blocks.raw_ocr_text IS
  'Uncorrected OCR retained for provenance and comparison with text_content.';