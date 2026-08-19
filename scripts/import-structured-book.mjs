#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertValidStructuredImport } from './structured-import-validation.mjs';

function usage() {
  console.error('Usage: node scripts/import-structured-book.mjs <manifest.json> [--validate-only]');
}

const manifestArgument = process.argv[2];
const validateOnly = process.argv.includes('--validate-only');
if (!manifestArgument) {
  usage();
  process.exitCode = 1;
} else {
  const manifestPath = resolve(process.cwd(), manifestArgument);
  const manifest = assertValidStructuredImport(
    JSON.parse(await readFile(manifestPath, 'utf8'))
  );

  console.log(`Validated ${manifest.pages.length} complete page(s) from ${manifestPath}`);

  if (!validateOnly) {
    if (manifest.datasetKind === 'demo') {
      throw new Error('Demo fixtures are validation-only and cannot be imported');
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for import');
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const editionRow = {
      id: manifest.edition.id,
      book_id: manifest.bookId,
      edition_label: manifest.edition.editionLabel,
      publisher: manifest.edition.publisher ?? null,
      publication_label: manifest.edition.publicationLabel ?? null,
      isbn: manifest.edition.isbn ?? null,
      language_code: manifest.edition.languageCode ?? null,
      notes: manifest.edition.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error: editionError } = await supabase.from('book_editions').upsert(editionRow);
    if (editionError) throw editionError;

    const sourceRow = {
      id: manifest.sourceDocument.id,
      edition_id: manifest.edition.id,
      document_type: 'pdf',
      original_filename: manifest.sourceDocument.originalFilename,
      storage_path: manifest.sourceDocument.storagePath ?? null,
      sha256_checksum: manifest.sourceDocument.sha256Checksum ?? null,
      pdf_page_count: manifest.sourceDocument.pdfPageCount ?? null,
      notes: manifest.sourceDocument.notes ?? null,
    };
    const { error: sourceError } = await supabase.from('source_documents').upsert(sourceRow);
    if (sourceError) throw sourceError;

    const batchRow = {
      id: manifest.importBatch.id,
      book_id: manifest.bookId,
      edition_id: manifest.edition.id,
      source_document_id: manifest.sourceDocument.id,
      status: 'pending',
      imported_by: manifest.importBatch.importedBy ?? null,
      notes: manifest.importBatch.notes ?? null,
      metadata: {
        schemaVersion: manifest.schemaVersion,
        datasetKind: manifest.datasetKind,
        manifestPath,
      },
      updated_at: new Date().toISOString(),
    };
    const { error: batchError } = await supabase.from('import_batches').upsert(batchRow);
    if (batchError) throw batchError;

    try {
      for (const page of manifest.pages) {
        const insertNewPage = manifest.pageWriteMode === 'insert';
        const rpcName = insertNewPage
          ? 'import_new_structured_page_v1'
          : 'import_structured_page_v1';
        const rpcArguments = {
          p_book_id: manifest.bookId,
          p_edition_id: manifest.edition.id,
          p_source_document_id: manifest.sourceDocument.id,
          p_import_batch_id: manifest.importBatch.id,
          p_page: page,
        };
        if (insertNewPage) rpcArguments.p_book_part_id = manifest.bookPartId;

        const { error } = await supabase.rpc(rpcName, rpcArguments);
        if (error) throw new Error(`Page ${page.pageId} failed atomically: ${error.message}`);
        console.log(`Imported page ${page.pageId} (PDF page ${page.pdfPageNumber})`);
      }

      const { error } = await supabase
        .from('import_batches')
        .update({ status: 'imported', completed_at: new Date().toISOString() })
        .eq('id', manifest.importBatch.id);
      if (error) throw error;
    } catch (error) {
      await supabase
        .from('import_batches')
        .update({ status: 'rejected', completed_at: new Date().toISOString() })
        .eq('id', manifest.importBatch.id);
      throw error;
    }
  }
}
