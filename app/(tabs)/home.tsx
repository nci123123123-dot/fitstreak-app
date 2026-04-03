import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  Image, Dimensions, Modal, ScrollView, Alert, AppState,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { api } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth.store';
import ExerciseLogger, { ExerciseSet, formatSetsSummary } from '../../src/components/ExerciseLogger';
import FriendsNudge from '../../src/components/FriendsNudge';
import {
  FlameIcon, BoltIcon, DumbbellIcon, ThumbUpIcon, PencilIcon,
  GlobeIcon, UsersIcon, LockIcon,
} from '../../src/components/Icons';

// 알림 수신 핸들러 (앱 포그라운드 상태에서도 배너 표시)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

async function registerPushToken() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const platform  = Platform.OS === 'ios' ? 'ios' : 'android';
    await api.post('/users/me/push-token', { token: tokenData.data, platform });
  } catch {
    // 알림 권한 거부 또는 등록 실패 — 무시
  }
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastLogDate: string | null;
  isAliveToday: boolean;
}

const { width: SCREEN_W } = Dimensions.get('window');

// ── 디자인 토큰 ─────────────────────────────────────
const C = {
  bg:        '#0a0a0a',
  card:      '#1c1c1e',
  border:    '#2c2c2e',
  primary:   '#ffffff',
  secondary: '#8e8e93',
  tertiary:  '#3a3a3c',
  accent:    '#4f8ef7',
  streak:    '#f7a84f',
  verified:  '#30d158',
  danger:    '#ff453a',
};

interface FeedLog {
  id: string;
  localDate: string;
  note: string | null;
  photoUrl: string | null;
  gpsVerified: boolean;
  loggedAt: string;
  user: { id: string; displayName: string };
  reactions: { type: string; userId: string }[];
}

function parsePhoto(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  try {
    const parsed = JSON.parse(photoUrl);
    return parsed.back ?? null;
  } catch {
    return photoUrl.startsWith('data:') ? photoUrl : null;
  }
}

function parseExercises(note: string | null): ExerciseSet[] | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note);
    if (parsed?.exercises && Array.isArray(parsed.exercises)) return parsed.exercises;
  } catch {}
  return null;
}

function getKoreanDate(): string {
  const now = new Date();
  const month = now.toLocaleDateString('ko-KR', { month: 'long', timeZone: 'Asia/Seoul' });
  const day   = now.toLocaleDateString('ko-KR', { day: 'numeric',   timeZone: 'Asia/Seoul' });
  const weekday = now.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' });
  // "4월 2일 수요일" 형식
  return `${month} ${day} ${weekday}`;
}

