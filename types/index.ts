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
}

export interface Bookmark {
  id: string;
  book_id: string;
  page_number: number;
  note: string | null;
  created_at: string;
}

export interface ReadingProgress {
  id: string;
  book_id: string;
  current_page: number;
  scroll_offset: number;
  updated_at: string;
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
