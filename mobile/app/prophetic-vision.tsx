import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Markdown from 'react-native-markdown-display';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../src/lib/supabase';

type PropheticVisionRow = {
  id: string;
  audio_file_name: string | null;
  audio_path: string | null;
  cover_image_path: string | null;
  long_version: string;
  short_version: string;
};

type RewriteResponse = {
  longVersion?: string;
  shortVersion?: string;
};

export default function PropheticVisionScreen() {
  const [audioFileName, setAudioFileName] = useState('');
  const [audioPath, setAudioPath] = useState('');
  const [audioUri, setAudioUri] = useState('');
  const [coverImagePath, setCoverImagePath] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [editingLongVersion, setEditingLongVersion] = useState(false);
  const [editingShortVersion, setEditingShortVersion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [longVersion, setLongVersion] = useState('');
  const [message, setMessage] = useState('');
  const [recordingUri, setRecordingUri] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [shortVersion, setShortVersion] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [visionId, setVisionId] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    if (audioUri) {
      player.replace(audioUri);
    }
  }, [audioUri, player]);

  useEffect(() => {
    let mounted = true;

    async function loadVision() {
      const { data: sessionData } = await supabase.auth.getSession();
      const nextSession = sessionData.session;

      if (!mounted) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('prophetic_visions')
        .select('id, audio_file_name, audio_path, cover_image_path, long_version, short_version')
        .eq('user_id', nextSession.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<PropheticVisionRow>();

      if (!mounted) {
        return;
      }

      if (error) {
        setMessage(error.message);
      }

      if (data) {
        setAudioFileName(data.audio_file_name ?? '');
        setAudioPath(data.audio_path ?? '');
        setCoverImagePath(data.cover_image_path ?? '');
        setCoverImageUrl(data.cover_image_path ? getPublicCoverImageUrl(data.cover_image_path) : '');
        setLongVersion(data.long_version);
        setShortVersion(data.short_version);
        setVisionId(data.id);

        if (data.audio_path) {
          try {
            const signedUrl = await getSignedAudioUrl(data.audio_path);

            if (mounted) {
              setAudioUri(signedUrl);
            }
          } catch (audioError) {
            if (mounted) {
              setMessage(audioError instanceof Error ? audioError.message : 'Audio could not be loaded.');
            }
          }
        }
      }

      setLoading(false);
    }

    loadVision();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave() {
    if (!session) {
      setMessage('Sign in before saving your Prophetic Vision.');
      return;
    }

    setSaving(true);
    setMessage('');

    const savedVision = {
      audio_file_name: audioFileName || null,
      audio_path: audioPath || null,
      cover_image_path: coverImagePath || null,
      id: visionId || undefined,
      long_version: longVersion.trim(),
      short_version: shortVersion.trim(),
      updated_at: new Date().toISOString(),
      user_id: session.user.id,
    };

    const { data, error } = await supabase
      .from('prophetic_visions')
      .upsert(savedVision)
      .select('id')
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setVisionId(data.id);
    setMessage('Prophetic Vision saved.');
  }

  async function handleAudioUpload() {
    if (!session) {
      setMessage('Sign in before uploading audio.');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ['audio/*'],
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    await uploadAudioFile({
      contentType: asset.mimeType ?? 'audio/mpeg',
      fileName: asset.name || 'prophetic-vision-audio',
      uri: asset.uri,
    });
  }

  async function handleCoverImageUpload() {
    if (!session) {
      setMessage('Sign in before uploading a cover image.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage('Photo library permission is needed to choose a cover image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [16, 9],
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';
    const extension = getImageExtension(contentType, asset.uri);
    const storagePath = `${session.user.id}/cover.${extension}`;

    setUploadingCover(true);
    setMessage('');
    setCoverImageUrl(asset.uri);

    const response = await fetch(asset.uri);
    const imageData = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('prophetic-vision-covers')
      .upload(storagePath, imageData, {
        cacheControl: '0',
        contentType,
        upsert: true,
      });

    setUploadingCover(false);

    if (uploadError) {
      setMessage(uploadError.message);
      return;
    }

    setCoverImagePath(storagePath);
    setCoverImageUrl(getPublicCoverImageUrl(storagePath, Date.now()));
    setMessage('Cover image uploaded. Save your Prophetic Vision to keep it.');
  }

  async function handleStartRecording() {
    if (!session) {
      setMessage('Sign in before recording audio.');
      return;
    }

    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setMessage('Microphone permission is needed to record your Prophetic Vision.');
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    setMessage('');
    setRecordingUri('');
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function handleStopRecording() {
    await recorder.stop();
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    const uri = recorder.uri;

    if (!uri) {
      setMessage('Recording stopped, but no audio file was created.');
      return;
    }

    setRecordingUri(uri);
    await uploadAudioFile({
      contentType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
      fileName: `profetic-vision-recording-${Date.now()}${Platform.OS === 'web' ? '.webm' : '.m4a'}`,
      uri,
    });
  }

  async function handlePlayPause() {
    if (!audioUri) {
      setMessage('Record or upload audio before listening back.');
      return;
    }

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    if (playerStatus.playing) {
      player.pause();
      return;
    }

    if (playerStatus.didJustFinish) {
      await player.seekTo(0);
    }

    player.play();
  }

  async function uploadAudioFile({
    contentType,
    fileName,
    uri,
  }: {
    contentType: string;
    fileName: string;
    uri: string;
  }) {
    if (!session) {
      setMessage('Sign in before uploading audio.');
      return;
    }

    const safeName = sanitizeFileName(fileName);
    const storagePath = `${session.user.id}/${Date.now()}-${safeName}`;

    setUploadingAudio(true);
    setMessage('');

    const response = await fetch(uri);
    const audioData = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('prophetic-vision-audio')
      .upload(storagePath, audioData, {
        contentType,
        upsert: true,
      });

    setUploadingAudio(false);

    if (uploadError) {
      setMessage(uploadError.message);
      return;
    }

    setAudioFileName(fileName);
    setAudioPath(storagePath);
    setAudioUri(uri);
    setMessage('Audio attached. Save your Prophetic Vision to keep it.');
  }

  async function handleRewriteWithAi() {
    if (!shortVersion.trim() && !longVersion.trim()) {
      setMessage('Add a short or long Prophetic Vision before rewriting with AI.');
      return;
    }

    setRewriting(true);
    setMessage('');

    const { data, error } = await supabase.functions.invoke<RewriteResponse>(
      'rewrite-prophetic-vision',
      {
        body: {
          longVersion,
          shortVersion,
        },
      },
    );

    setRewriting(false);

    if (error) {
      setMessage('AI rewrite is not ready yet. Deploy the rewrite-prophetic-vision Supabase function and set OPENAI_API_KEY.');
      return;
    }

    if (data?.shortVersion) {
      setShortVersion(data.shortVersion);
    }

    if (data?.longVersion) {
      setLongVersion(data.longVersion);
    }

    setMessage('AI rewrite applied. Review and save when ready.');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#38635D" />
          <Text style={styles.loadingText}>Loading Prophetic Vision...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>Prophetic Vision</Text>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.copy}>Your Prophetic Vision is available after signing in.</Text>
          <Link href="/" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Back to sign in</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.coverFrame}>
            {coverImageUrl ? (
              <ImageBackground
                source={{ uri: coverImageUrl }}
                style={styles.coverImage}
                imageStyle={styles.coverImageStyle}
              >
                <View style={styles.coverOverlay}>
                  <Text style={styles.coverEyebrow}>Prophetic Vision</Text>
                  <Text style={styles.coverTitle}>Speak the future clearly</Text>
                  <Text style={styles.coverCopy}>A visual anchor for the person you are becoming.</Text>
                </View>
              </ImageBackground>
            ) : (
              <View style={styles.coverFallback}>
                <Text style={styles.coverEyebrow}>Prophetic Vision</Text>
                <Text style={styles.coverTitle}>Speak the future clearly</Text>
                <Text style={styles.coverCopy}>Add an inspirational cover image to give this page a feel.</Text>
              </View>
            )}
            <Pressable
              disabled={uploadingCover}
              style={[styles.coverEditButton, uploadingCover && styles.disabledButton]}
              onPress={handleCoverImageUpload}
            >
              <Text style={styles.coverEditButtonText}>
                {uploadingCover ? '...' : coverImageUrl ? 'Edit' : 'Add'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.copy}>Write a compact declaration, expand it into a full vision, and attach an audio reading.</Text>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Short version</Text>
              <Pressable
                style={styles.toggleButton}
                onPress={() => setEditingShortVersion((isEditing) => !isEditing)}
              >
                <Text style={styles.toggleButtonText}>
                  {editingShortVersion ? 'Hide editor' : 'Edit'}
                </Text>
              </Pressable>
            </View>
            {editingShortVersion ? (
              <TextInput
                multiline
                onChangeText={setShortVersion}
                placeholder="A clear one or two sentence vision for who you are becoming."
                placeholderTextColor="#8A948F"
                style={[styles.input, styles.shortInput]}
                textAlignVertical="top"
                value={shortVersion}
              />
            ) : null}
            <MarkdownPreview value={shortVersion} emptyText="Short vision preview will appear here." />
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Long version</Text>
              <Pressable
                style={styles.toggleButton}
                onPress={() => setEditingLongVersion((isEditing) => !isEditing)}
              >
                <Text style={styles.toggleButtonText}>
                  {editingLongVersion ? 'Hide editor' : 'Edit'}
                </Text>
              </Pressable>
            </View>
            {editingLongVersion ? (
              <TextInput
                multiline
                onChangeText={setLongVersion}
                placeholder="Write the fuller version: values, identity, relationships, recovery commitments, and the life you are building."
                placeholderTextColor="#8A948F"
                style={[styles.input, styles.longInput]}
                textAlignVertical="top"
                value={longVersion}
              />
            ) : null}
            <MarkdownPreview value={longVersion} emptyText="Long vision preview will appear here." />
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Audio reading</Text>
            <Text style={styles.mutedText}>
              {audioFileName ? `Uploaded: ${audioFileName}` : 'Upload an audio file of someone reading the Prophetic Vision.'}
            </Text>
            <View style={styles.playerPanel}>
              <View style={styles.playerTopRow}>
                <Pressable
                  disabled={!audioUri}
                  style={[styles.playButton, !audioUri && styles.disabledButton]}
                  onPress={handlePlayPause}
                >
                  <Text style={styles.playButtonText}>{playerStatus.playing ? 'Pause' : 'Play'}</Text>
                </Pressable>
                <View style={styles.playerCopy}>
                  <Text style={styles.playerSubtitle}>
                    {audioFileName || 'No audio attached yet'}
                  </Text>
                </View>
                <Text style={styles.timeText}>
                  {formatDuration(Math.floor(playerStatus.currentTime || 0))}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${getProgressPercent(playerStatus.currentTime, playerStatus.duration)}%` },
                  ]}
                />
              </View>
            </View>
            <View style={styles.audioActionsRow}>
              <Pressable
                disabled={uploadingAudio || recorderState.isRecording}
                style={[styles.compactSecondaryButton, uploadingAudio && styles.disabledButton]}
                onPress={handleAudioUpload}
              >
                <Text style={styles.compactSecondaryButtonText}>
                  {uploadingAudio ? 'Uploading...' : 'Upload'}
                </Text>
              </Pressable>
              <Pressable
                disabled={uploadingAudio}
                style={[
                  styles.compactRecordButton,
                  recorderState.isRecording && styles.stopButton,
                  uploadingAudio && styles.disabledButton,
                ]}
                onPress={recorderState.isRecording ? handleStopRecording : handleStartRecording}
              >
                <Text style={styles.recordButtonText}>
                  {recorderState.isRecording ? 'Stop' : 'Record'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.compactRecordingStatus}>
              <View style={[styles.recordingDot, recorderState.isRecording && styles.activeRecordingDot]} />
              <Text style={styles.compactRecordingText}>
                {recorderState.isRecording
                  ? `Recording ${formatDuration(Math.floor(recorderState.durationMillis / 1000))}`
                  : recordingUri
                    ? 'Recording ready'
                    : 'Microphone ready'}
              </Text>
            </View>
          </View>

          <Pressable
            disabled={rewriting}
            style={[styles.aiButton, rewriting && styles.disabledButton]}
            onPress={handleRewriteWithAi}
          >
            <Text style={styles.aiButtonText}>
              {rewriting ? 'Rewriting with AI...' : 'Rewrite using AI'}
            </Text>
          </Pressable>

          <Pressable
            disabled={saving}
            style={[styles.button, saving && styles.disabledButton]}
            onPress={handleSave}
          >
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Prophetic Vision'}</Text>
          </Pressable>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Link href="/" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back home</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function getImageExtension(contentType: string, uri: string) {
  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  const uriExtension = uri.split('.').pop()?.toLowerCase();

  return uriExtension && uriExtension.length <= 5 ? uriExtension : 'jpg';
}

function getPublicCoverImageUrl(path: string, cacheKey?: number) {
  const publicUrl = supabase.storage.from('prophetic-vision-covers').getPublicUrl(path).data.publicUrl;

  return cacheKey ? `${publicUrl}?v=${cacheKey}` : publicUrl;
}

async function getSignedAudioUrl(path: string) {
  const { data, error } = await supabase.storage
    .from('prophetic-vision-audio')
    .createSignedUrl(path, 60 * 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getProgressPercent(currentTime: number, duration: number) {
  if (!duration || duration <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}

function MarkdownPreview({ emptyText, value }: { emptyText: string; value: string }) {
  return (
    <View style={styles.markdownPreview}>
      <Text style={styles.previewLabel}>Preview</Text>
      {value.trim() ? (
        <Markdown style={markdownStyles}>{value}</Markdown>
      ) : (
        <Text style={styles.previewEmpty}>{emptyText}</Text>
      )}
    </View>
  );
}

const markdownStyles = StyleSheet.create({
  body: {
    color: '#17211F',
    fontSize: 16,
    lineHeight: 24,
  },
  bullet_list: {
    marginBottom: 4,
  },
  code_inline: {
    backgroundColor: '#ECE5D8',
    borderRadius: 4,
    color: '#17211F',
    fontSize: 14,
    paddingHorizontal: 4,
  },
  fence: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211F',
    fontSize: 14,
    padding: 10,
  },
  heading1: {
    color: '#17211F',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginBottom: 8,
  },
  heading2: {
    color: '#17211F',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginBottom: 6,
  },
  heading3: {
    color: '#17211F',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginBottom: 4,
  },
  hr: {
    backgroundColor: '#DED7C9',
    height: 1,
    marginVertical: 10,
  },
  list_item: {
    marginBottom: 4,
  },
  ordered_list: {
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 8,
  },
  strong: {
    fontWeight: '900',
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  keyboardArea: {
    flex: 1,
  },
  container: {
    gap: 18,
    justifyContent: 'center',
    minHeight: '100%',
    padding: 24,
  },
  centerPanel: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
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
  coverFrame: {
    borderRadius: 8,
    minHeight: 260,
    overflow: 'hidden',
  },
  coverEditButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(247, 243, 234, 0.9)',
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    position: 'absolute',
    right: 12,
    top: 12,
  },
  coverEditButtonText: {
    color: '#38635D',
    fontSize: 13,
    fontWeight: '900',
  },
  coverImage: {
    flex: 1,
    justifyContent: 'flex-end',
    minHeight: 260,
  },
  coverImageStyle: {
    borderRadius: 8,
  },
  coverOverlay: {
    backgroundColor: 'rgba(23, 33, 31, 0.45)',
    gap: 8,
    justifyContent: 'flex-end',
    minHeight: 260,
    padding: 20,
  },
  coverFallback: {
    backgroundColor: '#17211F',
    gap: 10,
    justifyContent: 'flex-end',
    minHeight: 260,
    padding: 20,
  },
  coverEyebrow: {
    color: '#D5DED9',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  coverTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  coverCopy: {
    color: '#F7F3EA',
    fontSize: 15,
    lineHeight: 22,
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
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  toggleButton: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  toggleButtonText: {
    color: '#38635D',
    fontSize: 13,
    fontWeight: '900',
  },
  mutedText: {
    color: '#4F5D58',
    fontSize: 14,
    lineHeight: 20,
  },
  playerPanel: {
    backgroundColor: '#17211F',
    borderRadius: 8,
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playerTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: '#F7F3EA',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 58,
  },
  playButtonText: {
    color: '#17211F',
    fontSize: 12,
    fontWeight: '900',
  },
  playerCopy: {
    flex: 1,
  },
  playerSubtitle: {
    color: '#D5DED9',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  progressTrack: {
    backgroundColor: '#4F5D58',
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#F7F3EA',
    borderRadius: 3,
    height: 6,
  },
  timeText: {
    color: '#D5DED9',
    fontSize: 12,
    fontWeight: '800',
  },
  recordingRow: {
    alignItems: 'center',
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  recordingStatus: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  recordingDot: {
    backgroundColor: '#8A948F',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  activeRecordingDot: {
    backgroundColor: '#B3261E',
  },
  recordingText: {
    color: '#4F5D58',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  recordButton: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 88,
    paddingHorizontal: 14,
  },
  stopButton: {
    backgroundColor: '#B3261E',
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  audioActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compactSecondaryButton: {
    alignItems: 'center',
    borderColor: '#38635D',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  compactSecondaryButtonText: {
    color: '#38635D',
    fontSize: 14,
    fontWeight: '900',
  },
  compactRecordButton: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  compactRecordingStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 18,
  },
  compactRecordingText: {
    color: '#697570',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211F',
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  markdownPreview: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewLabel: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  previewEmpty: {
    color: '#8A948F',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  shortInput: {
    minHeight: 96,
  },
  longInput: {
    minHeight: 190,
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
  aiButton: {
    alignItems: 'center',
    backgroundColor: '#17211F',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  aiButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#38635D',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#38635D',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.64,
  },
  loadingText: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
