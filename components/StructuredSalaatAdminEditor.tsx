import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, ChevronRight, Italic, Lock, Palette, Redo2, Save, Underline, Undo2, X } from 'lucide-react-native';
import { useNavigation } from 'expo-router';
import { fetchBook, fetchReaderPages } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { AppColors, AppFonts, AppRadius, AppSpacing } from '@/lib/theme';
import type { Book, ReaderPage } from '@/types';

export const SALAAT_ADMIN_PART_ID = '59d7f112-fb58-4726-9c35-11485c6155e7';
const COLORS = ['#FFFFFF', '#000000', '#FF0000', '#FFCC00', '#39FF14', '#0099FF', '#9933FF', '#999999'];
type Draft = { text: string; dirty: boolean; pageId: string };

export function StructuredSalaatAdminEditor({ onLogout }: { onLogout: () => void }) {
  const navigation = useNavigation<any>();
  const [view, setView] = useState<'pages' | 'editor'>('pages');
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'text' | 'highlight' | null>(null);
  const [fontSize, setFontSize] = useState(3);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const parent = navigation.getParent?.();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: part, error: partError } = await supabase.from('book_parts').select('book_id').eq('id', SALAAT_ADMIN_PART_ID).single();
      if (partError) throw partError;
      const [bookData, pageData] = await Promise.all([fetchBook(part.book_id), fetchReaderPages(part.book_id, SALAAT_ADMIN_PART_ID)]);
      if (!bookData) throw new Error('Virtues of Salaat publication was not found.');
      if (pageData.some((page) => !page.isStructured || page.bookPartId !== SALAAT_ADMIN_PART_ID)) throw new Error('Admin refused a legacy or wrong-part page.');
      const next: Record<string, Draft> = {};
      pageData.forEach((page) => page.blocks.forEach((block) => { next[block.id] = { text: block.text, dirty: false, pageId: page.id }; }));
      setBook(bookData);
      setPages(pageData);
      setDrafts(next);
    } catch (reason: any) {
      setError(reason?.message || 'Failed to load structured Virtues of Salaat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateDraft = (blockId: string, text: string) => setDrafts((current) => ({ ...current, [blockId]: { ...current[blockId], text, dirty: true } }));
  const capture = (blockId: string) => { const element = refs.current[blockId]; if (element) updateDraft(blockId, element.innerText); };
  const format = (command: string, value?: string) => {
    if (Platform.OS !== 'web' || !activeBlockId) return;
    refs.current[activeBlockId]?.focus();
    document.execCommand(command, false, value);
    capture(activeBlockId);
  };

  const save = async () => {
    if (!activeBlockId || !book) return;
    const draft = drafts[activeBlockId];
    if (!draft?.dirty) return;
    setSaving(true);
    setError(null);
    try {
      const { data: identity, error: identityError } = await supabase.from('content_blocks')
        .select('id, page_id, book_id, page:pages!inner(book_part_id)')
        .eq('id', activeBlockId).eq('page_id', draft.pageId).eq('book_id', book.id)
        .eq('page.book_part_id', SALAAT_ADMIN_PART_ID).maybeSingle();
      if (identityError) throw identityError;
      if (!identity) throw new Error('Save refused: exact structured content-block UUID could not be verified.');
      const { error: updateError } = await supabase.from('content_blocks').update({ text_content: draft.text }).eq('id', activeBlockId).eq('page_id', draft.pageId);
      if (updateError) throw updateError;
      setDrafts((current) => ({ ...current, [activeBlockId]: { ...current[activeBlockId], dirty: false } }));
    } catch (reason: any) {
      setError(reason?.message || 'Structured block save failed.');
    } finally {
      setSaving(false);
    }
  };

  const toolbar = <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={styles.toolbarWrap} contentContainerStyle={styles.toolbar}>
    {[['undo', Undo2], ['redo', Redo2], ['bold', Bold], ['italic', Italic], ['underline', Underline], ['justifyLeft', AlignLeft], ['justifyCenter', AlignCenter], ['justifyRight', AlignRight]].map(([command, Icon]: any) => <TouchableOpacity key={command} style={styles.tool} onPress={() => format(command)}><Icon size={17} color={AppColors.text}/></TouchableOpacity>)}
    <TouchableOpacity style={styles.tool} onPress={() => { const next = Math.max(1, fontSize - 1); setFontSize(next); format('fontSize', String(next)); }}><Text style={styles.toolText}>A−</Text></TouchableOpacity>
    <TouchableOpacity style={styles.tool} onPress={() => { const next = Math.min(7, fontSize + 1); setFontSize(next); format('fontSize', String(next)); }}><Text style={styles.toolText}>A+</Text></TouchableOpacity>
    <TouchableOpacity style={styles.tool} onPress={() => setColorMode('text')}><Palette size={17} color={AppColors.text}/></TouchableOpacity>
    <TouchableOpacity style={styles.tool} onPress={() => setColorMode('highlight')}><Palette size={17} color={AppColors.primaryLight}/></TouchableOpacity>
    {activeBlockId && drafts[activeBlockId]?.dirty ? <TouchableOpacity style={styles.save} disabled={saving} onPress={save}>{saving ? <ActivityIndicator size="small" color={AppColors.white}/> : <Save size={18} color={AppColors.white}/>}</TouchableOpacity> : null}
  </ScrollView>;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={AppColors.primary}/></View>;
  if (view === 'pages') return <View style={styles.container}>
    <View style={styles.header}><View><Text style={styles.title}>Virtues of Salaat</Text><Text style={styles.subtitle}>Structured pages only · permanent part</Text></View><TouchableOpacity style={styles.lock} onPress={onLogout}><Lock size={17} color={AppColors.textSecondary}/></TouchableOpacity></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <FlatList data={pages} keyExtractor={(page) => page.id} contentContainerStyle={styles.list} renderItem={({ item }) => <TouchableOpacity style={styles.pageRow} onPress={() => setView('editor')}><View style={styles.pageBadge}><Text style={styles.pageBadgeText}>{item.printedPageLabel || '—'}</Text></View><View style={styles.pageCopy}><Text style={styles.pageTitle}>{item.printedPageLabel ? `Printed page ${item.printedPageLabel}` : `Opening page · PDF ${item.pdfPageNumber}`}</Text><Text style={styles.preview} numberOfLines={2}>{item.blocks.map((block) => block.text).join(' ')}</Text></View><ChevronRight size={18} color={AppColors.textMuted}/></TouchableOpacity>}/>
  </View>;

  return <View style={styles.container}>
    {!activeBlockId ? <View style={styles.editorHeader}><TouchableOpacity onPress={() => setView('pages')}><ChevronLeft size={24} color={AppColors.text}/></TouchableOpacity><Text style={styles.editorTitle}>Virtues of Salaat · Structured Editor</Text><TouchableOpacity onPress={onLogout}><Lock size={17} color={AppColors.textSecondary}/></TouchableOpacity></View> : null}
    {toolbar}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <ScrollView style={styles.canvas} contentContainerStyle={styles.canvasContent} keyboardShouldPersistTaps="always">
      {pages.map((page) => <View key={page.id} style={styles.pageCanvas}><Text style={styles.printedLabel}>{page.printedPageLabel ? `Page ${page.printedPageLabel}` : `Opening page · PDF ${page.pdfPageNumber}`}</Text>{page.blocks.map((block) => {
        const draft = drafts[block.id]; const rtl = block.direction === 'rtl' || block.type === 'arabic';
        return <View key={block.id} style={[styles.block, block.type === 'translation' && styles.translation]}><Text style={styles.identity}>{block.type} · {block.id}</Text>{Platform.OS === 'web' ? <div ref={(element) => { refs.current[block.id] = element; }} contentEditable suppressContentEditableWarning onFocus={() => setActiveBlockId(block.id)} onInput={() => capture(block.id)} style={{ width: '100%', minHeight: 54, color: '#D4D4D4', fontFamily: AppFonts.serif, fontSize: '18px', lineHeight: '24px', textAlign: rtl ? 'right' : block.type === 'heading' ? 'center' : 'justify', direction: rtl ? 'rtl' : 'ltr', outline: activeBlockId === block.id ? '1px solid #39FF14' : 'none', whiteSpace: 'pre-wrap', padding: '6px 2px' }}>{draft?.text || block.text}</div> : <TextInput multiline value={draft?.text || block.text} onFocus={() => setActiveBlockId(block.id)} onChangeText={(text) => updateDraft(block.id, text)} style={[styles.nativeInput, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}/>}</View>;
      })}</View>)}<View style={styles.bottomFill}/>
    </ScrollView>
    <Modal visible={colorMode !== null} transparent animationType="fade"><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{colorMode === 'text' ? 'Text Color' : 'Highlight Color'}</Text><TouchableOpacity onPress={() => setColorMode(null)}><X size={20} color={AppColors.text}/></TouchableOpacity></View><View style={styles.colors}>{COLORS.map((color) => <TouchableOpacity key={color} style={[styles.swatch,{backgroundColor:color}]} onPress={() => { format(colorMode === 'text' ? 'foreColor' : 'hiliteColor', color); setColorMode(null); }}/>)}</View></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:AppColors.background}, center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:AppColors.background}, header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:AppSpacing.md,paddingTop:Platform.OS==='web'?20:52,paddingBottom:AppSpacing.md}, title:{fontFamily:AppFonts.serifBold,fontSize:26,color:AppColors.text}, subtitle:{fontFamily:AppFonts.sans,fontSize:12,color:AppColors.textSecondary}, lock:{width:36,height:36,borderRadius:18,backgroundColor:AppColors.surface,alignItems:'center',justifyContent:'center'}, list:{paddingHorizontal:8,paddingBottom:40}, pageRow:{flexDirection:'row',alignItems:'center',gap:AppSpacing.sm,backgroundColor:AppColors.surface,padding:AppSpacing.md,marginBottom:6,borderRadius:AppRadius.md}, pageBadge:{width:42,height:42,borderRadius:21,backgroundColor:AppColors.surfaceElevated,alignItems:'center',justifyContent:'center'},pageBadgeText:{fontFamily:AppFonts.sansBold,color:AppColors.text},pageCopy:{flex:1},pageTitle:{fontFamily:AppFonts.sansMedium,fontSize:13,color:AppColors.primaryLight},preview:{fontFamily:AppFonts.serif,fontSize:13,color:AppColors.textSecondary,marginTop:3},error:{color:AppColors.white,backgroundColor:AppColors.error,padding:10,marginHorizontal:8,borderRadius:6},editorHeader:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:10,paddingTop:Platform.OS==='web'?12:48,paddingBottom:8},editorTitle:{flex:1,fontFamily:AppFonts.sansMedium,fontSize:14,color:AppColors.text},toolbarWrap:{flexGrow:0,backgroundColor:AppColors.surface,borderBottomWidth:1,borderBottomColor:AppColors.border,zIndex:20},toolbar:{alignItems:'center',paddingHorizontal:4,paddingVertical:5,gap:3},tool:{width:34,height:34,borderRadius:8,backgroundColor:AppColors.background,alignItems:'center',justifyContent:'center'},toolText:{fontFamily:AppFonts.sansBold,color:AppColors.text,fontSize:12},save:{width:38,height:34,borderRadius:8,backgroundColor:AppColors.primary,alignItems:'center',justifyContent:'center'},canvas:{flex:1,backgroundColor:'#1A1A1A'},canvasContent:{flexGrow:1,paddingHorizontal:6,paddingTop:8},pageCanvas:{paddingHorizontal:4,paddingVertical:10,marginBottom:14},printedLabel:{fontFamily:AppFonts.sansMedium,fontSize:12,color:'#888',textAlign:'right',marginBottom:8},block:{marginBottom:12,borderRadius:5},translation:{backgroundColor:'rgba(57,255,20,0.045)',paddingHorizontal:6},identity:{fontFamily:AppFonts.sans,fontSize:9,color:'#666',marginBottom:2},nativeInput:{minHeight:60,color:'#D4D4D4',fontFamily:AppFonts.serif,fontSize:18,lineHeight:24,padding:4},bottomFill:{height:120,backgroundColor:'#1A1A1A'},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.7)',alignItems:'center',justifyContent:'center',padding:20},modal:{width:'100%',maxWidth:420,backgroundColor:AppColors.surface,padding:16,borderRadius:14},modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:14},modalTitle:{fontFamily:AppFonts.serifBold,fontSize:18,color:AppColors.text},colors:{flexDirection:'row',flexWrap:'wrap',gap:10},swatch:{width:44,height:44,borderRadius:8,borderWidth:1,borderColor:AppColors.border},
});
