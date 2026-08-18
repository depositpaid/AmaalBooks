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

export async function fetchPages(bookId: string): Promise<Page[]> {
  return fetchAllRows<Page>((from, to) =>
    supabase
      .from('pages')
      .select('*')
      .eq('book_id', bookId)
      .order('page_number', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
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
 * Fetches a complete book for reading without changing the legacy reader.
 *
 * A page is structured only when at least one stored content_blocks row points
 * to it. Structured rows and source identifiers are returned exactly as stored.
 * Pages without blocks fall back to one untouched legacy block, which keeps
 * partially migrated books complete during a gradual, page-by-page migration.
 */
export async function fetchReaderPages(bookId: string): Promise<ReaderPage[]> {
  const contentBlocks = await fetchAllRows<ContentBlock>((from, to) =>
    supabase
      .from('content_blocks')
      .select('*')
      .eq('book_id', bookId)
      .order('page_id', { ascending: true })
      .order('sequence_index', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  // No structured rows means a pure legacy read. Avoid querying structural
  // metadata that cannot be referenced in this mode.
  if (contentBlocks.length === 0) {
    const legacyPages = await fetchPages(bookId);
    return legacyPages.map((page) => ({
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
      verificationStatus: toReaderVerificationStatus(page.verification_status),
      isStructured: false,
      structuralNodes: [],
      blocks: [toLegacyReaderBlock(page)],
    }));
  }

  const [pages, structuralNodes] = await Promise.all([
    fetchPages(bookId),
    fetchAllRows<StructuralNode>((from, to) =>
      supabase
        .from('structural_nodes')
        .select('*')
        .eq('book_id', bookId)
        .order('sequence_index', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

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

export async function addPage(bookId: string, pageNumber: number, content: string, chapterTitle: string | null = null): Promise<Page> {
  const { data, error } = await supabase
    .from('pages')
    .insert({ book_id: bookId, page_number: pageNumber, content, chapter_title: chapterTitle })
    .select()
    .single();
  if (error) throw error;
  return data;
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
  note?: string
): Promise<Bookmark> {
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({ book_id: bookId, page_number: pageNumber, note: note || null })
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
  scrollOffset: number = 0
): Promise<void> {
  const { error } = await supabase.from('reading_progress').upsert(
    {
      book_id: bookId,
      current_page: currentPage,
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
      .order('page_number', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

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
      .order('page_number', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PaginatedResponse<SearchRow>>
  );

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
