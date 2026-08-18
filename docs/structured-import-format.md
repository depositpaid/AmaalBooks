# Structured book import format — version 1

This manifest format is for source-faithful transcription from an authoritative
scanned PDF. It must not be populated from the rejected legacy Salaat package or
treated as verified merely because it passes automated validation.

Run validation without contacting Supabase:

```text
node scripts/import-structured-book.mjs path/to/manifest.json --validate-only
```

Run an approved import with credentials supplied only through the environment:

```text
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-structured-book.mjs path/to/manifest.json
```

Manifests marked `datasetKind: "demo"` are validation-only; the utility refuses
to send them to Supabase.

## Top-level payload

```text
{
  schemaVersion: 1,
  datasetKind: "demo" | "production",
  bookId: UUID of an existing constituent book,
  bookPartId?: UUID of the target constituent part,
  pageWriteMode?: "existing" | "insert",
  edition: {
    id: UUID,
    editionLabel: string,
    publisher?: string | null,
    publicationLabel?: string | null,
    isbn?: string | null,
    languageCode?: string | null,
    notes?: string | null
  },
  sourceDocument: {
    id: UUID,
    originalFilename: string,
    storagePath?: string | null,
    sha256Checksum?: 64-character hex string | null,
    pdfPageCount?: positive integer | null,
    notes?: string | null
  },
  importBatch: {
    id: UUID,
    importedBy?: string | null,
    notes?: string | null
  },
  pages: StructuredPage[]
}
```

UUIDs are technical database identities only. They do not represent, replace,
or generate printed chapter, section, Hadith, or page identifiers.

## StructuredPage

```text
{
  pageId: UUID of an existing pages row,
  bookPartId?: UUID of the target constituent part,
  pageNumber?: integer compatibility locator,
  sourceShowsPrintedPageLabel: boolean,
  printedPageLabel: exact string visible in the scan, or null when none is shown,
  printedPageNumber: integer only when explicitly numeric, otherwise null,
  pdfPageNumber: one-based PDF page number,
  sequenceIndex: non-negative source-order integer,
  verificationStatus: "draft" | "in_review",
  scanLanguages: string[],
  reviewEvidence: {
    englishTranscriptionComplete: boolean,
    arabicTranscriptionComplete: boolean,
    blockOrderChecked: boolean,
    identifiersChecked: boolean,
    scanCompared: boolean
  },
  structuralNodes: StructuralNodeInput[],
  blocks: ContentBlockInput[]
}
```

`pageWriteMode: "insert"` is for fixed, pre-approved new page UUIDs. It requires
`bookPartId` and `pageNumber` and calls `import_new_structured_page_v1`. That RPC
fails on an existing page UUID, an existing `(book_id, book_part_id,
page_number)`, or an existing source-document/PDF-page mapping. The compatibility
page row and all structured nodes/blocks are committed in one transaction.
Existing-page mode retains the original `import_structured_page_v1` behavior.

`scanLanguages` declares what a human can see on the scan; it is not a
substitute for transcription. Declaring `ar` requires at least one non-empty
Unicode Arabic block and `arabicTranscriptionComplete: true`. The importer never
allows a page or block to enter as `verified`.

## StructuralNodeInput

```text
{
  id: UUID,
  parentId: earlier node UUID in this page payload | null,
  nodeType: "chapter" | "section" | "hadith" | future stored type,
  sourceLabel: exact source text | null,
  sourceIdentifier: exact printed identifier | null,
  title: exact source title | null,
  sequenceIndex: non-negative source-order integer,
  startPageId?: UUID | null,
  endPageId?: UUID | null
}
```

Nodes are parent-first. Missing labels and identifiers remain null. The importer
does not infer, normalize, renumber, or format them.

## ContentBlockInput

```text
{
  id: UUID,
  structuralNodeId: node UUID in this page payload | null,
  sequenceIndex: strictly increasing non-negative integer,
  blockType: "english" | "arabic" | "translation" | "heading" | "note" | future type,
  languageCode: string,
  direction: "ltr" | "rtl" | "auto",
  textContent: exact corrected canonical Unicode text,
  rawOcrText: original OCR string | null,
  ttsEligible: boolean,
  verificationStatus: "draft" | "in_review",
  provenanceNotes?: string | null
}
```

Arabic blocks require `blockType: "arabic"`, an Arabic language code,
`direction: "rtl"`, and actual Unicode Arabic script in `textContent`.
`rawOcrText` and `textContent` are never merged: corrections remain explicit and
traceable by comparing the two fields.

## Page validation gate

Before any database call, and again inside the database transaction, the import
requires:

1. Exact printed page label when shown (otherwise explicit null) and separate PDF page number.
2. Explicit source sequence.
3. A non-empty complete block list in strictly increasing order.
4. English transcription when the scan declares visible English.
5. Unicode Arabic transcription with RTL/Arabic metadata when the scan declares Arabic.
6. Parent-first structural nodes and exact nullable source identifiers.
7. Human assertions that block order and identifiers were checked.
8. `draft` or `in_review` status only.
9. No existing structured blocks for the target page.
10. Matching book, edition, PDF, import batch, page, and structural-node ownership.

Automated validation cannot decide whether every glyph was transcribed correctly.
`reviewEvidence` records the required human assertion, while verification remains
non-final until a later scan-comparison workflow marks it verified.

## Atomicity

Edition, source-document, and batch metadata are prepared first. Each page is
then sent to `import_structured_page_v1`. PostgreSQL executes the page metadata
update, structural-node inserts, and every content-block insert in one function
transaction. Any exception rolls back all changes for that page, leaving it on
the legacy reader path. Successfully imported earlier pages are not rolled back
if a later page fails; the batch is marked rejected for investigation.
