import { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Image,
  Dimensions, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { api } from '../../src/api/client';
import WorkoutCamera, { CapturedPhotos } from '../../src/components/BeRealCamera';
import ExerciseLogger, { ExerciseSet } from '../../src/components/ExerciseLogger';
import MirrorChallenge from '../../src/components/MirrorChallenge';
import {
  LocationIcon, CameraIcon, CheckIcon, CheckCircleIcon,
  XCircleIcon, AlertCircleIcon, LockIcon,
  FlameIcon, BoltIcon, DumbbellIcon,
  ChevronRightIcon,
} from '../../src/components/Icons';


const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_W = SCREEN_W - 40;
const PHOTO_H = PHOTO_W * 1.1;

const C = {
  bg:     '#0a0a0a',
  card:   '#1c1c1e',
  border: '#2c2c2e',
  text:   '#ffffff',
  sub:    '#8e8e93',
  muted:  '#3a3a3c',
  accent: '#4f8ef7',
  green:  '#30d158',
  orange: '#f7a84f',
  red:    '#ff453a',
};

function getDistanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GYM_RADIUS_M = 300;

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastLogDate: string | null;
  isAliveToday: boolean;
}
interface WorkoutResponse {
  message: string;
  alreadyLogged: boolean;
  localDate: string;
  streak: StreakData;
}
interface GymInfo {
  gymName: string | null;
  gymLat: number | null;
  gymLng: number | null;
}

type GpsStatus = 'idle' | 'checking' | 'verified' | 'far' | 'no_gym' | 'denied';


