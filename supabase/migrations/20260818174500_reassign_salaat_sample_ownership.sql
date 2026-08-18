/*
# Reassign the six validated Salaat sample pages to Faza'il-e-A'maal

This is a protected ownership-only migration. It moves six existing pages from
the temporary Virtues of Salaat book to the permanent Virtues of SALAAT part
inside the canonical Faza'il-e-A'maal publication.

Only these columns are updated:
- pages.book_id
- pages.book_part_id
- content_blocks.book_id
- structural_nodes.book_id

No row is inserted, recreated, or deleted. Temporary snapshots and hashes prove
that UUIDs, canonical text, OCR, metadata, ordering, hierarchy, provenance, and
verification state remain unchanged. Any failed precondition or postcondition
raises an exception and rolls back the complete DO statement transactionally.
*/

DO $$
DECLARE
  v_canonical_book_id constant uuid := '3cbdc749-e9c9-44f3-8330-ecc1e3b38cc8';
  v_salaat_part_id constant uuid := '59d7f112-fb58-4726-9c35-11485c6155e7';
  v_temporary_book_id constant uuid := '25e9e7c2-ee8d-43e2-ae59-f93b6402922e';
  v_temporary_book_hash text;
  v_page_count integer;
  v_block_count integer;
  v_node_count integer;
  v_updated_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM books WHERE id = v_canonical_book_id) THEN
    RAISE EXCEPTION 'Canonical Faza''il-e-A''maal book % does not exist', v_canonical_book_id;
  END IF;

  SELECT md5(to_jsonb(b)::text)
  INTO v_temporary_book_hash
  FROM books b
  WHERE b.id = v_temporary_book_id
  FOR UPDATE;

  IF v_temporary_book_hash IS NULL THEN
    RAISE EXCEPTION 'Temporary Virtues of Salaat book % does not exist', v_temporary_book_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM book_parts
    WHERE id = v_salaat_part_id
      AND book_id = v_canonical_book_id
      AND source_title = 'Virtues of SALAAT'
      AND source_part_identifier = 'Part 3'
      AND source_pdf_start_page = 384
      AND source_pdf_end_page = 487
  ) THEN
    RAISE EXCEPTION
      'Permanent Virtues of SALAAT part % is missing or does not belong to canonical book %',
      v_salaat_part_id, v_canonical_book_id;
  END IF;

  CREATE TEMP TABLE expected_salaat_pages (
    page_id uuid PRIMARY KEY,
    printed_page_label text NOT NULL,
    pdf_page_number integer NOT NULL,
    expected_block_count integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO expected_salaat_pages
    (page_id, printed_page_label, pdf_page_number, expected_block_count)
  VALUES
    ('8dc420ec-c6b6-462e-943c-6ed8d40df762', '10', 393, 3),
    ('49427b68-478b-44f2-b6ff-bbcdd98b2111', '11', 394, 7),
    ('7fe43692-e5f8-4fa3-b50a-a709113bdda3', '12', 395, 9),
    ('45e2f471-bead-45ec-bfd1-2ac1b6bc7b80', '13', 396, 7),
    ('1f03c4b7-6cc8-44ab-af97-ca836c4cd552', '14', 397, 4),
    ('40cbbcb7-6008-41d6-855a-b35c31ed6096', '15', 398, 10);

  -- Lock and validate all six exact page rows before taking snapshots.
  PERFORM 1
  FROM pages p
  JOIN expected_salaat_pages e ON e.page_id = p.id
  FOR UPDATE OF p;

  SELECT count(*)
  INTO v_page_count
  FROM pages p
  JOIN expected_salaat_pages e ON e.page_id = p.id;

  IF v_page_count <> 6 THEN
    RAISE EXCEPTION 'Expected all 6 validated Salaat pages; found %', v_page_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM expected_salaat_pages e
    JOIN pages p ON p.id = e.page_id
    WHERE p.book_id IS DISTINCT FROM v_temporary_book_id
      OR p.book_part_id IS NOT NULL
      OR p.printed_page_label IS DISTINCT FROM e.printed_page_label
      OR p.printed_page_number IS DISTINCT FROM e.printed_page_label::integer
      OR p.pdf_page_number IS DISTINCT FROM e.pdf_page_number
      OR p.verification_status IS DISTINCT FROM 'in_review'
  ) THEN
    RAISE EXCEPTION
      'One or more Salaat pages has unexpected ownership, source metadata, or verification status';
  END IF;

  -- Prevent destination uniqueness collisions; never overwrite an existing page.
  IF EXISTS (
    SELECT 1
    FROM pages destination
    JOIN pages moving
      ON moving.id IN (SELECT page_id FROM expected_salaat_pages)
     AND destination.book_id = v_canonical_book_id
     AND destination.id <> moving.id
     AND (
       destination.page_number = moving.page_number OR
       (
         destination.sequence_index IS NOT NULL AND
         destination.sequence_index = moving.sequence_index
       )
     )
  ) THEN
    RAISE EXCEPTION
      'Canonical Faza''il-e-A''maal already has a conflicting page number or sequence index';
  END IF;

  -- Exact block counts are source-page preconditions, not inferred totals.
  IF EXISTS (
    SELECT 1
    FROM expected_salaat_pages e
    LEFT JOIN content_blocks cb ON cb.page_id = e.page_id
    GROUP BY e.page_id, e.expected_block_count
    HAVING count(cb.id) <> e.expected_block_count
  ) THEN
    RAISE EXCEPTION 'One or more Salaat pages has an unexpected content block count';
  END IF;

  SELECT count(*)
  INTO v_block_count
  FROM content_blocks cb
  WHERE cb.page_id IN (SELECT page_id FROM expected_salaat_pages);

  IF v_block_count <> 40 THEN
    RAISE EXCEPTION 'Expected 40 content blocks across the six pages; found %', v_block_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM content_blocks cb
    WHERE cb.page_id IN (SELECT page_id FROM expected_salaat_pages)
      AND cb.book_id IS DISTINCT FROM v_temporary_book_id
  ) THEN
    RAISE EXCEPTION 'One or more Salaat content blocks has unexpected book ownership';
  END IF;

  CREATE TEMP TABLE moving_salaat_node_ids
  ON COMMIT DROP
  AS
  SELECT DISTINCT cb.structural_node_id AS node_id
  FROM content_blocks cb
  WHERE cb.page_id IN (SELECT page_id FROM expected_salaat_pages)
    AND cb.structural_node_id IS NOT NULL;

  SELECT count(*) INTO v_node_count FROM moving_salaat_node_ids;
  IF v_node_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 related structural nodes; found %', v_node_count;
  END IF;

  PERFORM 1
  FROM structural_nodes sn
  JOIN moving_salaat_node_ids moving ON moving.node_id = sn.id
  FOR UPDATE OF sn;

  IF (
    SELECT count(*)
    FROM structural_nodes sn
    JOIN moving_salaat_node_ids moving ON moving.node_id = sn.id
  ) <> v_node_count THEN
    RAISE EXCEPTION 'A referenced Salaat structural node does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM structural_nodes sn
    JOIN moving_salaat_node_ids moving ON moving.node_id = sn.id
    WHERE sn.book_id IS DISTINCT FROM v_temporary_book_id
  ) THEN
    RAISE EXCEPTION 'One or more Salaat structural nodes has unexpected book ownership';
  END IF;

  -- A node is exclusive only if no outside block, page anchor, block anchor,
  -- parent, or child associates it with content beyond the six-page set.
  IF EXISTS (
    SELECT 1
    FROM content_blocks cb
    WHERE cb.structural_node_id IN (SELECT node_id FROM moving_salaat_node_ids)
      AND cb.page_id NOT IN (SELECT page_id FROM expected_salaat_pages)
  ) OR EXISTS (
    SELECT 1
    FROM structural_nodes sn
    WHERE sn.id IN (SELECT node_id FROM moving_salaat_node_ids)
      AND (
        (sn.start_page_id IS NOT NULL AND sn.start_page_id NOT IN (SELECT page_id FROM expected_salaat_pages)) OR
        (sn.end_page_id IS NOT NULL AND sn.end_page_id NOT IN (SELECT page_id FROM expected_salaat_pages)) OR
        (sn.start_block_id IS NOT NULL AND sn.start_block_id NOT IN (
          SELECT id FROM content_blocks WHERE page_id IN (SELECT page_id FROM expected_salaat_pages)
        )) OR
        (sn.end_block_id IS NOT NULL AND sn.end_block_id NOT IN (
          SELECT id FROM content_blocks WHERE page_id IN (SELECT page_id FROM expected_salaat_pages)
        )) OR
        (sn.parent_id IS NOT NULL AND sn.parent_id NOT IN (SELECT node_id FROM moving_salaat_node_ids))
      )
  ) OR EXISTS (
    SELECT 1
    FROM structural_nodes child
    WHERE child.parent_id IN (SELECT node_id FROM moving_salaat_node_ids)
      AND child.id NOT IN (SELECT node_id FROM moving_salaat_node_ids)
  ) THEN
    RAISE EXCEPTION
      'A Salaat structural node is shared with content outside the six-page set';
  END IF;

  -- Prevent structural-node sequence collisions in the destination book.
  IF EXISTS (
    SELECT 1
    FROM structural_nodes destination
    JOIN structural_nodes moving
      ON moving.id IN (SELECT node_id FROM moving_salaat_node_ids)
     AND destination.book_id = v_canonical_book_id
     AND destination.id <> moving.id
     AND destination.sequence_index = moving.sequence_index
  ) THEN
    RAISE EXCEPTION
      'Canonical Faza''il-e-A''maal already has a conflicting structural-node sequence';
  END IF;

  -- Hash every non-ownership field. JSONB text has deterministic key ordering,
  -- so these snapshots also preserve IDs, exact Unicode text, OCR, metadata,
  -- ordering, provenance, timestamps, verification state, and hierarchy.
  CREATE TEMP TABLE salaat_pages_before
  ON COMMIT DROP
  AS
  SELECT p.id, md5((to_jsonb(p) - 'book_id' - 'book_part_id')::text) AS preserved_hash
  FROM pages p
  WHERE p.id IN (SELECT page_id FROM expected_salaat_pages);

  CREATE TEMP TABLE salaat_blocks_before
  ON COMMIT DROP
  AS
  SELECT cb.id, md5((to_jsonb(cb) - 'book_id')::text) AS preserved_hash
  FROM content_blocks cb
  WHERE cb.page_id IN (SELECT page_id FROM expected_salaat_pages);

  CREATE TEMP TABLE salaat_nodes_before
  ON COMMIT DROP
  AS
  SELECT sn.id, md5((to_jsonb(sn) - 'book_id')::text) AS preserved_hash
  FROM structural_nodes sn
  WHERE sn.id IN (SELECT node_id FROM moving_salaat_node_ids);

  UPDATE pages
  SET
    book_id = v_canonical_book_id,
    book_part_id = v_salaat_part_id
  WHERE id IN (SELECT page_id FROM expected_salaat_pages);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 6 THEN
    RAISE EXCEPTION 'Expected to update 6 page ownership rows; updated %', v_updated_count;
  END IF;

  UPDATE content_blocks
  SET book_id = v_canonical_book_id
  WHERE page_id IN (SELECT page_id FROM expected_salaat_pages);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 40 THEN
    RAISE EXCEPTION 'Expected to update 40 content block ownership rows; updated %', v_updated_count;
  END IF;

  UPDATE structural_nodes
  SET book_id = v_canonical_book_id
  WHERE id IN (SELECT node_id FROM moving_salaat_node_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 7 THEN
    RAISE EXCEPTION 'Expected to update 7 structural node ownership rows; updated %', v_updated_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pages p
    JOIN expected_salaat_pages e ON e.page_id = p.id
    WHERE p.book_id IS DISTINCT FROM v_canonical_book_id
      OR p.book_part_id IS DISTINCT FROM v_salaat_part_id
  ) THEN
    RAISE EXCEPTION 'Postcondition failed for Salaat page ownership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM content_blocks cb
    WHERE cb.page_id IN (SELECT page_id FROM expected_salaat_pages)
      AND cb.book_id IS DISTINCT FROM v_canonical_book_id
  ) THEN
    RAISE EXCEPTION 'Postcondition failed for Salaat content block ownership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM structural_nodes sn
    WHERE sn.id IN (SELECT node_id FROM moving_salaat_node_ids)
      AND sn.book_id IS DISTINCT FROM v_canonical_book_id
  ) THEN
    RAISE EXCEPTION 'Postcondition failed for Salaat structural node ownership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM salaat_pages_before before_row
    FULL JOIN (
      SELECT * FROM pages WHERE id IN (SELECT page_id FROM expected_salaat_pages)
    ) p ON p.id = before_row.id
    WHERE before_row.id IS NULL
      OR p.id IS NULL
      OR before_row.preserved_hash IS DISTINCT FROM
         md5((to_jsonb(p) - 'book_id' - 'book_part_id')::text)
  ) THEN
    RAISE EXCEPTION 'A protected page UUID or non-ownership field changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM salaat_blocks_before before_row
    FULL JOIN (
      SELECT *
      FROM content_blocks
      WHERE page_id IN (SELECT page_id FROM expected_salaat_pages)
    ) cb ON cb.id = before_row.id
    WHERE before_row.id IS NULL
      OR cb.id IS NULL
      OR before_row.preserved_hash IS DISTINCT FROM md5((to_jsonb(cb) - 'book_id')::text)
  ) THEN
    RAISE EXCEPTION 'A protected content block UUID, text, or metadata field changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM salaat_nodes_before before_row
    FULL JOIN (
      SELECT *
      FROM structural_nodes
      WHERE id IN (SELECT node_id FROM moving_salaat_node_ids)
    ) sn ON sn.id = before_row.id
    WHERE before_row.id IS NULL
      OR sn.id IS NULL
      OR before_row.preserved_hash IS DISTINCT FROM md5((to_jsonb(sn) - 'book_id')::text)
  ) THEN
    RAISE EXCEPTION 'A protected structural node UUID, hierarchy, or metadata field changed';
  END IF;

  IF (SELECT count(*) FROM salaat_pages_before) <> 6
     OR (SELECT count(*) FROM salaat_blocks_before) <> 40
     OR (SELECT count(*) FROM salaat_nodes_before) <> 7 THEN
    RAISE EXCEPTION 'Preserved page, block, or node counts changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM books b
    WHERE b.id = v_temporary_book_id
      AND md5(to_jsonb(b)::text) = v_temporary_book_hash
  ) THEN
    RAISE EXCEPTION 'Temporary Virtues of Salaat book row changed unexpectedly';
  END IF;
END;
$$;
