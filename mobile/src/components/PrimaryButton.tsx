import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, spacing, touchTarget, type } from '../theme/designTokens';

export function PrimaryButton({
  children,
  disabled,
  loading,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled || loading}
      style={[styles.button, (disabled || loading) && styles.disabled]}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.label}>{children}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  disabled,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.secondary, disabled && styles.disabled]}
      onPress={onPress}
    >
      <Text style={styles.secondaryLabel}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    justifyContent: 'center',
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.card,
  },
  secondary: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radii.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.card,
  },
  label: {
    color: colors.white,
    fontFamily: 'Manrope',
    fontSize: type.button,
    fontWeight: '900',
  },
  secondaryLabel: {
    color: colors.primary,
    fontFamily: 'Manrope',
    fontSize: type.button,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.55,
  },
});