// ── 3단계 진행 바 ────────────────────────────────────
function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: '도착 인증' },
    { n: 2, label: '기록 작성' },
    { n: 3, label: '완료' },
  ];
  return (
    <View style={stepStyles.wrap}>
      {steps.map((s, i) => (
        <View key={s.n} style={stepStyles.item}>
          <View style={[
            stepStyles.circle,
            step > s.n  && stepStyles.circleDone,
            step === s.n && stepStyles.circleActive,
          ]}>
            {step > s.n
              ? <CheckIcon size={14} color={C.green} strokeWidth={2.5} />
              : <Text style={[stepStyles.circleNum, step === s.n && stepStyles.circleNumActive]}>
                  {s.n}
                </Text>
            }
          </View>
          <Text style={[stepStyles.label, step === s.n && stepStyles.labelActive]}>{s.label}</Text>
          {i < steps.length - 1 && (
            <View style={[stepStyles.line, step > s.n && stepStyles.lineDone]} />
          )}
        </View>
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  wrap:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  item:            { flexDirection: 'row', alignItems: 'center', gap: 6 },
  circle:          { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  circleActive:    { borderColor: C.accent, backgroundColor: 'rgba(79,142,247,0.15)' },
  circleDone:      { borderColor: C.green, backgroundColor: 'rgba(48,209,88,0.15)' },
  circleNum:       { color: C.sub, fontSize: 12, fontWeight: '700' },
  circleNumActive: { color: C.accent },
  label:           { color: C.sub, fontSize: 11, fontWeight: '500' },
  labelActive:     { color: C.text },
  line:            { width: 32, height: 1.5, backgroundColor: C.muted, marginHorizontal: 4 },
  lineDone:        { backgroundColor: C.green },
});

// ── 스트릭 동기부여 배너 ──────────────────────────────
function StreakBanner({ streak }: { streak?: StreakData }) {
  if (!streak) return null;

  if (streak.isAliveToday) {
    return (
      <View style={bannerStyles.warning}>
        <View style={bannerStyles.iconWrap}>
          <FlameIcon size={22} color={C.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={bannerStyles.warnTitle}>{streak.currentStreak}일 스트릭 유지중</Text>
          <Text style={bannerStyles.warnSub}>오늘도 기록하면 {streak.currentStreak + 1}일이 돼요!</Text>
        </View>
      </View>
    );
  }

  if (streak.currentStreak > 0) {
    return (
      <View style={bannerStyles.warning}>
        <View style={bannerStyles.iconWrap}>
          <BoltIcon size={22} color={C.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={bannerStyles.warnTitle}>{streak.currentStreak}일 스트릭 위기</Text>
          <Text style={bannerStyles.warnSub}>오늘 기록하지 않으면 리셋돼요</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={bannerStyles.empty}>
      <View style={bannerStyles.iconWrap}>
        <DumbbellIcon size={22} color={C.sub} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.emptyTitle}>첫 스트릭을 시작해보세요</Text>
        <Text style={bannerStyles.emptySub}>오늘 기록하면 1일 달성</Text>
      </View>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  done:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(48,209,88,0.08)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(48,209,88,0.18)' },
  warning:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(247,168,79,0.08)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(247,168,79,0.22)' },
  empty:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14 },
  iconWrap:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: C.green, fontWeight: '700', fontSize: 14 },
  doneSub:   { color: '#4cba6d', fontSize: 12, marginTop: 2 },
  warnTitle: { color: C.orange, fontWeight: '700', fontSize: 14 },
  warnSub:   { color: '#a07030', fontSize: 12, marginTop: 2 },
  emptyTitle:{ color: C.text, fontWeight: '700', fontSize: 14 },
  emptySub:  { color: C.sub, fontSize: 12, marginTop: 2 },
});

// ── 메인 화면 ────────────────────────────────────────
export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises]   = useState<ExerciseSet[]>([]);
  const [loading, setLoading]       = useState(false);
  const [photoUri, setPhotoUri]     = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [result, setResult]         = useState<WorkoutResponse | null>(null);
  const [gpsStatus, setGpsStatus]   = useState<GpsStatus>('idle');
  const [distanceM, setDistanceM]   = useState<number | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const queryClient = useQueryClient();

  const { data: streakData } = useQuery({
    queryKey: ['streak'],
    queryFn:  () => api.get<{ streak: StreakData }>('/workouts/streak'),
  });

  const { data: gymData } = useQuery({
    queryKey: ['gym'],
    queryFn:  () => api.get<{ user: GymInfo }>('/users/me'),
  });

  const { data: splitData } = useQuery({
    queryKey: ['split'],
    queryFn:  () => api.get<{ todaySlot: { label: string } | null }>('/users/me/split'),
    staleTime: 60_000,
  });

  const streak = result?.streak ?? streakData?.streak;
  const gym    = gymData?.user;
  const gymSet = !!(gym?.gymLat && gym?.gymLng);

  useFocusEffect(
    useCallback(() => {
      if (!gymSet) return;
      startWatchingGps();
      return () => {
        locationSub.current?.remove();
        locationSub.current = null;
      };
    }, [gymSet, gym?.gymLat, gym?.gymLng])
  );

  function currentStep(): 1 | 2 | 3 {
    if (result && !result.alreadyLogged) return 3;
    if (gpsStatus === 'verified') return 2;
    return 1;
  }

  async function startWatchingGps() {
    if (!gymSet) { setGpsStatus('no_gym'); return; }
    setGpsStatus('checking');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setGpsStatus('denied'); return; }

      // 이전 구독 해제
      locationSub.current?.remove();

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (loc) => {
          const dist = getDistanceM(
            loc.coords.latitude, loc.coords.longitude,
            gym!.gymLat!, gym!.gymLng!,
          );
          setDistanceM(Math.round(dist));
          setGpsStatus(dist <= GYM_RADIUS_M ? 'verified' : 'far');
        },
      );
    } catch {
      setGpsStatus('idle');
    }
  }

  async function handleLog() {
    if (gpsStatus !== 'verified') {
      Alert.alert('헬스장 인증 필요', '헬스장 도착 인증 후 기록할 수 있어요.');
      return;
    }
    if (!photoUri && exercises.length === 0) {
      Alert.alert('기록 필요', '사진을 찍거나 운동을 1개 이상 추가해주세요.');
      return;
    }
    setLoading(true);
    try {
      const notePayload = exercises.length > 0
        ? JSON.stringify({ exercises })
        : undefined;
      const res = await api.post<WorkoutResponse>('/workouts', {
        note:        notePayload,
        gpsVerified: true,
        photoUrl:    photoUri ?? undefined,
      });
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['friendsRanking'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      if (!res.alreadyLogged) { setExercises([]); setPhotoUri(null); }
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── GPS 상태 카드 ───────────────────────────────────
  function renderGpsCard() {

    if (!gymSet) {
      return (
        <View style={styles.gpsCard}>
          <View style={[styles.gpsIconBg, styles.gpsIconGray]}>
            <LocationIcon size={18} color={C.sub} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.gpsTitle}>헬스장 미등록</Text>
            <Text style={styles.gpsSub}>프로필 탭에서 등록해주세요</Text>
          </View>
        </View>
      );
    }

    if (gpsStatus === 'idle' || gpsStatus === 'no_gym') {
      return (
        <TouchableOpacity style={[styles.gpsCard, styles.gpsCardTap]} onPress={startWatchingGps} activeOpacity={0.8}>
          <View style={[styles.gpsIconBg, styles.gpsIconBlue]}>
            <LocationIcon size={18} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.gpsTitle}>헬스장 도착 인증</Text>
            <Text style={styles.gpsSub}>{gym?.gymName ?? '내 헬스장'}  탭해서 위치 확인</Text>
          </View>
          <ChevronRightIcon size={18} color={C.accent} strokeWidth={2} />
        </TouchableOpacity>
      );
    }

    if (gpsStatus === 'checking') {
      return (
        <View style={styles.gpsCard}>
          <ActivityIndicator color={C.accent} style={{ marginRight: 14 }} />
          <Text style={styles.gpsTitle}>위치 확인 중...</Text>
        </View>
      );
    }

    if (gpsStatus === 'verified') {
      return (
        <View style={[styles.gpsCard, styles.gpsCardGreen]}>
          <View style={[styles.gpsIconBg, styles.gpsIconGreen]}>
            <CheckCircleIcon size={18} color={C.green} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.gpsTitle, { color: C.green }]}>도착 인증 완료</Text>
            <Text style={styles.gpsSub}>{gym?.gymName ?? '내 헬스장'}  {distanceM}m 이내</Text>
          </View>
        </View>
      );
    }

    if (gpsStatus === 'far') {
      return (
        <TouchableOpacity style={[styles.gpsCard, styles.gpsCardRed]} onPress={startWatchingGps} activeOpacity={0.8}>
          <View style={[styles.gpsIconBg, styles.gpsIconRed]}>
            <AlertCircleIcon size={18} color={C.red} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.gpsTitle, { color: C.red }]}>헬스장과 멀어요</Text>
            <Text style={styles.gpsSub}>{distanceM}m  {GYM_RADIUS_M}m 이내 필요  탭해서 재시도</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (gpsStatus === 'denied') {
      return (
        <View style={[styles.gpsCard, styles.gpsCardRed]}>
          <View style={[styles.gpsIconBg, styles.gpsIconRed]}>
            <XCircleIcon size={18} color={C.red} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.gpsTitle, { color: C.red }]}>위치 권한 없음</Text>
            <Text style={styles.gpsSub}>설정에서 위치 접근을 허용해주세요</Text>
          </View>
        </View>
      );
    }

    return null;
  }

  // ── 오늘 이미 인증 완료 ──────────────────────────────
  const todayKST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const s0 = result?.streak ?? streakData?.streak;
  const loggedToday = s0?.lastLogDate === todayKST || (result != null && !result.alreadyLogged);
  if (loggedToday) {
    const s = s0;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={doneStyles.wrap}>
          <View style={doneStyles.iconRing}>
            <FlameIcon size={52} color="#30d158" />
          </View>
          <Text style={doneStyles.title}>오늘 완료!</Text>
          <Text style={doneStyles.streak}>{s?.currentStreak ?? 0}일</Text>
          <Text style={doneStyles.streakLabel}>연속 스트릭</Text>
          <Text style={doneStyles.sub}>
            {s && s.currentStreak > 0
              ? `내일도 운동하면 ${s.currentStreak + 1}일째가 돼요 🔥`
              : '오늘 하루도 잘 하셨어요!'}
          </Text>
          <View style={doneStyles.card}>
            <Text style={doneStyles.cardText}>내일 다시 기록할 수 있어요</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const step      = currentStep();
  const canSubmit = gpsStatus === 'verified' && (!!photoUri || exercises.length > 0);

  return (
    <>
      <Modal visible={showCamera} animationType="slide" statusBarTranslucent>
        <WorkoutCamera
          onCapture={(photos: CapturedPhotos) => { setPhotoUri(photos.back); setShowCamera(false); }}
          onCancel={() => setShowCamera(false)}
        />
      </Modal>

      <SafeAreaView style={styles.container} edges={['top']}>

        {/* ── 헤더 ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSub}>
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
            </Text>
            <Text style={styles.headerTitle}>운동 기록</Text>
          </View>
          {splitData?.todaySlot && (
            <View style={styles.splitBadge}>
              <DumbbellIcon size={13} color="#4f8ef7" />
              <Text style={styles.splitBadgeText}>{splitData.todaySlot.label}</Text>
            </View>
          )}
        </View>

        {/* ── 진행 단계 ── */}
        <View style={styles.stepWrap}>
          <StepBar step={step} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 스트릭 배너 */}
          <StreakBanner streak={streak} />

          {/* GPS 카드 */}
          {renderGpsCard()}

          {/* 이미 기록 (중복 제출) */}
          {result?.alreadyLogged && (
            <View style={[styles.completeBanner, styles.warnBanner]}>
              <View style={[styles.completeBannerIcon, styles.warnBannerIcon]}>
                <AlertCircleIcon size={28} color={C.orange} />
              </View>
              <View>
                <Text style={[styles.completeBannerTitle, { color: C.orange }]}>오늘은 이미 기록했어요</Text>
                <Text style={styles.completeBannerSub}>내일 다시 기록해주세요</Text>
              </View>
            </View>
          )}

          {/* 인증 완료 후 입력 UI */}
          {gpsStatus === 'verified' && (
            <>
              {/* 거울 자아 챌린지 */}
              <MirrorChallenge currentExercises={exercises} />

              {/* 사진 섹션 */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>오운완 사진</Text>
                  <View style={styles.optBadge}>
                    <Text style={styles.optBadgeText}>선택</Text>
                  </View>
                </View>
                {photoUri ? (
                  <View style={styles.photoWrap}>
                    <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => setShowCamera(true)}>
                      <CameraIcon size={14} color="#fff" strokeWidth={1.8} />
                      <Text style={styles.retakeBtnText}>다시 찍기</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.cameraBtn} onPress={() => setShowCamera(true)} activeOpacity={0.75}>
                    <View style={styles.cameraIconWrap}>
                      <CameraIcon size={32} color={C.sub} strokeWidth={1.5} />
                    </View>
                    <Text style={styles.cameraBtnText}>사진 찍기</Text>
                    <Text style={styles.cameraBtnSub}>오운완을 인증해보세요</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 운동 기록 섹션 */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>운동 기록</Text>
                  <View style={styles.optBadge}>
                    <Text style={styles.optBadgeText}>사진 없으면 필수</Text>
                  </View>
                </View>
                <ExerciseLogger value={exercises} onChange={setExercises} />
              </View>

              <View style={{ height: 20 }} />
            </>
          )}

          {/* GPS 미인증 안내 */}
          {gpsStatus !== 'verified' && (
            <View style={styles.lockHint}>
              <View style={styles.lockIconWrap}>
                <LockIcon size={28} color={C.muted} strokeWidth={1.5} />
              </View>
              <Text style={styles.lockTitle}>헬스장 도착 인증 후 기록 가능해요</Text>
              <Text style={styles.lockSub}>
                위의 인증 버튼을 탭하거나{'\n'}자동으로 확인을 기다려주세요
              </Text>
            </View>
          )}
        </ScrollView>

        {/* ── 고정 제출 버튼 ── */}
        {gpsStatus === 'verified' && (
          <View style={[styles.stickyBottom, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleLog}
              disabled={loading || !canSubmit}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextMuted]}>
                    {canSubmit ? '기록 완료하기' : '사진 또는 운동을 추가해주세요'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        )}

      </SafeAreaView>
    </>
  );
}

