import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
  Modal,
  Pressable,
  type TextStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  Volume2,
  Pause,
  Play,
  Square,
  Settings2,
  X,
  Gauge,
  List,
  ChevronUp,
  ChevronDown,
  MonitorOff,
  Monitor,
} from 'lucide-react-native';
import { useKeepAwake, activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppColors, AppFonts, AppSpacing, AppRadius } from '@/lib/theme';
import { READING_THEMES, type ReadingTheme, type ThemeColors } from '@/types';
import { fetchBook, fetchReaderPages, fetchReadingProgress, saveReadingProgress } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { tts, type TTSState } from '@/lib/tts';
import type { Book, ReaderBlock, ReaderPage } from '@/types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SCROLL_SPEEDS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '3x', value: 3 },
  { label: '4x', value: 4 },
];

export default function ReaderScreen() {
  const {
    id,
    page: pageParam,
    pageId: pageIdParam,
    bookPartId,
    highlight: highlightParam,
  } = useLocalSearchParams<{
    id: string;
    page?: string;
    pageId?: string;
    bookPartId?: string;
    highlight?: string;
  }>();
  const router = useRouter();
  useKeepAwake();

  const wakeLockRef = useRef<any>(null);

  const toggleKeepScreenOn = useCallback(async () => {
    setKeepScreenOn((prev) => {
      const next = !prev;
      if (next) {
        activateKeepAwakeAsync().catch(() => {});
        // Web Wake Lock API
        if (Platform.OS === 'web' && 'wakeLock' in navigator) {
          (navigator as any).wakeLock.request('screen').then((wl: any) => {
            wakeLockRef.current = wl;
          }).catch(() => {});
        }
      } else {
        deactivateKeepAwake().catch(() => {});
        if (wakeLockRef.current) {
          wakeLockRef.current.release?.();
          wakeLockRef.current = null;
        }
      }
      return next;
    });
  }, []);

  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [contextEntryIndex, setContextEntryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [themeName, setThemeName] = useState<ReadingTheme>('dark');
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.2);
  const [keepScreenOn, setKeepScreenOn] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<TTSState>('idle');
  const [ttsRate, setTtsRate] = useState(1.0);
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(0.5);
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null);
  const [ttsAutoScroll, setTtsAutoScroll] = useState(true);
  const [ttsSentenceIndex, setTtsSentenceIndex] = useState(-1);
  const [ttsPageIdx, setTtsPageIdx] = useState(-1);
  const ttsScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIsScrolling = useRef(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageOffsets = useRef<number[]>([]);
  const [renderEnd, setRenderEnd] = useState(15);
  const [contentHeight, setContentHeight] = useState(0);

  const theme: ThemeColors = READING_THEMES[themeName];
  const currentPage = pages[currentIndex];

  // Load book data on mount and refetch when returning from other tabs (e.g. admin edits)
  useEffect(() => {
    loadBookData();
  }, [id, bookPartId]);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchReaderPages(id, bookPartId).then((freshPages) => {
          setPages(freshPages);
        });
      }
    }, [id, bookPartId])
  );

  const loadBookData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [bookData, pagesData] = await Promise.all([
        fetchBook(id),
        fetchReaderPages(id, bookPartId),
      ]);

      if (!bookData) {
        setError('Book not found');
        setLoading(false);
        return;
      }

      setBook(bookData);
      setPages(pagesData);

      // Determine starting page
      let startIndex = 0;
      let requestedIndex = -1;
      if (pageIdParam) {
        requestedIndex = pagesData.findIndex((page) => page.id === pageIdParam);
      }
      if (requestedIndex < 0 && pageParam) {
        const requestedPage = parseInt(pageParam, 10);
        requestedIndex = pagesData.findIndex((p) => p.legacyPageNumber === requestedPage);
      }
      if (requestedIndex >= 0) {
        startIndex = requestedIndex;
      } else if (!pageIdParam && !pageParam) {
        const progress = await fetchReadingProgress(id);
        if (progress) {
          const pageIdIndex = progress.page_id
            ? pagesData.findIndex((page) => page.id === progress.page_id)
            : -1;
          const idx = pageIdIndex >= 0
            ? pageIdIndex
            : pagesData.findIndex((p) => p.legacyPageNumber === progress.current_page);
          if (idx >= 0) startIndex = idx;
        }
      }
      setCurrentIndex(startIndex);
      setContextEntryIndex(startIndex);

      // Ensure the starting page is rendered
      setRenderEnd(Math.min(pagesData.length, startIndex + 15));

      if (highlightParam) {
        setHighlightQuery(highlightParam);
      }

      // Check bookmark
      await checkBookmark(startIndex, pagesData);

      setLoading(false);

      // Scroll to saved page after render
      if (startIndex > 0) {
        setTimeout(() => {
          const y = pageOffsets.current[startIndex];
          if (y !== undefined) {
            scrollRef.current?.scrollTo({ y, animated: false });
            scrollPositionRef.current = y;
          }
        }, 300);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load book');
      setLoading(false);
    }
  };

  const checkBookmark = async (idx: number, pagesData: ReaderPage[]) => {
    if (!id || !pagesData[idx]) return;
    const page = pagesData[idx];
    let data: { id: string } | null = null;

    if (page.isStructured) {
      const result = await supabase
        .from('bookmarks')
        .select('id')
        .eq('book_id', id)
        .eq('page_id', page.id)
        .limit(1)
        .maybeSingle();
      data = result.data;
    }

    // Backward-compatible lookup for legacy pages and old structured
    // bookmarks created before stable page anchors were populated.
    if (!data) {
      const result = await supabase
        .from('bookmarks')
        .select('id')
        .eq('book_id', id)
        .is('page_id', null)
        .eq('page_number', page.legacyPageNumber)
        .limit(1)
        .maybeSingle();
      data = result.data;
    }
    if (data) {
      setIsBookmarked(true);
      setBookmarkId(data.id);
    } else {
      setIsBookmarked(false);
      setBookmarkId(null);
    }
  };

  // Save progress when page changes
  useEffect(() => {
    if (!id || !currentPage || loading) return;
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    progressSaveTimer.current = setTimeout(() => {
      saveReadingProgress(
        id,
        currentPage.legacyPageNumber,
        scrollPositionRef.current,
        currentPage.isStructured ? currentPage.id : null
      ).catch(console.error);
    }, 1000);
    return () => {
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    };
  }, [currentIndex, currentPage, id, loading]);

  // TTS subscription
  useEffect(() => {
    const unsubState = tts.subscribe(setTtsState);
    const unsubProgress = tts.subscribeProgress((idx) => {
      setTtsSentenceIndex(idx);
    });
    return () => {
      unsubState();
      unsubProgress();
      tts.stop();
    };
  }, []);

  // Stop TTS when user manually scrolls
  const handleTouchStart = () => {
    if (ttsState === 'speaking') {
      tts.stop();
      setTtsSentenceIndex(-1);
      setTtsPageIdx(-1);
    }
    if (autoScrollActive) {
      setAutoScrollActive(false);
    }
  };

  // Auto-scroll through continuous content (manual mode)
  useEffect(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
    if (!autoScrollActive) return;

    autoScrollTimer.current = setInterval(() => {
      const step = 0.75 * autoScrollSpeed;
      const newPos = scrollPositionRef.current + step;
      const maxScroll = contentHeight - screenHeight;

      if (newPos >= maxScroll) {
        setAutoScrollActive(false);
        return;
      }

      scrollPositionRef.current = newPos;
      scrollRef.current?.scrollTo({
        y: newPos,
        animated: false,
      });
    }, 16);

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [autoScrollActive, autoScrollSpeed, contentHeight]);

  // Auto-scroll while TTS is playing - scroll within current page only
  useEffect(() => {
    if (ttsScrollTimer.current) {
      clearInterval(ttsScrollTimer.current);
      ttsScrollTimer.current = null;
    }

    if (ttsState !== 'speaking' || !ttsAutoScroll) return;

    ttsScrollTimer.current = setInterval(() => {
      const step = 0.4 * ttsRate;
      const currentY = scrollPositionRef.current;

      // Calculate current page boundaries
      const pageStart = pageOffsets.current[currentIndex] || 0;
      const nextPageStart = pageOffsets.current[currentIndex + 1] || contentHeight;
      const pageEnd = nextPageStart - 20; // leave a small margin

      // Only scroll within the current page
      const newPos = currentY + step;
      if (newPos >= pageEnd) return;

      scrollPositionRef.current = newPos;
      scrollRef.current?.scrollTo({
        y: newPos,
        animated: false,
      });
    }, 16);

    return () => {
      if (ttsScrollTimer.current) clearInterval(ttsScrollTimer.current);
    };
  }, [ttsState, ttsAutoScroll, ttsRate, contentHeight, currentIndex]);

  const scrollToPageIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= pages.length) return;

      // Ensure the target page is rendered
      if (index >= renderEnd) {
        setRenderEnd(Math.min(pages.length, index + 10));
      }

      setAutoScrollActive(false);
      tts.stop();
      setHighlightQuery(null);
      setContextEntryIndex(index);

      // Wait for render, then scroll
      setTimeout(() => {
        const y = pageOffsets.current[index];
        if (y !== undefined) {
          scrollRef.current?.scrollTo({ y, animated: false });
        }
      }, 150);
    },
    [pages.length, renderEnd]
  );

  const nextPage = () => {
    if (currentIndex < pages.length - 1) scrollToPageIndex(currentIndex + 1);
  };

  const prevPage = () => {
    if (currentIndex > 0) scrollToPageIndex(currentIndex - 1);
  };

  const toggleBookmark = async () => {
    if (!id || !currentPage) return;
    if (isBookmarked && bookmarkId) {
      await supabase.from('bookmarks').delete().eq('id', bookmarkId);
      setIsBookmarked(false);
      setBookmarkId(null);
    } else {
      const { data } = await supabase
        .from('bookmarks')
        .insert({
          book_id: id,
          page_number: currentPage.legacyPageNumber,
          page_id: currentPage.isStructured ? currentPage.id : null,
          note: null,
        })
        .select()
        .single();
      if (data) {
        setIsBookmarked(true);
        setBookmarkId(data.id);
      }
    }
  };

  const toggleControls = () => {
    setControlsVisible((v) => !v);
  };

  const toggleTts = () => {
    if (!currentPage) return;
    // Pressing TTS cancels auto-scroll
    if (autoScrollActive) setAutoScrollActive(false);
    if (ttsState === 'speaking') {
      tts.pause();
    } else if (ttsState === 'paused') {
      tts.resume();
    } else {
      speakFromPage(currentIndex, 0);
    }
  };

  const speakFromPage = (pageIdx: number, sentenceIdx: number) => {
    if (!pages[pageIdx]) return;
    tts.setRate(ttsRate);
    const speechText = getPageTtsText(pages[pageIdx]);
    if (!speechText) return;
    setTtsPageIdx(pageIdx);
    tts.speak(speechText, () => {
      // When audio finishes the current page, advance to next page and continue
      if (pageIdx < pages.length - 1) {
        const nextIdx = pageIdx + 1;
        setCurrentIndex(nextIdx);
        checkBookmark(nextIdx, pages);
        setTtsPageIdx(nextIdx);
        setTtsSentenceIndex(0);
        if (nextIdx >= renderEnd) {
          setRenderEnd(Math.min(pages.length, nextIdx + 10));
        }
        setTimeout(() => {
          const y = pageOffsets.current[nextIdx];
          if (y !== undefined) {
            scrollRef.current?.scrollTo({ y, animated: true });
            scrollPositionRef.current = y;
          }
          speakFromPage(nextIdx, 0);
        }, 200);
      } else {
        setTtsPageIdx(-1);
        setTtsSentenceIndex(-1);
      }
    }, sentenceIdx);
  };

  const speakFromSentence = (sentenceIdx: number) => {
    if (!currentPage) return;
    if (autoScrollActive) setAutoScrollActive(false);
    speakFromPage(currentIndex, sentenceIdx);
  };

  const stopTts = () => {
    tts.stop();
  };

  const toggleAutoScroll = () => {
    // Pressing auto-scroll cancels TTS
    if (ttsState !== 'idle') {
      tts.stop();
      setTtsSentenceIndex(-1);
      setTtsPageIdx(-1);
    }
    setAutoScrollActive((prev) => !prev);
  };

  const cycleScrollSpeed = () => {
    const currentIdx = SCROLL_SPEEDS.findIndex((s) => s.value === autoScrollSpeed);
    const nextIdx = (currentIdx + 1) % SCROLL_SPEEDS.length;
    setAutoScrollSpeed(SCROLL_SPEEDS[nextIdx].value);
  };

  const getPageTtsText = (page: ReaderPage): string => {
    if (page.isStructured) {
      // Canonical structured text is already plain Unicode. Do not run OCR
      // cleanup or pass presentation markup to speech synthesis.
      return page.blocks
        .filter((block) => block.ttsEligible)
        .map((block) => block.text)
        .join('\n\n');
    }

    // Preserve the existing legacy TTS behavior until its separate redesign.
    return cleanBookText(page.blocks[0]?.text || '');
  };

  const handleScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollPositionRef.current = y;

    // Determine current page from Y offsets
    for (let i = pageOffsets.current.length - 1; i >= 0; i--) {
      if (y >= pageOffsets.current[i] - 10) {
        if (i !== currentIndex) {
          setCurrentIndex(i);
          checkBookmark(i, pages);
        }
        break;
      }
    }

    // Extend render window if near the end of rendered content
    if (renderEnd < pages.length) {
      const lastOffset = pageOffsets.current[renderEnd - 1] || 0;
      if (y > lastOffset - screenHeight * 1.5) {
        setRenderEnd((prev) => Math.min(prev + 10, pages.length));
      }
    }
  };

  const renderPageText = (text: string, keyPrefix: string, pageIdx: number) => {
    // Preserve HTML formatting (bold, color, font, etc.) from the rich text editor on web
    if (Platform.OS === 'web' && hasHtmlFormatting(text)) {
      const html = lightCleanHtml(text);
      return (
        <div
          key={`${keyPrefix}-html`}
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            color: theme.text,
            fontFamily: AppFonts.serif,
            fontSize: `${fontSize}px`,
            lineHeight: `${fontSize * lineHeight}px`,
            textAlign: 'left',
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        />
      );
    }

    const cleanedText = cleanBookText(text);
    const headingRegex = /^(?:\d+\.\s+[A-Z]|(?:Hadith|HADITH)[\-\s]*\d+)/;

    // Search highlight mode
    if (highlightQuery) {
      const lowerText = cleanedText.toLowerCase();
      const lowerQuery = highlightQuery.toLowerCase();
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let searchPos = 0;

      while (searchPos < cleanedText.length) {
        const foundIdx = lowerText.indexOf(lowerQuery, searchPos);
        if (foundIdx === -1) break;

        if (foundIdx > lastIndex) {
          parts.push(<Text key={`${keyPrefix}-t-${lastIndex}`}>{cleanedText.substring(lastIndex, foundIdx)}</Text>);
        }
        parts.push(
          <Text key={`${keyPrefix}-h-${foundIdx}`} style={highlightedTextStyle(theme)}>
            {cleanedText.substring(foundIdx, foundIdx + highlightQuery.length)}
          </Text>
        );
        lastIndex = foundIdx + highlightQuery.length;
        searchPos = lastIndex;
      }

      if (lastIndex < cleanedText.length) {
        parts.push(<Text key={`${keyPrefix}-t-end`}>{cleanedText.substring(lastIndex)}</Text>);
      }

      return (
        <Text style={pageTextStyle(theme, fontSize, lineHeight)}>
          {parts}
        </Text>
      );
    }

    // Build sentence array matching TTS engine for index alignment
    const rawSentences = cleanedText.match(/[^.!?]+[.!?]*/g) || [cleanedText];
    const sentences = rawSentences.map((s) => s.trim()).filter(Boolean);
    const isTtsPage = ttsPageIdx === pageIdx && ttsState !== 'idle';

    // Find each sentence's character position in the full cleaned text
    const sentenceRanges: { start: number; end: number; text: string }[] = [];
    let searchFrom = 0;
    for (const sent of sentences) {
      const idx = cleanedText.indexOf(sent, searchFrom);
      if (idx >= 0) {
        sentenceRanges.push({ start: idx, end: idx + sent.length, text: sent });
        searchFrom = idx + sent.length;
      }
    }

    // Render: preserve ALL original whitespace/newlines as gap text between sentence spans
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    for (let si = 0; si < sentenceRanges.length; si++) {
      const range = sentenceRanges[si];

      // Gap text (whitespace, newlines) before this sentence - preserves paragraph spacing
      if (range.start > lastEnd) {
        parts.push(
          <Text key={`${keyPrefix}-gap-${si}`}>
            {cleanedText.substring(lastEnd, range.start)}
          </Text>
        );
      }

      const isHighlighted = isTtsPage && si === ttsSentenceIndex;
      const isHeading = headingRegex.test(range.text.trim());

      const spanStyle: TextStyle[] = [];
      if (isHeading) spanStyle.push(hadithHeadingStyle(theme));
      if (isHighlighted) spanStyle.push(highlightedSentenceStyle(theme));

      parts.push(
        <Text
          key={`${keyPrefix}-sent-${si}`}
          style={spanStyle.length > 0 ? spanStyle : undefined}
          onPress={() => speakFromSentence(si)}
        >
          {range.text}
        </Text>
      );

      lastEnd = range.end;
    }

    // Trailing text after the last sentence
    if (lastEnd < cleanedText.length) {
      parts.push(
        <Text key={`${keyPrefix}-trail`}>
          {cleanedText.substring(lastEnd)}
        </Text>
      );
    }

    return (
      <Text style={pageTextStyle(theme, fontSize, lineHeight)}>
        {parts}
      </Text>
    );
  };

  const renderExactHighlightedText = (text: string, keyPrefix: string) => {
    if (!highlightQuery) return text;

    const lowerText = text.toLocaleLowerCase();
    const lowerQuery = highlightQuery.toLocaleLowerCase();
    if (!lowerQuery) return text;

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      const matchIndex = lowerText.indexOf(lowerQuery, cursor);
      if (matchIndex < 0) break;
      if (matchIndex > cursor) {
        parts.push(text.substring(cursor, matchIndex));
      }
      parts.push(
        <Text key={`${keyPrefix}-match-${matchIndex}`} style={highlightedTextStyle(theme)}>
          {text.substring(matchIndex, matchIndex + highlightQuery.length)}
        </Text>
      );
      cursor = matchIndex + highlightQuery.length;
    }
    if (cursor < text.length) parts.push(text.substring(cursor));
    return parts.length > 0 ? parts : text;
  };

  const getBlockDirection = (block: ReaderBlock): 'ltr' | 'rtl' => {
    if (block.direction === 'rtl' || block.type === 'arabic') return 'rtl';
    if (block.direction === 'ltr') return 'ltr';
    return block.language?.toLocaleLowerCase().startsWith('ar') ? 'rtl' : 'ltr';
  };

  const getStoredStructuralContextParts = (
    page: ReaderPage,
    block: ReaderBlock
  ): string[] => {
    const values = [
      block.structuralLabel,
      block.structuralIdentifier,
      page.structuralNodes.find((node) => node.id === block.structuralNodeId)?.title ?? null,
    ];
    return values.filter(
      (value, index): value is string =>
        Boolean(value) && values.findIndex((candidate) => candidate === value) === index
    );
  };

  const renderStructuredPage = (page: ReaderPage, pageIdx: number) => {
    const previousPageBlocks = pageIdx > 0 ? pages[pageIdx - 1].blocks : [];
    let previousStructuralNodeId: string | null =
      previousPageBlocks.length > 0
        ? previousPageBlocks[previousPageBlocks.length - 1].structuralNodeId
        : null;
    let hasEncounteredStructuralGroup = false;

    return page.blocks.map((block, blockIdx) => {
      const direction = getBlockDirection(block);
      const isArabic = direction === 'rtl';
      const isTranslation = block.type === 'translation';
      const isHeading = block.type === 'heading';
      const isNote = block.type === 'note';
      const hasGreenStructure =
        block.structuralType === 'hadith' || block.structuralType === 'section';
      const showStructuralHeader =
        hasGreenStructure &&
        Boolean(block.structuralNodeId) &&
        block.structuralNodeId !== previousStructuralNodeId;
      const storedContextParts = getStoredStructuralContextParts(page, block);
      const showContinuationHeader =
        hasGreenStructure &&
        Boolean(block.structuralNodeId) &&
        block.structuralNodeId === previousStructuralNodeId &&
        pageIdx === contextEntryIndex &&
        !hasEncounteredStructuralGroup &&
        storedContextParts.length > 0;
      const structuralHeaderParts = showStructuralHeader
        ? [block.structuralType, ...storedContextParts].filter(
            (value, index, all): value is string =>
              Boolean(value) && all.findIndex((candidate) => candidate === value) === index
          )
        : showContinuationHeader
          ? storedContextParts
          : [];

      previousStructuralNodeId = block.structuralNodeId;
      if (hasGreenStructure) hasEncounteredStructuralGroup = true;

      return (
        <View
          key={block.id}
          style={[
            styles.structuredBlock,
            isTranslation && { backgroundColor: theme.surface },
            isNote && { backgroundColor: theme.surface },
            hasGreenStructure && {
              borderLeftColor: theme.accent,
              borderLeftWidth: 2,
              paddingLeft: AppSpacing.md,
            },
          ]}
        >
          {structuralHeaderParts.length > 0 && (
            <View style={styles.structuralHeader}>
              <View style={[styles.structuralMarker, { backgroundColor: theme.accent }]} />
              <Text
                style={[
                  styles.structuralHeaderText,
                  {
                    color: theme.accent,
                    textShadowColor: theme.accent,
                  },
                ]}
              >
                {showContinuationHeader ? 'Continued — ' : ''}
                {structuralHeaderParts.join(' · ')}
              </Text>
            </View>
          )}
          <Text
            style={[
              pageTextStyle(theme, isArabic ? fontSize + 3 : fontSize, lineHeight),
              {
                textAlign: isArabic ? 'right' : 'left',
                writingDirection: direction,
                fontFamily: isArabic
                  ? Platform.select({
                      ios: 'Geeza Pro',
                      android: 'sans-serif',
                      web: 'Tahoma, Arial, sans-serif',
                      default: undefined,
                    })
                  : AppFonts.serif,
              },
              Platform.OS === 'web' ? ({ direction } as any) : null,
              isTranslation && styles.translationBlockText,
              isHeading && [styles.structuredHeading, { color: theme.text }],
              isNote && [styles.noteBlockText, { color: theme.secondaryText }],
            ]}
          >
            {renderExactHighlightedText(block.text, `p${pageIdx}-b${blockIdx}`)}
          </Text>
        </View>
      );
    });
  };

  // Build a book-style index by parsing the contents pages (first ~10 pages)
  const tocSections = useMemo(() => {
    type TocEntry = { title: string; pageId: string; pageLabel: string };
    type TocSection = { title: string; firstPageId: string; pageLabel: string; entries: TocEntry[] };

    const sections: TocSection[] = [];
    const hasStructuredPages = pages.some((page) => page.isStructured);

    if (hasStructuredPages) {
      // Structured books use only authoritative stored chapter/section nodes.
      // If none exist, return no TOC rather than interpreting canonical text.
      const nodePage = new Map<string, ReaderPage>();
      const nodeById = new Map<string, ReaderPage['structuralNodes'][number]>();
      for (const page of pages) {
        for (const node of page.structuralNodes) {
          if (!nodePage.has(node.id)) nodePage.set(node.id, page);
          nodeById.set(node.id, node);
        }
      }

      const exactNodeTitle = (node: ReaderPage['structuralNodes'][number]) => {
        const values = [node.label, node.identifier, node.title].filter(
          (value, index, all): value is string =>
            Boolean(value) && all.findIndex((candidate) => candidate === value) === index
        );
        return values.join(' · ');
      };

      const chapters = [...nodeById.values()]
        .filter((node) => node.type === 'chapter')
        .sort(
          (first, second) =>
            first.sequenceIndex - second.sequenceIndex || first.id.localeCompare(second.id)
        );

      for (const chapter of chapters) {
        const chapterPage = nodePage.get(chapter.id);
        const title = exactNodeTitle(chapter);
        if (!chapterPage || !title) continue;

        const entries = [...nodeById.values()]
          .filter((node) => node.type === 'section' && node.parentId === chapter.id)
          .sort(
            (first, second) =>
              first.sequenceIndex - second.sequenceIndex || first.id.localeCompare(second.id)
          )
          .flatMap((node) => {
            const entryPage = nodePage.get(node.id);
            const entryTitle = exactNodeTitle(node);
            return entryPage && entryTitle
              ? [{
                  title: entryTitle,
                  pageId: entryPage.id,
                  pageLabel:
                    entryPage.printedPageLabel || String(entryPage.legacyPageNumber),
                }]
              : [];
          });

        sections.push({
          title,
          firstPageId: chapterPage.id,
          pageLabel: chapterPage.printedPageLabel || String(chapterPage.legacyPageNumber),
          entries,
        });
      }

      return sections;
    }

    const sourceText = cleanBookText(
      pages
        .slice(0, 10)
        .map((page) => page.blocks[0]?.text || '')
        .join('\n')
    );
    const contentsStart = sourceText.toUpperCase().indexOf('CONTENTS');
    const rawLines = (contentsStart >= 0 ? sourceText.slice(contentsStart + 8) : sourceText)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    // Merge continuation lines: if a line has no trailing page number,
    // join it with the next line(s) until we find one that ends with a number.
    const mergedLines: string[] = [];
    let buffer = '';
    for (let li = 0; li < rawLines.length; li++) {
      const cleaned = rawLines[li]
        .replace(/[•■§~^*]/g, '')
        .replace(/\.\s*[;:,]\s*\./g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!cleaned || /^page\s+no:?$/i.test(cleaned)) continue;

      // Check if this line ends with a page number (possibly with junk before it)
      const pageMatch = cleaned.match(/^(.*?)[\s.>;:,x*\-]+(\d{1,4})\s*\.?\s*$/);

      if (pageMatch) {
        const titlePart = (buffer + ' ' + pageMatch[1]).replace(/[-_]+$/g, '').trim();
        const pageNum = Number(pageMatch[2]);
        if (titlePart.length >= 4 && !/^contents|^foreword|^page\s+no|^stories\s+of\s+the\s+sa/i.test(titlePart)) {
          mergedLines.push(`${titlePart}\t${pageNum}`);
        }
        buffer = '';
      } else if (/^chapter\s+[ivx]+\s*\|?$/i.test(cleaned)) {
        if (buffer.trim()) {
          mergedLines.push(buffer.trim());
          buffer = '';
        }
        // Peek ahead: next non-empty line is likely the chapter heading
        const nextCleaned = rawLines[li + 1]?.replace(/[•■§~^*]/g, '').replace(/\s{2,}/g, ' ').trim();
        if (nextCleaned && /^[A-Z][A-Z\s,'\-]{6,}$/.test(nextCleaned) && !/\d{1,4}$/.test(nextCleaned)) {
          mergedLines.push(`CHAPTER\t${nextCleaned}`);
          li += 1;
        } else {
          mergedLines.push(`CHAPTER\t${cleaned.replace(/^chapter\s+/i, '').replace(/\s*\|?$/, '')}`);
        }
      } else if (/^chapter\s*[ivx]+\s+/i.test(cleaned) && !/\d{1,4}$/.test(cleaned)) {
        // "CHAPTER V DEVOTION TO SALAAT" - title is on same line
        if (buffer.trim()) {
          mergedLines.push(buffer.trim());
          buffer = '';
        }
        const heading = cleaned.replace(/^chapter\s*[ivx]+\s*/i, '').trim();
        mergedLines.push(`CHAPTER\t${heading}`);
      } else {
        // Continuation line - accumulate
        buffer = buffer ? `${buffer} ${cleaned}` : cleaned;
      }
    }
    if (buffer.trim()) {
      mergedLines.push(buffer.trim());
    }

    let activeSection: TocSection | null = null;
    for (const line of mergedLines) {
      const [prefix, rest] = line.split('\t');

      if (prefix === 'CHAPTER') {
        const heading = (rest || '').trim();
        activeSection = {
          title: heading || `Chapter ${sections.length + 1}`,
          firstPageId: pages[0]?.id || '',
          pageLabel: String(pages[0]?.legacyPageNumber || 1),
          entries: [],
        };
        sections.push(activeSection);
        continue;
      }

      // This is a title\tpageNumber entry
      const title = prefix.trim();
      const pageNum = Number(rest);
      if (!pageNum || title.length < 4) continue;

      // Check if this looks like a chapter heading (all caps, no page needed)
      if (/^[A-Z][A-Z\s,'\-]{10,}$/.test(title) && !activeSection) {
        activeSection = {
          title,
          firstPageId: pages[0]?.id || '',
          pageLabel: String(pages[0]?.legacyPageNumber || 1),
          entries: [],
        };
        sections.push(activeSection);
        continue;
      }

      if (!activeSection) {
        activeSection = {
          title: book?.title || 'Contents',
          firstPageId: pages[0].id,
          pageLabel: String(pages[0].legacyPageNumber),
          entries: [],
        };
        sections.push(activeSection);
      }

      // Clean the title further - remove trailing punctuation
      const cleanTitle = title.replace(/[,.;:]+$/g, '').trim();
      const entryPage = pages.find((page) => page.legacyPageNumber === pageNum);
      if (
        entryPage &&
        !activeSection.entries.some((entry) => entry.title === cleanTitle && entry.pageId === entryPage.id)
      ) {
        activeSection.entries.push({
          title: cleanTitle,
          pageId: entryPage.id,
          pageLabel: String(pageNum),
        });
      }
    }

    if (sections.length === 0 && pages.length > 0) {
      sections.push({
        title: book?.title || 'Contents',
        firstPageId: pages[0].id,
        pageLabel: String(pages[0].legacyPageNumber),
        entries: [],
      });
    }
    return sections;
  }, [pages, book?.title]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.secondaryText }]}>
          Opening book...
        </Text>
      </View>
    );
  }

  if (error || !book || !currentPage) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: AppColors.background }]}>
        <Text style={styles.errorText}>{error || 'Something went wrong'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progressPercent = Math.round(((currentIndex + 1) / pages.length) * 100);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Reading area - continuous scroll, always full screen */}
      <View style={styles.readingArea}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          onContentSizeChange={(_, h) => setContentHeight(h)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          onStartShouldSetResponder={() => false}
          onTouchStart={handleTouchStart}
        >
          {pages.slice(0, renderEnd).map((page, idx) => (
            <View
              key={`page-${idx}`}
              onLayout={(e) => {
                pageOffsets.current[idx] = e.nativeEvent.layout.y;
              }}
              style={[styles.pageBorder, { borderColor: theme.accent, marginBottom: AppSpacing.xl }]}
            >
              {!page.isStructured && page.legacyChapterTitle && (
                <Text style={[styles.chapterTitle, { color: theme.accent }]}>
                  {page.legacyChapterTitle}
                </Text>
              )}
              <View style={styles.pageNumberRow}>
                <Text style={[styles.pageNumberText, { color: theme.secondaryText }]}>
                  {page.isStructured && page.printedPageLabel
                    ? page.printedPageLabel
                    : page.legacyPageNumber}
                </Text>
              </View>
              {page.isStructured
                ? renderStructuredPage(page, idx)
                : renderPageText(page.blocks[0]?.text || '', `p${idx}`, idx)}
            </View>
          ))}
          {renderEnd < pages.length && (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          )}
          <View style={styles.pageBottomSpacer} />
        </ScrollView>

      </View>

      {/* Show controls button when hidden - small floating dot */}
      {!controlsVisible && (
        <TouchableOpacity
          style={styles.showControlsBtn}
          onPress={toggleControls}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        />
      )}

      {/* Top controls - overlay, no layout shift */}
      {controlsVisible && (
        <View style={[styles.topBar, { backgroundColor: theme.background, borderBottomColor: theme.surface }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ChevronLeft size={26} color={theme.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBarCenter} onPress={toggleControls} activeOpacity={0.8}>
            <Text style={[styles.topBarTitle, { color: theme.text }]} numberOfLines={1}>
              {book.title}
            </Text>
            <Text style={[styles.topBarSubtitle, { color: theme.secondaryText }]}>
              Page{' '}
              {currentPage.isStructured && currentPage.printedPageLabel
                ? currentPage.printedPageLabel
                : currentPage.legacyPageNumber}
              {!currentPage.isStructured ? ` of ${book.total_pages}` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowToc(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <List size={24} color={theme.text} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      {/* Progress bar - overlay */}
      {controlsVisible && (
        <View style={[styles.progressBar, { backgroundColor: theme.surface }]}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: theme.accent }]}
          />
        </View>
      )}

      {/* Bottom controls - overlay */}
      {controlsVisible && (
        <View style={[styles.bottomBar, { backgroundColor: theme.background, borderTopColor: theme.surface }]}>
          <TouchableOpacity style={styles.controlButton} onPress={prevPage} disabled={currentIndex === 0}>
            <ChevronLeft
              size={24}
              color={currentIndex === 0 ? theme.secondaryText : theme.text}
              strokeWidth={2}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={toggleBookmark}>
            {isBookmarked ? (
              <BookmarkCheck size={24} color={theme.accent} strokeWidth={2} />
            ) : (
              <Bookmark size={24} color={theme.text} strokeWidth={2} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={toggleAutoScroll}>
            <Gauge
              size={24}
              color={autoScrollActive ? theme.accent : theme.text}
              strokeWidth={2}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={toggleKeepScreenOn}>
            {keepScreenOn ? (
              <Monitor size={24} color={theme.accent} strokeWidth={2} />
            ) : (
              <MonitorOff size={24} color={theme.text} strokeWidth={2} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={toggleTts}>
            {ttsState === 'speaking' ? (
              <Pause size={24} color={theme.accent} strokeWidth={2} />
            ) : ttsState === 'paused' ? (
              <Play size={24} color={theme.accent} strokeWidth={2} />
            ) : (
              <Volume2 size={24} color={theme.text} strokeWidth={2} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={() => setShowSettings(true)}>
            <Settings2 size={24} color={theme.text} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={nextPage} disabled={currentIndex >= pages.length - 1}>
            <ChevronRight
              size={24}
              color={currentIndex >= pages.length - 1 ? theme.secondaryText : theme.text}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Unified settings panel */}
      <Modal visible={showSettings} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Reading Settings</Text>
                <TouchableOpacity onPress={() => setShowSettings(false)}>
                  <X size={22} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {/* Theme picker */}
              <Text style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                Theme
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScroll}>
                {Object.values(READING_THEMES).map((t) => (
                  <TouchableOpacity
                    key={t.name}
                    style={[
                      styles.themeCard,
                      { backgroundColor: t.background, borderColor: themeName === t.name ? t.accent : 'rgba(128,128,128,0.2)' },
                    ]}
                    onPress={() => setThemeName(t.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.themeLabel, { color: t.text }]}>{t.label}</Text>
                    {themeName === t.name && (
                      <View style={[styles.themeCheck, { backgroundColor: t.accent }]}>
                        <Text style={styles.themeCheckText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Font size */}
              <Text style={[styles.sectionLabel, { color: theme.secondaryText, marginTop: AppSpacing.lg }]}>
                Font Size — {fontSize}px
              </Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity
                  style={[styles.fontSizeButton, { borderColor: theme.text }]}
                  onPress={() => setFontSize((f) => Math.max(12, f - 1))}
                >
                  <ChevronDown size={20} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
                <View style={[styles.sliderTrack, { backgroundColor: theme.background }]}>
                  <View
                    style={[
                      styles.sliderFill,
                      { width: `${((fontSize - 12) / 20) * 100}%`, backgroundColor: theme.accent },
                    ]}
                  />
                </View>
                <Text style={[styles.fontSizeValue, { color: theme.text }]}>{fontSize}</Text>
                <TouchableOpacity
                  style={[styles.fontSizeButton, { borderColor: theme.text }]}
                  onPress={() => setFontSize((f) => Math.min(32, f + 1))}
                >
                  <ChevronUp size={20} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {/* Line spacing */}
              <Text style={[styles.sectionLabel, { color: theme.secondaryText, marginTop: AppSpacing.md }]}>
                Line Spacing — {lineHeight.toFixed(1)}
              </Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity
                  style={[styles.fontSizeButton, { borderColor: theme.text }]}
                  onPress={() => setLineHeight((l) => Math.max(1.2, parseFloat((l - 0.1).toFixed(1))) )}
                >
                  <ChevronDown size={20} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
                <View style={[styles.sliderTrack, { backgroundColor: theme.background }]}>
                  <View
                    style={[
                      styles.sliderFill,
                      { width: `${((lineHeight - 1.2) / 1.3) * 100}%`, backgroundColor: theme.accent },
                    ]}
                  />
                </View>
                <Text style={[styles.fontSizeValue, { color: theme.text }]}>{lineHeight.toFixed(1)}</Text>
                <TouchableOpacity
                  style={[styles.fontSizeButton, { borderColor: theme.text }]}
                  onPress={() => setLineHeight((l) => Math.min(2.5, parseFloat((l + 0.1).toFixed(1))) )}
                >
                  <ChevronUp size={20} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {/* Screen timeout toggle */}
              <View style={[styles.toggleRow, { borderTopColor: theme.background }]}>
                <View style={styles.toggleLeft}>
                  {keepScreenOn ? (
                    <Monitor size={22} color={theme.accent} strokeWidth={2} />
                  ) : (
                    <MonitorOff size={22} color={theme.secondaryText} strokeWidth={2} />
                  )}
                  <View>
                    <Text style={[styles.toggleLabel, { color: theme.text }]}>Screen Timeout</Text>
                    <Text style={[styles.toggleSub, { color: theme.secondaryText }]}>
                      {keepScreenOn ? 'Screen stays on while reading' : 'Screen will turn off normally'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={toggleKeepScreenOn}
                  activeOpacity={0.8}
                  style={[
                    styles.switchTrack,
                    { backgroundColor: keepScreenOn ? theme.accent : theme.background },
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      keepScreenOn ? styles.switchThumbOn : styles.switchThumbOff,
                      { backgroundColor: keepScreenOn ? AppColors.white : theme.secondaryText },
                    ]}
                  />
                </TouchableOpacity>
              </View>

              {/* Auto-scroll speed */}
              <Text style={[styles.sectionLabel, { color: theme.secondaryText, marginTop: AppSpacing.lg }]}>
                Auto-Scroll Speed
              </Text>
              <View style={styles.speedRow}>
                {SCROLL_SPEEDS.map((speed) => (
                  <TouchableOpacity
                    key={speed.value}
                    style={[
                      styles.speedButton,
                      autoScrollSpeed === speed.value && { backgroundColor: theme.accent },
                    ]}
                    onPress={() => setAutoScrollSpeed(speed.value)}
                  >
                    <Text
                      style={[
                        styles.speedText,
                        { color: autoScrollSpeed === speed.value ? AppColors.white : theme.text },
                      ]}
                    >
                      {speed.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* TTS auto-scroll toggle */}
              <View style={[styles.toggleRow, { borderTopColor: theme.background }]}>
                <View style={styles.toggleLeft}>
                  <Volume2 size={22} color={ttsAutoScroll ? theme.accent : theme.secondaryText} strokeWidth={2} />
                  <View>
                    <Text style={[styles.toggleLabel, { color: theme.text }]}>Auto-scroll with Audio</Text>
                    <Text style={[styles.toggleSub, { color: theme.secondaryText }]}>
                      {ttsAutoScroll ? 'Page scrolls while audio plays' : 'Page stays still during audio'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setTtsAutoScroll((v) => !v)}
                  activeOpacity={0.8}
                  style={[
                    styles.switchTrack,
                    { backgroundColor: ttsAutoScroll ? theme.accent : theme.background },
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      ttsAutoScroll ? styles.switchThumbOn : styles.switchThumbOff,
                      { backgroundColor: ttsAutoScroll ? AppColors.white : theme.secondaryText },
                    ]}
                  />
                </TouchableOpacity>
              </View>

              {/* Audio speed */}
              <Text style={[styles.sectionLabel, { color: theme.secondaryText, marginTop: AppSpacing.lg }]}>
                Audio Speed — {ttsRate}x
              </Text>
              <View style={styles.speedRow}>
                {[0.5, 1, 1.5, 2].map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    style={[
                      styles.speedButton,
                      ttsRate === rate && { backgroundColor: theme.accent },
                    ]}
                    onPress={() => {
                      setTtsRate(rate);
                      tts.setRate(rate);
                    }}
                  >
                    <Text
                      style={[
                        styles.speedText,
                        { color: ttsRate === rate ? AppColors.white : theme.text },
                      ]}
                    >
                      {rate}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Table of contents modal — book-style index grouped by section/chapter */}
      <Modal visible={showToc} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowToc(false)}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, maxHeight: screenHeight * 0.75 }]}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Contents</Text>
                <TouchableOpacity onPress={() => setShowToc(false)}>
                  <X size={22} color={theme.text} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.tocList} showsVerticalScrollIndicator={false}>
                {tocSections.map((section, sIdx) => {
                  const sectionIdx = pages.findIndex(
                    (page) => page.id === section.firstPageId
                  );
                  const isCurrentSection =
                    currentIndex >= sectionIdx &&
                    currentIndex < (sIdx + 1 < tocSections.length
                      ? pages.findIndex(
                          (page) => page.id === tocSections[sIdx + 1].firstPageId
                        )
                      : pages.length);

                  return (
                    <View key={`section-${sIdx}`}>
                      <TouchableOpacity
                        style={[
                          styles.tocSectionHeader,
                          isCurrentSection && { backgroundColor: theme.background },
                        ]}
                        onPress={() => {
                          scrollToPageIndex(sectionIdx);
                          setShowToc(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.tocSectionTitle,
                            {
                              color: isCurrentSection ? theme.accent : theme.text,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {section.title}
                        </Text>
                        <Text style={[styles.tocSectionPage, { color: theme.secondaryText }]}>
                          {section.pageLabel}
                        </Text>
                      </TouchableOpacity>

                      {section.entries.map((entry, eIdx) => {
                        const entryIdxInPages = pages.findIndex(
                          (page) => page.id === entry.pageId
                        );
                        const isCurrent = currentIndex === entryIdxInPages;

                        return (
                          <TouchableOpacity
                            key={`entry-${sIdx}-${eIdx}`}
                            style={[
                              styles.tocSubItem,
                              isCurrent && { backgroundColor: theme.background },
                            ]}
                            onPress={() => {
                              scrollToPageIndex(entryIdxInPages);
                              setShowToc(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.tocSubText,
                                {
                                  color: isCurrent ? theme.accent : theme.secondaryText,
                                  fontFamily: isCurrent
                                    ? AppFonts.sansMedium
                                    : AppFonts.sans,
                                },
                              ]}
                              numberOfLines={2}
                            >
                              {entry.title}
                            </Text>
                            <Text style={[styles.tocSubPage, { color: theme.secondaryText }]}>
                              {entry.pageLabel}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
  },
  loadingText: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
  },
  errorText: {
    fontFamily: AppFonts.sans,
    fontSize: 16,
    color: AppColors.error,
    textAlign: 'center',
  },
  backButton: {
    marginTop: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
    paddingVertical: AppSpacing.sm,
    backgroundColor: AppColors.primary,
    borderRadius: AppRadius.md,
  },
  backButtonText: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 14,
    color: AppColors.white,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: AppSpacing.md,
    paddingTop: Platform.OS === 'web' ? 16 : 52,
    paddingBottom: AppSpacing.sm,
    borderBottomWidth: 1,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: AppSpacing.sm,
  },
  topBarTitle: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 15,
  },
  topBarSubtitle: {
    fontFamily: AppFonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  readingArea: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: AppSpacing.xl,
    paddingTop: Platform.OS === 'web' ? 70 : 110,
    paddingBottom: 120,
  },
  pageBorder: {
    borderWidth: 3,
    borderRadius: AppRadius.lg,
    padding: AppSpacing.xl,
    borderStyle: 'dashed' as any,
  },
  pageNumberRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: AppSpacing.md,
  },
  pageNumberText: {
    fontFamily: AppFonts.serifBold,
    fontSize: 13,
    opacity: 0.6,
  },
  loadingMore: {
    paddingVertical: AppSpacing.lg,
    alignItems: 'center',
  },
  chapterTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 22,
    marginBottom: AppSpacing.lg,
    textAlign: 'center',
  },
  structuredBlock: {
    marginBottom: AppSpacing.lg,
    borderRadius: AppRadius.sm,
  },
  structuralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginBottom: AppSpacing.sm,
  },
  structuralMarker: {
    width: 5,
    height: 18,
    borderRadius: 3,
    shadowColor: '#39FF14',
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 2,
  },
  structuralHeaderText: {
    flex: 1,
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
    textShadowRadius: 4,
  },
  translationBlockText: {
    fontStyle: 'italic',
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  structuredHeading: {
    fontFamily: AppFonts.serifBold,
    fontSize: 22,
    lineHeight: 29,
    marginTop: AppSpacing.sm,
    marginBottom: AppSpacing.sm,
  },
  noteBlockText: {
    fontFamily: AppFonts.sans,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
  },
  pageBottomSpacer: {
    height: 60,
  },
  progressBar: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 56 : 84,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 90,
  },
  progressFill: {
    height: '100%',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: AppSpacing.sm,
    paddingTop: AppSpacing.sm,
    paddingBottom: Platform.OS === 'web' ? AppSpacing.sm : 28,
    borderTopWidth: 1,
  },
  controlButton: {
    padding: AppSpacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showControlsBtn: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 52,
    right: AppSpacing.md,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(128,128,128,0.4)',
    zIndex: 50,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: AppRadius.xl,
    borderTopRightRadius: AppRadius.xl,
    padding: AppSpacing.lg,
    paddingBottom: Platform.OS === 'web' ? AppSpacing.lg : 36,
    maxHeight: screenHeight * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AppSpacing.lg,
  },
  modalTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 20,
  },
  settingLabel: {
    fontFamily: AppFonts.sans,
    fontSize: 14,
    marginBottom: AppSpacing.sm,
  },
  sectionLabel: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
    marginBottom: AppSpacing.sm,
    textTransform: 'uppercase' as any,
    letterSpacing: 0.5,
  },
  fontSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing.md,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 3,
  },
  fontSizeButton: {
    width: 40,
    height: 40,
    borderRadius: AppRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeValue: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 16,
    minWidth: 36,
    textAlign: 'center',
  },
  themeScroll: {
    marginBottom: AppSpacing.xs,
  },
  themeCard: {
    width: 88,
    height: 56,
    marginRight: AppSpacing.md,
    borderRadius: AppRadius.md,
    padding: AppSpacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    position: 'relative',
  },
  themeLabel: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
  },
  themeCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeCheckText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: '700' as any,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: AppSpacing.lg,
    paddingTop: AppSpacing.lg,
    borderTopWidth: 1,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.md,
    flex: 1,
  },
  toggleLabel: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 15,
  },
  toggleSub: {
    fontFamily: AppFonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  switchTrack: {
    width: 52,
    height: 30,
    borderRadius: 15,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  speedRow: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    flexWrap: 'wrap' as any,
  },
  speedButton: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.sm,
    borderRadius: AppRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  speedText: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
  },
  tocList: {
    maxHeight: 500,
  },
  tocSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: AppSpacing.md,
    paddingHorizontal: AppSpacing.md,
    borderRadius: AppRadius.sm,
    marginTop: AppSpacing.sm,
    marginBottom: 2,
  },
  tocSectionTitle: {
    fontFamily: AppFonts.serifBold,
    fontSize: 16,
    flex: 1,
    marginRight: AppSpacing.sm,
    lineHeight: 20,
  },
  tocSectionPage: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
    minWidth: 36,
    textAlign: 'right',
  },
  tocSubItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: AppSpacing.sm,
    paddingHorizontal: AppSpacing.lg,
    borderRadius: AppRadius.sm,
    marginBottom: 1,
  },
  tocSubText: {
    fontSize: 13,
    flex: 1,
    marginRight: AppSpacing.md,
    lineHeight: 18,
  },
  tocSubPage: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 13,
    minWidth: 48,
    textAlign: 'right',
    lineHeight: 18,
  },
});

function pageTextStyle(theme: ThemeColors, fs: number, lh: number): TextStyle {
  return {
    fontFamily: AppFonts.serif,
    fontSize: fs,
    lineHeight: fs * lh,
    color: theme.text,
    textAlign: 'left',
  };
}

function highlightedTextStyle(theme: ThemeColors): TextStyle {
  return {
    backgroundColor:
      theme.name === 'dark' || theme.name === 'night'
        ? 'rgba(0, 255, 102, 0.25)'
        : 'rgba(0, 200, 83, 0.2)',
    color: theme.accent,
  };
}

function highlightedSentenceStyle(theme: ThemeColors): TextStyle {
  return {
    backgroundColor:
      theme.name === 'dark' || theme.name === 'night'
        ? 'rgba(0, 255, 102, 0.25)'
        : 'rgba(0, 200, 83, 0.25)',
    color: '#00C853',
  };
}

function hadithHeadingStyle(theme: ThemeColors): TextStyle {
  const green = theme.name === 'dark' || theme.name === 'night' ? '#39FF14' : '#00E676';
  return {
    color: green,
    fontFamily: AppFonts.serifBold,
    fontSize: 17,
    marginTop: 12,
    marginBottom: 4,
    textShadowColor: green,
    textShadowRadius: 3,
  };
}

// Fix OCR errors and clean up text for display
function cleanBookText(text: string): string {
  return text
    // Strip HTML tags (e.g. <br>, <font>, <span>) and convert <br> to newlines first
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:font|span|div|p|b|i|u|em|strong|sup|sub|small|big|center|hr|table|tr|td|th|ul|ol|li|h[1-6])\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/Janda[Tt]/gi, 'Jandal')
    .replace(/\bandAbuBasir\b/gi, 'and Abu Basir')
    .replace(/\bAbuBasir\b/gi, 'Abu Basir')
    .replace(/\bAbuJandal\b/gi, 'Abu Jandal')
    .replace(/Qur\*an/gi, "Qur'an")
    // Remove "Page No:" and "Page No." header lines
    .replace(/^Page\s+No[:.]?\s*$/gim, '')
    // Remove stray OCR symbols
    .replace(/[•■§~^]/g, '')
    // Remove filler dot patterns: ".........", ". . . .", "....."
    .replace(/(\.\s*){2,}/g, ' ')
    // Remove ". ; ." and similar punctuation junk between text and numbers
    .replace(/[\s]*[;:,]+\s*\.\s*/g, ' ')
    .replace(/\.\s*;\s*\./g, ' ')
    .replace(/\.\s*,\s*\./g, ' ')
    // Remove ">" and stray quotes before page numbers
    .replace(/>\s*(?=\d)/g, '')
    .replace(/[>"]/g, '')
    // Remove "*" before numbers (e.g. "*83" → "83")
    .replace(/\*\s*(?=\d{1,4})/g, '')
    // Remove "x" prefix before page numbers (e.g. "x80" → "80")
    .replace(/\bx\s*(?=\d{1,4}\b)/g, '')
    // Remove lone asterisks
    .replace(/\s\*\s/g, ' ')
    .replace(/^\s*\*\s*$/gm, '')
    // Remove stray single-char lines (OCR artifacts like "5 -a", "8 J", etc.)
    .replace(/^\s*[\d\w]\s*[-,.'"]?\s*[\w]?\s*$/gm, (match) => {
      // Keep lines that are actual words (4+ chars), only remove tiny fragments
      return match.trim().length <= 4 && /\d/.test(match) ? '' : match;
    })
    // Remove lines that are just a number (stray page artifacts)
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    // Clean up ".- .,, " type junk
    .replace(/[\-.][\s,."']*\.[\s,."']*/g, ' ')
    // Remove leading punctuation on lines
    .replace(/^\s*[.,;:'"]+\s*/gm, '')
    // Collapse multiple spaces to two (preserve paragraph breaks)
    .replace(/[ \t]{3,}/g, '  ')
    // Collapse 3+ newlines to 2
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function hasHtmlFormatting(text: string): boolean {
  return /<(b>|strong>|i>|em>|u>|span[^>]*>|font[^>]*>|div[^>]*>|p[^>]*|h[1-6][^>]*>)/i.test(text);
}

function lightCleanHtml(text: string): string {
  return text
    .replace(/Janda[Tt]/gi, 'Jandal')
    .replace(/\bandAbuBasir\b/gi, 'and Abu Basir')
    .replace(/\bAbuBasir\b/gi, 'Abu Basir')
    .replace(/\bAbuJandal\b/gi, 'Abu Jandal')
    .replace(/Qur\*an/gi, "Qur'an")
    .replace(/&nbsp;/g, ' ')
    .replace(/[•■§~^]/g, '')
    .replace(/(\.\s*){2,}/g, ' ')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();
}
