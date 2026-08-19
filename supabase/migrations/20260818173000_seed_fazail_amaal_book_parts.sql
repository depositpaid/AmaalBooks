/*
# Seed the verified Faza'il-e-A'maal publication parts

Source of truth:
- Filename: Fazail-e-amaalComplete.pdf
- SHA-256: 2617AA897D3B23AA7BBC9DEAE7CE424771C291F3C46D6E88553BE62222500867
- Physical page count: 958

Safety and compatibility:
- This migration targets only the manually verified canonical Faza'il-e-A'maal
  books.id: 3cbdc749-e9c9-44f3-8330-ecc1e3b38cc8.
- It inserts fixed-ID book_parts and source-evidence rows only.
- It never updates or deletes books, pages, content_blocks, structural_nodes,
  or any existing source-faithful text or UUID.
- In particular, it does not touch the temporary Virtues of Salaat book
  25e9e7c2-ee8d-43e2-ae59-f93b6402922e or its six test pages.
- Fixed IDs plus exact postcondition checks make a byte-for-byte equivalent
  rerun safe. Any conflicting IDs, sequences, or values abort transactionally.
- The Qur'aan constituent's Part identifier remains NULL because the scan has
  contradictory Part 3 (constituent cover) and Part 2 (combined-volume list)
  evidence. Both observations are retained without choosing between them.
*/

