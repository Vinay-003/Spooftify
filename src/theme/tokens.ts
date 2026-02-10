// Spooftify design tokens — distinct identity with indigo/coral palette

export const Colors = {
  // Primary accent — warm coral/amber
  primary: '#FF6B6B',
  primaryDark: '#E85D5D',
  primaryLight: '#FF8A8A',

  // Secondary accent — electric violet
  secondary: '#7C5CFC',
  secondaryDark: '#6A4BE0',
  secondaryLight: '#9B82FF',

  // Tertiary — amber/gold for highlights
  tertiary: '#FFB347',
  tertiaryDark: '#E09A30',

  // Backgrounds — deep indigo-black
  background: '#0A0E1A',
  surface: '#111827',
  surfaceLight: '#1C2333',
  surfaceElevated: '#242D3F',
  surfaceHighlight: '#2E3A50',

  // Glass effect
  glass: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassLight: 'rgba(255, 255, 255, 0.08)',

  // Text
  textPrimary: '#F0F2F5',
  textSecondary: '#8B95A8',
  textMuted: '#5A6478',
  textDisabled: '#3D4557',

  // Utility
  error: '#FF5C72',
  success: '#34D399',
  overlay: 'rgba(0, 0, 0, 0.75)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',

  // Gradients
  gradientStart: '#1A2240',
  gradientMid: '#111827',
  gradientEnd: '#0A0E1A',

  // Glow colors (for shadow effects)
  glowPrimary: 'rgba(255, 107, 107, 0.3)',
  glowSecondary: 'rgba(124, 92, 252, 0.3)',
  glowAmbient: 'rgba(124, 92, 252, 0.15)',
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
  hero: 42,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
  black: '900' as const,
};

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 9999,
};

export const Shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  glowSecondary: {
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const Layout = {
  screenPaddingH: Spacing.lg,
  tabBarHeight: 64,
  miniPlayerHeight: 60,
  statusBarOffset: 0,
  bottomInset: 0,
};
