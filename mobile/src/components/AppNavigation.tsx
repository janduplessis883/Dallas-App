import { MaterialIcons } from '@expo/vector-icons';
import { Link, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const navigationItems = [
  { activeBackground: '#E6F1EA', activeColor: '#075A43', href: '/', icon: 'home', label: 'Home', routes: ['/'] },
  {
    activeBackground: '#FFF3B8',
    activeColor: '#806400',
    href: '/event-planning',
    icon: 'assignment',
    label: 'Plan',
    routes: ['/event-planning', '/danger-zone-planning'],
  },
  {
    activeBackground: '#DFF3F0',
    activeColor: '#007C78',
    href: '/dallas-app-buddies',
    icon: 'groups',
    label: 'Buddies',
    routes: ['/accountability', '/dallas-app-buddies'],
  },
  {
    activeBackground: '#F8E3ED',
    activeColor: '#B51E66',
    href: '/profile',
    icon: 'person',
    label: 'Profile',
    routes: ['/profile', '/settings'],
  },
] as const;

export function AppNavigation() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const canGoBack = pathname !== '/' && router.canGoBack();

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.navigationRow}>
          {canGoBack ? (
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              style={styles.navigationItem}
              onPress={() => router.back()}
            >
              <MaterialIcons color="#596760" name="arrow-back" size={24} />
              <Text style={styles.label}>Back</Text>
            </Pressable>
          ) : null}

          {navigationItems.map((item) => {
            const active = item.routes.includes(pathname as never);

            return (
              <Link key={item.href} href={item.href} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={
                    active
                      ? StyleSheet.flatten([styles.navigationItem, { backgroundColor: item.activeBackground }])
                      : styles.navigationItem
                  }
                >
                  <MaterialIcons color={active ? item.activeColor : '#596760'} name={item.icon} size={25} />
                  <Text style={[styles.label, active && { color: item.activeColor }]}>{item.label}</Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  navigation: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: '#E3E1DB',
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 9,
  },
  navigationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 62,
  },
  navigationItem: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 58,
    borderRadius: 8,
  },
  label: {
    color: '#596760',
    fontSize: 12,
    fontWeight: '700',
  },
});
