// Spotify-faithful design tokens

export const Colors = {
  // Primary
  primary: '#1DB954',
  primaryDark: '#1AA34A',
  primaryLight: '#1ED760',

  // Backgrounds
  background: '#121212',
  surface: '#181818',
  surfaceLight: '#282828',
  surfaceElevated: '#333333',
  surfaceHighlight: '#3E3E3E',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textMuted: '#727272',
  textDisabled: '#535353',

  // Utility
  error: '#F15E6C',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',

  // Gradients
  gradientStart: '#404040',
  gradientEnd: '#121212',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  display: 34,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};

export const BorderRadius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  round: 9999,
};

export const Shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
};

export const Layout = {
  screenPaddingH: Spacing.lg,
  tabBarHeight: 64,
  miniPlayerHeight: 56,
  statusBarOffset: 0, // will be set dynamically
  bottomInset: 0, // will be set dynamically
};