DO $$
DECLARE
  v_book_id constant uuid := '3cbdc749-e9c9-44f3-8330-ecc1e3b38cc8';
  v_expected_parts integer;
  v_expected_evidence integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM books WHERE id = v_book_id) THEN
    RAISE EXCEPTION
      'Canonical Faza''il-e-A''maal book % does not exist; refusing to seed book parts',
      v_book_id;
  END IF;

  INSERT INTO book_parts (
    id,
    book_id,
    part_type,
    source_title,
    display_title,
    source_part_identifier,
    sequence_index,
    source_pdf_start_page,
    source_pdf_end_page,
    printed_page_start,
    printed_page_end,
    verification_status,
    verification_notes
  )
  VALUES
    (
      '4fa615b5-35e0-4947-885f-7fcb7349ff1c', v_book_id, 'part',
      'STORIES OF THE SAHABAH', 'Stories of the Sahabah', 'Part 1', 0,
      1, 268, '3', '266', 'verified',
      'Verified against Fazail-e-amaalComplete.pdf (958 pages; SHA-256 2617AA897D3B23AA7BBC9DEAE7CE424771C291F3C46D6E88553BE62222500867).'
    ),
    (
      'fb53917f-6d64-4aa1-907b-215538af024f', v_book_id, 'part',
      'VIRTUES OF THE HOLY QUR'||chr(8217)||'AAN', 'Virtues of the Holy Qur'||chr(8217)||'aan', NULL, 1,
      269, 383, '4', '114', 'verified',
      'The constituent cover says Part 3 while the combined-volume list says Part 2. The primary identifier is intentionally unresolved; both observations are preserved in book_part_source_evidence.'
    ),
    (
      '59d7f112-fb58-4726-9c35-11485c6155e7', v_book_id, 'part',
      'Virtues of SALAAT', 'Virtues of Salaat', 'Part 3', 2,
      384, 487, '5', '104', 'verified',
      'The constituent cover and title page use different exact title forms; both are preserved in book_part_source_evidence.'
    ),
    (
      '56d83977-5e5b-4047-a201-84fb7b09b567', v_book_id, 'part',
      'Virtues of Zikr', 'Virtues of Zikr', 'Part 4', 3,
      488, 732, '4', '245', 'verified',
      'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'
    ),
    (
      '37289293-eaf0-4d7b-8971-67b9f0a147d2', v_book_id, 'part',
      'VIRTUES OF TABLIGH', 'Virtues of Tabligh', 'Part 5', 4,
      733, 778, '3', '46', 'verified',
      'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'
    ),
    (
      'be945aef-9ea1-4f5f-9f2a-4b7d6cb95bc2', v_book_id, 'part',
      'Virtues of Ramadhaan', 'Virtues of Ramadhaan', 'Part 6', 5,
      779, 863, '3', '84', 'verified',
      'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'
    ),
    (
      '0bad7c04-59e7-483e-94d0-a01a18187765', v_book_id, 'part',
      'MUSLIM DEGENERATION AND ITS ONLY REMEDY',
      'Muslim Degeneration and Its Only Remedy', 'Part 7', 6,
      864, 902, '3', '39', 'verified',
      'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'
    ),
    (
      '33ee47ae-ac2b-4ce3-8682-44269e20cee2', v_book_id, 'part',
      'Six Fundamentals', 'Six Fundamentals', 'Part 8', 7,
      903, 943, '2', '39', 'verified',
      'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'
    ),
    (
      '9d883011-dd1e-48d0-8963-c3c1c0e1f8aa', v_book_id, 'ancillary',
      'GLOSSARY FOR FAZA'||chr(8217)||'IL-E-A'||chr(8217)||'MAAL', 'Glossary for Faza'||chr(8217)||'il-e-A'||chr(8217)||'maal', NULL, 8,
      944, 958, '1', '15', 'verified',
      'Verified unnumbered ancillary section; no Part identifier is invented.'
    )
  ON CONFLICT (id) DO NOTHING;

  WITH expected (
    id, book_id, part_type, source_title, display_title,
    source_part_identifier, sequence_index, source_pdf_start_page,
    source_pdf_end_page, printed_page_start, printed_page_end,
    verification_status, verification_notes
  ) AS (
    VALUES
      ('4fa615b5-35e0-4947-885f-7fcb7349ff1c'::uuid, v_book_id, 'part', 'STORIES OF THE SAHABAH', 'Stories of the Sahabah', 'Part 1', 0, 1, 268, '3', '266', 'verified', 'Verified against Fazail-e-amaalComplete.pdf (958 pages; SHA-256 2617AA897D3B23AA7BBC9DEAE7CE424771C291F3C46D6E88553BE62222500867).'),
      ('fb53917f-6d64-4aa1-907b-215538af024f'::uuid, v_book_id, 'part', 'VIRTUES OF THE HOLY QUR'||chr(8217)||'AAN', 'Virtues of the Holy Qur'||chr(8217)||'aan', NULL, 1, 269, 383, '4', '114', 'verified', 'The constituent cover says Part 3 while the combined-volume list says Part 2. The primary identifier is intentionally unresolved; both observations are preserved in book_part_source_evidence.'),
      ('59d7f112-fb58-4726-9c35-11485c6155e7'::uuid, v_book_id, 'part', 'Virtues of SALAAT', 'Virtues of Salaat', 'Part 3', 2, 384, 487, '5', '104', 'verified', 'The constituent cover and title page use different exact title forms; both are preserved in book_part_source_evidence.'),
      ('56d83977-5e5b-4047-a201-84fb7b09b567'::uuid, v_book_id, 'part', 'Virtues of Zikr', 'Virtues of Zikr', 'Part 4', 3, 488, 732, '4', '245', 'verified', 'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'),
      ('37289293-eaf0-4d7b-8971-67b9f0a147d2'::uuid, v_book_id, 'part', 'VIRTUES OF TABLIGH', 'Virtues of Tabligh', 'Part 5', 4, 733, 778, '3', '46', 'verified', 'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'),
      ('be945aef-9ea1-4f5f-9f2a-4b7d6cb95bc2'::uuid, v_book_id, 'part', 'Virtues of Ramadhaan', 'Virtues of Ramadhaan', 'Part 6', 5, 779, 863, '3', '84', 'verified', 'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'),
      ('0bad7c04-59e7-483e-94d0-a01a18187765'::uuid, v_book_id, 'part', 'MUSLIM DEGENERATION AND ITS ONLY REMEDY', 'Muslim Degeneration and Its Only Remedy', 'Part 7', 6, 864, 902, '3', '39', 'verified', 'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'),
      ('33ee47ae-ac2b-4ce3-8682-44269e20cee2'::uuid, v_book_id, 'part', 'Six Fundamentals', 'Six Fundamentals', 'Part 8', 7, 903, 943, '2', '39', 'verified', 'Verified against the authoritative source map for Fazail-e-amaalComplete.pdf.'),
      ('9d883011-dd1e-48d0-8963-c3c1c0e1f8aa'::uuid, v_book_id, 'ancillary', 'GLOSSARY FOR FAZA'||chr(8217)||'IL-E-A'||chr(8217)||'MAAL', 'Glossary for Faza'||chr(8217)||'il-e-A'||chr(8217)||'maal', NULL, 8, 944, 958, '1', '15', 'verified', 'Verified unnumbered ancillary section; no Part identifier is invented.')
  )
  SELECT count(*)
  INTO v_expected_parts
  FROM expected e
  JOIN book_parts p ON p.id = e.id
  WHERE p.book_id = e.book_id
    AND p.part_type = e.part_type
    AND p.source_title = e.source_title
    AND p.display_title IS NOT DISTINCT FROM e.display_title
    AND p.source_part_identifier IS NOT DISTINCT FROM e.source_part_identifier
    AND p.sequence_index = e.sequence_index
    AND p.source_pdf_start_page = e.source_pdf_start_page
    AND p.source_pdf_end_page = e.source_pdf_end_page
    AND p.printed_page_start = e.printed_page_start
    AND p.printed_page_end = e.printed_page_end
    AND p.verification_status = e.verification_status
    AND p.verification_notes = e.verification_notes;

  IF v_expected_parts <> 9 THEN
    RAISE EXCEPTION
      'Existing book_parts conflict with the verified Faza''il-e-A''maal seed; transaction aborted';
  END IF;

  INSERT INTO book_part_source_evidence (
    id,
    book_part_id,
    source_document_id,
    evidence_type,
    source_pdf_page,
    printed_identifier,
    printed_title,
    notes
  )
  VALUES
    (
      'bbbc9ad0-f34f-4540-9e40-ae79780b802d',
      'fb53917f-6d64-4aa1-907b-215538af024f',
      NULL, 'constituent_cover', 269, 'Part 3', 'VIRTUES OF THE HOLY QUR'||chr(8217)||'AAN',
      'Exact constituent-cover observation in Fazail-e-amaalComplete.pdf.'
    ),
    (
      'dde4b37b-9e8d-4284-b9a1-01bd489e15b5',
      'fb53917f-6d64-4aa1-907b-215538af024f',
      NULL, 'combined_volume_list', 385, 'Part 2', 'Virtues of The Holy Qur'||chr(8217)||'aan',
      'Exact combined-volume list observation in Fazail-e-amaalComplete.pdf; retained alongside the contradictory constituent-cover identifier.'
    ),
    (
      '2d972a60-29a3-496b-81ca-58b46f39e705',
      '59d7f112-fb58-4726-9c35-11485c6155e7',
      NULL, 'constituent_cover', 384, 'Part 3', 'VIRTUES OF SALAAH',
      'Exact constituent-cover title and identifier observation in Fazail-e-amaalComplete.pdf.'
    ),
    (
      '0d588130-ff25-4b9a-89b4-842288fb7fe9',
      '59d7f112-fb58-4726-9c35-11485c6155e7',
      NULL, 'title_page', 386, NULL, 'Virtues of SALAAT',
      'Exact title-page observation in Fazail-e-amaalComplete.pdf.'
    )
  ON CONFLICT (id) DO NOTHING;

  WITH expected (
    id, book_part_id, source_document_id, evidence_type, source_pdf_page,
    printed_identifier, printed_title, notes
  ) AS (
    VALUES
      ('bbbc9ad0-f34f-4540-9e40-ae79780b802d'::uuid, 'fb53917f-6d64-4aa1-907b-215538af024f'::uuid, NULL::uuid, 'constituent_cover', 269, 'Part 3', 'VIRTUES OF THE HOLY QUR'||chr(8217)||'AAN', 'Exact constituent-cover observation in Fazail-e-amaalComplete.pdf.'),
      ('dde4b37b-9e8d-4284-b9a1-01bd489e15b5'::uuid, 'fb53917f-6d64-4aa1-907b-215538af024f'::uuid, NULL::uuid, 'combined_volume_list', 385, 'Part 2', 'Virtues of The Holy Qur'||chr(8217)||'aan', 'Exact combined-volume list observation in Fazail-e-amaalComplete.pdf; retained alongside the contradictory constituent-cover identifier.'),
      ('2d972a60-29a3-496b-81ca-58b46f39e705'::uuid, '59d7f112-fb58-4726-9c35-11485c6155e7'::uuid, NULL::uuid, 'constituent_cover', 384, 'Part 3', 'VIRTUES OF SALAAH', 'Exact constituent-cover title and identifier observation in Fazail-e-amaalComplete.pdf.'),
      ('0d588130-ff25-4b9a-89b4-842288fb7fe9'::uuid, '59d7f112-fb58-4726-9c35-11485c6155e7'::uuid, NULL::uuid, 'title_page', 386, NULL, 'Virtues of SALAAT', 'Exact title-page observation in Fazail-e-amaalComplete.pdf.')
  )
  SELECT count(*)
  INTO v_expected_evidence
  FROM expected e
  JOIN book_part_source_evidence s ON s.id = e.id
  WHERE s.book_part_id = e.book_part_id
    AND s.source_document_id IS NOT DISTINCT FROM e.source_document_id
    AND s.evidence_type = e.evidence_type
    AND s.source_pdf_page = e.source_pdf_page
    AND s.printed_identifier IS NOT DISTINCT FROM e.printed_identifier
    AND s.printed_title IS NOT DISTINCT FROM e.printed_title
    AND s.notes = e.notes;

  IF v_expected_evidence <> 4 THEN
    RAISE EXCEPTION
      'Existing source evidence conflicts with the verified Faza''il-e-A''maal seed; transaction aborted';
  END IF;
END;
$$;
