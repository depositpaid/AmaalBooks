import { supabase } from './supabase';
import type {
  Book,
  Page,
  Bookmark,
  ReadingProgress,
  ContentBlock,
  StructuralNode,
  ReaderBlock,
  ReaderPage,
  ReaderStructuralMetadata,
  ReaderVerificationStatus,
  BookPart,
} from '@/types';

// Keep each request well below Supabase's commonly configured 1,000-row limit.
// Pagination stops only after a short page, so larger books are never silently
// truncated by the API's per-request cap.
const DATABASE_PAGE_SIZE = 500;

type PaginatedResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function fetchAllRows<T>(
  fetchRange: (from: number, to: number) => PromiseLike<PaginatedResponse<T>>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await fetchRange(from, from + DATABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < DATABASE_PAGE_SIZE) break;
  }

  return rows;
}

export async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchBook(bookId: string): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Returns a publication's authoritative internal parts in stored source order.
 * Legacy books simply return an empty array; no title or chapter inference is
 * performed.
 */
export async function fetchBookParts(bookId: string): Promise<BookPart[]> {
  return fetchAllRows<BookPart>((from, to) =>
    supabase
      .from('book_parts')
      .select('*')
      .eq('book_id', bookId)
      .order('sequence_index', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
}

/**
 * Part-scoped page access for the future Book -> Parts -> Pages navigation.
 * Existing fetchPages/fetchReaderPages behavior remains unchanged.
 */
export async function fetchPagesForBookPart(
  bookId: string,
  bookPartId: string
): Promise<Page[]> {
  return fetchAllRows<Page>((from, to) =>
    supabase
      .from('pages')
      .select('*')
      .eq('book_id', bookId)
      .eq('book_part_id', bookPartId)
      .order('sequence_index', { ascending: true, nullsFirst: false })
      .order('pdf_page_number', { ascending: true, nullsFirst: false })
      .order('page_number', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
}

export async function fetchPages(bookId: string): Promise<Page[]> {
  const [pages, parts] = await Promise.all([
    fetchAllRows<Page>((from, to) =>
      supabase
        .from('pages')
        .select('*')
        .eq('book_id', bookId)
        // Stable server ordering is required for safe pagination. Reader order
        // is applied after every row has been fetched.
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchBookParts(bookId),
  ]);

  const partSequence = new Map(parts.map((part) => [part.id, part.sequence_index]));
  return pages.sort((first, second) => comparePagesForReading(first, second, partSequence));
}

function compareNullableNumbers(first: number | null | undefined, second: number | null | undefined) {
  if (first == null && second == null) return 0;
  if (first == null) return 1;
  if (second == null) return -1;
  return first - second;
}

function comparePagesForReading(
  first: Page,
  second: Page,
  partSequence: ReadonlyMap<string, number> = new Map()
): number {
  // PDF position is authoritative for structured pages. Legacy rows have no
  // source metadata, so their compatibility page_number remains the fallback.
  const sourceOrder =
    (first.pdf_page_number ?? first.page_number) -
    (second.pdf_page_number ?? second.page_number);
  if (sourceOrder !== 0) return sourceOrder;

  const partOrder = compareNullableNumbers(
    first.book_part_id ? partSequence.get(first.book_part_id) : null,
    second.book_part_id ? partSequence.get(second.book_part_id) : null
  );
  if (partOrder !== 0) return partOrder;

  const sequenceOrder = compareNullableNumbers(first.sequence_index, second.sequence_index);
  if (sequenceOrder !== 0) return sequenceOrder;
  if (first.page_number !== second.page_number) return first.page_number - second.page_number;
  return first.id.localeCompare(second.id);
}

function toReaderVerificationStatus(
  status: string | null | undefined
): ReaderVerificationStatus {
  if (
    status === 'draft' ||
    status === 'in_review' ||
    status === 'verified' ||
    status === 'rejected'
  ) {
    return status;
  }
  return 'legacy_unverified';
}

function toReaderStructuralMetadata(node: StructuralNode): ReaderStructuralMetadata {
  return {
    id: node.id,
    type: node.node_type,
    label: node.source_label,
    identifier: node.source_identifier,
    title: node.title,
    parentId: node.parent_id,
    sequenceIndex: node.sequence_index,
  };
}

function toStructuredReaderBlock(
  block: ContentBlock,
  structuralNode: StructuralNode | undefined
): ReaderBlock {
  return {
    id: block.id,
    type: block.block_type,
    language: block.language_code,
    direction: block.direction,
    text: block.text_content,
    sequenceIndex: block.sequence_index,
    structuralNodeId: block.structural_node_id,
    structuralType: structuralNode?.node_type ?? null,
    structuralLabel: structuralNode?.source_label ?? null,
    structuralIdentifier: structuralNode?.source_identifier ?? null,
    ttsEligible: block.tts_eligible,
    verificationStatus: block.verification_status,
  };
}

function toLegacyReaderBlock(page: Page): ReaderBlock {
  return {
    id: `legacy:${page.id}`,
    type: 'legacy',
    language: null,
    direction: 'auto',
    // Deliberately preserve the complete stored value. OCR cleanup and
    // structural inference do not belong in the data-access layer.
    text: page.content,
    sequenceIndex: 0,
    structuralNodeId: null,
    structuralType: null,
    structuralLabel: null,
    structuralIdentifier: null,
    ttsEligible: true,
    verificationStatus: toReaderVerificationStatus(page.verification_status),
  };
}

/**
 * Fetches a complete publication or one authoritative book part for reading.
 *
 * A page is structured only when at least one stored content_blocks row points
 * to it. Structured rows and source identifiers are returned exactly as stored.
 * Pages without blocks fall back to one untouched legacy block, which keeps
 * partially migrated books complete during a gradual, page-by-page migration.
 * When bookPartId is supplied, both pages and blocks are restricted to that
 * permanent part identity; compatibility page numbers are never used as scope.
 */
export async function fetchReaderPages(
  bookId: string,
  bookPartId?: string
): Promise<ReaderPage[]> {
  const pages = bookPartId
    ? await fetchPagesForBookPart(bookId, bookPartId)
    : await fetchPages(bookId);
  const pageIds = pages.map((page) => page.id);

  // A part-scoped reader must never pull blocks from legacy publication rows
  // that happen to share the same compatibility page number.
  const contentBlocks = pageIds.length === 0
    ? []
    : await fetchAllRows<ContentBlock>((from, to) =>
        supabase
          .from('content_blocks')
          .select('*')
          .eq('book_id', bookId)
          .in('page_id', pageIds)
          .order('page_id', { ascending: true })
          .order('sequence_index', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );

  // No structured rows means a pure legacy read. Avoid querying structural
  // metadata that cannot be referenced in this mode.
  if (contentBlocks.length === 0) {
    return pages.map((page) => ({
      id: page.id,
      bookId: page.book_id,
      legacyPageNumber: page.page_number,
      legacyChapterTitle: page.chapter_title,
      printedPageLabel: page.printed_page_label ?? null,
      printedPageNumber: page.printed_page_number ?? null,
      pdfPageNumber: page.pdf_page_number ?? null,
      sequenceIndex: page.sequence_index ?? null,
      editionId: page.edition_id ?? null,
      sourceDocumentId: page.source_document_id ?? null,
      bookPartId: page.book_part_id ?? null,
      verificationStatus: toReaderVerificationStatus(page.verification_status),
      isStructured: false,
      structuralNodes: [],
      blocks: [toLegacyReaderBlock(page)],
    }));
  }

  const structuralNodes = await fetchAllRows<StructuralNode>((from, to) =>
    supabase
      .from('structural_nodes')
      .select('*')
      .eq('book_id', bookId)
      .order('sequence_index', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  const nodeById = new Map(structuralNodes.map((node) => [node.id, node]));
  const anchoredNodesByPageId = new Map<string, StructuralNode[]>();
  for (const node of structuralNodes) {
    for (const pageId of [node.start_page_id, node.end_page_id]) {
      if (!pageId) continue;
      const anchoredNodes = anchoredNodesByPageId.get(pageId) || [];
      if (!anchoredNodes.some((anchoredNode) => anchoredNode.id === node.id)) {
        anchoredNodes.push(node);
        anchoredNodesByPageId.set(pageId, anchoredNodes);
      }
    }
  }
  const blocksByPageId = new Map<string, ContentBlock[]>();
  for (const block of contentBlocks) {
    const pageBlocks = blocksByPageId.get(block.page_id) || [];
    pageBlocks.push(block);
    blocksByPageId.set(block.page_id, pageBlocks);
  }

  return pages.map((page) => {
    const pageBlocks = blocksByPageId.get(page.id) || [];
    const associatedNodes = new Map<string, StructuralNode>();

    // Include authoritative page anchors even when the node is not repeated on
    // every block (for example a chapter that starts on this page).
    for (const node of anchoredNodesByPageId.get(page.id) || []) {
      associatedNodes.set(node.id, node);
    }

    for (const block of pageBlocks) {
      if (!block.structural_node_id) continue;
      let node = nodeById.get(block.structural_node_id);
      const visited = new Set<string>();
      while (node && !visited.has(node.id)) {
        visited.add(node.id);
        associatedNodes.set(node.id, node);
        node = node.parent_id ? nodeById.get(node.parent_id) : undefined;
      }
    }

    return {
      id: page.id,
      bookId: page.book_id,
      legacyPageNumber: page.page_number,
      legacyChapterTitle: page.chapter_title,
      printedPageLabel: page.printed_page_label ?? null,
      printedPageNumber: page.printed_page_number ?? null,
      pdfPageNumber: page.pdf_page_number ?? null,
      sequenceIndex: page.sequence_index ?? null,
      editionId: page.edition_id ?? null,
      sourceDocumentId: page.source_document_id ?? null,
      bookPartId: page.book_part_id ?? null,
      verificationStatus: toReaderVerificationStatus(page.verification_status),
      isStructured: pageBlocks.length > 0,
      structuralNodes: [...associatedNodes.values()]
        .sort(
          (first, second) =>
            first.sequence_index - second.sequence_index ||
            first.id.localeCompare(second.id)
        )
        .map(toReaderStructuralMetadata),
      blocks:
        pageBlocks.length > 0
          ? pageBlocks.map((block) =>
              toStructuredReaderBlock(
                block,
                block.structural_node_id
                  ? nodeById.get(block.structural_node_id)
                  : undefined
              )
            )
          : [toLegacyReaderBlock(page)],
    };
  });
}

export async function updatePage(pageId: string, content: string, chapterTitle: string | null, pageNumber?: number): Promise<void> {
  const updates: { content: string; chapter_title: string | null; page_number?: number } = { content, chapter_title: chapterTitle };
  if (pageNumber !== undefined) updates.page_number = pageNumber;
  const { error } = await supabase
    .from('pages')
    .update(updates)
    .eq('id', pageId);
  if (error) throw error;
}

export async function updateBook(bookId: string, updates: { title?: string; author?: string | null; description?: string; color_accent?: string }): Promise<void> {
  const { error } = await supabase
    .from('books')
    .update(updates)
    .eq('id', bookId);
  if (error) throw error;
}

export async function deletePage(pageId: string): Promise<void> {
  const { error } = await supabase
    .from('pages')
    .delete()
    .eq('id', pageId);
  if (error) throw error;
}

export async function addPage(
  bookId: string,
  pageNumber: number,
  content: string,
  chapterTitle: string | null = null,
  bookPartId: string | null = null
): Promise<Page> {
  const { data, error } = await supabase
    .from('pages')
    .insert({
      book_id: bookId,
      book_part_id: bookPartId,
      page_number: pageNumber,
      content,
      chapter_title: chapterTitle,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchNextPageNumber(
  bookId: string,
  bookPartId: string | null = null
): Promise<number> {
  let query = supabase
    .from('pages')
    .select('page_number')
    .eq('book_id', bookId);

  query = bookPartId
    ? query.eq('book_part_id', bookPartId)
    : query.is('book_part_id', null);

  const { data, error } = await query
    .order('page_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? data.page_number + 1 : 1;
}

export async function fetchBookmarks(bookId?: string): Promise<Bookmark[]> {
  let query = supabase.from('bookmarks').select('*');
  if (bookId) {
    query = query.eq('book_id', bookId);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addBookmark(
  bookId: string,
  pageNumber: number,
  note?: string,
  pageId?: string | null
): Promise<Bookmark> {
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      book_id: bookId,
      page_number: pageNumber,
      page_id: pageId ?? null,
      note: note || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeBookmark(bookmarkId: string): Promise<void> {
  const { error } = await supabase.from('bookmarks').delete().eq('id', bookmarkId);
  if (error) throw error;
}

export async function fetchReadingProgress(
  bookId: string
): Promise<ReadingProgress | null> {
  const { data, error } = await supabase
    .from('reading_progress')
    .select('*')
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveReadingProgress(
  bookId: string,
  currentPage: number,
  scrollOffset: number = 0,
  pageId?: string | null
): Promise<void> {
  const { error } = await supabase.from('reading_progress').upsert(
    {
      book_id: bookId,
      current_page: currentPage,
      page_id: pageId ?? null,
      scroll_offset: scrollOffset,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'book_id' }
  );
  if (error) throw error;
}

export async function searchInBook(
  bookId: string,
  query: string
): Promise<{ page: Page; snippet: string; matchIndex: number }[]> {
  const data = await fetchAllRows<Page>((from, to) =>
    supabase
      .from('pages')
      .select('*')
      .eq('book_id', bookId)
      .ilike('content', `%${query}%`)
      .order('id', { ascending: true })
      .range(from, to)
  );

  data.sort((first, second) => comparePagesForReading(first, second));
  return data.map((page) => {
    const lowerContent = page.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);
    const start = Math.max(0, matchIndex - 40);
    const end = Math.min(page.content.length, matchIndex + query.length + 40);
    const snippet =
      (start > 0 ? '...' : '') +
      page.content.substring(start, end) +
      (end < page.content.length ? '...' : '');
    return { page, snippet, matchIndex };
  });
}

export async function searchInAllBooks(
  query: string
): Promise<{ page: Page; book: Book; snippet: string; matchIndex: number }[]> {
  type SearchRow = Page & { book: Book };
  const data = await fetchAllRows<SearchRow>((from, to) =>
    supabase
      .from('pages')
      .select('*, book:books(*)')
      .ilike('content', `%${query}%`)
      .order('book_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PaginatedResponse<SearchRow>>
  );

  data.sort((first, second) => {
    const bookOrder =
      first.book.sort_order - second.book.sort_order ||
      first.book.title.localeCompare(second.book.title) ||
      first.book.id.localeCompare(second.book.id);
    return bookOrder || comparePagesForReading(first, second);
  });

  return data.map((row) => {
    const page = row as unknown as Page;
    const book = (row as any).book as Book;
    const lowerContent = page.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);
    const start = Math.max(0, matchIndex - 40);
    const end = Math.min(page.content.length, matchIndex + query.length + 40);
    const snippet =
      (start > 0 ? '...' : '') +
      page.content.substring(start, end) +
      (end < page.content.length ? '...' : '');
    return { page, book, snippet, matchIndex };
  });
}
