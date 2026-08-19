CREATE OR REPLACE FUNCTION public.import_structured_page_v1(
  p_book_id uuid,
  p_edition_id uuid,
  p_source_document_id uuid,
  p_import_batch_id uuid,
  p_page jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_page_id uuid;
  v_page_status text;
  v_node jsonb;
  v_block jsonb;
  v_node_id uuid;
  v_parent_id uuid;
  v_block_id uuid;
  v_block_sequence int;
  v_previous_block_sequence int := -1;
  v_scan_has_arabic boolean;
  v_scan_has_english boolean;
  v_has_arabic_block boolean;
  v_has_english_block boolean;
BEGIN
  IF jsonb_typeof(p_page) <> 'object' THEN
    RAISE EXCEPTION 'Page payload must be a JSON object';
  END IF;

  v_page_id := (p_page->>'pageId')::uuid;
  v_page_status := p_page->>'verificationStatus';

  IF v_page_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'Imported pages must remain draft or in_review';
  END IF;
  IF jsonb_typeof(p_page->'sourceShowsPrintedPageLabel') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'sourceShowsPrintedPageLabel must be boolean';
  END IF;
  IF (p_page->>'sourceShowsPrintedPageLabel')::boolean AND
     NULLIF(btrim(p_page->>'printedPageLabel'), '') IS NULL THEN
    RAISE EXCEPTION 'printedPageLabel is required because the source shows one';
  END IF;
  IF NOT (p_page->>'sourceShowsPrintedPageLabel')::boolean AND (
    NOT (p_page ? 'printedPageLabel') OR
    jsonb_typeof(p_page->'printedPageLabel') <> 'null'
  ) THEN
    RAISE EXCEPTION 'printedPageLabel must be null because the source shows none';
  END IF;
  IF (p_page->>'pdfPageNumber') IS NULL OR (p_page->>'pdfPageNumber')::int <= 0 THEN
    RAISE EXCEPTION 'pdfPageNumber must be positive';
  END IF;
  IF (p_page->>'sequenceIndex')::int < 0 THEN
    RAISE EXCEPTION 'sequenceIndex must be non-negative';
  END IF;
  IF jsonb_typeof(p_page->'blocks') <> 'array' OR jsonb_array_length(p_page->'blocks') = 0 THEN
    RAISE EXCEPTION 'A complete page must contain at least one content block';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pages WHERE id = v_page_id AND book_id = p_book_id) THEN
    RAISE EXCEPTION 'Page % does not exist in book %', v_page_id, p_book_id;
  END IF;
  IF EXISTS (SELECT 1 FROM content_blocks WHERE page_id = v_page_id) THEN
    RAISE EXCEPTION 'Page % already has structured blocks and will not be overwritten', v_page_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM book_editions WHERE id = p_edition_id AND book_id = p_book_id
  ) THEN
    RAISE EXCEPTION 'Edition does not belong to the requested book';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM source_documents
    WHERE id = p_source_document_id AND edition_id = p_edition_id
  ) THEN
    RAISE EXCEPTION 'Source document does not belong to the requested edition';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM import_batches
    WHERE id = p_import_batch_id
    AND book_id = p_book_id
    AND edition_id = p_edition_id
    AND source_document_id = p_source_document_id
  ) THEN
    RAISE EXCEPTION 'Import batch metadata does not match the page source';
  END IF;

  v_scan_has_arabic := EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(p_page->'scanLanguages', '[]'::jsonb)
    ) AS languages(language_code)
    WHERE lower(language_code) LIKE 'ar%'
  );
  v_scan_has_english := EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(p_page->'scanLanguages', '[]'::jsonb)
    ) AS languages(language_code)
    WHERE lower(language_code) LIKE 'en%'
  );
  v_has_arabic_block := EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_page->'blocks') AS blocks(block_data)
    WHERE block_data->>'blockType' = 'arabic'
    AND block_data->>'direction' = 'rtl'
    AND lower(block_data->>'languageCode') LIKE 'ar%'
    AND block_data->>'textContent' ~ '[ء-ي]'
  );
  v_has_english_block := EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_page->'blocks') AS blocks(block_data)
    WHERE lower(block_data->>'languageCode') LIKE 'en%'
    AND NULLIF(block_data->>'textContent', '') IS NOT NULL
  );

  IF v_scan_has_arabic AND (
    NOT v_has_arabic_block OR
    COALESCE((p_page#>>'{reviewEvidence,arabicTranscriptionComplete}')::boolean, false) = false
  ) THEN
    RAISE EXCEPTION 'Visible Arabic requires complete Unicode Arabic blocks before import';
  END IF;
  IF v_scan_has_english AND (
    NOT v_has_english_block OR
    COALESCE((p_page#>>'{reviewEvidence,englishTranscriptionComplete}')::boolean, false) = false
  ) THEN
    RAISE EXCEPTION 'Visible English requires a complete English transcription before import';
  END IF;
  IF COALESCE((p_page#>>'{reviewEvidence,blockOrderChecked}')::boolean, false) = false THEN
    RAISE EXCEPTION 'Block order must be checked against the scan before import';
  END IF;
  IF COALESCE((p_page#>>'{reviewEvidence,identifiersChecked}')::boolean, false) = false THEN
    RAISE EXCEPTION 'Structural identifiers must be checked against the scan before import';
  END IF;

  -- Nodes must be ordered parent-first in the manifest. Existing nodes may be
  -- reused only when every source-significant field matches exactly.
  -- Mutable page-range fields (start_page_id, end_page_id) are updated on conflict.
  -- sequence_index is NOT updated (it is globally unique per book); the per-page
  -- sequenceIndex in the payload is only used for new node insertion.
  FOR v_node IN SELECT value FROM jsonb_array_elements(COALESCE(p_page->'structuralNodes', '[]'::jsonb))
  LOOP
    v_node_id := (v_node->>'id')::uuid;
    v_parent_id := NULLIF(v_node->>'parentId', '')::uuid;

    INSERT INTO structural_nodes (
      id, book_id, edition_id, parent_id, node_type, source_label,
      source_identifier, title, sequence_index, start_page_id, end_page_id,
      verification_status
    ) VALUES (
      v_node_id,
      p_book_id,
      p_edition_id,
      v_parent_id,
      v_node->>'nodeType',
      NULLIF(v_node->>'sourceLabel', ''),
      NULLIF(v_node->>'sourceIdentifier', ''),
      NULLIF(v_node->>'title', ''),
      (v_node->>'sequenceIndex')::int,
      NULLIF(v_node->>'startPageId', '')::uuid,
      NULLIF(v_node->>'endPageId', '')::uuid,
      v_page_status
    ) ON CONFLICT (id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      start_page_id = EXCLUDED.start_page_id,
      end_page_id = EXCLUDED.end_page_id;

    IF NOT EXISTS (
      SELECT 1 FROM structural_nodes node
      WHERE node.id = v_node_id
      AND node.book_id = p_book_id
      AND node.edition_id IS NOT DISTINCT FROM p_edition_id
      AND node.node_type = v_node->>'nodeType'
      AND node.source_label IS NOT DISTINCT FROM NULLIF(v_node->>'sourceLabel', '')
      AND node.source_identifier IS NOT DISTINCT FROM NULLIF(v_node->>'sourceIdentifier', '')
      AND node.title IS NOT DISTINCT FROM NULLIF(v_node->>'title', '')
    ) THEN
      RAISE EXCEPTION 'Structural node % conflicts with an existing source definition', v_node_id;
    END IF;
  END LOOP;

  UPDATE pages SET
    edition_id = p_edition_id,
    source_document_id = p_source_document_id,
    printed_page_label = p_page->>'printedPageLabel',
    printed_page_number = NULLIF(p_page->>'printedPageNumber', '')::int,
    pdf_page_number = (p_page->>'pdfPageNumber')::int,
    sequence_index = (p_page->>'sequenceIndex')::int,
    verification_status = v_page_status,
    verified_at = NULL,
    updated_at = now()
  WHERE id = v_page_id AND book_id = p_book_id;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_page->'blocks')
  LOOP
    v_block_id := (v_block->>'id')::uuid;
    v_block_sequence := (v_block->>'sequenceIndex')::int;

    IF NULLIF(v_block->>'textContent', '') IS NULL THEN
      RAISE EXCEPTION 'Content block % has empty canonical text', v_block_id;
    END IF;
    IF (v_block->>'verificationStatus') NOT IN ('draft', 'in_review') THEN
      RAISE EXCEPTION 'Content block % has an invalid import verification status', v_block_id;
    END IF;
    IF v_block_sequence < 0 OR v_block_sequence <= v_previous_block_sequence THEN
      RAISE EXCEPTION 'Content block % is not in strict source sequence order', v_block_id;
    END IF;
    v_previous_block_sequence := v_block_sequence;

    IF NULLIF(v_block->>'structuralNodeId', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM structural_nodes
      WHERE id = (v_block->>'structuralNodeId')::uuid AND book_id = p_book_id
    ) THEN
      RAISE EXCEPTION 'Content block % references a structural node outside this book', v_block_id;
    END IF;

    IF v_block->>'blockType' = 'arabic' AND NOT (
      v_block->>'direction' = 'rtl'
      AND lower(v_block->>'languageCode') LIKE 'ar%'
      AND v_block->>'textContent' ~ '[ء-ي]'
    ) THEN
      RAISE EXCEPTION 'Arabic block % must contain Unicode Arabic with rtl/ar metadata', v_block_id;
    END IF;

    INSERT INTO content_blocks (
      id, book_id, page_id, structural_node_id, import_batch_id,
      source_document_id, sequence_index, block_type, language_code,
      direction, text_content, raw_ocr_text, tts_eligible,
      verification_status, provenance_notes
    ) VALUES (
      v_block_id,
      p_book_id,
      v_page_id,
      NULLIF(v_block->>'structuralNodeId', '')::uuid,
      p_import_batch_id,
      p_source_document_id,
      v_block_sequence,
      v_block->>'blockType',
      v_block->>'languageCode',
      v_block->>'direction',
      v_block->>'textContent',
      CASE WHEN v_block ? 'rawOcrText' THEN v_block->>'rawOcrText' ELSE NULL END,
      (v_block->>'ttsEligible')::boolean,
      v_block->>'verificationStatus',
      NULLIF(v_block->>'provenanceNotes', '')
    );
  END LOOP;

  RETURN v_page_id;
END;
$function$;