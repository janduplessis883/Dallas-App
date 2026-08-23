import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borders, colors, radii, spacing, type } from '../theme/designTokens';

export function SectionCard({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <View style={styles.card}>
      {title || description ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: borders.color,
    borderRadius: radii.card,
    borderWidth: borders.width,
    gap: spacing.control,
    padding: spacing.card,
  },
  header: {
    gap: spacing.tight,
  },
  title: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: type.sectionTitle,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    fontFamily: 'Manrope',
    fontSize: type.body,
    lineHeight: 21,
  },
});
