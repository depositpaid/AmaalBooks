import { supabase } from './supabase';
import type { Book, Page, Bookmark, ReadingProgress } from '@/types';

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
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('book_id', bookId)
    .order('page_number', { ascending: true });
  if (error) throw error;
  return data || [];
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
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('book_id', bookId)
    .ilike('content', `%${query}%`)
    .order('page_number', { ascending: true });
  if (error) throw error;

  return (data || []).map((page) => {
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
  const { data, error } = await supabase
    .from('pages')
    .select('*, book:books(*)')
    .ilike('content', `%${query}%`)
    .order('page_number', { ascending: true });
  if (error) throw error;

  return (data || []).map((row) => {
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
