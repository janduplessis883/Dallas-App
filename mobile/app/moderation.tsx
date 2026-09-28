import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme/designTokens';

type Report = {
  created_at: string; email_attempt_count: number; email_last_error: string | null; email_status: string;
  id: string; message_snapshot: string; reason: string; review_note: string | null;
  source: string; source_message_id: string; status: string; subject_user_id: string | null;
};
const statuses = ['new', 'in_review', 'resolved', 'dismissed'];

export default function ModerationScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [filter, setFilter] = useState('new');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const callAdmin = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('admin-moderation', { body: payload });
    if (invokeError) throw new Error(invokeError.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { setAllowed(false); setLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('user_role').eq('id', session.session.user.id).maybeSingle();
    if (profile?.user_role !== 'admin') { setAllowed(false); setLoading(false); return; }
    setAllowed(true);
    try {
      const result = await callAdmin({ action: 'list_reports', status: filter });
      setReports(result.reports ?? []);
      setSelected((current) => current ? (result.reports ?? []).find((r: Report) => r.id === current.id) ?? current : null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports.'); }
    setLoading(false);
  }, [callAdmin, filter]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function perform(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await callAdmin({ action, reportId: selected.id, ...extra });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'The action could not be completed.'); }
    setBusy(false);
  }

  if (loading && allowed === null) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  if (!allowed) return <SafeAreaView style={styles.center}><Text style={styles.heading}>Moderation unavailable</Text><Text style={styles.copy}>This section is for Dallas admins.</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Moderation</Text>
      <Text style={styles.copy}>Review reports submitted by Dallas users.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {statuses.map((status) => <Pressable key={status} style={[styles.filter, status === filter && styles.filterActive]} onPress={() => { setFilter(status); setSelected(null); }}><Text style={styles.filterText}>{title(status)}</Text></Pressable>)}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : reports.length === 0 ? <Text style={styles.copy}>No {filter.replace('_', ' ')} reports.</Text> : reports.map((report) => <Pressable key={report.id} style={[styles.report, selected?.id === report.id && styles.selected]} onPress={() => { setSelected(report); setNote(report.review_note ?? ''); }}><Text style={styles.reportTitle}>{report.source === 'buddy_message' ? 'Dallas buddy message' : 'External check-in reply'}</Text><Text style={styles.copy}>{new Date(report.created_at).toLocaleString()} · {title(report.status)}</Text><Text numberOfLines={2} style={styles.copy}>{report.reason}</Text></Pressable>)}
      {selected ? <View style={styles.detail}>
        <Text style={styles.reportTitle}>Report details</Text>
        <Text style={styles.copy}>Report ID: {selected.id}</Text>
        <Text style={styles.copy}>Reported message</Text><Text style={styles.message}>{selected.message_snapshot}</Text>
        <Text style={styles.copy}>Reason: {selected.reason}</Text>
        <Text style={styles.copy}>Email: {selected.email_status} · attempts {selected.email_attempt_count}</Text>
        {selected.email_last_error ? <Text style={styles.error}>{selected.email_last_error}</Text> : null}
        <TextInput value={note} onChangeText={setNote} placeholder="Internal review note" multiline style={styles.input} />
        <View style={styles.actions}>
          <Action title="In review" disabled={busy} onPress={() => perform('set_report_status', { status: 'in_review', note })} />
          <Action title="Resolve" disabled={busy} onPress={() => perform('set_report_status', { status: 'resolved', note })} />
          <Action title="Dismiss" disabled={busy} onPress={() => perform('set_report_status', { status: 'dismissed', note })} />
          {selected.email_status !== 'sent' ? <Action title="Retry email" disabled={busy} onPress={() => perform('retry_email')} /> : null}
          <Action title="Remove message" disabled={busy} onPress={() => { if (!reason.trim()) { setError('Enter an action reason below first.'); return; } perform('remove_message', { reason }); }} />
          {selected.status !== 'new' ? <Action title="Restore message" disabled={busy} onPress={() => { if (!reason.trim()) { setError('Enter an action reason below first.'); return; } perform('restore_message', { reason }); }} /> : null}
          {selected.subject_user_id ? <Action title="Suspend account" disabled={busy} onPress={() => { if (!reason.trim()) { setError('Enter an action reason below first.'); return; } Alert.alert('Suspend account', 'Choose how long this Dallas account should be suspended.', [{ text: 'Cancel', style: 'cancel' }, ...(['1d', '7d', '30d', 'indefinite'] as const).map((duration) => ({ text: duration === 'indefinite' ? 'Indefinitely' : duration, onPress: () => perform('suspend_account', { reason, duration }) }))]); }} /> : null}
          {selected.subject_user_id ? <Action title="Reinstate account" disabled={busy} onPress={() => { if (!reason.trim()) { setError('Enter an action reason below first.'); return; } perform('reinstate_account', { reason }); }} /> : null}
        </View>
        <TextInput value={reason} onChangeText={setReason} placeholder="Reason for removal or account action" multiline style={styles.input} />
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

function Action({ title, disabled, onPress }: { title: string; disabled: boolean; onPress: () => void }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: .5 }]}><Text style={styles.actionText}>{title}</Text></Pressable>; }
function title(value: string) { return value.replace('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 120, gap: 12 }, heading: { color: colors.ink, fontFamily: 'Manrope', fontSize: 26, fontWeight: '800' }, copy: { color: colors.quiet, fontFamily: 'Manrope', fontSize: 14 }, filters: { gap: 8 }, filter: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: '#EEF1EC' }, filterText: { color: colors.ink, fontFamily: 'Manrope', fontWeight: '700' }, report: { padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', borderRadius: 12, gap: 4 }, selected: { borderColor: colors.primary, borderWidth: 2 }, reportTitle: { color: colors.ink, fontFamily: 'Manrope', fontWeight: '800', fontSize: 16 }, detail: { padding: 16, borderRadius: 14, backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, gap: 10 }, message: { color: colors.ink, backgroundColor: '#F4F5F2', padding: 12, borderRadius: 10 }, input: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 52, color: colors.ink, fontFamily: 'Manrope' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, action: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 }, actionText: { color: 'white', fontFamily: 'Manrope', fontWeight: '700' }, error: { color: '#A33B30', fontFamily: 'Manrope' } });
