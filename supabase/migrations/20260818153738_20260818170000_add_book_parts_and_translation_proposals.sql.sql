/*
# Add authoritative book parts and private translation proposals

This migration is intentionally additive:

- Existing books, pages, structured content, UUIDs, and text are untouched.
- No existing page is assigned to a part. The temporary Virtues of Salaat book
  and its six structured sample pages therefore continue to work unchanged.
- book_parts models publication-level constituent works above chapters and
  Hadith; it does not overload structural_nodes.
- Source evidence is stored separately so conflicting printed identifiers can
  coexist without silently rewriting the source.
- Modern-English proposals never replace content_blocks.text_content and are
  private to privileged database/admin access.
*/

CREATE TABLE book_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  part_type text NOT NULL DEFAULT 'part',
  source_title text NOT NULL,
  display_title text,
  source_part_identifier text,
  sequence_index int NOT NULL,
  source_pdf_start_page int,
  source_pdf_end_page int,
  printed_page_start text,
  printed_page_end text,
  verification_status text NOT NULL DEFAULT 'draft',
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_parts_type_valid CHECK (part_type IN ('part', 'ancillary')),
  CONSTRAINT book_parts_source_title_not_blank CHECK (btrim(source_title) <> ''),
  CONSTRAINT book_parts_display_title_not_blank
    CHECK (display_title IS NULL OR btrim(display_title) <> ''),
  CONSTRAINT book_parts_source_identifier_not_blank
    CHECK (source_part_identifier IS NULL OR btrim(source_part_identifier) <> ''),
  CONSTRAINT book_parts_sequence_nonnegative CHECK (sequence_index >= 0),
  CONSTRAINT book_parts_pdf_start_positive
    CHECK (source_pdf_start_page IS NULL OR source_pdf_start_page > 0),
  CONSTRAINT book_parts_pdf_end_positive
    CHECK (source_pdf_end_page IS NULL OR source_pdf_end_page > 0),
  CONSTRAINT book_parts_pdf_range_valid CHECK (
    source_pdf_start_page IS NULL OR
    source_pdf_end_page IS NULL OR
    source_pdf_end_page >= source_pdf_start_page
  ),
  CONSTRAINT book_parts_printed_start_not_blank
    CHECK (printed_page_start IS NULL OR btrim(printed_page_start) <> ''),
  CONSTRAINT book_parts_printed_end_not_blank
    CHECK (printed_page_end IS NULL OR btrim(printed_page_end) <> ''),
  CONSTRAINT book_parts_verification_status_valid CHECK (
    verification_status IN ('draft', 'in_review', 'verified', 'rejected')
  ),
  CONSTRAINT unique_book_part_sequence UNIQUE (book_id, sequence_index),
  -- Supports the composite page FK that enforces same-book ownership.
  CONSTRAINT unique_book_part_id_and_book UNIQUE (id, book_id)
);

COMMENT ON TABLE book_parts IS
  'Authoritative constituent works or ancillary sections within one reader-facing publication.';
COMMENT ON COLUMN book_parts.source_title IS
  'Exact printed/source title; do not normalize or silently correct it.';
COMMENT ON COLUMN book_parts.source_part_identifier IS
  'Exact printed Part identifier when present; NULL for unnumbered ancillary material.';
COMMENT ON COLUMN book_parts.printed_page_start IS
  'First visibly printed page label stored as text; never inferred from PDF position.';
COMMENT ON COLUMN book_parts.printed_page_end IS
  'Last visibly printed page label stored as text; never inferred from PDF position.';

ALTER TABLE pages
  ADD COLUMN book_part_id uuid;

-- A composite FK prevents assigning a page to a part owned by another book.
-- NULL keeps every existing legacy and structured page valid without updates.
ALTER TABLE pages
  ADD CONSTRAINT pages_book_part_same_book_fk
  FOREIGN KEY (book_part_id, book_id)
  REFERENCES book_parts(id, book_id)
  ON DELETE RESTRICT;

CREATE TABLE book_part_source_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_part_id uuid NOT NULL REFERENCES book_parts(id) ON DELETE CASCADE,
  source_document_id uuid REFERENCES source_documents(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  source_pdf_page int,
  printed_identifier text,
  printed_title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_part_evidence_type_not_blank CHECK (btrim(evidence_type) <> ''),
  CONSTRAINT book_part_evidence_pdf_page_positive
    CHECK (source_pdf_page IS NULL OR source_pdf_page > 0),
  CONSTRAINT book_part_evidence_identifier_not_blank
    CHECK (printed_identifier IS NULL OR btrim(printed_identifier) <> ''),
  CONSTRAINT book_part_evidence_title_not_blank
    CHECK (printed_title IS NULL OR btrim(printed_title) <> ''),
  CONSTRAINT book_part_evidence_has_source_detail CHECK (
    printed_identifier IS NOT NULL OR printed_title IS NOT NULL OR notes IS NOT NULL
  )
);

