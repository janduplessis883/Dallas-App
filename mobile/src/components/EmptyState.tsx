import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '../theme/designTokens';

export function EmptyState({
  action,
  description,
  title,
  tone = 'neutral',
}: {
  action?: ReactNode;
  description: string;
  title: string;
  tone?: 'neutral' | 'error';
}) {
  const error = tone === 'error';

  return (
    <View style={[styles.container, error && styles.errorContainer]}>
      <Text style={[styles.title, error && styles.errorText]}>{title}</Text>
      <Text style={[styles.description, error && styles.errorText]}>{description}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EEF1EC',
    borderRadius: 10,
    gap: spacing.compact,
    padding: spacing.card,
  },
  errorContainer: {
    backgroundColor: colors.dangerSoft,
  },
  title: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: type.cardTitle,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    fontFamily: 'Manrope',
    fontSize: type.body,
    lineHeight: 21,
  },
  errorText: {
    color: colors.danger,
  },
  action: {
    marginTop: spacing.compact,
  },
});