// ── 아바타 배경색 (이름 기반 고정) ──────────────────
const AVATAR_COLORS = ['#4f8ef7', '#f7a84f', '#30d158', '#bf5af2', '#ff6b6b', '#0dd3c5'];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── 편집 모달 ────────────────────────────────────────
function EditModal({
  log,
  onClose,
  onSaved,
}: {
  log: FeedLog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<ExerciseSet[]>(
    parseExercises(log.note) ?? []
  );
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>(
    'friends'
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const notePayload = exercises.length > 0
        ? JSON.stringify({ exercises })
        : undefined;
      await api.put(`/workouts/${log.id}`, { note: notePayload, visibility });
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={editStyles.wrap}>
        {/* 헤더 */}
        <View style={[editStyles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={editStyles.cancel}>취소</Text>
          </TouchableOpacity>
          <Text style={editStyles.title}>{log.localDate} 수정</Text>
          <TouchableOpacity onPress={save} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            {saving
              ? <ActivityIndicator color={C.accent} size="small" />
              : <Text style={editStyles.save}>저장</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[editStyles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* 운동 기록 */}
          <Text style={editStyles.sectionLabel}>운동 기록</Text>
          <View style={editStyles.section}>
            <ExerciseLogger value={exercises} onChange={setExercises} />
          </View>

          {/* 공개 범위 */}
          <Text style={[editStyles.sectionLabel, { marginTop: 28 }]}>공개 범위</Text>
          <View style={editStyles.visRow}>
            {([
              { key: 'public',  label: '전체공개', Icon: GlobeIcon },
              { key: 'friends', label: '친구공개', Icon: UsersIcon },
              { key: 'private', label: '나만보기', Icon: LockIcon },
            ] as const).map((item) => {
              const active = visibility === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[editStyles.visBtn, active && editStyles.visBtnOn]}
                  onPress={() => setVisibility(item.key)}
                  activeOpacity={0.7}
                >
                  <item.Icon size={22} color={active ? C.accent : C.secondary} strokeWidth={1.8} />
                  <Text style={[editStyles.visLabel, active && editStyles.visLabelOn]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── 오늘 내 상태 배너 ────────────────────────────────
function TodayBanner({ streak, onLog }: { streak?: StreakData; onLog: () => void }) {
  if (!streak) return null;

  const todayKST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const loggedToday = streak.lastLogDate === todayKST;

  if (loggedToday) {
    return (
      <View style={todayStyles.done}>
        <View style={todayStyles.left}>
          <View style={todayStyles.iconWrapGreen}>
            <FlameIcon size={20} color="#30d158" />
          </View>
          <View>
            <Text style={todayStyles.doneTitle}>오늘 완료</Text>
            <Text style={todayStyles.doneSub}>{streak.currentStreak}일 연속 스트릭 중</Text>
          </View>
        </View>
        <View style={todayStyles.streakNum}>
          <Text style={todayStyles.streakNumText}>{streak.currentStreak}</Text>
          <Text style={todayStyles.streakNumLabel}>일</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={todayStyles.todo} onPress={onLog} activeOpacity={0.85}>
      <View style={todayStyles.left}>
        <View style={todayStyles.iconWrapBlue}>
          {streak.currentStreak > 0
            ? <BoltIcon size={20} color="#f7a84f" />
            : <DumbbellIcon size={20} color="#4f8ef7" />
          }
        </View>
        <View>
          <Text style={todayStyles.todoTitle}>
            {streak.currentStreak > 0
              ? `${streak.currentStreak}일 스트릭 위기`
              : '오늘 운동을 기록해보세요'}
          </Text>
          <Text style={todayStyles.todoSub}>
            {streak.currentStreak > 0
              ? '오늘 기록 안 하면 리셋돼요'
              : '첫 스트릭을 시작해볼까요'}
          </Text>
        </View>
      </View>
      <View style={todayStyles.cta}>
        <Text style={todayStyles.ctaText}>기록하기</Text>
      </View>
    </TouchableOpacity>
  );
}

const todayStyles = StyleSheet.create({
  done: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(48,209,88,0.09)',
    borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(48,209,88,0.18)',
  },
  todo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8, backgroundColor: '#1c1c1e',
    borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#4f8ef7',
  },
  left:          { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrapGreen: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(48,209,88,0.15)', alignItems: 'center', justifyContent: 'center' },
  iconWrapBlue:  { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(79,142,247,0.15)', alignItems: 'center', justifyContent: 'center' },
  doneTitle:     { color: '#30d158', fontWeight: '700', fontSize: 14 },
  doneSub:       { color: '#4cba6d', fontSize: 12, marginTop: 2 },
  todoTitle:     { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  todoSub:       { color: '#8e8e93', fontSize: 12, marginTop: 2 },
  streakNum:     { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  streakNumText: { color: '#30d158', fontSize: 28, fontWeight: '800' },
  streakNumLabel:{ color: '#30d158', fontSize: 14, fontWeight: '600' },
  cta:           { backgroundColor: '#4f8ef7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  ctaText:       { color: '#fff', fontWeight: '700', fontSize: 13 },
});

// ── 메인 화면 ────────────────────────────────────────
export default function HomeScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [editingLog, setEditingLog] = useState<FeedLog | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const lastDateRef = useRef(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));

  // 푸시 토큰 등록 (최초 1회)
  useEffect(() => { registerPushToken(); }, []);

  // 앱 포그라운드 복귀 시 날짜가 바뀌었으면 피드 새로고침
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        if (today !== lastDateRef.current) {
          lastDateRef.current = today;
          queryClient.invalidateQueries({ queryKey: ['feed'] });
        }
      }
    });

    // 자정에도 자동 새로고침
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => {
      lastDateRef.current = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    }, midnight.getTime() - now.getTime());

    return () => { sub.remove(); clearTimeout(timer); };
  }, []);

  async function handleAddPhoto(logId: string) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '카메라 접근 권한이 필요해요.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0].base64) return;

    setUploadingId(logId);
    try {
      const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      await api.put(`/workouts/${logId}`, { photoUrl: JSON.stringify({ back: base64 }) });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setUploadingId(null);
    }
  }

  const { data: streakData } = useQuery({
    queryKey: ['streak'],
    queryFn:  () => api.get<{ streak: StreakData }>('/workouts/streak'),
  });

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed'],
    queryFn:  () => api.get<{ logs: FeedLog[] }>('/workouts/feed'),
    staleTime: 0,
    gcTime:    0,
  });

  const reactMutation = useMutation({
    mutationFn: ({ logId, type }: { logId: string; type: string }) =>
      api.post(`/workouts/${logId}/reactions`, { type }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  function renderItem({ item }: { item: FeedLog }) {
    const photo = parsePhoto(item.photoUrl);
    const timeAgo = getTimeAgo(item.loggedAt);
    const exercises = parseExercises(item.note);
    const isOwn = item.user.id === user?.id;
    const reactionCounts = item.reactions.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    }, {});
    const bgColor = avatarColor(item.user.displayName);

    return (
      <View style={styles.card}>
        {/* ── 카드 헤더 ── */}
        <View style={styles.cardHeader}>
          {/* 아바타 */}
          <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarText}>{item.user.displayName[0]}</Text>
          </View>

          {/* 이름 + 시간 */}
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.userName}>{item.user.displayName}</Text>
            <Text style={styles.timeText}>{timeAgo}</Text>
          </View>

          {/* 배지들 */}
          <View style={styles.cardHeaderRight}>
            {item.gpsVerified && (
              <View style={styles.gpsBadge}>
                <Text style={styles.gpsBadgeDot}>●</Text>
                <Text style={styles.gpsBadgeText}>인증</Text>
              </View>
            )}
            {isOwn && (
              <TouchableOpacity
                onPress={() => setEditingLog(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.moreBtn}
              >
                <Text style={styles.moreBtnText}>···</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── 사진 (4:3 비율) ── */}
        {photo && (
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            resizeMode="cover"
          />
        )}

        {/* ── 컨텐츠 없음 (사진도 운동도 없을 때) ── */}
        {!photo && (!exercises || exercises.length === 0) && (
          <View style={styles.emptyContent}>
            <View style={styles.emptyContentIcon}>
              <DumbbellIcon size={32} color={C.secondary} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyContentText}>오운완 완료</Text>
            {isOwn && (
              <TouchableOpacity
                style={styles.addPhotoBtn}
                onPress={() => handleAddPhoto(item.id)}
                disabled={uploadingId === item.id}
                activeOpacity={0.75}
              >
                {uploadingId === item.id
                  ? <ActivityIndicator color={C.accent} size="small" />
                  : <Text style={styles.addPhotoBtnText}>사진 추가</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── 운동 목록 ── */}
        {exercises && exercises.length > 0 && (
          <View style={styles.exerciseList}>
            {exercises.map((ex) => (
              <View key={ex.exerciseId} style={styles.exerciseRow}>
                <Text style={styles.exerciseEmoji}>{ex.emoji}</Text>
                <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
                <Text style={styles.exerciseSets}>
                  {formatSetsSummary(ex, ex.category === '유산소')}
                </Text>
              </View>
            ))}

            {/* 운동 있고 사진 없을 때 사진 추가 버튼 */}
            {!photo && isOwn && (
              <TouchableOpacity
                style={styles.addPhotoInline}
                onPress={() => handleAddPhoto(item.id)}
                disabled={uploadingId === item.id}
                activeOpacity={0.75}
              >
                {uploadingId === item.id
                  ? <ActivityIndicator color={C.accent} size="small" />
                  : <Text style={styles.addPhotoBtnText}>사진 추가</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── 사진 있고 운동 없을 때 힌트 ── */}
        {photo && (!exercises || exercises.length === 0) && (
          <View style={styles.noNoteHint}>
            <PencilIcon size={13} color={C.tertiary} strokeWidth={1.6} />
            <Text style={styles.noNoteHintText}>운동 기록을 추가해보세요</Text>
          </View>
        )}

        {/* ── 구분선 ── */}
        <View style={styles.divider} />

        {/* ── 리액션 ── */}
        <View style={styles.reactionRow}>
          {([
            { type: 'like',   Icon: ThumbUpIcon,  label: '좋아요', activeColor: '#4f8ef7' },
            { type: 'fire',   Icon: FlameIcon,    label: '불꽃',   activeColor: '#f7a84f' },
            { type: 'strong', Icon: DumbbellIcon, label: '대단해', activeColor: '#30d158' },
          ] as const).map(({ type, Icon, label, activeColor }) => {
            const count = reactionCounts[type] ?? 0;
            const hasReacted = item.reactions.some(
              (r) => r.type === type && r.userId === user?.id
            );
            return (
              <TouchableOpacity
                key={type}
                style={[styles.reactionBtn, hasReacted && styles.reactionBtnActive]}
                onPress={() => reactMutation.mutate({ logId: item.id, type })}
                activeOpacity={0.7}
              >
                <Icon size={17} color={hasReacted ? activeColor : C.secondary} strokeWidth={1.8} />
                <Text style={[styles.reactionLabel, hasReacted && { color: activeColor }]}>
                  {count > 0 ? count : label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {editingLog && (
        <EditModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }}
        />
      )}

      {/* ── 헤더 ── */}
      <View style={styles.headerBar}>
        <Text style={styles.headerLeft}>오늘</Text>
        <Text style={styles.headerDate}>{getKoreanDate()}</Text>
      </View>
      <View style={styles.headerDivider} />

      {/* ── 피드 ── */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={data?.logs ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ paddingTop: 12 }}>
              <TodayBanner
                streak={streakData?.streak}
                onLog={() => router.push('/(tabs)/log')}
              />
              <FriendsNudge />
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={C.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <DumbbellIcon size={40} color={C.secondary} strokeWidth={1.4} />
              </View>
              <Text style={styles.emptyTitle}>피드에 아무도 없어요</Text>
              <Text style={styles.emptySub}>운동을 준비해봐요</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/(tabs)/log')}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>오늘 운동 기록하기</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return '방금 전';
  if (mins < 60)  return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

// ── 메인 스타일 ──────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // 헤더
  headerBar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerLeft: {
    color: C.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerDate: {
    color: C.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  headerDivider: {
    height: 1,
    backgroundColor: C.card,
    marginHorizontal: 0,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },

  // 카드
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  cardHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: C.primary,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  timeText: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: '400',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // GPS 배지
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    borderRadius: 100,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  gpsBadgeDot: {
    color: C.verified,
    fontSize: 7,
  },
  gpsBadgeText: {
    color: C.verified,
    fontSize: 11,
    fontWeight: '600',
  },

  // 편집 버튼
  moreBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  moreBtnText: {
    color: C.secondary,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 22,
  },

  // 사진 (4:3)
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
  },

  // 컨텐츠 없음
  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyContentIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(142,142,147,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyContentText: {
    color: C.secondary,
    fontSize: 15,
    fontWeight: '600',
  },

  // 사진 추가 버튼
  addPhotoBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 142, 247, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  addPhotoInline: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 142, 247, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  addPhotoBtnText: {
    color: C.accent,
    fontWeight: '600',
    fontSize: 13,
  },

  // 운동 목록
  exerciseList: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 2,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
  },
  exerciseEmoji: {
    fontSize: 17,
    width: 24,
    textAlign: 'center',
  },
  exerciseName: {
    color: C.primary,
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  exerciseSets: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '500',
  },

  // 힌트
  noNoteHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  noNoteHintText: {
    color: C.tertiary,
    fontSize: 12,
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: C.tertiary,
    opacity: 0.35,
    marginHorizontal: 16,
  },

  // 리액션
  reactionRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  reactionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  reactionBtnActive: {
    backgroundColor: 'rgba(79, 142, 247, 0.15)',
  },
  reactionEmoji: {
    fontSize: 18,
  },
  reactionLabel: {
    color: C.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  reactionLabelActive: {
    color: C.accent,
  },

  // 빈 상태
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(142,142,147,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    color: C.primary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySub: {
    color: C.secondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 16,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: -0.2,
  },
});

// ── 편집 모달 스타일 ──────────────────────────────────
const editStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.card,
  },
  title: {
    color: C.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cancel: {
    color: C.secondary,
    fontSize: 16,
    fontWeight: '400',
  },
  save: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    padding: 20,
    paddingTop: 24,
  },
  sectionLabel: {
    color: C.secondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  section: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  visRow: {
    flexDirection: 'row',
    gap: 10,
  },
  visBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.card,
    gap: 6,
  },
  visBtnOn: {
    backgroundColor: 'rgba(79, 142, 247, 0.15)',
  },
  visLabel: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  visLabelOn: {
    color: C.accent,
  },
});
