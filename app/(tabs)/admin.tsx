import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
  Modal,
  RefreshControl,
  Dimensions,
  Linking,
  Share as NativeShare,
} from 'react-native';
import {
  Undo2,
  Redo2,
  ChevronRight,
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  X,
  FileText,
  Book as BookIcon,
  Check,
  Lock,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Palette,
  Volume2,
  Moon,
  Sun,
  Smartphone,
  Heart,
  Mail,
  Flag,
  Shield,
  ChevronDown,
  Copy,
} from 'lucide-react-native';
import { AppColors, AppFonts, AppSpacing, AppRadius } from '@/lib/theme';
import { useNavigation } from 'expo-router';
import { READING_THEMES, type ReadingTheme, type ThemeColors } from '@/types';
import {
  fetchBooks,
  fetchPages,
  updatePage,
  deletePage,
  addPage,
  fetchNextPageNumber,
} from '@/lib/database';
import type { Book, Page } from '@/types';

const ADMIN_PASSWORD = 'editor123';
const STORAGE_KEY = 'admin_authed';

type AdminView = 'books' | 'pages' | 'editor';

const COLOR_PRESETS = [
  '#FFFFFF', '#000000', '#FF0000', '#FF6600', '#FFCC00',
  '#00E676', '#0099FF', '#9933FF', '#FF00FF', '#FF6699',
  '#00B050', '#0033CC', '#663300', '#999999', '#333333',
];

const FONT_PRESETS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Inter'];

const EDITOR_THEME: ReadingTheme = 'dark';
const EDITOR_COLORS: ThemeColors = READING_THEMES[EDITOR_THEME];

const sortAdminPages = (first: Page, second: Page) => {
  const sourceOrder =
    (first.pdf_page_number ?? first.page_number) -
    (second.pdf_page_number ?? second.page_number);
  if (sourceOrder !== 0) return sourceOrder;
  if (
    first.book_part_id &&
    first.book_part_id === second.book_part_id &&
    first.sequence_index != null &&
    second.sequence_index != null &&
    first.sequence_index !== second.sequence_index
  ) {
    return first.sequence_index - second.sequence_index;
  }
  return first.page_number - second.page_number || first.id.localeCompare(second.id);
};

