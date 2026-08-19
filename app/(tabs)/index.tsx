import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  Image,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Book as BookIcon, BookOpen } from 'lucide-react-native';
import { AppColors, AppFonts, AppSpacing, AppRadius } from '@/lib/theme';
import { fetchBooks, fetchReadingProgress } from '@/lib/database';
import type { Book, ReadingProgress } from '@/types';

const FAZAIL_AMAAL_BOOK_ID = '3cbdc749-e9c9-44f3-8330-ecc1e3b38cc8';
const VIRTUES_OF_SALAAT_PART_ID = '59d7f112-fb58-4726-9c35-11485c6155e7';

export default function LibraryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listWidth = Math.min(width, 760);
  const cardWidth = (listWidth - AppSpacing.md * 3) / 2;
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgress | null>>({});

  const loadBooks = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchBooks();
      setBooks(data);

      const progressEntries = await Promise.all(
        data.map(async (book) => {
          const progress = await fetchReadingProgress(book.id);
          return [book.id, progress] as [string, ReadingProgress | null];
        })
      );
      const map: Record<string, ReadingProgress | null> = {};
      progressEntries.forEach(([id, p]) => {
        map[id] = p;
      });
      setProgressMap(map);
    } catch (e: any) {
      setError(e.message || 'Failed to load books');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBooks();
  };

  const openBook = (bookId: string) => {
    router.push({
      pathname: `/reader/${bookId}`,
      params:
        bookId === FAZAIL_AMAAL_BOOK_ID
          ? { bookPartId: VIRTUES_OF_SALAAT_PART_ID }
          : {},
    });
  };

  const renderBook = ({ item }: { item: Book }) => {
    const progress = progressMap[item.id];
    const progressPercent =
      progress && item.total_pages > 0
        ? Math.round((progress.current_page / item.total_pages) * 100)
        : 0;

    return (
      <TouchableOpacity
        style={[styles.bookCard, { width: cardWidth }]}
        activeOpacity={0.8}
        onPress={() => openBook(item.id)}
      >
        <View style={styles.coverContainer}>
          {item.cover_url ? (
            <Image source={{ uri: item.cover_url }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: item.color_accent || AppColors.primary }]}>
              <BookIcon size={30} color={AppColors.white} strokeWidth={1.5} />
              <Text style={styles.coverTitle} numberOfLines={3}>
                {item.title}
              </Text>
            </View>
          )}
          {progressPercent > 0 && (
            <View style={styles.progressBadge}>
              <Text style={styles.progressText}>{progressPercent}%</Text>
            </View>
          )}
        </View>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.author ? (
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {item.author}
          </Text>
        ) : null}
        <Text style={styles.bookPages}>{item.total_pages} pages</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>Loading your library...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadBooks}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (books.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <BookOpen size={64} color={AppColors.textMuted} strokeWidth={1} />
        <Text style={styles.emptyTitle}>No books yet</Text>
        <Text style={styles.emptyText}>
          Send me the PDFs for your books and I'll add them to your library.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Books</Text>
        <Text style={styles.headerSubtitle}>
          {books.length} {books.length === 1 ? 'book' : 'books'} in your library
        </Text>
      </View>
      <FlatList
        data={books}
        renderItem={renderBook}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={AppColors.primary}
            colors={[AppColors.primary]}
          />
        }
      />
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
    paddingTop: Platform.OS === 'web' ? 24 : 56,
    paddingBottom: AppSpacing.md,
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
  list: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: AppSpacing.md,
    paddingBottom: AppSpacing.xxl,
  },
  row: {
    gap: AppSpacing.md,
    marginBottom: AppSpacing.md,
  },
  bookCard: {
    flexShrink: 0,
  },
  coverContainer: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: AppRadius.md,
    overflow: 'hidden',
    marginBottom: 6,
    position: 'relative',
    backgroundColor: AppColors.surface,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: AppRadius.md,
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.md,
    gap: AppSpacing.sm,
  },
  coverTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 14,
    color: AppColors.white,
    textAlign: 'center',
    lineHeight: 18,
  },
  progressBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: AppRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  progressText: {
    fontFamily: AppFonts.sansBold,
    fontSize: 11,
    color: AppColors.primaryLight,
  },
  bookTitle: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 14,
    color: AppColors.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  bookAuthor: {
    fontFamily: AppFonts.sans,
    fontSize: 12,
    color: AppColors.textSecondary,
    marginBottom: 2,
  },
  bookPages: {
    fontFamily: AppFonts.sans,
    fontSize: 11,
    color: AppColors.textMuted,
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
  errorText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    backgroundColor: AppColors.primary,
    borderRadius: AppRadius.md,
  },
  retryText: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 14,
    color: AppColors.white,
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
});
