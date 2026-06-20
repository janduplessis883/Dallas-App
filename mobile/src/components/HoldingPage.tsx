import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type HoldingPageProps = {
  title: string;
  eyebrow: string;
  description: string;
  nextItems: string[];
};

export function HoldingPage({ description, eyebrow, nextItems, title }: HoldingPageProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.copy}>{description}</Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Coming next</Text>
          {nextItems.map((item) => (
            <View key={item} style={styles.itemRow}>
              <View style={styles.itemMarker} />
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>

        <Link href="/" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Back home</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  container: {
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#38635D',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#17211F',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  copy: {
    color: '#4F5D58',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  panelTitle: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '800',
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  itemMarker: {
    backgroundColor: '#38635D',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  itemText: {
    color: '#4F5D58',
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