export default function AdminScreen() {
  const [authed, setAuthed] = useState(false);
  const [adminRequested, setAdminRequested] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [currency, setCurrency] = useState<'GBP' | 'PKR'>('GBP');
  const [settingsTheme, setSettingsTheme] = useState<'dark' | 'light' | 'device'>('dark');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [repeatMode, setRepeatMode] = useState<'word' | 'line' | 'hadith' | 'section'>('line');
  const [screenTimeout, setScreenTimeout] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState<string | null>(null);
  const [selectedDonationAmount, setSelectedDonationAmount] = useState('£10');
  const [customDonationAmount, setCustomDonationAmount] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === '1') setAuthed(true);
    }
  }, []);

  const handleLogin = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthed(true);
      setAuthError(false);
      if (Platform.OS === 'web') sessionStorage.setItem(STORAGE_KEY, '1');
    } else {
      setAuthError(true);
    }
  };

  const handleLogout = () => {
    setAuthed(false);
    setAdminRequested(false);
    setPasswordInput('');
    if (Platform.OS === 'web') sessionStorage.removeItem(STORAGE_KEY);
  };

  const copyDonationDetail = async (label: string, value: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    } else {
      await NativeShare.share({ message: `${label}: ${value}` });
    }
    setCopiedDetail(label);
    setTimeout(() => setCopiedDetail((current) => current === label ? null : current), 1600);
  };

  if (!adminRequested && !authed) {
    const settingsRows = [
      { label: 'Share App', icon: ChevronRight, onPress: () => NativeShare.share({ message: 'AmaalBooks' }) },
      { label: 'Contact Developer', icon: Mail, onPress: () => Linking.openURL('mailto:4455uk@gmail.com') },
      { label: 'Report an Issue', icon: Flag, onPress: () => Linking.openURL('mailto:4455uk@gmail.com?subject=AmaalBooks%20%E2%80%94%20Report%20an%20Issue') },
      { label: 'Donate / Support AmaalBooks', icon: Heart, onPress: () => setShowDonation(true) },
      { label: 'Admin Settings', icon: Shield, onPress: () => setAdminRequested(true) },
    ];
    return <View style={styles.settingsContainer}><ScrollView contentContainerStyle={styles.settingsContent}>
      <Text style={styles.settingsTitle}>Settings</Text>
      <Text style={styles.settingsSection}>Audio Settings</Text>
      <View style={styles.settingsCard}><View style={styles.settingRow}><Volume2 size={21} color={AppColors.primaryLight}/><Text style={styles.settingRowLabel}>Playback speed</Text></View><View style={styles.choiceRow}>{[0.5,1,1.5,2].map((speed)=><TouchableOpacity key={speed} style={[styles.choiceChip,playbackSpeed===speed&&styles.choiceChipActive]} onPress={()=>setPlaybackSpeed(speed)}><Text style={styles.choiceText}>{speed}×</Text></TouchableOpacity>)}</View>
      <Text style={styles.settingSubLabel}>Repeat</Text><View style={styles.choiceRow}>{(['word','line','hadith','section'] as const).map((mode)=><TouchableOpacity key={mode} style={[styles.choiceChip,repeatMode===mode&&styles.choiceChipActive]} onPress={()=>setRepeatMode(mode)}><Text style={styles.choiceText}>{mode[0].toUpperCase()+mode.slice(1)}</Text></TouchableOpacity>)}</View></View>
      <Text style={styles.settingsSection}>Theme</Text><View style={styles.choiceRow}>{([{id:'dark',label:'Dark',Icon:Moon},{id:'light',label:'Light',Icon:Sun},{id:'device',label:'Device Default',Icon:Smartphone}] as const).map(({id,label,Icon})=><TouchableOpacity key={id} style={[styles.themeChoice,settingsTheme===id&&styles.choiceChipActive]} onPress={()=>setSettingsTheme(id)}><Icon size={20} color={AppColors.text}/><Text style={styles.choiceText}>{label}</Text></TouchableOpacity>)}</View>
      <TouchableOpacity style={styles.settingsRow} onPress={()=>setScreenTimeout((value)=>!value)}><Smartphone size={21} color={AppColors.primaryLight}/><View style={{flex:1}}><Text style={styles.settingRowLabel}>Screen Timeout</Text><Text style={styles.settingRowSub}>{screenTimeout?'Keep screen awake':'Use device default'}</Text></View><Text style={styles.settingValue}>{screenTimeout?'On':'Off'}</Text></TouchableOpacity>
      {settingsRows.map(({label,icon:Icon,onPress})=><TouchableOpacity key={label} style={styles.settingsRow} onPress={onPress}><Icon size={21} color={label.startsWith('Donate')?AppColors.primaryLight:AppColors.textSecondary}/><Text style={styles.settingRowLabel}>{label}</Text><ChevronRight size={18} color={AppColors.textMuted}/></TouchableOpacity>)}
    </ScrollView><Modal visible={showDonation} transparent animationType="slide" onRequestClose={()=>setShowDonation(false)}><View style={styles.modalOverlay}><View style={styles.donationSheet}>
      <View style={styles.modalHeader}><Text style={styles.modalTitle}>Donate / Support AmaalBooks</Text><TouchableOpacity onPress={()=>setShowDonation(false)}><X size={22} color={AppColors.text}/></TouchableOpacity></View>
      <View style={styles.choiceRow}>{(['GBP','PKR'] as const).map((item)=><TouchableOpacity key={item} style={[styles.choiceChip,currency===item&&styles.choiceChipActive]} onPress={()=>{setCurrency(item);setSelectedDonationAmount(item==='GBP'?'£10':'Rs 1,000');setCustomDonationAmount('');}}><Text style={styles.choiceText}>{item}</Text></TouchableOpacity>)}</View>
      <View style={styles.amountGrid}>{(currency==='GBP'?['£10','£20','£50','£100','Custom']:['Rs 1,000','Rs 5,000','Rs 10,000','Rs 100,000 (1 lakh)','Custom']).map((amount)=><TouchableOpacity key={amount} style={[styles.amountButton,selectedDonationAmount===amount&&styles.amountButtonSelected]} onPress={()=>{setSelectedDonationAmount(amount);if(amount!=='Custom')setCustomDonationAmount('');}}><Text style={styles.amountText}>{amount}</Text></TouchableOpacity>)}</View>
      {selectedDonationAmount === 'Custom' ? <TextInput style={styles.customAmountInput} value={customDonationAmount} onChangeText={setCustomDonationAmount} placeholder={currency === 'GBP' ? 'Enter custom GBP amount' : 'Enter custom PKR amount'} placeholderTextColor={AppColors.textMuted} keyboardType="numeric" /> : null}
      <View style={styles.selectedAmountRow}><View style={styles.paymentCopy}><Text style={styles.paymentLabel}>Selected amount</Text><Text selectable style={styles.paymentValue}>{selectedDonationAmount === 'Custom' ? `${currency} ${customDonationAmount || 'Custom'}` : selectedDonationAmount}</Text></View><TouchableOpacity accessibilityLabel="Copy selected amount" style={styles.copyButton} onPress={()=>copyDonationDetail('Selected amount',selectedDonationAmount === 'Custom' ? `${currency} ${customDonationAmount || 'Custom'}` : selectedDonationAmount)}>{copiedDetail==='Selected amount'?<Check size={18} color={AppColors.success}/>:<Copy size={18} color={AppColors.text}/>}</TouchableOpacity></View>
      <Text style={styles.paymentHeading}>{currency === 'GBP' ? 'Monzo Bank' : 'Easypaisa / JazzCash'}</Text>
      {(currency === 'GBP' ? [
        ['Name','Mohammed Khan'],['Bank','Monzo Bank'],['Account number','56769426'],['Sort code','04-00-05'],['IBAN','GB91MONZ04000556769426'],['BIC','MONZGB2L'],
      ] : [['Recipient','Mohammed Sarwar Khan'],['Number','+92300 831 9035']]).map(([label,value])=><View key={label} style={styles.paymentRow}><View style={styles.paymentCopy}><Text style={styles.paymentLabel}>{label}</Text><Text selectable style={styles.paymentValue}>{value}</Text></View><TouchableOpacity accessibilityLabel={`Copy ${label}`} style={styles.copyButton} onPress={()=>copyDonationDetail(label,value)}>{copiedDetail===label?<Check size={18} color={AppColors.success}/>:<Copy size={18} color={AppColors.text}/>}</TouchableOpacity></View>)}
      <Text style={styles.donationNote}>Thank you for supporting the continued preservation and development of AmaalBooks.</Text>
    </View></View></Modal></View>;
  }

  if (!authed) {
    return (
      <View style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <View style={styles.loginIconBox}>
            <Lock size={28} color={AppColors.primary} strokeWidth={2} />
          </View>
          <Text style={styles.loginTitle}>Admin Access</Text>
          <Text style={styles.loginSubtitle}>
            Enter the password to edit book pages
          </Text>
          <TextInput
            style={[styles.loginInput, authError && styles.loginInputError]}
            value={passwordInput}
            onChangeText={(t) => { setPasswordInput(t); setAuthError(false); }}
            placeholder="Password"
            placeholderTextColor={AppColors.textMuted}
            secureTextEntry
            onSubmitEditing={handleLogin}
            autoFocus
          />
          {authError && <Text style={styles.loginErrorText}>Incorrect password. Try again.</Text>}
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Enter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelAdmin} onPress={() => setAdminRequested(false)}><Text style={styles.cancelAdminText}>Back to Settings</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return <AdminContent onLogout={handleLogout} />;
}