const doneStyles = StyleSheet.create({
  wrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  iconRing:     { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(48,209,88,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 2, borderColor: 'rgba(48,209,88,0.25)' },
  title:        { color: '#30d158', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  streak:       { color: '#fff', fontSize: 72, fontWeight: '900', letterSpacing: -3, lineHeight: 80 },
  streakLabel:  { color: '#8e8e93', fontSize: 16, fontWeight: '600', marginTop: -4 },
  sub:          { color: '#636366', fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  card:         { marginTop: 24, backgroundColor: '#1c1c1e', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14 },
  cardText:     { color: '#636366', fontSize: 14 },
});

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },

  header:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerSub:   { color: C.sub, fontSize: 12, fontWeight: '500', marginBottom: 2 },
  headerTitle: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  splitBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)', marginBottom: 4 },
  splitBadgeText: { color: '#4f8ef7', fontSize: 13, fontWeight: '700' },

  stepWrap: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.card },

  scroll: { padding: 20, gap: 14, paddingBottom: 40 },

  // GPS
  gpsCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 16, padding: 16 },
  gpsCardTap:   { borderWidth: 1.5, borderColor: C.accent },
  gpsCardGreen: { backgroundColor: 'rgba(48,209,88,0.07)', borderWidth: 1.5, borderColor: 'rgba(48,209,88,0.28)' },
  gpsCardRed:   { backgroundColor: 'rgba(255,69,58,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,69,58,0.28)' },
  gpsIconBg:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  gpsIconGray:  { backgroundColor: 'rgba(142,142,147,0.12)' },
  gpsIconBlue:  { backgroundColor: 'rgba(79,142,247,0.15)' },
  gpsIconGreen: { backgroundColor: 'rgba(48,209,88,0.15)' },
  gpsIconRed:   { backgroundColor: 'rgba(255,69,58,0.15)' },
  gpsTitle:     { color: C.text, fontWeight: '700', fontSize: 15 },
  gpsSub:       { color: C.sub, fontSize: 12, marginTop: 3 },

  // 완료 배너
  completeBanner:     { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(48,209,88,0.09)', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(48,209,88,0.2)' },
  warnBanner:         { backgroundColor: 'rgba(247,168,79,0.09)', borderColor: 'rgba(247,168,79,0.22)' },
  completeBannerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(247,168,79,0.15)', alignItems: 'center', justifyContent: 'center' },
  warnBannerIcon:     { backgroundColor: 'rgba(247,168,79,0.15)' },
  completeBannerTitle:{ color: C.green, fontWeight: '800', fontSize: 16 },
  completeBannerSub:  { color: C.sub, fontSize: 13, marginTop: 3 },

  // 섹션
  section:      { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  optBadge:     { backgroundColor: C.muted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  optBadgeText: { color: C.sub, fontSize: 11, fontWeight: '500' },

  // 카메라
  cameraBtn:     { height: 130, borderRadius: 12, borderWidth: 1.5, borderColor: '#3a3a3c', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cameraIconWrap:{ marginBottom: 2 },
  cameraBtnText: { color: C.text, fontSize: 15, fontWeight: '600' },
  cameraBtnSub:  { color: C.sub, fontSize: 12 },

  photoWrap:    { borderRadius: 12, overflow: 'hidden', height: PHOTO_H, position: 'relative' },
  photo:        { width: '100%', height: '100%' },
  retakeBtn:    { position: 'absolute', bottom: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22 },
  retakeBtnText:{ color: '#fff', fontWeight: '600', fontSize: 13 },

  // 잠금 안내
  lockHint:    { alignItems: 'center', paddingVertical: 52, gap: 12 },
  lockIconWrap:{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  lockTitle:   { color: C.sub, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  lockSub:     { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // 하단 고정 버튼
  stickyBottom:      { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.card, backgroundColor: C.bg },
  submitBtn:         { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { backgroundColor: C.card },
  submitBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  submitBtnTextMuted:{ color: C.sub },
});
