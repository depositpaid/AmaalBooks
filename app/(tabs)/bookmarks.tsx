import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bookmark,
  BookmarkCheck,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  Star,
  X,
} from 'lucide-react-native';
import { AppColors, AppFonts, AppSpacing, AppRadius } from '@/lib/theme';
import { removeBookmark } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import type { Bookmark as BookmarkType, Book, Page } from '@/types';

interface BookmarkWithBook extends BookmarkType {
  book: Book;
  page: Pick<Page, 'id' | 'printed_page_label' | 'book_part_id'> | null;
}

type SortMode = 'recent' | 'book';
type SavedType = 'favorite' | 'reading_mark';

interface BookmarkExportItem {
  bookTitle: string;
  pageNumber: number;
  note: string | null;
  createdAt: string;
}

export default function BookmarksScreen() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<BookmarkWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [savedType, setSavedType] = useState<SavedType>('favorite');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInputRef = useRef<{ click: () => void } | null>(null);

  const loadBookmarks = useCallback(async () => {
    try {
      setError(null);
      const { data, error: queryError } = await supabase
        .from('bookmarks')
        .select('*, book:books(*), page:pages(id, printed_page_label, book_part_id)')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setBookmarks((data || []) as unknown as BookmarkWithBook[]);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load bookmarks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBookmarks();
  };

  const handleDelete = async (bookmarkId: string) => {
    setRemovingId(bookmarkId);
    setError(null);
    try {
      await removeBookmark(bookmarkId);
      setBookmarks((current) => current.filter((bookmark) => bookmark.id !== bookmarkId));
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove bookmark');
    } finally {
      setRemovingId(null);
    }
  };

  const openBook = (
    bookId: string,
    pageNumber: number,
    pageId?: string | null,
    bookPartId?: string | null
  ) => {
    router.push({
      pathname: `/reader/${bookId}`,
      params: {
        page: String(pageNumber),
        ...(pageId ? { pageId } : {}),
        ...(bookPartId ? { bookPartId } : {}),
      },
    });
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const typedBookmarks = bookmarks.filter((bookmark) => {
    const kind = bookmark.note?.split('|')[0];
    return savedType === 'reading_mark' ? kind === 'reading_mark' : kind !== 'reading_mark';
  });
  const sortedBookmarks = [...typedBookmarks].sort((first, second) => {
    if (sortMode === 'book') {
      return first.book.title.localeCompare(second.book.title) || first.page_number - second.page_number;
    }
    return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
  });

  const exportBookmarks = () => {
    if (Platform.OS !== 'web') {
      setError('Export is available in the web version of the app.');
      return;
    }

    const exportData: BookmarkExportItem[] = bookmarks.map((bookmark) => ({
      bookTitle: bookmark.book.title,
      pageNumber: bookmark.page_number,
      note: bookmark.note,
      createdAt: bookmark.created_at,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'my-books-bookmarks.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBookmarks = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as BookmarkExportItem[];
      if (!Array.isArray(imported)) throw new Error('The selected file is not a bookmark export.');

      const { data: books, error: booksError } = await supabase.from('books').select('*');
      if (booksError) throw booksError;
      const bookByTitle = new Map((books || []).map((book) => [book.title, book as Book]));
      const existingKeys = new Set(bookmarks.map((bookmark) => `${bookmark.book_id}:${bookmark.page_number}`));
      const rows = imported
        .filter((item) => item && typeof item.bookTitle === 'string' && Number.isInteger(item.pageNumber))
        .map((item) => {
          const book = bookByTitle.get(item.bookTitle);
          return book ? { book, item } : null;
        })
        .filter((entry): entry is { book: Book; item: BookmarkExportItem } => entry !== null)
        .filter(({ book, item }) => !existingKeys.has(`${book.id}:${item.pageNumber}`))
        .map(({ book, item }) => ({
          book_id: book.id,
          page_number: item.pageNumber,
          note: item.note || null,
          created_at: item.createdAt || new Date().toISOString(),
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('bookmarks').insert(rows);
        if (insertError) throw insertError;
      }
      await loadBookmarks();
      if (rows.length === 0 && imported.length > 0) {
        setError('No new bookmarks matched the books in your library.');
      }
    } catch (importError: unknown) {
      setError(importError instanceof Error ? importError.message : 'Could not import bookmarks');
    } finally {
      setImporting(false);
    }
  };

  const renderBookmark = ({ item }: { item: BookmarkWithBook }) => (
    <View style={styles.bookmarkCard}>
      <TouchableOpacity
        style={styles.bookmarkMain}
        activeOpacity={0.75}
        onPress={() =>
          openBook(item.book_id, item.page_number, item.page_id, item.page?.book_part_id)
        }
      >
        <View style={styles.iconColumn}>
          <View style={[styles.bookmarkIcon, { backgroundColor: item.book.color_accent || AppColors.primary }]}>
            <BookmarkCheck size={20} color={AppColors.white} strokeWidth={2.2} fill={AppColors.white} />
          </View>
          <View style={[styles.verticalLine, { backgroundColor: item.book.color_accent || AppColors.primary }]} />
        </View>
        <View style={styles.bookmarkInfo}>
          {(() => {
            const parts = item.note?.split('|') || [];
            const partName = parts.length >= 4 ? parts[1] : item.book.title.toUpperCase();
            const preview = parts.length >= 4 ? parts.slice(3).join('|') : (item.note || item.book.title);
            return <>
              <Text style={styles.bookmarkTitle} numberOfLines={1}>{partName} · Page {item.page?.printed_page_label || item.page_number}</Text>
              <Text style={styles.bookmarkMeta} numberOfLines={2}>{preview}</Text>
            </>;
          })()}
          <Text style={styles.bookmarkDate}>
            {formatTime(item.created_at)} · {formatDate(item.created_at)}
          </Text>
        </View>
        <ChevronRight size={20} color={AppColors.textMuted} strokeWidth={2} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleDelete(item.id)}
        disabled={removingId === item.id}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        {removingId === item.id ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <X size={17} color={AppColors.textMuted} strokeWidth={2} />
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>Loading bookmarks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.headerTitle}>Favorites & Reading Marks</Text>
            <Text style={styles.headerSubtitle}>
              {bookmarks.length} saved {bookmarks.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <Star size={24} color={AppColors.primaryLight} strokeWidth={1.8} />
          </View>
        </View>
        <View style={styles.typeTabs}>
          <TouchableOpacity style={[styles.typeTab, savedType === 'favorite' && styles.typeTabActive]} onPress={() => setSavedType('favorite')}><Text style={styles.typeTabText}>Favorites</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.typeTab, savedType === 'reading_mark' && styles.typeTabActive]} onPress={() => setSavedType('reading_mark')}><Text style={styles.typeTabText}>Reading Marks</Text></TouchableOpacity>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={exportBookmarks}>
            <Download size={17} color={AppColors.text} strokeWidth={2} />
            <Text style={styles.actionText}>Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Platform.OS === 'web' && fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color={AppColors.text} />
            ) : (
              <FileUp size={17} color={AppColors.text} strokeWidth={2} />
            )}
            <Text style={styles.actionText}>Import</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortMenu(true)}>
            <ChevronDown size={16} color={AppColors.textSecondary} strokeWidth={2} />
            <Text style={styles.sortText}>{sortMode === 'recent' ? 'Recent' : 'By book'}</Text>
          </TouchableOpacity>
        </View>
        {Platform.OS === 'web' &&
          React.createElement('input', {
            ref: fileInputRef,
            type: 'file',
            accept: 'application/json,.json',
            style: { display: 'none' },
            onChange: (event: { target: { files?: FileList; value?: string } }) => {
              const file = event.target.files?.[0];
              if (file) importBookmarks(file);
              if (event.target.value !== undefined) event.target.value = '';
            },
          })}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <X size={16} color={AppColors.error} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      {sortedBookmarks.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <BookOpen size={42} color={AppColors.primaryLight} strokeWidth={1.4} />
          </View>
          <Text style={styles.emptyTitle}>No {savedType === 'favorite' ? 'favorites' : 'reading marks'} yet</Text>
          <Text style={styles.emptyText}>
            Long-press text in the reader to save it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedBookmarks}
          renderItem={renderBookmark}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={AppColors.primary}
              colors={[AppColors.primary]}
            />
          }
        />
      )}

      <Modal visible={showSortMenu} transparent animationType="fade">
        <Pressable style={styles.sortOverlay} onPress={() => setShowSortMenu(false)}>
          <View style={styles.sortMenu}>
            <Text style={styles.sortMenuTitle}>Sort bookmarks</Text>
            <TouchableOpacity
              style={styles.sortOption}
              onPress={() => {
                setSortMode('recent');
                setShowSortMenu(false);
              }}
            >
              <Text style={styles.sortOptionText}>Most recent first</Text>
              {sortMode === 'recent' && <BookmarkCheck size={18} color={AppColors.primary} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sortOption}
              onPress={() => {
                setSortMode('book');
                setShowSortMenu(false);
              }}
            >
              <Text style={styles.sortOptionText}>Group by book</Text>
              {sortMode === 'book' && <BookmarkCheck size={18} color={AppColors.primary} />}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  header: {
    paddingHorizontal: AppSpacing.lg,
    paddingTop: Platform.OS === 'web' ? 28 : 56,
    paddingBottom: AppSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 34,
    color: AppColors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.textSecondary,
  },
  typeTabs: { flexDirection: 'row', gap: AppSpacing.sm, marginTop: AppSpacing.md },
  typeTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: AppRadius.md, backgroundColor: AppColors.surface },
  typeTabActive: { backgroundColor: AppColors.primary },
  typeTabText: { color: AppColors.text, fontFamily: AppFonts.sansMedium, fontSize: 13 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: AppColors.red[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: 10,
    borderRadius: AppRadius.md,
    backgroundColor: AppColors.surfaceLight,
    borderWidth: 1,
    borderColor: AppColors.borderLight,
  },
  actionText: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
    color: AppColors.text,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
    paddingVertical: 10,
    paddingLeft: AppSpacing.sm,
  },
  sortText: {
    fontFamily: AppFonts.sans,
    fontSize: 13,
    color: AppColors.textSecondary,
  },
  list: {
    padding: AppSpacing.lg,
    paddingBottom: AppSpacing.xxl,
  },
  bookmarkCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: AppColors.white,
    minHeight: 112,
    marginBottom: AppSpacing.sm,
    borderRadius: AppRadius.sm,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  bookmarkMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: AppSpacing.md,
    gap: AppSpacing.md,
  },
  iconColumn: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  bookmarkIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    marginTop: 6,
    opacity: 0.8,
  },
  bookmarkInfo: {
    flex: 1,
    gap: 4,
  },
  bookmarkTitle: {
    fontFamily: AppFonts.sansBold,
    fontSize: 17,
    color: AppColors.black[900],
    lineHeight: 22,
  },
  bookmarkMeta: {
    fontFamily: AppFonts.sans,
    fontSize: 13,
    color: AppColors.black[300],
  },
  bookmarkDate: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 12,
    color: '#2A729C',
    marginTop: 2,
  },
  removeButton: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: AppSpacing.lg,
    marginTop: AppSpacing.md,
    padding: AppSpacing.md,
    borderRadius: AppRadius.md,
    backgroundColor: AppColors.red[900],
  },
  errorText: {
    flex: 1,
    fontFamily: AppFonts.sans,
    fontSize: 13,
    color: AppColors.red[100],
    marginRight: AppSpacing.sm,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: AppColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.md,
  },
  loadingText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.textSecondary,
    marginTop: AppSpacing.sm,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: AppColors.red[900],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 22,
    color: AppColors.text,
  },
  emptyText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sortOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'web' ? 140 : 190,
    paddingRight: AppSpacing.lg,
  },
  sortMenu: {
    width: 210,
    padding: AppSpacing.sm,
    borderRadius: AppRadius.md,
    backgroundColor: AppColors.surfaceElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  sortMenuTitle: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 12,
    color: AppColors.textMuted,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.sm,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: AppSpacing.md,
    borderRadius: AppRadius.sm,
  },
  sortOptionText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.text,
  },
});