COMMENT ON TABLE book_part_source_evidence IS
  'Source-exact observations from covers, title pages, contents lists, or other scan locations. Multiple contradictory observations are preserved.';
COMMENT ON COLUMN book_part_source_evidence.evidence_type IS
  'Practical source location label such as constituent_cover, combined_volume_list, title_page, or other.';

CREATE TABLE content_block_translation_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_block_id uuid NOT NULL REFERENCES content_blocks(id) ON DELETE RESTRICT,
  original_translation text NOT NULL,
  proposed_modern_translation text NOT NULL,
  reason_comment text,
  review_status text NOT NULL DEFAULT 'draft',
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT translation_proposals_original_not_blank
    CHECK (btrim(original_translation) <> ''),
  CONSTRAINT translation_proposals_modern_not_blank
    CHECK (btrim(proposed_modern_translation) <> ''),
  CONSTRAINT translation_proposals_status_valid CHECK (
    review_status IN ('draft', 'awaiting_review', 'approved', 'rejected')
  )
);

COMMENT ON TABLE content_block_translation_proposals IS
  'Private scholarly proposals. Approval records a review decision only and never changes or publishes canonical reader text.';
COMMENT ON COLUMN content_block_translation_proposals.original_translation IS
  'Immutable snapshot of the linked canonical translation block at proposal creation.';
COMMENT ON COLUMN content_block_translation_proposals.proposed_modern_translation IS
  'Admin-only proposed wording; never substituted into content_blocks automatically.';

CREATE OR REPLACE FUNCTION enforce_translation_proposal_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_block_type text;
  v_text_content text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.content_block_id IS DISTINCT FROM OLD.content_block_id OR
    NEW.original_translation IS DISTINCT FROM OLD.original_translation
  ) THEN
    RAISE EXCEPTION 'Translation proposal source fields are immutable';
  END IF;

  SELECT block_type, text_content
  INTO v_block_type, v_text_content
  FROM content_blocks
  WHERE id = NEW.content_block_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Translation proposal content block does not exist';
  END IF;
  IF v_block_type <> 'translation' THEN
    RAISE EXCEPTION 'Translation proposals require a translation content block';
  END IF;
  IF NEW.original_translation IS DISTINCT FROM v_text_content THEN
    RAISE EXCEPTION 'original_translation must exactly match canonical content block text';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_translation_proposal_source_trigger
BEFORE INSERT OR UPDATE ON content_block_translation_proposals
FOR EACH ROW EXECUTE FUNCTION enforce_translation_proposal_source();

CREATE OR REPLACE FUNCTION set_book_part_foundation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_book_parts_updated_at
BEFORE UPDATE ON book_parts
FOR EACH ROW EXECUTE FUNCTION set_book_part_foundation_updated_at();

CREATE TRIGGER set_translation_proposals_updated_at
BEFORE UPDATE ON content_block_translation_proposals
FOR EACH ROW EXECUTE FUNCTION set_book_part_foundation_updated_at();

CREATE INDEX idx_book_parts_book_order
  ON book_parts(book_id, sequence_index);
CREATE INDEX idx_book_parts_type
  ON book_parts(book_id, part_type, sequence_index);
CREATE INDEX idx_pages_book_part_order
  ON pages(book_part_id, sequence_index)
  WHERE book_part_id IS NOT NULL;
CREATE INDEX idx_book_part_evidence_part
  ON book_part_source_evidence(book_part_id, source_pdf_page);
CREATE INDEX idx_book_part_evidence_source_document
  ON book_part_source_evidence(source_document_id);
CREATE INDEX idx_translation_proposals_block
  ON content_block_translation_proposals(content_block_id, created_at DESC);
CREATE INDEX idx_translation_proposals_review_queue
  ON content_block_translation_proposals(review_status, updated_at DESC);

ALTER TABLE book_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_part_source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_block_translation_proposals ENABLE ROW LEVEL SECURITY;

-- Publication hierarchy and its source evidence are readable by the same
-- reader roles as books. No client write policies are introduced here.
CREATE POLICY "reader_select_book_parts" ON book_parts FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "reader_select_book_part_source_evidence" ON book_part_source_evidence FOR SELECT
  TO anon, authenticated USING (true);

-- Translation proposals are deliberately admin/service-role only. RLS has no
-- anon/authenticated policy, and explicit revocation provides defence in depth.
REVOKE ALL ON TABLE content_block_translation_proposals FROM anon, authenticated;
