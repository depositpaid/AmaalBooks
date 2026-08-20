import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, Check, ChevronDown, ChevronRight, Mic, Search, Square, X } from 'lucide-react-native';
import { AppColors, AppFonts, AppRadius, AppSpacing } from '@/lib/theme';
import { fetchSearchableBookParts, searchInBookPart, type SearchableBookPart } from '@/lib/database';
import { speechRecognition } from '@/lib/stt';
import type { Book, Page } from '@/types';

interface SearchResultItem { page: Page; book: Book; snippet: string; matchIndex: number }

export default function SearchScreen() {
  const router = useRouter();
  const { bookPartId: requestedBookPartId } = useLocalSearchParams<{ bookPartId?: string }>();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [scopes, setScopes] = useState<SearchableBookPart[]>([]);
  const [selectedScope, setSelectedScope] = useState<SearchableBookPart | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    fetchSearchableBookParts().then((available) => {
      setScopes(available);
      setSelectedScope((current) => current ?? available.find((scope) => scope.part.id === requestedBookPartId) ?? available[0] ?? null);
    }).catch((reason) => setError(reason.message || 'Could not load book choices'));
    return () => speechRecognition.stop();
  }, [requestedBookPartId]);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) { setResults([]); setHasSearched(false); return; }
    if (!selectedScope) { setError('Select a book or section before searching.'); return; }
    setLoading(true); setError(null);
    try {
      setResults(await searchInBookPart(selectedScope.book, selectedScope.part.id, trimmed));
      setHasSearched(true);
    } catch (reason: any) {
      setError(reason.message || 'Search failed'); setHasSearched(true);
    } finally { setLoading(false); }
  }, [selectedScope]);

  const handleVoiceSearch = () => {
    if (!selectedScope) { setError('Select a book or section before using voice search.'); return; }
    if (!speechRecognition.isSupported()) { setError('Voice search is not supported on this device or browser.'); return; }
    if (isListening) { speechRecognition.stop(); setIsListening(false); return; }
    setError(null); setIsListening(true);
    speechRecognition.start({
      onResult: ({ transcript, isFinal }) => {
        setQuery(transcript);
        if (isFinal) { setIsListening(false); performSearch(transcript); }
      },
      onError: (reason) => {
        setIsListening(false);
        if (reason !== 'no-speech' && reason !== 'aborted') setError(`Voice search error: ${reason}`);
      },
      onEnd: () => setIsListening(false),
    });
  };

  const scopeLabel = (scope: SearchableBookPart) => scope.part.display_title || scope.part.source_title || scope.book.title;
  const clearSearch = () => { setQuery(''); setResults([]); setHasSearched(false); setError(null); inputRef.current?.focus(); };
  const openResult = (item: SearchResultItem) => router.push({
    pathname: `/reader/${item.book.id}`,
    params: { page: String(item.page.page_number), pageId: item.page.id, bookPartId: selectedScope?.part.id ?? item.page.book_part_id, highlight: query },
  });
  const renderResult = ({ item }: { item: SearchResultItem }) => (
    <TouchableOpacity style={styles.resultCard} activeOpacity={0.75} onPress={() => openResult(item)}>
      <View style={styles.resultInfo}>
        <Text style={styles.resultBookTitle}>{selectedScope ? scopeLabel(selectedScope) : item.book.title}</Text>
        <Text style={styles.resultPage}>Page {item.page.printed_page_label || item.page.page_number}</Text>
        <Text style={styles.snippetText}>{item.snippet}</Text>
      </View><ChevronRight size={18} color={AppColors.textMuted} />
    </TouchableOpacity>
  );

  return <View style={styles.container}>
    <View style={styles.content}>
      <View style={styles.header}><Text style={styles.headerTitle}>Search</Text></View>
      <View style={styles.inputShell}>
        <TextInput ref={inputRef} style={styles.searchInput} placeholder="Type or speak a word or phrase" placeholderTextColor={AppColors.textMuted} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => performSearch(query)} />
        {query ? <TouchableOpacity style={styles.clearButton} onPress={clearSearch}><X size={19} color={AppColors.textMuted} /></TouchableOpacity> : null}
        <TouchableOpacity accessibilityLabel="Search by microphone" style={[styles.micButton, isListening && styles.micButtonActive]} onPress={handleVoiceSearch}>
          {isListening ? <Square size={20} color={AppColors.white} fill={AppColors.white} /> : <Mic size={23} color={AppColors.white} />}
        </TouchableOpacity>
      </View>
      {isListening ? <Text style={styles.listeningText}>Listening… speak now</Text> : null}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.selectorButton} onPress={() => setSelectorOpen(true)}><BookOpen size={18} color={AppColors.primaryLight} /><Text style={styles.selectorText} numberOfLines={1}>{selectedScope ? scopeLabel(selectedScope) : 'Select book or section'}</Text><ChevronDown size={18} color={AppColors.textMuted} /></TouchableOpacity>
        <TouchableOpacity style={styles.submitButton} onPress={() => { Keyboard.dismiss(); performSearch(query); }}><Search size={19} color={AppColors.white} /><Text style={styles.submitText}>Search</Text></TouchableOpacity>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {loading ? <View style={styles.emptyState}><ActivityIndicator size="large" color={AppColors.primary} /><Text style={styles.hintText}>Searching…</Text></View>
        : results.length ? <FlatList data={results} renderItem={renderResult} keyExtractor={(item) => item.page.id} contentContainerStyle={styles.resultsList} />
        : <View style={styles.emptyState}><BookOpen size={50} color={AppColors.textMuted} strokeWidth={1} /><Text style={styles.hintTitle}>{hasSearched ? 'No results found' : 'Search within one book'}</Text><Text style={styles.hintText}>{hasSearched ? 'Try a different word or phrase.' : 'Choose a book or section, then type or speak your search.'}</Text></View>}
    </View>
    <Modal transparent visible={selectorOpen} animationType="fade" onRequestClose={() => setSelectorOpen(false)}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectorOpen(false)}><View style={styles.selectorPanel} onStartShouldSetResponder={() => true}>
        <Text style={styles.selectorTitle}>Search in</Text><ScrollView>{scopes.map((scope) => {
          const selected = scope.part.id === selectedScope?.part.id;
          return <TouchableOpacity key={scope.part.id} style={[styles.scopeOption, selected && styles.scopeOptionSelected]} onPress={() => { setSelectedScope(scope); setSelectorOpen(false); setResults([]); setHasSearched(false); }}><View style={styles.scopeCopy}><Text style={styles.scopeTitle}>{scopeLabel(scope)}</Text><Text style={styles.scopeBook}>{scope.book.title}</Text></View>{selected ? <Check size={20} color={AppColors.primaryLight} /> : null}</TouchableOpacity>;
        })}</ScrollView>
      </View></TouchableOpacity>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.background }, content: { flex: 1, width: '100%', maxWidth: 920, alignSelf: 'center' },
  header: { paddingHorizontal: AppSpacing.lg, paddingTop: Platform.OS === 'web' ? 20 : 48, paddingBottom: AppSpacing.sm }, headerTitle: { fontFamily: AppFonts.serifBold, fontSize: 25, color: AppColors.text }, headerSubtitle: { fontFamily: AppFonts.sans, fontSize: 15, color: AppColors.textSecondary },
  inputShell: { height: 54, marginHorizontal: AppSpacing.lg, borderWidth: 1, borderColor: AppColors.border, borderRadius: 27, backgroundColor: AppColors.surface, paddingLeft: AppSpacing.md, paddingRight: 58, justifyContent: 'center' }, searchInput: { height: 52, fontFamily: AppFonts.sans, fontSize: 16, color: AppColors.text, outlineWidth: 0 }, clearButton: { position: 'absolute', right: 52, top: 13, padding: 4 }, micButton: { position: 'absolute', right: 5, top: 5, width: 42, height: 42, borderRadius: 21, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center' }, micButtonActive: { backgroundColor: AppColors.error }, listeningText: { marginHorizontal: AppSpacing.lg, marginTop: 8, color: AppColors.error, fontFamily: AppFonts.sansMedium },
  actionRow: { flexDirection: 'row', gap: AppSpacing.sm, paddingHorizontal: AppSpacing.lg, marginTop: AppSpacing.md }, selectorButton: { flex: 1, minWidth: 0, height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: AppSpacing.md, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 23 }, selectorText: { flex: 1, color: AppColors.text, fontFamily: AppFonts.sansMedium, fontSize: 14 }, submitButton: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, backgroundColor: AppColors.primary, borderRadius: 23 }, submitText: { color: AppColors.white, fontFamily: AppFonts.sansBold, fontSize: 13 },
  errorText: { marginHorizontal: AppSpacing.lg, marginTop: AppSpacing.sm, color: AppColors.error, fontFamily: AppFonts.sans }, resultsList: { padding: AppSpacing.lg, paddingBottom: AppSpacing.xxl }, resultCard: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, padding: AppSpacing.md, marginBottom: AppSpacing.sm, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: AppRadius.md }, resultInfo: { flex: 1 }, resultBookTitle: { color: AppColors.text, fontFamily: AppFonts.sansMedium, fontSize: 14 }, resultPage: { color: AppColors.primaryLight, fontFamily: AppFonts.sans, fontSize: 12, marginTop: 2 }, snippetText: { color: AppColors.textSecondary, fontFamily: AppFonts.serif, fontSize: 14, lineHeight: 20, marginTop: 7 },
  emptyState: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 6, padding: AppSpacing.lg }, hintTitle: { color: AppColors.text, fontFamily: AppFonts.serifBold, fontSize: 17 }, hintText: { maxWidth: 420, color: AppColors.textSecondary, fontFamily: AppFonts.sans, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: AppSpacing.lg, backgroundColor: 'rgba(0,0,0,0.72)' }, selectorPanel: { width: '100%', maxWidth: 560, maxHeight: '72%', alignSelf: 'center', padding: AppSpacing.lg, backgroundColor: AppColors.black[800], borderRadius: AppRadius.lg, borderWidth: 1, borderColor: AppColors.border }, selectorTitle: { color: AppColors.text, fontFamily: AppFonts.serifBold, fontSize: 24, marginBottom: AppSpacing.md }, scopeOption: { flexDirection: 'row', alignItems: 'center', padding: AppSpacing.md, borderRadius: AppRadius.md, marginBottom: 6 }, scopeOptionSelected: { backgroundColor: AppColors.surface }, scopeCopy: { flex: 1 }, scopeTitle: { color: AppColors.text, fontFamily: AppFonts.sansMedium, fontSize: 15 }, scopeBook: { color: AppColors.textMuted, fontFamily: AppFonts.sans, fontSize: 12, marginTop: 3 },
});
