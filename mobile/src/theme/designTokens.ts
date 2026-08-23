export const colors = {
  background: '#F7F7F5',
  ink: '#171717',
  muted: '#777777',
  quiet: '#768277',
  border: '#E7E6E2',
  divider: '#E7E6E2',
  primary: '#2E4737',
  primarySoft: '#EEF1EC',
  support: '#829480',
  supportSoft: '#EEF1EC',
  warning: '#768277',
  warningSoft: '#EEF1EC',
  danger: '#A33D32',
  dangerSoft: '#FFF8F7',
  white: '#FFFFFF',
} as const;

export const type = {
  screenTitle: 30,
  heroTitle: 28,
  sectionTitle: 17,
  cardTitle: 16,
  body: 15,
  bodyLarge: 16,
  supporting: 13,
  button: 15,
  uiFont: 'Manrope',
  metaFont: 'DM Mono',
} as const;

export const spacing = {
  screen: 20,
  section: 16,
  card: 14,
  compact: 8,
  tight: 4,
  control: 12,
  touchTarget: 44,
} as const;

export const radii = {
  card: 12,
  control: 10,
  pill: 999,
} as const;

export const borders = {
  width: 1,
  color: colors.border,
  divider: colors.divider,
} as const;

export const statusColors = {
  success: colors.support,
  successSurface: colors.supportSoft,
  warning: colors.warning,
  warningSurface: colors.warningSoft,
  error: colors.danger,
  errorSurface: colors.dangerSoft,
  neutral: colors.quiet,
  neutralSurface: '#EEF1EC',
} as const;

export const touchTarget = {
  minHeight: spacing.touchTarget,
  minWidth: spacing.touchTarget,
} as const;
