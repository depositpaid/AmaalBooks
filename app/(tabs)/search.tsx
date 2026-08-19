import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Search,
  Mic,
  X,
  BookOpen,
  ChevronRight,
  Square,
} from 'lucide-react-native';
import { AppColors, AppFonts, AppSpacing, AppRadius } from '@/lib/theme';
import { searchInAllBooks } from '@/lib/database';
import { speechRecognition } from '@/lib/stt';
import type { Book, Page } from '@/types';

interface SearchResultItem {
  page: Page;
  book: Book;
  snippet: string;
  matchIndex: number;
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await searchInAllBooks(searchQuery.trim());
      setResults(data);
      setHasSearched(true);
    } catch (e: any) {
      setError(e.message || 'Search failed');
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTextChange = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      performSearch(text);
    }, 400);
  };

  const handleVoiceSearch = () => {
    if (!speechRecognition.isSupported()) {
      setError('Voice search is not supported in this browser. Try Chrome or Safari.');
      return;
    }

    if (isListening) {
      speechRecognition.stop();
      setIsListening(false);
      return;
    }

    setError(null);
    setQuery('');
    setIsListening(true);

    speechRecognition.start({
      onResult: ({ transcript, isFinal }) => {
        setQuery(transcript);
        if (isFinal) {
          setIsListening(false);
          performSearch(transcript);
        }
      },
      onError: (err) => {
        setIsListening(false);
        if (err !== 'no-speech' && err !== 'aborted') {
          setError(`Voice search error: ${err}`);
        }
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setError(null);
    inputRef.current?.focus();
  };

  const openResult = (item: SearchResultItem) => {
    router.push({
      pathname: `/reader/${item.book.id}`,
      params: {
        page: String(item.page.page_number),
        pageId: item.page.id,
        ...(item.page.book_part_id ? { bookPartId: item.page.book_part_id } : {}),
        highlight: query,
      },
    });
  };

  useEffect(() => {
    return () => {
      speechRecognition.stop();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const highlightMatch = (snippet: string, searchQuery: string) => {
    if (!searchQuery.trim()) return snippet;
    const lowerSnippet = snippet.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const index = lowerSnippet.indexOf(lowerQuery);
    if (index === -1) return snippet;

    const before = snippet.substring(0, index);
    const match = snippet.substring(index, index + searchQuery.length);
    const after = snippet.substring(index + searchQuery.length);

    return (
      <Text style={styles.snippetText}>
        {before}
        <Text style={styles.highlightedText}>{match}</Text>
        {after}
      </Text>
    );
  };

  const renderResult = ({ item }: { item: SearchResultItem }) => (
    <TouchableOpacity
      style={styles.resultCard}
      activeOpacity={0.7}
      onPress={() => openResult(item)}
    >
      <View style={styles.resultLeft}>
        <View style={[styles.bookDot, { backgroundColor: item.book.color_accent || AppColors.primary }]} />
        <View style={styles.resultInfo}>
          <Text style={styles.resultBookTitle} numberOfLines={1}>
            {item.book.title}
          </Text>
          <Text style={styles.resultPage}>
            Page {item.page.printed_page_label || item.page.page_number}
          </Text>
          {highlightMatch(item.snippet, query)}
        </View>
      </View>
      <ChevronRight size={18} color={AppColors.textMuted} strokeWidth={2} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
        <Text style={styles.headerSubtitle}>Find by typing or speaking</Text>
      </View>

      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color={AppColors.textMuted} strokeWidth={2} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search across all books..."
            placeholderTextColor={AppColors.textMuted}
            value={query}
            onChangeText={handleTextChange}
            returnKeyType="search"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              performSearch(query);
            }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={AppColors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.micButton, isListening && styles.micButtonActive]}
          onPress={handleVoiceSearch}
          activeOpacity={0.7}
        >
          {isListening ? (
            <Square size={20} color={AppColors.white} strokeWidth={2} fill={AppColors.white} />
          ) : (
            <Mic size={22} color={AppColors.white} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      {isListening && (
        <View style={styles.listeningIndicator}>
          <View style={styles.pulseDot} />
          <Text style={styles.listeningText}>Listening... speak now</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.resultsContainer}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item) => item.page.id}
          contentContainerStyle={styles.resultsList}
        />
      ) : hasSearched && !loading ? (
        <View style={styles.resultsContainer}>
          <BookOpen size={56} color={AppColors.textMuted} strokeWidth={1} />
          <Text style={styles.noResultsTitle}>No results found</Text>
          <Text style={styles.noResultsText}>
            Try different keywords or check spelling
          </Text>
        </View>
      ) : !isListening ? (
        <View style={styles.resultsContainer}>
          <Mic size={56} color={AppColors.textMuted} strokeWidth={1} />
          <Text style={styles.hintTitle}>Search your books</Text>
          <Text style={styles.hintText}>
            Type a word or phrase, or tap the microphone to speak your search
          </Text>
        </View>
      ) : null}
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
    paddingTop: 56,
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
  searchBarContainer: {
    flexDirection: 'row',
    paddingHorizontal: AppSpacing.lg,
    gap: AppSpacing.sm,
    marginBottom: AppSpacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: AppRadius.md,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    gap: AppSpacing.sm,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: AppFonts.sans,
    fontSize: 15,
    color: AppColors.text,
    padding: 0,
    outlineWidth: 0,
  },
  micButton: {
    width: 50,
    height: 50,
    borderRadius: AppRadius.md,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: AppColors.error,
  },
  listeningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: AppSpacing.lg,
    gap: AppSpacing.sm,
    marginBottom: AppSpacing.md,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppColors.error,
  },
  listeningText: {
    fontFamily: AppFonts.sans,
    fontSize: 13,
    color: AppColors.error,
  },
  errorContainer: {
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
  },
  errorText: {
    fontFamily: AppFonts.sans,
    fontSize: 13,
    color: AppColors.error,
  },
  resultsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.xl,
    gap: AppSpacing.sm,
  },
  resultsList: {
    paddingHorizontal: AppSpacing.lg,
    paddingBottom: AppSpacing.xxl,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppColors.surface,
    borderRadius: AppRadius.md,
    padding: AppSpacing.md,
    marginBottom: AppSpacing.sm,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: AppSpacing.sm,
  },
  bookDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultBookTitle: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 14,
    color: AppColors.text,
  },
  resultPage: {
    fontFamily: AppFonts.sans,
    fontSize: 12,
    color: AppColors.primaryLight,
  },
  snippetText: {
    fontFamily: AppFonts.serif,
    fontSize: 13,
    color: AppColors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  highlightedText: {
    backgroundColor: 'rgba(196, 30, 58, 0.25)',
    color: AppColors.primaryLight,
    fontWeight: '700' as any,
  },
  loadingText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.textSecondary,
    marginTop: AppSpacing.sm,
  },
  noResultsTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 20,
    color: AppColors.text,
  },
  noResultsText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },
  hintTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 20,
    color: AppColors.text,
  },
  hintText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
