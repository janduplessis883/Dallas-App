import { MaterialIcons } from '@expo/vector-icons';
import { Link, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/designTokens';
import { supabase } from '../lib/supabase';

const navigationItems = [
  { activeBackground: '#EEF1EC', activeColor: '#2E4737', href: '/', icon: 'home', label: 'Home', routes: ['/'] },
  {
    activeBackground: '#EEF1EC',
    activeColor: '#2E4737',
    href: '/event-planning',
    icon: 'assignment',
    label: 'Plan',
    routes: ['/event-planning', '/danger-zone-planning'],
  },
  {
    activeBackground: '#EEF1EC',
    activeColor: '#2E4737',
    href: '/accountability',
    icon: 'notifications',
    label: 'Reminders',
    routes: ['/accountability'],
  },
  {
    activeBackground: '#EEF1EC',
    activeColor: '#2E4737',
    href: '/dallas-app-buddies',
    icon: 'groups',
    label: 'Check-in',
    routes: ['/dallas-app-buddies'],
  },
  {
    activeBackground: '#EEF1EC',
    activeColor: '#2E4737',
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
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const checkInBadgeCount = pendingInvitations + unreadMessageCount;

  useEffect(() => {
    async function loadCheckInBadge() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        setPendingInvitations(0);
        setUnreadMessageCount(0);
        return;
      }

      const { data, error } = await supabase.rpc('get_check_in_badge');
      const badge = !error && data?.[0] ? data[0] : null;

      setPendingInvitations(Number(badge?.pending_invitation_count ?? 0));
      setUnreadMessageCount(
        Number(badge?.unread_app_message_count ?? 0)
        + Number(badge?.unread_external_reply_count ?? 0),
      );
    }

    loadCheckInBadge();
  }, [pathname]);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {canGoBack ? (
        <View pointerEvents="box-none" style={[styles.topBar, { top: Math.max(4, insets.top - 16) }]}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.topBackButton}
            onPress={() => router.back()}
          >
            <MaterialIcons color={colors.quiet} name="arrow-back" size={21} />
            <Text style={styles.topBackLabel}>Back</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.navigationRow}>
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
                  <MaterialIcons color={active ? item.activeColor : '#777777'} name={item.icon} size={25} />
                  {item.href === '/dallas-app-buddies' && checkInBadgeCount ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{checkInBadgeCount > 99 ? '99+' : checkInBadgeCount}</Text>
                    </View>
                  ) : null}
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
    top: 0,
  },
  topBar: {
    left: 12,
    position: 'absolute',
    right: 12,
    zIndex: 2,
  },
  topBackButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  topBackLabel: {
    color: colors.quiet,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
  },
  navigation: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 9,
    position: 'absolute',
    right: 0,
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
    color: colors.quiet,
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '600',
  },
  badge: { alignItems: 'center', backgroundColor: '#A33D32', borderRadius: 9, height: 18, justifyContent: 'center', position: 'absolute', right: 12, top: 2, minWidth: 18 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