interface EditingPageState {
  content: string;
  chapter: string;
  pageNumber: string;
  dirty: boolean;
}

function AdminContent({ onLogout }: { onLogout: () => void }) {
  const navigation = useNavigation<any>();
  const [view, setView] = useState<AdminView>('books');
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccessId, setSaveSuccessId] = useState<string | null>(null);

  // Editor state: editing content per page (keyed by page id)
  const [editingState, setEditingState] = useState<Record<string, EditingPageState>>({});
  const [renderEnd, setRenderEnd] = useState(20);

  // Active page for toolbar targeting (the page the user last clicked into)
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [editorFontSize, setEditorFontSize] = useState(3);

  // Color/font picker state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerMode, setColorPickerMode] = useState<'text' | 'highlight'>('text');
  const [showFontPicker, setShowFontPicker] = useState(false);

  useEffect(() => {
    const parent = navigation.getParent?.();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const loadBooks = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchBooks();
      setBooks(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load books');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  const loadPages = useCallback(async (bookId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPages(bookId);
      setPages(data);
      setRenderEnd(Math.min(data.length, 20));
      // Initialize editing state from loaded pages
      const state: Record<string, EditingPageState> = {};
      for (const p of data) {
        state[p.id] = {
          content: p.content,
          chapter: p.chapter_title || '',
          pageNumber: String(p.page_number),
          dirty: false,
        };
      }
      setEditingState(state);
    } catch (e: any) {
      setError(e.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, []);

  const setEditorContent = (pageId: string, content: string) => {
    setTimeout(() => {
      const el = editorRefs.current[pageId];
      if (el) {
        el.innerHTML = content.replace(/\n/g, '<br>');
      }
    }, 50);
  };

  const openBook = (book: Book) => {
    setSelectedBook(book);
    setView('pages');
    loadPages(book.id);
  };

  const handleMetaChange = (pageId: string, field: 'chapter' | 'pageNumber', value: string) => {
    setEditingState((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], [field]: value, dirty: true },
    }));
  };

  const handleEditorInput = (pageId: string) => {
    const el = editorRefs.current[pageId];
    if (!el) return;
    const html = el.innerHTML;
    setEditingState((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], content: html, dirty: true },
    }));
  };

  const focusEditor = (pageId: string) => {
    setActivePageId(pageId);
  };

  const handleSavePage = async (pageId: string) => {
    const state = editingState[pageId];
    if (!state) return;
    const originalPage = pages.find((p) => p.id === pageId);
    if (!originalPage) return;
    setSaving(true);
    setError(null);
    try {
      const newPageNum = parseInt(state.pageNumber, 10);
      const validPageNum = !isNaN(newPageNum) && newPageNum > 0 ? newPageNum : originalPage.page_number;
      const hasScopedConflict = pages.some(
        (page) =>
          page.id !== pageId &&
          (page.book_part_id ?? null) === (originalPage.book_part_id ?? null) &&
          page.page_number === validPageNum
      );
      if (hasScopedConflict) {
        throw new Error(
          originalPage.book_part_id
            ? 'That page number is already used in this book part.'
            : 'That legacy page number is already used in this book.'
        );
      }
      await updatePage(pageId, state.content, state.chapter.trim() || null, validPageNum);
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? { ...p, content: state.content, chapter_title: state.chapter.trim() || null, page_number: validPageNum }
            : p
        ).sort(sortAdminPages)
      );
      setEditingState((prev) => ({
        ...prev,
        [pageId]: { ...prev[pageId], dirty: false },
      }));
      setSaveSuccessId(pageId);
      setTimeout(() => setSaveSuccessId((cur) => (cur === pageId ? null : cur)), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    try {
      await deletePage(pageId);
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      setEditingState((prev) => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
    } catch (e: any) {
      setError(e.message || 'Failed to delete page');
    }
  };

  const handleAddPage = async () => {
    if (!selectedBook) return;
    setSaving(true);
    setError(null);
    try {
      // This existing editor creates legacy/unassigned pages only. Number
      // allocation is therefore scoped to book_part_id IS NULL rather than
      // across the publication or any structured constituent part.
      const nextNum = await fetchNextPageNumber(selectedBook.id, null);
      const created = await addPage(selectedBook.id, nextNum, '', null, null);
      setPages((prev) => [...prev, created].sort(sortAdminPages));
      setEditingState((prev) => ({
        ...prev,
        [created.id]: { content: '', chapter: '', pageNumber: String(created.page_number), dirty: false },
      }));
      setEditorContent(created.id, '');
      // Scroll the new page into view after render
      setTimeout(() => {
        const el = editorRefs.current[created.id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    } catch (e: any) {
      setError(e.message || 'Failed to add page');
    } finally {
      setSaving(false);
    }
  };

  const goBackToBooks = () => { setView('books'); setSelectedBook(null); setPages([]); setEditingState({}); };
  const goBackToPages = () => { setView('pages'); };

  const applyColor = (color: string) => {
    // Ensure focus is in an editor before applying
    if (activePageId && editorRefs.current[activePageId]) {
      editorRefs.current[activePageId]!.focus();
    }
    if (colorPickerMode === 'text') {
      document.execCommand('foreColor', false, color);
    } else {
      document.execCommand('hiliteColor', false, color);
    }
    if (activePageId) handleEditorInput(activePageId);
    setShowColorPicker(false);
  };

  const applyFormat = (command: string, value?: string) => {
    if (activePageId && editorRefs.current[activePageId]) {
      editorRefs.current[activePageId]!.focus();
    }
    document.execCommand(command, false, value);
    if (activePageId) handleEditorInput(activePageId);
  };

  // BOOKS LIST VIEW
  if (view === 'books') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Control Panel</Text>
            <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Lock</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>
            {books.length} {books.length === 1 ? 'book' : 'books'} - tap to edit pages
          </Text>
        </View>
        {loading ? (
          <View style={styles.centerContainer}><ActivityIndicator size="large" color={AppColors.primary} /></View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadBooks}><Text style={styles.retryText}>Try Again</Text></TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={books}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBooks(); }} tintColor={AppColors.primary} colors={[AppColors.primary]} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.bookRow} onPress={() => openBook(item)} activeOpacity={0.7}>
                <View style={[styles.bookIconBox, { backgroundColor: item.color_accent || AppColors.primary }]}>
                  <BookIcon size={20} color={AppColors.white} strokeWidth={2} />
                </View>
                <View style={styles.bookInfo}>
                  <Text style={styles.bookRowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.bookRowMeta}>{item.author ? `${item.author} - ` : ''}{item.total_pages} pages</Text>
                </View>
                <ChevronRight size={20} color={AppColors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  // PAGES LIST VIEW
  if (view === 'pages' && selectedBook) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.backRow}>
            <TouchableOpacity onPress={goBackToBooks} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <ChevronLeft size={24} color={AppColors.text} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{selectedBook.title}</Text>
          </View>
          <TouchableOpacity style={styles.addPageBtn} onPress={handleAddPage} disabled={saving}>
            {saving ? <ActivityIndicator size={16} color={AppColors.textSecondary} /> : <Plus size={16} color={AppColors.textSecondary} strokeWidth={2} />}
            <Text style={styles.addPageText}>Add Page</Text>
          </TouchableOpacity>
        </View>
        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorBarText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}><X size={16} color={AppColors.white} strokeWidth={2} /></TouchableOpacity>
          </View>
        )}
        {loading ? (
          <View style={styles.centerContainer}><ActivityIndicator size="large" color={AppColors.primary} /></View>
        ) : (
          <FlatList
            data={pages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.pageRow}>
                <TouchableOpacity style={styles.pageRowContent} onPress={() => { setView('editor'); setEditorContent(item.id, item.content); setActivePageId(item.id); }} activeOpacity={0.7}>
                  <View style={styles.pageNumberBox}><Text style={styles.pageNumberText}>{item.page_number}</Text></View>
                  <View style={styles.pageInfo}>
                    {item.chapter_title ? <Text style={styles.pageChapter} numberOfLines={1}>{item.chapter_title}</Text> : null}
                    <Text style={styles.pagePreview} numberOfLines={2}>{item.content.substring(0, 100).replace(/<[^>]+>/g, '').replace(/\n/g, ' ')}</Text>
                  </View>
                  <FileText size={18} color={AppColors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeletePage(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Trash2 size={16} color={AppColors.error} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    );
  }

  // PAGE EDITOR VIEW - continuous scroll, all pages editable inline
  if (view === 'editor' && selectedBook) {
    const visiblePages = pages.slice(0, renderEnd);
    const dirtyCount = Object.values(editingState).filter((s) => s.dirty).length;

    return (
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.editorHeader}>
          <View style={styles.editorHeaderLeft}>
            <TouchableOpacity onPress={goBackToPages} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <ChevronLeft size={24} color={AppColors.text} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.editorTitle} numberOfLines={1}>{selectedBook.title}</Text>
          </View>
          <View style={styles.editorHeaderRight}>
            <TouchableOpacity style={styles.addPageBtn} onPress={handleAddPage} disabled={saving}>
              {saving ? <ActivityIndicator size={16} color={AppColors.textSecondary} /> : <Plus size={16} color={AppColors.textSecondary} strokeWidth={2} />}
              <Text style={styles.addPageText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Lock</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Formatting toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('undo')}>
            <Undo2 size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('redo')}>
            <Redo2 size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('bold')}>
            <Bold size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('italic')}>
            <Italic size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('underline')}>
            <Underline size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('justifyLeft')}>
            <AlignLeft size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('justifyCenter')}>
            <AlignCenter size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('justifyRight')}>
            <AlignRight size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => {
            const next = Math.max(1, editorFontSize - 1);
            setEditorFontSize(next);
            applyFormat('fontSize', String(next));
          }}>
            <Type size={13} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => {
            const next = Math.min(7, editorFontSize + 1);
            setEditorFontSize(next);
            applyFormat('fontSize', String(next));
          }}>
            <Type size={17} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => { setColorPickerMode('text'); setShowColorPicker(true); }}>
            <Palette size={15} color={AppColors.text} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => { setColorPickerMode('highlight'); setShowColorPicker(true); }}>
            <Palette size={15} color={AppColors.primaryLight} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => setShowFontPicker(true)}>
            <Type size={15} color={AppColors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => applyFormat('removeFormat')}>
            <X size={15} color={AppColors.error} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorBarText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}><X size={16} color={AppColors.white} strokeWidth={2} /></TouchableOpacity>
          </View>
        )}

        {/* Continuous scroll - all pages in one scroll, like the reader */}
        <ScrollView
          style={[styles.previewScroll, { backgroundColor: EDITOR_COLORS.background }]}
          contentContainerStyle={styles.previewScrollContent}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600 && renderEnd < pages.length) {
              setRenderEnd((prev) => Math.min(pages.length, prev + 15));
            }
          }}
          scrollEventThrottle={64}
        >
          {visiblePages.map((page, idx) => {
            const state = editingState[page.id];
            if (!state) return null;
            const isSaved = saveSuccessId === page.id;
            return (
              <View
                key={page.id}
                style={[
                  styles.previewPageCard,
                  {
                    borderColor: EDITOR_COLORS.accent,
                    backgroundColor: EDITOR_COLORS.background,
                    marginBottom: AppSpacing.xl,
                  },
                ]}
              >
                {/* Per-page meta + save row */}
                <View style={styles.pageMetaBar}>
                  <View style={styles.pageMetaLeft}>
                    <Text style={[styles.pageMetaLabel, { color: EDITOR_COLORS.secondaryText }]}>Page</Text>
                    <TextInput
                      style={[styles.pageMetaInput, { color: EDITOR_COLORS.text, borderColor: EDITOR_COLORS.secondaryText }]}
                      value={state.pageNumber}
                      onChangeText={(v) => handleMetaChange(page.id, 'pageNumber', v)}
                      placeholder="#"
                      placeholderTextColor={EDITOR_COLORS.secondaryText}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.pageMetaCenter}>
                    <TextInput
                      style={[styles.pageMetaChapterInput, { color: EDITOR_COLORS.text, borderColor: EDITOR_COLORS.secondaryText }]}
                      value={state.chapter}
                      onChangeText={(v) => handleMetaChange(page.id, 'chapter', v)}
                      placeholder="Chapter title (optional)"
                      placeholderTextColor={EDITOR_COLORS.secondaryText}
                    />
                  </View>
                  <View style={styles.pageMetaRight}>
                    {state.dirty && <Text style={styles.dirtyDot} />}
                    {isSaved ? (
                      <View style={styles.savedBadge}>
                        <Check size={11} color={AppColors.white} strokeWidth={2.5} />
                        <Text style={styles.savedText}>Saved</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.saveBtn, (!state.dirty || saving) && styles.saveBtnDisabled]}
                      onPress={() => handleSavePage(page.id)}
                      disabled={!state.dirty || saving}
                    >
                      {saving && saveSuccessId !== page.id ? (
                        <ActivityIndicator size={14} color={AppColors.white} />
                      ) : (
                        <Save size={14} color={AppColors.white} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeletePage(page.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.deleteIconBtn}>
                      <Trash2 size={16} color={AppColors.error} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Editable content area */}
                {Platform.OS === 'web' ? (
                  <div
                    ref={(el) => { editorRefs.current[page.id] = el; }}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => focusEditor(page.id)}
                    onInput={() => handleEditorInput(page.id)}
                    style={{
                      width: '100%',
                      minHeight: 300,
                      color: EDITOR_COLORS.text,
                      fontFamily: AppFonts.serif,
                      fontSize: '18px',
                      lineHeight: '21px',
                      textAlign: 'left',
                      outline: 'none',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      cursor: 'text',
                    }}
                  />
                ) : (
                  <Text style={[styles.previewTextMobile, { color: EDITOR_COLORS.text }]}>
                    Rich text editing is available on web.
                  </Text>
                )}
              </View>
            );
          })}
          {renderEnd < pages.length && (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={EDITOR_COLORS.accent} />
            </View>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Color picker modal */}
        <Modal visible={showColorPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{colorPickerMode === 'text' ? 'Text Color' : 'Highlight Color'}</Text>
                <TouchableOpacity onPress={() => setShowColorPicker(false)}><X size={20} color={AppColors.text} strokeWidth={2} /></TouchableOpacity>
              </View>
              <View style={styles.colorGrid}>
                {COLOR_PRESETS.map((color) => (
                  <TouchableOpacity key={color} style={[styles.colorSwatch, { backgroundColor: color }]} onPress={() => applyColor(color)} />
                ))}
              </View>
            </View>
          </View>
        </Modal>

        {/* Font picker modal */}
        <Modal visible={showFontPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Font Family</Text>
                <TouchableOpacity onPress={() => setShowFontPicker(false)}><X size={20} color={AppColors.text} strokeWidth={2} /></TouchableOpacity>
              </View>
              {FONT_PRESETS.map((font) => (
                <TouchableOpacity
                  key={font}
                  style={styles.fontOption}
                  onPress={() => { applyFormat('fontName', font); setShowFontPicker(false); }}
                >
                  <Text style={[styles.fontOptionText, { fontFamily: font }]}>{font}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.background },
  settingsContainer: { flex: 1, backgroundColor: AppColors.background },
  settingsContent: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: AppSpacing.lg, paddingTop: Platform.OS === 'web' ? 28 : 56, paddingBottom: AppSpacing.xxl },
  settingsTitle: { fontFamily: AppFonts.serifBold, fontSize: 34, color: AppColors.text, marginBottom: AppSpacing.lg },
  settingsSection: { fontFamily: AppFonts.sansMedium, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: AppColors.textMuted, marginTop: AppSpacing.md, marginBottom: AppSpacing.sm },
  settingsCard: { backgroundColor: AppColors.surface, borderRadius: AppRadius.lg, padding: AppSpacing.md, gap: AppSpacing.sm, marginBottom: AppSpacing.sm },
  settingsRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md, backgroundColor: AppColors.surface, borderRadius: AppRadius.md, paddingHorizontal: AppSpacing.md, marginBottom: AppSpacing.sm },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.md },
  settingRowLabel: { flex: 1, fontFamily: AppFonts.sansMedium, fontSize: 15, color: AppColors.text },
  settingRowSub: { fontFamily: AppFonts.sans, fontSize: 12, color: AppColors.textMuted, marginTop: 2 },
  settingSubLabel: { fontFamily: AppFonts.sansMedium, fontSize: 12, color: AppColors.textSecondary, marginTop: AppSpacing.sm },
  settingValue: { fontFamily: AppFonts.sansBold, fontSize: 12, color: AppColors.primaryLight },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing.sm },
  choiceChip: { minHeight: 38, paddingHorizontal: AppSpacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceElevated, borderRadius: AppRadius.md },
  choiceChipActive: { backgroundColor: AppColors.primary },
  choiceText: { fontFamily: AppFonts.sansMedium, fontSize: 13, color: AppColors.text },
  themeChoice: { flex: 1, minWidth: 105, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: AppColors.surface, borderRadius: AppRadius.md },
  donationSheet: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: AppColors.surface, borderRadius: AppRadius.xl, padding: AppSpacing.lg },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing.sm, marginTop: AppSpacing.lg },
  amountButton: { minWidth: '46%', flexGrow: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceElevated, borderRadius: AppRadius.md },
  amountButtonSelected: { backgroundColor: AppColors.primary },
  amountText: { color: AppColors.text, fontFamily: AppFonts.sansBold },
  customAmountInput: { marginTop: AppSpacing.sm, minHeight: 48, color: AppColors.text, backgroundColor: AppColors.surfaceElevated, borderRadius: AppRadius.md, paddingHorizontal: AppSpacing.md, fontFamily: AppFonts.sansMedium },
  selectedAmountRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, marginTop: AppSpacing.sm, padding: AppSpacing.sm, backgroundColor: AppColors.surfaceElevated, borderRadius: AppRadius.md },
  paymentHeading: { color: AppColors.text, fontFamily: AppFonts.serifBold, fontSize: 20, marginTop: AppSpacing.lg, marginBottom: AppSpacing.sm },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  paymentCopy: { flex: 1 },
  paymentLabel: { color: AppColors.textMuted, fontFamily: AppFonts.sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  paymentValue: { color: AppColors.text, fontFamily: AppFonts.sansMedium, fontSize: 15, marginTop: 2 },
  copyButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceElevated, borderRadius: AppRadius.sm },
  donationNote: { color: AppColors.textSecondary, fontFamily: AppFonts.sans, fontSize: 13, lineHeight: 19, marginTop: AppSpacing.lg },
  cancelAdmin: { marginTop: AppSpacing.md, padding: AppSpacing.sm },
  cancelAdminText: { color: AppColors.textSecondary, fontFamily: AppFonts.sansMedium },
  // Login
  loginContainer: { flex: 1, backgroundColor: AppColors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: AppSpacing.lg },
  loginCard: { width: '100%', maxWidth: 400, backgroundColor: AppColors.surface, borderRadius: AppRadius.xl, padding: AppSpacing.xl, alignItems: 'center' },
  loginIconBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: AppColors.surfaceElevated, alignItems: 'center', justifyContent: 'center', marginBottom: AppSpacing.md },
  loginTitle: { fontFamily: AppFonts.serifBold, fontSize: 24, color: AppColors.text, marginBottom: AppSpacing.xs },
  loginSubtitle: { fontFamily: AppFonts.sans, fontSize: 14, color: AppColors.textSecondary, textAlign: 'center', marginBottom: AppSpacing.lg },
  loginInput: { fontFamily: AppFonts.sans, fontSize: 16, color: AppColors.text, backgroundColor: AppColors.background, borderRadius: AppRadius.md, paddingHorizontal: AppSpacing.lg, paddingVertical: Platform.OS === 'web' ? 14 : 16, borderWidth: 1.5, borderColor: AppColors.border, width: '100%', marginBottom: AppSpacing.sm },
  loginInputError: { borderColor: AppColors.error },
  loginErrorText: { fontFamily: AppFonts.sans, fontSize: 13, color: AppColors.error, marginBottom: AppSpacing.sm },
  loginButton: { backgroundColor: AppColors.primary, borderRadius: AppRadius.md, paddingVertical: Platform.OS === 'web' ? 14 : 16, width: '100%', alignItems: 'center' },
  loginButtonText: { fontFamily: AppFonts.sansBold, fontSize: 16, color: AppColors.white },
  // Header
  header: { paddingHorizontal: AppSpacing.lg, paddingTop: Platform.OS === 'web' ? 24 : 56, paddingBottom: AppSpacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontFamily: AppFonts.serifBold, fontSize: 28, color: AppColors.text, marginBottom: 4, flexShrink: 1 },
  headerSubtitle: { fontFamily: AppFonts.sans, fontSize: 13, color: AppColors.textSecondary },
  logoutBtn: { paddingHorizontal: AppSpacing.md, paddingVertical: AppSpacing.xs, backgroundColor: AppColors.surfaceElevated, borderRadius: AppRadius.sm },
  logoutText: { fontFamily: AppFonts.sansMedium, fontSize: 13, color: AppColors.textSecondary },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, marginBottom: AppSpacing.sm },
  addPageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: AppSpacing.md, paddingVertical: AppSpacing.sm, backgroundColor: AppColors.surface, borderRadius: AppRadius.sm, alignSelf: 'flex-start' },
  addPageText: { fontFamily: AppFonts.sansMedium, fontSize: 13, color: AppColors.textSecondary },
  list: { paddingHorizontal: AppSpacing.lg, paddingBottom: AppSpacing.xxl },
  bookRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: AppSpacing.md, paddingHorizontal: AppSpacing.md, backgroundColor: AppColors.surface, borderRadius: AppRadius.md, marginBottom: AppSpacing.sm, gap: AppSpacing.md },
  bookIconBox: { width: 40, height: 40, borderRadius: AppRadius.sm, alignItems: 'center', justifyContent: 'center' },
  bookInfo: { flex: 1 },
  bookRowTitle: { fontFamily: AppFonts.sansMedium, fontSize: 15, color: AppColors.text, marginBottom: 2 },
  bookRowMeta: { fontFamily: AppFonts.sans, fontSize: 12, color: AppColors.textSecondary },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: AppSpacing.md },
  errorText: { fontFamily: AppFonts.sans, fontSize: 14, color: AppColors.error, textAlign: 'center' },
  retryButton: { paddingHorizontal: AppSpacing.lg, paddingVertical: AppSpacing.sm, backgroundColor: AppColors.primary, borderRadius: AppRadius.md },
  retryText: { fontFamily: AppFonts.sansMedium, fontSize: 14, color: AppColors.white },
  // Page list
  pageRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.surface, borderRadius: AppRadius.md, marginBottom: AppSpacing.sm, paddingRight: AppSpacing.sm },
  pageRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: AppSpacing.md, paddingHorizontal: AppSpacing.md, gap: AppSpacing.md },
  pageNumberBox: { width: 40, height: 40, borderRadius: AppRadius.sm, backgroundColor: AppColors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  pageNumberText: { fontFamily: AppFonts.sansBold, fontSize: 13, color: AppColors.textSecondary },
  pageInfo: { flex: 1 },
  pageChapter: { fontFamily: AppFonts.sansMedium, fontSize: 12, color: AppColors.primaryLight, marginBottom: 2 },
  pagePreview: { fontFamily: AppFonts.sans, fontSize: 13, color: AppColors.textSecondary, lineHeight: 18 },
  deleteBtn: { padding: AppSpacing.sm },
  // Editor header
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: AppSpacing.md, paddingTop: Platform.OS === 'web' ? 20 : 52, paddingBottom: AppSpacing.sm, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  editorHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, flex: 1 },
  editorHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  editorTitle: { fontFamily: AppFonts.sansMedium, fontSize: 15, color: AppColors.text, flexShrink: 1 },
  pageNavBtn: { padding: 4 },
  savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: AppColors.success, paddingHorizontal: 7, paddingVertical: 2, borderRadius: AppRadius.full },
  savedText: { fontFamily: AppFonts.sansBold, fontSize: 10, color: AppColors.white },
  // Toolbar
  toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', backgroundColor: AppColors.surface, borderBottomWidth: 1, borderBottomColor: AppColors.border, paddingHorizontal: 4, paddingVertical: 4, gap: 2 },
  toolbarBtn: { alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: AppRadius.sm, backgroundColor: AppColors.background },
  toolbarDivider: { width: 1, height: 20, backgroundColor: AppColors.border, marginHorizontal: 2 },
  // Hint bar
  hintBar: { backgroundColor: AppColors.background, paddingHorizontal: AppSpacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  hintText: { fontFamily: AppFonts.sans, fontSize: 12, color: AppColors.textSecondary, textAlign: 'center' },
  // Preview / editable area
  previewScroll: { flex: 1 },
  previewScrollContent: { padding: AppSpacing.xl, maxWidth: 900, width: '100%', alignSelf: 'center' },
  previewPageCard: { borderWidth: 3, borderRadius: AppRadius.lg, padding: AppSpacing.xl, borderStyle: 'dashed' as any },
  previewTextMobile: { fontFamily: AppFonts.serif, fontSize: 18, lineHeight: 22 },
  loadingMore: { paddingVertical: AppSpacing.lg, alignItems: 'center' },
  // Per-page meta bar
  pageMetaBar: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm, marginBottom: AppSpacing.md, flexWrap: 'wrap' },
  pageMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageMetaLabel: { fontFamily: AppFonts.sansMedium, fontSize: 11 },
  pageMetaInput: { fontFamily: AppFonts.sansBold, fontSize: 13, borderWidth: 1, borderRadius: AppRadius.sm, paddingHorizontal: 8, paddingVertical: 4, width: 50, textAlign: 'center' },
  pageMetaCenter: { flex: 1, minWidth: 150 },
  pageMetaChapterInput: { fontFamily: AppFonts.sans, fontSize: 13, borderWidth: 1, borderRadius: AppRadius.sm, paddingHorizontal: AppSpacing.sm, paddingVertical: 4 },
  pageMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dirtyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFA000' },
  saveBtn: { backgroundColor: AppColors.primary, borderRadius: AppRadius.sm, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  deleteIconBtn: { padding: 4 },
  // Error bar
  errorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AppColors.error, paddingHorizontal: AppSpacing.md, paddingVertical: AppSpacing.sm, marginHorizontal: AppSpacing.lg, marginTop: AppSpacing.sm, borderRadius: AppRadius.sm },
  errorBarText: { fontFamily: AppFonts.sans, fontSize: 12, color: AppColors.white, flex: 1 },
  // Modals
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: AppSpacing.lg },
  modalContent: { width: '100%', maxWidth: 500, backgroundColor: AppColors.surface, borderRadius: AppRadius.lg, padding: AppSpacing.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: AppSpacing.md },
  modalTitle: { fontFamily: AppFonts.serifBold, fontSize: 18, color: AppColors.text },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing.sm, justifyContent: 'center' },
  colorSwatch: { width: 44, height: 44, borderRadius: AppRadius.sm, borderWidth: 2, borderColor: AppColors.border },
  fontOption: { paddingVertical: AppSpacing.md, paddingHorizontal: AppSpacing.md, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  fontOptionText: { fontSize: 16, color: AppColors.text },
});
