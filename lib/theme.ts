export const AppColors = {
  // Primary red palette
  red: {
    50: '#FFF0F0',
    100: '#FFD9D9',
    200: '#FFB3B3',
    300: '#FF8A8A',
    400: '#E63950',
    500: '#C41E3A',
    600: '#A01830',
    700: '#7D1225',
    800: '#5A0C1B',
    900: '#3D0812',
  },
  // Black/dark palette
  black: {
    50: '#F2F2F2',
    100: '#D9D9D9',
    200: '#B8B8B8',
    300: '#888888',
    400: '#555555',
    500: '#333333',
    600: '#222222',
    700: '#1A1A1A',
    800: '#111111',
    900: '#0A0A0A',
  },
  // Semantic
  primary: '#C41E3A',
  primaryLight: '#E63950',
  primaryDark: '#7D1225',
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceLight: '#222222',
  surfaceElevated: '#2A2A2A',
  text: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: '#2A2A2A',
  borderLight: '#333333',
  error: '#E63950',
  success: '#2D8659',
  warning: '#D4941A',
  white: '#FFFFFF',
  offWhite: '#F5F5F5',
} as const;

export const AppSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const AppFonts = {
  sans: 'Inter-Regular',
  sansMedium: 'Inter-Medium',
  sansBold: 'Inter-Bold',
  serif: 'Lora-Regular',
  serifBold: 'Lora-Bold',
} as const;

export const AppRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;
