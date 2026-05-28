/**
 * Theme Colors for AI Trends
 * Distinguishing Amazon-specific features from multi-platform features
 */

export const SOURCE_COLORS = {
  amazon: {
    primary: 'orange-500',
    bg: 'orange-50',
    bgHover: 'orange-100',
    border: 'orange-300',
    text: 'orange-700',
    textLight: 'orange-600',
    gradient: 'from-orange-500 to-amber-600',
    icon: '📦',
    label: 'Amazon'
  },
  multiPlatform: {
    primary: 'emerald-500',
    bg: 'emerald-50',
    bgHover: 'emerald-100',
    border: 'emerald-300',
    text: 'emerald-700',
    textLight: 'emerald-600',
    gradient: 'from-emerald-500 to-teal-600',
    icon: '🌍',
    label: 'Multi-Platform'
  }
} as const;

export type SourceType = keyof typeof SOURCE_COLORS;

