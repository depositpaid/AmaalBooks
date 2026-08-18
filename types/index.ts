export interface Book {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  total_pages: number;
  description: string | null;
  color_accent: string;
  sort_order: number;
  created_at: string;
}

export interface Page {
  id: string;
  book_id: string;
  page_number: number;
  content: string;
  chapter_title: string | null;
  created_at: string;
  edition_id?: string | null;
  source_document_id?: string | null;
  printed_page_label?: string | null;
  printed_page_number?: number | null;
  pdf_page_number?: number | null;
  sequence_index?: number | null;
  verification_status?: VerificationStatus | 'legacy_unverified';
  verified_at?: string | null;
  updated_at?: string;
}

export interface Bookmark {
  id: string;
  book_id: string;
  page_number: number;
  note: string | null;
  created_at: string;
  page_id?: string | null;
  block_id?: string | null;
}

export interface ReadingProgress {
  id: string;
  book_id: string;
  current_page: number;
  scroll_offset: number;
  updated_at: string;
  page_id?: string | null;
  block_id?: string | null;
}

export type VerificationStatus = 'draft' | 'in_review' | 'verified' | 'rejected';
export type ImportStatus = 'pending' | 'imported' | 'in_review' | 'verified' | 'rejected';
export type ContentDirection = 'ltr' | 'rtl' | 'auto';
export type InitialContentBlockType =
  | 'english'
  | 'arabic'
  | 'translation'
  | 'heading'
  | 'note';
export type ContentBlockType = InitialContentBlockType | (string & {});
export type InitialStructuralNodeType = 'chapter' | 'section' | 'hadith';
export type StructuralNodeType = InitialStructuralNodeType | (string & {});

export interface BookEdition {
  id: string;
  book_id: string;
  edition_label: string;
  publisher: string | null;
  publication_label: string | null;
  isbn: string | null;
  language_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceDocument {
  id: string;
  edition_id: string;
  document_type: string;
  original_filename: string | null;
  storage_path: string | null;
  sha256_checksum: string | null;
  pdf_page_count: number | null;
  notes: string | null;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  book_id: string;
  edition_id: string | null;
  source_document_id: string | null;
  status: ImportStatus;
  imported_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface StructuralNode {
  id: string;
  book_id: string;
  edition_id: string | null;
  parent_id: string | null;
  node_type: StructuralNodeType;
  source_label: string | null;
  source_identifier: string | null;
  title: string | null;
  sequence_index: number;
  start_page_id: string | null;
  end_page_id: string | null;
  start_block_id: string | null;
  end_block_id: string | null;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
}

export interface ContentBlock {
  id: string;
  book_id: string;
  page_id: string;
  structural_node_id: string | null;
  import_batch_id: string | null;
  source_document_id: string | null;
  sequence_index: number;
  block_type: ContentBlockType;
  language_code: string | null;
  direction: ContentDirection;
  text_content: string;
  raw_ocr_text: string | null;
  tts_eligible: boolean;
  verification_status: VerificationStatus;
  source_page_region: Record<string, unknown> | null;
  provenance_notes: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

export interface SearchResult {
  page: Page;
  book: Book;
  snippet: string;
  matchIndex: number;
}

export type ReadingTheme = 'default' | 'sepia' | 'dark' | 'cream' | 'night';

export interface ThemeColors {
  name: ReadingTheme;
  label: string;
  background: string;
  text: string;
  accent: string;
  surface: string;
  secondaryText: string;
}

export const READING_THEMES: Record<ReadingTheme, ThemeColors> = {
  default: {
    name: 'default',
    label: 'White',
    background: '#FFFFFF',
    text: '#1A1A1A',
    accent: '#00E676',
    surface: '#F5F5F5',
    secondaryText: '#666666',
  },
  sepia: {
    name: 'sepia',
    label: 'Sepia',
    background: '#F4ECD8',
    text: '#3B2F1E',
    accent: '#00E676',
    surface: '#E8DFC8',
    secondaryText: '#7A6B52',
  },
  cream: {
    name: 'cream',
    label: 'Cream',
    background: '#FFF8E7',
    text: '#2D2D2D',
    accent: '#00E676',
    surface: '#F5EDD6',
    secondaryText: '#6B6B6B',
  },
  dark: {
    name: 'dark',
    label: 'Dark',
    background: '#1A1A1A',
    text: '#D4D4D4',
    accent: '#39FF14',
    surface: '#2A2A2A',
    secondaryText: '#888888',
  },
  night: {
    name: 'night',
    label: 'Night',
    background: '#0D0D0D',
    text: '#AAB2B5',
    accent: '#39FF14',
    surface: '#1C1C1C',
    secondaryText: '#666666',
  },
};
