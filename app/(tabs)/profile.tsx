import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Modal, Image, FlatList, Dimensions, Animated, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/store/auth.store';
import { api } from '../../src/api/client';
import GymPicker, { GymLocation } from '../../src/components/GymPicker';
import MuscleCoverageMap from '../../src/components/MuscleCoverageMap';
import {
  SettingsIcon, CalendarIcon, LocationIcon,
  LockIcon, LogoutIcon, ChevronRightIcon,
  FlameIcon, GlobeIcon, UsersIcon, DumbbellIcon,
} from '../../src/components/Icons';

const { width: SCREEN_W } = Dimensions.get('window');

interface Profile {
  user: { id: string; displayName: string; timezone: string; createdAt: string };
  stats: {
    currentStreak: number; longestStreak: number; lastLogDate: string | null;
    totalWorkouts: number; followerCount: number; followingCount: number;
  };
}
interface CalendarLog {
  id: string; localDate: string; photoUrl: string | null; note: string | null; gpsVerified: boolean;
}
interface ExerciseEntry {
  exerciseId:  string;
  emoji:       string;
  name:        string;
  category?:   string;
  setEntries?: { reps: number; weight?: number }[];
  sets?:       number;
  reps?:       number;
  weight?:     number;
}
interface SocialUser { id: string; displayName: string; isFollowing?: boolean; }
interface RankEntry  { id: string; isMe: boolean; currentStreak: number; }
interface SplitSlot  { label: string; }
interface SplitConfig { slots: SplitSlot[]; currentSlotIndex: number; }
interface SplitData   { config: SplitConfig | null; todaySlot: SplitSlot | null; todaySlotIndex: number | null; }
interface GymInfo { gymName: string | null; gymLat: number | null; gymLng: number | null; defaultVisibility: string; profilePhoto?: string | null; }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

function parsePhoto(url: string | null): string | null {
  if (!url) return null;
  try { return JSON.parse(url).back ?? null; } catch {}
  return url.startsWith('data:') ? url : null;
}

function parseExercises(note: string | null): ExerciseEntry[] | null {
  if (!note) return null;
  try {
    const p = JSON.parse(note);
    if (Array.isArray(p?.exercises)) return p.exercises;
  } catch {}
  return null;
}

function fmtSets(ex: ExerciseEntry): string {
  if (ex.setEntries && ex.setEntries.length > 0) {
    const count = ex.setEntries.length;
    const unit  = ex.category === '유산소' ? '분' : '회';
    const reps  = ex.setEntries.map((s: any) => s.reps);
    const wts   = ex.setEntries.map((s: any) => s.weight ?? 0).filter((w: number) => w > 0);
    const rMin  = Math.min(...reps), rMax = Math.max(...reps);
    const repPart = rMin === rMax ? `${rMin}${unit}` : `${rMin}~${rMax}${unit}`;
    if (wts.length === 0) return `${count}세트 × ${repPart}`;
    const wMin = Math.min(...wts), wMax = Math.max(...wts);
    const wtPart = wMin === wMax ? `${wMin}kg` : `${wMin}~${wMax}kg`;
    return `${count}세트 × ${repPart} · ${wtPart}`;
  }
  return `${ex.sets ?? 1}세트 × ${ex.reps ?? 0}회${ex.weight ? ` × ${ex.weight}kg` : ''}`;
}

// ── 프로필 편집 모달 ────────────────────────────────
function ProfileEditModal({
  initialName,
  initialPhoto,
  onClose,
  onSaved,
}: {
  initialName: string;
  initialPhoto: string | null;
  onClose: () => void;
  onSaved: (name: string, photo: string | null) => void;
}) {
  const [name, setName]   = useState(initialName);
  const [photo, setPhoto] = useState<string | null>(initialPhoto);
  const [saving, setSaving] = useState(false);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('권한 필요', '사진 접근 권한이 필요해요'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, any> = { displayName: name.trim() };
      if (photo !== initialPhoto) body.profilePhoto = photo;
      await api.patch('/users/me/profile', body);
      onSaved(name.trim(), photo);
      onClose();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={peStyles.wrap}>
        <View style={peStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={peStyles.cancel}>취소</Text>
          </TouchableOpacity>
          <Text style={peStyles.title}>프로필 편집</Text>
          <TouchableOpacity onPress={save} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            {saving
              ? <ActivityIndicator color="#4f8ef7" size="small" />
              : <Text style={peStyles.save}>저장</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={peStyles.body}>
          {/* 사진 */}
          <TouchableOpacity style={peStyles.avatarWrap} onPress={pickPhoto}>
            {photo ? (
              <Image source={{ uri: photo }} style={peStyles.avatarImg} />
            ) : (
              <View style={peStyles.avatarFallback}>
                <Text style={peStyles.avatarLetter}>{name[0] ?? '?'}</Text>
              </View>
            )}
            <View style={peStyles.cameraOverlay}>
              <Text style={{ fontSize: 18 }}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={peStyles.photoHint}>탭해서 사진 변경</Text>

          {/* 이름 */}
          <View style={peStyles.field}>
            <Text style={peStyles.fieldLabel}>이름</Text>
            <TextInput
              style={peStyles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="이름 입력"
              placeholderTextColor="#636366"
              maxLength={20}
              returnKeyType="done"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const peStyles = StyleSheet.create({
  wrap:   { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: '#2c2c2e' },
  title:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  cancel: { color: '#8e8e93', fontSize: 16 },
  save:   { color: '#4f8ef7', fontSize: 16, fontWeight: '600' },

  body:          { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, gap: 8 },
  avatarWrap:    { position: 'relative', marginBottom: 4 },
  avatarImg:     { width: 96, height: 96, borderRadius: 48 },
  avatarFallback:{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#1c3a6e', alignItems: 'center', justifyContent: 'center' },
  avatarLetter:  { color: '#fff', fontSize: 38, fontWeight: '800' },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: '#4f8ef7', alignItems: 'center', justifyContent: 'center' },
  photoHint:     { color: '#636366', fontSize: 13, marginBottom: 32 },

  field:      { width: '100%', gap: 8 },
  fieldLabel: { color: '#8e8e93', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: { backgroundColor: '#1c1c1e', color: '#fff', fontSize: 16, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
});

// ── 운동 분할 설정 패널 ─────────────────────────────
const SPLIT_PRESETS: Record<number, string[]> = {
  2: ['상체', '하체'],
  3: ['등·이두', '가슴·삼두', '어깨·하체'],
  4: ['등·이두', '가슴·삼두', '어깨', '하체'],
  5: ['등', '가슴', '어깨', '이두·삼두', '하체'],
  6: ['가슴', '등', '어깨', '팔', '하체', '코어'],
};

function SplitPanel({
  insetTop, config, onClose, onSaved,
}: {
  insetTop: number;
  config:   SplitConfig | null;
  onClose:  () => void;
  onSaved:  () => void;
}) {
  const [splitCount, setSplitCount] = useState<number>(config?.slots.length ?? 0);
  const [labels, setLabels]         = useState<string[]>(
    config?.slots.map(s => s.label) ?? []
  );
  const [saving, setSaving] = useState(false);

  function applyPreset(n: number) {
    setSplitCount(n);
    setLabels(PRESET => SPLIT_PRESETS[n] ?? Array(n).fill(''));
  }

  // 슬롯 수 변경 시 라벨 배열 조정
  function handleCountChange(n: number) {
    setSplitCount(n);
    if (n === 0) { setLabels([]); return; }
    const preset = SPLIT_PRESETS[n];
    if (preset) { setLabels(preset); return; }
    // 커스텀: 기존 라벨 유지 + 부족한 건 빈 값으로
    setLabels(prev => {
      const next = [...prev];
      while (next.length < n) next.push('');
      return next.slice(0, n);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const slots = splitCount === 0 ? null : labels.map(l => ({ label: l.trim() || '운동' }));
      await api.put('/users/me/split', { slots });
      onSaved();
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[splitStyles.header, { paddingTop: insetTop + 16 }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={splitStyles.back}>‹ 뒤로</Text>
        </TouchableOpacity>
        <Text style={splitStyles.title}>운동 분할</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#4f8ef7" size="small" />
            : <Text style={splitStyles.save}>저장</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={splitStyles.body} showsVerticalScrollIndicator={false}>
        {/* 분할 수 선택 */}
        <Text style={splitStyles.sectionLabel}>분할 수</Text>
        <View style={splitStyles.countRow}>
          {[0, 2, 3, 4, 5, 6].map(n => (
            <TouchableOpacity
              key={n}
              style={[splitStyles.countBtn, splitCount === n && splitStyles.countBtnOn]}
              onPress={() => handleCountChange(n)}
            >
              <Text style={[splitStyles.countBtnText, splitCount === n && splitStyles.countBtnTextOn]}>
                {n === 0 ? '없음' : `${n}분할`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {splitCount > 0 && (
          <>
            <Text style={[splitStyles.sectionLabel, { marginTop: 24 }]}>각 날의 운동 부위</Text>
            <Text style={splitStyles.sectionSub}>쉼표로 여러 부위를 구분해요 (예: 등, 이두)</Text>
            {labels.map((lbl, i) => (
              <View key={i} style={splitStyles.slotRow}>
                <View style={splitStyles.slotBadge}>
                  <Text style={splitStyles.slotBadgeText}>Day {i + 1}</Text>
                </View>
                <TextInput
                  style={splitStyles.slotInput}
                  value={lbl}
                  onChangeText={v => setLabels(prev => prev.map((x, j) => j === i ? v : x))}
                  placeholder={SPLIT_PRESETS[splitCount]?.[i] ?? `운동 ${i + 1}`}
                  placeholderTextColor="#48484a"
                  returnKeyType="next"
                />
              </View>
            ))}

            {/* 현재 슬롯 위치 */}
            {config && (
              <View style={splitStyles.infoBox}>
                <Text style={splitStyles.infoText}>
                  현재 위치: Day {(config.currentSlotIndex % config.slots.length) + 1} — {config.slots[config.currentSlotIndex % config.slots.length]?.label}
                </Text>
                <Text style={[splitStyles.infoText, { color: '#636366', marginTop: 4 }]}>
                  운동 기록할 때마다 자동으로 다음 날로 넘어가요
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const splitStyles = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: '#2c2c2e' },
  title:        { color: '#fff', fontSize: 17, fontWeight: '700' },
  back:         { color: '#4f8ef7', fontSize: 16, fontWeight: '500', width: 60 },
  save:         { color: '#4f8ef7', fontSize: 16, fontWeight: '700', width: 60, textAlign: 'right' },
  body:         { padding: 20, gap: 12, paddingBottom: 60 },
  sectionLabel: { color: '#8e8e93', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  sectionSub:   { color: '#636366', fontSize: 12, marginBottom: 12, marginTop: -6 },
  countRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countBtn:     { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#1c1c1e', borderWidth: 1, borderColor: '#2c2c2e' },
  countBtnOn:   { backgroundColor: 'rgba(79,142,247,0.15)', borderColor: '#4f8ef7' },
  countBtnText: { color: '#8e8e93', fontSize: 14, fontWeight: '600' },
  countBtnTextOn:{ color: '#4f8ef7' },
  slotRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  slotBadge:    { width: 52, height: 32, borderRadius: 8, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  slotBadgeText:{ color: '#8e8e93', fontSize: 12, fontWeight: '700' },
  slotInput:    { flex: 1, backgroundColor: '#1c1c1e', color: '#fff', fontSize: 15, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#2c2c2e' },
  infoBox:      { marginTop: 16, backgroundColor: 'rgba(79,142,247,0.08)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)' },
  infoText:     { color: '#4f8ef7', fontSize: 13, fontWeight: '600' },
});

// ── 날짜 상세 모달 ──────────────────────────────────
function DayDetailModal({ log, onClose }: { log: CalendarLog; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const photo = parsePhoto(log.photoUrl);
  const exercises = parseExercises(log.note);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.modalTitle}>{log.localDate}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>닫기</Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.detailPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.noPhotoBox}>
              <DumbbellIcon size={44} color="#3a3a3c" strokeWidth={1.4} />
              <Text style={{ color: '#555', marginTop: 10, fontSize: 13 }}>사진 없음</Text>
            </View>
          )}
          {log.gpsVerified && (
            <View style={styles.gpsBadge}>
              <LocationIcon size={13} color="#30d158" strokeWidth={2} />
              <Text style={styles.gpsBadgeText}>헬스장 방문 인증</Text>
            </View>
          )}
          {exercises && exercises.length > 0 ? (
            <View style={styles.detailExList}>
              <Text style={styles.detailExTitle}>운동 기록</Text>
              {exercises.map((ex) => (
                <View key={ex.exerciseId} style={styles.detailExRow}>
                  <Text style={{ fontSize: 22 }}>{ex.emoji}</Text>
                  <Text style={styles.detailExName}>{ex.name}</Text>
                  <Text style={styles.detailExSets}>{fmtSets(ex)}</Text>
                </View>
              ))}
            </View>
          ) : (
            !photo && <Text style={styles.emptyList}>운동 기록이 없어요</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── 소셜 목록 모달 ──────────────────────────────────
function SocialModal({
  title, users, onClose, onToggleFollow,
}: {
  title:            string;
  users:            SocialUser[];
  onClose:          () => void;
  onToggleFollow?:  (targetId: string, currentlyFollowing: boolean) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [localUsers, setLocalUsers] = useState<SocialUser[]>(users);

  async function handleToggle(u: SocialUser) {
    if (!onToggleFollow || pendingIds.has(u.id)) return;
    setPendingIds(prev => new Set(prev).add(u.id));
    try {
      await onToggleFollow(u.id, !!u.isFollowing);
      setLocalUsers(prev =>
        prev.map(x => x.id === u.id ? { ...x, isFollowing: !x.isFollowing } : x)
      );
    } finally {
      setPendingIds(prev => { const s = new Set(prev); s.delete(u.id); return s; });
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>닫기</Text>
          </TouchableOpacity>
        </View>
        {localUsers.length === 0 ? (
          <Text style={styles.emptyList}>아직 없어요</Text>
        ) : (
          <FlatList
            data={localUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => {
              const pending = pendingIds.has(item.id);
              return (
                <View style={styles.userRow}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{item.displayName[0]}</Text>
                  </View>
                  <Text style={[styles.userDisplayName, { flex: 1 }]}>{item.displayName}</Text>
                  {onToggleFollow && (
                    <TouchableOpacity
                      style={[styles.socialFollowBtn, item.isFollowing && styles.socialFollowingBtn]}
                      onPress={() => handleToggle(item)}
                      disabled={pending}
                    >
                      {pending
                        ? <ActivityIndicator size="small" color={item.isFollowing ? '#8e8e93' : '#fff'} />
                        : <Text style={[styles.socialFollowBtnText, item.isFollowing && styles.socialFollowingBtnText]}>
                            {item.isFollowing ? '언팔로우' : '팔로우'}
                          </Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ── 히스토리 모달 ──────────────────────────────────
const HIST_CELL = Math.floor(SCREEN_W / 7);

function HistoryModal({ onClose }: { onClose: () => void }) {
  const [year,  setYear]  = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedLog, setSelectedLog] = useState<CalendarLog | null>(null);

  const { data: calData, isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn:  () => api.get<{ logs: CalendarLog[] }>(`/workouts/calendar?year=${year}&month=${month}`),
  });

  const logMap = new Map<string, CalendarLog>();
  (calData?.logs ?? []).forEach((l) => logMap.set(l.localDate, l));

  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={hStyles.container}>
        {selectedLog && (
          <DayDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        )}

        <View style={hStyles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={hStyles.close}>닫기</Text>
          </TouchableOpacity>
          <Text style={hStyles.title}>운동 히스토리</Text>
          <View style={{ width: 48 }} />
        </View>

        {/* 월 네비게이션 */}
        <View style={hStyles.nav}>
          <TouchableOpacity style={hStyles.navBtn} onPress={() => {
            if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
          }}>
            <Text style={hStyles.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={hStyles.navTitle}>{year}년 {month}월</Text>
          <TouchableOpacity style={hStyles.navBtn} onPress={() => {
            if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
          }}>
            <Text style={hStyles.navArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 요일 헤더 */}
        <View style={hStyles.weekRow}>
          {WEEKDAYS.map((d, i) => (
            <Text key={d} style={[hStyles.weekDay, i === 0 && { color: '#e05555' }, i === 6 && { color: '#4f8ef7' }]}>
              {d}
            </Text>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color="#4f8ef7" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView>
            <View style={hStyles.grid}>
              {cells.map((day, idx) => {
                if (!day) return <View key={`e${idx}`} style={hStyles.cell} />;

                const dateStr = `${year}-${pad(month)}-${pad(day)}`;
                const log     = logMap.get(dateStr);
                const photo   = log ? parsePhoto(log.photoUrl) : null;
                const isToday = dateStr === today;
                const dow     = idx % 7;

                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={hStyles.cell}
                    onPress={() => { if (log) setSelectedLog(log); }}
                    activeOpacity={log ? 0.75 : 1}
                  >
                    {photo ? (
                      <View style={hStyles.photoCell}>
                        <Image source={{ uri: photo }} style={hStyles.photo} />
                        <Text style={hStyles.photoDay}>{day}</Text>
                      </View>
                    ) : (
                      <View style={[
                        hStyles.emptyCell,
                        isToday && hStyles.todayCell,
                        log && !isToday && hStyles.loggedCell,
                      ]}>
                        <Text style={[
                          hStyles.dayNum,
                          dow === 0 && { color: '#e05555' },
                          dow === 6 && { color: '#4f8ef7' },
                          isToday && { color: '#fff' },
                          log && !isToday && { color: '#4caf50' },
                        ]}>
                          {day}
                        </Text>
                        {log && <View style={hStyles.dot} />}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const hStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  title:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  close:     { color: '#4f8ef7', fontSize: 16 },

  nav:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12 },
  navBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navArrow:  { color: '#4f8ef7', fontSize: 32 },
  navTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },

  weekRow:   { flexDirection: 'row' },
  weekDay:   { width: HIST_CELL, textAlign: 'center', color: '#555', fontSize: 11, fontWeight: '600', paddingBottom: 6 },

  grid:      { flexDirection: 'row', flexWrap: 'wrap' },
  cell:      { width: HIST_CELL, height: HIST_CELL, padding: 1 },

  photoCell: { flex: 1, position: 'relative' },
  photo:     { width: '100%', height: '100%', borderRadius: 4 },
  photoDay:  { position: 'absolute', bottom: 3, left: 4, color: '#fff', fontSize: 10, fontWeight: '700', textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  emptyCell: { flex: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', gap: 2 },
  todayCell: { backgroundColor: '#4f8ef7' },
  loggedCell:{ backgroundColor: '#1a2e1a' },
  dayNum:    { color: '#444', fontSize: 13, fontWeight: '600' },
  dot:       { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4caf50' },
});

// ── 메인 스크린 ─────────────────────────────────────
export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [selectedLog,  setSelectedLog]  = useState<CalendarLog | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [socialType,   setSocialType]   = useState<'followers' | 'following' | null>(null);
  const [gymSaving, setGymSaving] = useState(false);
  const [showGymPicker, setShowGymPicker] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [showSplitPanel, setShowSplitPanel]       = useState(false);
  const settingsAnim      = useRef(new Animated.Value(SCREEN_W)).current;
  const slideAnim         = useRef(new Animated.Value(SCREEN_W)).current;
  const scheduleSlideAnim = useRef(new Animated.Value(SCREEN_W)).current;
  const splitSlideAnim    = useRef(new Animated.Value(SCREEN_W)).current;

  function openSettings() {
    setShowSettings(true);
    Animated.timing(settingsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }

  function closeSettings() {
    Animated.timing(settingsAnim, { toValue: SCREEN_W, duration: 300, useNativeDriver: true }).start(() => {
      setShowSettings(false);
      settingsAnim.setValue(SCREEN_W);
    });
  }

  function openPrivacy() {
    setShowPrivacy(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }

  function closePrivacy() {
    Animated.timing(slideAnim, { toValue: SCREEN_W, duration: 300, useNativeDriver: true }).start(() => {
      setShowPrivacy(false);
      slideAnim.setValue(SCREEN_W);
    });
  }

  function openSchedulePanel() {
    setShowSchedulePanel(true);
    Animated.timing(scheduleSlideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }

  function closeSchedulePanel() {
    Animated.timing(scheduleSlideAnim, { toValue: SCREEN_W, duration: 300, useNativeDriver: true }).start(() => {
      setShowSchedulePanel(false);
      scheduleSlideAnim.setValue(SCREEN_W);
    });
  }

  function openSplitPanel() {
    setShowSplitPanel(true);
    Animated.timing(splitSlideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }

  function closeSplitPanel() {
    Animated.timing(splitSlideAnim, { toValue: SCREEN_W, duration: 300, useNativeDriver: true }).start(() => {
      setShowSplitPanel(false);
      splitSlideAnim.setValue(SCREEN_W);
    });
  }

  const { data: profile, isLoading, refetch: refetchProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn:  () => api.get<Profile>(`/users/${user!.id}/profile`),
    enabled:  !!user,
  });

  // 탭 포커스마다 팔로워/팔로잉 수 최신 갱신
  useFocusEffect(
    useCallback(() => { refetchProfile(); }, [])
  );

  const { data: followersData, refetch: refetchFollowers } = useQuery({
    queryKey: ['followers', user?.id],
    queryFn:  () => api.get<{ users: SocialUser[] }>(`/users/${user!.id}/followers`),
    enabled:  !!user && socialType === 'followers',
  });

  const { data: followingData, refetch: refetchFollowing } = useQuery({
    queryKey: ['following', user?.id],
    queryFn:  () => api.get<{ users: SocialUser[] }>(`/users/${user!.id}/following`),
    enabled:  !!user && socialType === 'following',
  });

  const { data: rankingData } = useQuery({
    queryKey: ['friendsRanking'],
    queryFn:  () => api.get<{ ranking: RankEntry[] }>('/users/me/friends/ranking'),
    enabled:  !!user,
    staleTime: 60_000,
  });

  const myRankIdx   = rankingData?.ranking.findIndex(r => r.isMe) ?? -1;
  const myRank      = myRankIdx >= 0 ? myRankIdx + 1 : null;
  const rankTotal   = rankingData?.ranking.length ?? 0;

  const { data: splitData, refetch: refetchSplit } = useQuery({
    queryKey: ['split'],
    queryFn:  () => api.get<SplitData>('/users/me/split'),
    enabled:  !!user,
  });

  async function toggleSocialFollow(targetId: string, currentlyFollowing: boolean) {
    if (currentlyFollowing) {
      await api.delete(`/users/${targetId}/follow`);
    } else {
      await api.post(`/users/${targetId}/follow`);
    }
    queryClient.invalidateQueries({ queryKey: ['profile'], exact: false });
    queryClient.invalidateQueries({ queryKey: ['friendsRanking'] });
    refetchFollowers();
    refetchFollowing();
  }

  const { data: gymData } = useQuery({
    queryKey: ['gym'],
    queryFn:  () => api.get<{ user: GymInfo }>('/users/me'),
    enabled:  !!user,
  });

  const { data: scheduleData, refetch: refetchSchedule } = useQuery({
    queryKey: ['schedule'],
    queryFn:  () => api.get<{ daysOfWeek: number[] }>('/users/me/schedule'),
    enabled:  !!user,
  });

  const scheduleDays: number[] = scheduleData?.daysOfWeek ?? [1, 2, 3, 4, 5];

  async function handleGymConfirm(loc: GymLocation) {
    setShowGymPicker(false);
    setGymSaving(true);
    try {
      await api.put('/users/me/gym', {
        gymLat:  loc.lat,
        gymLng:  loc.lng,
        gymName: loc.name,
      });
      queryClient.invalidateQueries({ queryKey: ['gym'] });
      Alert.alert('등록 완료', `"${loc.name}" 위치로 헬스장이 등록되었어요.`);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setGymSaving(false);
    }
  }

  async function handleVisibilityChange(value: string) {
    setVisibilitySaving(true);
    try {
      await api.patch('/users/me/visibility', { defaultVisibility: value });
      queryClient.invalidateQueries({ queryKey: ['gym'] });
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function handleScheduleToggle(day: number) {
    const current = scheduleData?.daysOfWeek ?? [1, 2, 3, 4, 5];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setSavingSchedule(true);
    try {
      await api.put('/users/me/schedule', { daysOfWeek: next });
      refetchSchedule();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleLogout() {
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: async () => {
          await logout(); router.replace('/(auth)/login');
        },
      },
    ]);
  }



  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const s = profile?.stats;

  // ── 이번 주 운동 횟수 (회복 부채 계산용) ──────────
  const now = new Date();
  const weekYear  = now.getFullYear();
  const weekMonth = now.getMonth() + 1;
  const { data: calData } = useQuery({
    queryKey: ['calendar', weekYear, weekMonth],
    queryFn:  () => api.get<{ logs: { localDate: string; note: string | null }[] }>(
      `/workouts/calendar?year=${weekYear}&month=${weekMonth}`
    ),
    enabled: !!user,
  });

  // 이번 주 월요일~오늘까지 날짜
  const todayDate   = new Date();
  const dayOfWeek   = todayDate.getDay();
  const monday      = new Date(todayDate);
  monday.setDate(todayDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  });

  const WEEKLY_GOAL = scheduleDays.length || 3;
  const weeklyActual = (calData?.logs ?? []).filter(l =>
    weekDates.includes(l.localDate)
  ).length;
  const weekCredit = weeklyActual - WEEKLY_GOAL; // 양수=여유, 음수=부채

  function getStreakStartDate(): string | null {
    if (!s?.lastLogDate || !s.currentStreak) return null;
    const last = new Date(s.lastLogDate);
    last.setDate(last.getDate() - (s.currentStreak - 1));
    return `${last.getFullYear()}.${String(last.getMonth() + 1).padStart(2, '0')}.${String(last.getDate()).padStart(2, '0')}`;
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color="#4f8ef7" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 프로필 편집 모달 */}
      {showEditProfile && (
        <ProfileEditModal
          initialName={user?.displayName ?? ''}
          initialPhoto={gymData?.user?.profilePhoto ?? null}
          onClose={() => setShowEditProfile(false)}
          onSaved={(name, photo) => {
            queryClient.invalidateQueries({ queryKey: ['gym'] });
            queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
            if (user) (useAuthStore as any).setState({ user: { ...user, displayName: name } });
          }}
        />
      )}

      {/* 히스토리 모달 */}
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}

      {/* 설정 모달 */}
      <Modal visible={showSettings} animationType="none" presentationStyle="fullScreen" onRequestClose={closeSettings}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.modalWrap, { transform: [{ translateX: settingsAnim }], overflow: 'hidden' }]}>
          {/* 설정 메인 */}
          <View style={StyleSheet.absoluteFill}>
            <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
              <Text style={styles.modalTitle}>설정</Text>
              <TouchableOpacity onPress={() => { closePrivacy(); closeSettings(); }}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingsList}>
              <TouchableOpacity style={styles.settingsItem} onPress={openSchedulePanel}>
                <View style={styles.menuIconWrap}><CalendarIcon size={20} color="#8e8e93" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsItemLabel}>운동 계획</Text>
                  <Text style={styles.menuSub}>
                    {scheduleDays.length === 0 ? '미설정' : `주 ${scheduleDays.length}회 · ${scheduleDays.map(d => ['일','월','화','수','목','금','토'][d]).join('·')}`}
                  </Text>
                </View>
                <ChevronRightIcon />
              </TouchableOpacity>
              <TouchableOpacity style={styles.settingsItem} onPress={openSplitPanel}>
                <View style={styles.menuIconWrap}><DumbbellIcon size={20} color="#8e8e93" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsItemLabel}>운동 분할</Text>
                  <Text style={styles.menuSub}>
                    {splitData?.config
                      ? `${splitData.config.slots.length}분할 · 다음: ${splitData.config.slots[splitData.todaySlotIndex ?? 0]?.label}`
                      : '미설정'}
                  </Text>
                </View>
                <ChevronRightIcon />
              </TouchableOpacity>
              <TouchableOpacity style={styles.settingsItem} onPress={openPrivacy}>
                <View style={styles.menuIconWrap}><LockIcon size={20} color="#8e8e93" /></View>
                <Text style={styles.settingsItemLabel}>개인정보 보호</Text>
                <ChevronRightIcon />
              </TouchableOpacity>
              <TouchableOpacity style={styles.settingsItem} onPress={handleLogout}>
                <View style={styles.menuIconWrap}><LogoutIcon size={20} color="#ff453a" /></View>
                <Text style={[styles.settingsItemLabel, { color: '#ff453a' }]}>로그아웃</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 개인정보 보호 */}
          {showPrivacy && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.modalWrap, { transform: [{ translateX: slideAnim }] }]}>
              <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={closePrivacy}>
                  <Text style={styles.modalClose}>‹ 뒤로</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>개인정보 보호</Text>
                <View style={{ width: 60 }} />
              </View>
              <View style={{ padding: 20, gap: 8 }}>
                <Text style={styles.gymTitle}>기록 기본 공개 범위</Text>
                <Text style={styles.gymSub}>새 운동 기록의 기본 공개 범위를 설정해요</Text>
                <View style={[styles.visibilityRow, { marginTop: 8 }]}>
                  {(['public', 'friends', 'private'] as const).map((v) => {
                    const label = v === 'public' ? '전체 공개' : v === 'friends' ? '친구만' : '나만 보기';
                    const isSelected = (gymData?.user?.defaultVisibility ?? 'friends') === v;
                    const iconColor = isSelected ? '#4f8ef7' : '#8e8e93';
                    const VisIcon = v === 'public' ? GlobeIcon : v === 'friends' ? UsersIcon : LockIcon;
                    return (
                      <TouchableOpacity
                        key={v}
                        style={[styles.visibilityBtn, isSelected && styles.visibilityBtnSelected]}
                        onPress={() => handleVisibilityChange(v)}
                        disabled={visibilitySaving}
                      >
                        <VisIcon size={22} color={iconColor} strokeWidth={1.8} />
                        <Text style={[styles.visibilityLabel, isSelected && styles.visibilityLabelSelected]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          )}

          {/* 운동 계획 */}
          {showSchedulePanel && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.modalWrap, { transform: [{ translateX: scheduleSlideAnim }] }]}>
              <View style={[styles.modalHeader, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity onPress={closeSchedulePanel}>
                  <Text style={styles.modalClose}>‹ 뒤로</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>운동 계획</Text>
                <View style={{ width: 60 }} />
              </View>
              <View style={{ padding: 20, gap: 16 }}>
                <View>
                  <Text style={styles.gymTitle}>운동 요일 선택</Text>
                  <Text style={styles.gymSub}>운동하는 요일을 골라주세요. 주간 목표가 자동 설정돼요.</Text>
                </View>
                <View style={styles.scheduleDays}>
                  {[1,2,3,4,5,6,0].map((day) => {
                    const label = ['일','월','화','수','목','금','토'][day];
                    const active = scheduleDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.scheduleDay, active && styles.scheduleDayActive]}
                        onPress={() => handleScheduleToggle(day)}
                        disabled={savingSchedule}
                      >
                        <Text style={[styles.scheduleDayText, active && styles.scheduleDayTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.scheduleInfoBox}>
                  <Text style={styles.scheduleInfoText}>
                    {scheduleDays.length === 0
                      ? '요일을 선택해주세요'
                      : `주 ${scheduleDays.length}회 · ${scheduleDays.map(d => ['일','월','화','수','목','금','토'][d]).join('·')} 운동`}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
          {/* 운동 분할 */}
          {showSplitPanel && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.modalWrap, { transform: [{ translateX: splitSlideAnim }] }]}>
              <SplitPanel
                insetTop={insets.top}
                config={splitData?.config ?? null}
                onClose={closeSplitPanel}
                onSaved={() => { refetchSplit(); closeSplitPanel(); }}
              />
            </Animated.View>
          )}
        </Animated.View>
      </Modal>

      {/* 헬스장 지도 선택 */}
      {showGymPicker && (
        <Modal visible animationType="slide" onRequestClose={() => setShowGymPicker(false)}>
          <GymPicker
            initial={gymData?.user?.gymLat ? { lat: gymData.user.gymLat, lng: gymData.user.gymLng! } : null}
            onConfirm={handleGymConfirm}
            onCancel={() => setShowGymPicker(false)}
          />
        </Modal>
      )}

      {/* 날짜 상세 모달 */}
      {selectedLog && (
        <DayDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      {/* 팔로워 모달 */}
      {socialType === 'followers' && (
        <SocialModal
          title="팔로워"
          users={followersData?.users ?? []}
          onClose={() => setSocialType(null)}
          onToggleFollow={toggleSocialFollow}
        />
      )}

      {/* 팔로잉 모달 */}
      {socialType === 'following' && (
        <SocialModal
          title="팔로잉"
          users={followingData?.users ?? []}
          onClose={() => setSocialType(null)}
          onToggleFollow={toggleSocialFollow}
        />
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── 프로필 헤더 ── */}
        <View style={styles.profileBanner}>
          <TouchableOpacity style={styles.settingsBtn} onPress={openSettings} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <SettingsIcon size={18} color="#8e8e93" />
          </TouchableOpacity>

          <View style={styles.avatarRing}>
            {gymData?.user?.profilePhoto ? (
              <Image source={{ uri: gymData.user.profilePhoto }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.displayName?.[0] ?? '?'}</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{user?.displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          <TouchableOpacity style={styles.editProfileBtn} onPress={() => setShowEditProfile(true)}>
            <Text style={styles.editProfileBtnText}>프로필 편집</Text>
          </TouchableOpacity>

          {myRank !== null && rankTotal > 1 && (
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>
                {myRank === 1 ? '👑' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🏅'} 친구 중 {myRank}위 / {rankTotal}명
              </Text>
            </View>
          )}
        </View>

        {/* ── 통계 3칸 ── */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{s?.totalWorkouts ?? 0}</Text>
            <Text style={styles.statLbl}>운동 횟수</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statItem} onPress={() => setSocialType('followers')}>
            <Text style={styles.statNum}>{s?.followerCount ?? 0}</Text>
            <Text style={[styles.statLbl, { color: '#4f8ef7' }]}>팔로워</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statItem} onPress={() => setSocialType('following')}>
            <Text style={styles.statNum}>{s?.followingCount ?? 0}</Text>
            <Text style={[styles.statLbl, { color: '#4f8ef7' }]}>팔로잉</Text>
          </TouchableOpacity>
        </View>

        {/* ── Streak + 회복 부채 카드 ── */}
        <View style={styles.streakCard}>
          {/* 연속 스트릭 */}
          <View style={styles.streakLeft}>
            <View style={styles.streakIconWrap}>
              <FlameIcon size={22} color="#f7a84f" />
            </View>
            <View>
              <Text style={styles.streakLabel}>연속 운동</Text>
              {getStreakStartDate() && (
                <Text style={styles.streakStartDate}>{getStreakStartDate()} 시작</Text>
              )}
            </View>
          </View>
          <View style={styles.streakRight}>
            <View style={styles.streakNumBox}>
              <Text style={styles.streakNum}>{s?.currentStreak ?? 0}</Text>
              <Text style={styles.streakUnit}>일</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakNumBox}>
              <Text style={[styles.streakNum, { color: '#8e8e93' }]}>{s?.longestStreak ?? 0}</Text>
              <Text style={[styles.streakUnit, { color: '#636366' }]}>최장</Text>
            </View>
          </View>
        </View>

        {/* ── 회복 부채 시스템 ── */}
        <View style={styles.debtCard}>
          {/* 주간 목표 진행 */}
          <View style={styles.debtHeader}>
            <View>
              <Text style={styles.debtTitle}>이번 주 운동 부채</Text>
              <Text style={styles.debtSub}>목표 주 {WEEKLY_GOAL}회</Text>
            </View>
            <View style={[
              styles.debtBadge,
              weekCredit >= 0 ? styles.debtBadgeSurplus : styles.debtBadgeDebt,
            ]}>
              <Text style={[
                styles.debtBadgeText,
                weekCredit >= 0 ? styles.debtBadgeSurplusText : styles.debtBadgeDebtText,
              ]}>
                {weekCredit > 0 ? `+${weekCredit} 여유` : weekCredit < 0 ? `${Math.abs(weekCredit)}회 부족` : '목표 달성'}
              </Text>
            </View>
          </View>

          {/* 요일 도트 */}
          <View style={styles.debtDots}>
            {weekDates.map((date, i) => {
              const done    = (calData?.logs ?? []).some(l => l.localDate === date);
              const isToday = date === today;
              const isFuture = date > today;
              const dayLabel = ['월','화','수','목','금','토','일'][i];
              return (
                <View key={date} style={styles.debtDotWrap}>
                  <View style={[
                    styles.debtDot,
                    done      && styles.debtDotDone,
                    isToday && !done && styles.debtDotToday,
                    isFuture  && styles.debtDotFuture,
                  ]} />
                  <Text style={[
                    styles.debtDotLabel,
                    isToday && styles.debtDotLabelToday,
                  ]}>{dayLabel}</Text>
                </View>
              );
            })}
          </View>

          {/* 진행 바 */}
          <View style={styles.debtTrack}>
            <View style={[
              styles.debtFill,
              {
                width: `${Math.min(100, (weeklyActual / WEEKLY_GOAL) * 100)}%`,
                backgroundColor: weekCredit >= 0 ? '#30d158' : '#4f8ef7',
              },
            ]} />
          </View>
          <Text style={styles.debtCount}>
            {weeklyActual} / {WEEKLY_GOAL}회 완료
          </Text>
        </View>

        {/* ── 머슬 커버리지 맵 ── */}
        <MuscleCoverageMap onOpenHistory={() => setShowHistory(true)} />

        {/* ── 메뉴 카드 ── */}
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowHistory(true)}>
            <View style={styles.menuIconWrap}><CalendarIcon size={20} color="#8e8e93" /></View>
            <Text style={styles.menuLabel}>운동 히스토리</Text>
            <ChevronRightIcon />
          </TouchableOpacity>
          <View style={styles.menuSeparator} />
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowGymPicker(true)} disabled={gymSaving}>
            <View style={styles.menuIconWrap}><LocationIcon size={20} color="#8e8e93" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>헬스장 위치</Text>
              {gymData?.user?.gymLat ? (
                <Text style={styles.menuSub}>{gymData.user.gymName ?? '내 헬스장'} · 등록됨</Text>
              ) : (
                <Text style={[styles.menuSub, { color: '#ff453a' }]}>미등록</Text>
              )}
            </View>
            {gymSaving
              ? <ActivityIndicator color="#4f8ef7" size="small" />
              : <ChevronRightIcon />
            }
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll:    { paddingBottom: 32 },

  // ── 프로필 헤더
  profileBanner: { alignItems: 'center', paddingTop: 20, paddingBottom: 28, paddingHorizontal: 20, backgroundColor: '#0a0a0a' },
  settingsBtn:   { position: 'absolute', top: 20, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  settingsIcon:  { fontSize: 17 },
  avatarRing:    { width: 92, height: 92, borderRadius: 46, borderWidth: 2.5, borderColor: '#4f8ef7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatar:        { width: 82, height: 82, borderRadius: 41, backgroundColor: '#1c3a6e', alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: '#fff', fontSize: 34, fontWeight: '800' },
  name:          { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  email:         { color: '#8e8e93', fontSize: 13, marginTop: 4 },

  // ── 통계
  statsRow:     { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1c1c1e', borderRadius: 18, paddingVertical: 18 },
  statItem:     { flex: 1, alignItems: 'center' },
  statNum:      { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLbl:      { color: '#8e8e93', fontSize: 11, fontWeight: '500', marginTop: 3 },
  statDivider:  { width: 0.5, backgroundColor: '#3a3a3c' },

  // ── Streak 카드
  streakCard:      { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1c1c1e', borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center' },
  streakLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  streakIconWrap:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(247,168,79,0.12)', alignItems: 'center', justifyContent: 'center' },
  streakLabel:     { color: '#fff', fontSize: 15, fontWeight: '700' },
  streakStartDate: { color: '#8e8e93', fontSize: 11, marginTop: 2 },
  streakRight:     { flexDirection: 'row', alignItems: 'center', gap: 16 },
  streakNumBox:    { alignItems: 'center' },
  streakNum:       { color: '#f7a84f', fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  streakUnit:      { color: '#8e8e93', fontSize: 11, fontWeight: '500' },
  streakDivider:   { width: 0.5, height: 32, backgroundColor: '#3a3a3c' },

  // ── 회복 부채 카드
  debtCard:            { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1c1c1e', borderRadius: 18, padding: 18, gap: 12 },
  debtHeader:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  debtTitle:           { color: '#fff', fontSize: 15, fontWeight: '700' },
  debtSub:             { color: '#8e8e93', fontSize: 12, marginTop: 2 },
  debtBadge:           { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  debtBadgeSurplus:    { backgroundColor: 'rgba(48,209,88,0.15)' },
  debtBadgeDebt:       { backgroundColor: 'rgba(79,142,247,0.15)' },
  debtBadgeText:       { fontSize: 12, fontWeight: '700' },
  debtBadgeSurplusText:{ color: '#30d158' },
  debtBadgeDebtText:   { color: '#4f8ef7' },
  debtDots:            { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  debtDotWrap:         { alignItems: 'center', gap: 5 },
  debtDot:             { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2c2c2e', borderWidth: 1.5, borderColor: '#3a3a3c' },
  debtDotDone:         { backgroundColor: '#30d158', borderColor: '#30d158' },
  debtDotToday:        { borderColor: '#4f8ef7', borderWidth: 2 },
  debtDotFuture:       { opacity: 0.35 },
  debtDotLabel:        { color: '#636366', fontSize: 10, fontWeight: '600' },
  debtDotLabelToday:   { color: '#4f8ef7' },
  debtTrack:           { height: 5, backgroundColor: '#2c2c2e', borderRadius: 3, overflow: 'hidden' },
  debtFill:            { height: '100%', borderRadius: 3 },
  debtCount:           { color: '#636366', fontSize: 12, textAlign: 'right' },

  // ── 메뉴 카드
  menuCard:      { marginHorizontal: 16, backgroundColor: '#1c1c1e', borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  menuItem:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 16, gap: 14 },
  menuIconWrap:  { width: 26, alignItems: 'center' },
  menuIcon:      { fontSize: 20, width: 26, textAlign: 'center' },
  menuLabel:     { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
  menuSub:       { color: '#8e8e93', fontSize: 12, marginTop: 1 },
  menuArrow:     { color: '#636366', fontSize: 20, fontWeight: '300' },
  menuSeparator: { height: 0.5, backgroundColor: '#2c2c2e', marginLeft: 58 },

  // ── 모달 공통
  modalWrap:   { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  modalTitle:  { color: '#fff', fontSize: 20, fontWeight: '700' },
  modalClose:  { color: '#4f8ef7', fontSize: 16, fontWeight: '500' },

  // ── 소셜 목록
  userRow:         { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: '#2c2c2e' },
  userAvatar:      { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1c3a6e', alignItems: 'center', justifyContent: 'center' },
  userAvatarText:  { color: '#fff', fontWeight: '700', fontSize: 18 },
  userDisplayName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyList:       { color: '#636366', textAlign: 'center', marginTop: 60, fontSize: 15 },

  // ── 날짜 상세
  detailPhoto:   { width: '100%', aspectRatio: 1 },
  noPhotoBox:    { height: 160, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },
  gpsBadge:      { margin: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(48,209,88,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  gpsBadgeText:  { color: '#30d158', fontWeight: '600', fontSize: 13 },
  detailExList:  { padding: 16 },
  detailExTitle: { color: '#8e8e93', fontWeight: '600', fontSize: 12, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailExRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: '#2c2c2e' },
  detailExName:  { color: '#fff', fontWeight: '600', fontSize: 15, flex: 1 },
  detailExSets:  { color: '#4f8ef7', fontSize: 13, fontWeight: '600' },

  // ── 설정 모달
  settingsList:      { marginTop: 8 },
  settingsItem:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: '#2c2c2e', gap: 14 },
  settingsItemIcon:  { fontSize: 20, width: 26, textAlign: 'center' }, // unused (kept for compat)
  settingsItemLabel: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '400' },
  settingsItemArrow: { color: '#636366', fontSize: 20 },

  // ── 아바타
  avatarImg:  { width: 82, height: 82, borderRadius: 41 },

  // ── 프로필 편집 버튼
  editProfileBtn:     { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1c1c1e', borderWidth: 0.5, borderColor: '#3a3a3c' },
  editProfileBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── 랭킹 뱃지
  rankBadge:     { marginTop: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(79,142,247,0.12)', borderWidth: 0.5, borderColor: 'rgba(79,142,247,0.4)' },
  rankBadgeText: { color: '#4f8ef7', fontSize: 13, fontWeight: '700' },

  // ── 팔로워/팔로잉 모달 버튼
  socialFollowBtn:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#4f8ef7', minWidth: 70, alignItems: 'center' },
  socialFollowingBtn:      { backgroundColor: '#2c2c2e' },
  socialFollowBtnText:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  socialFollowingBtnText:  { color: '#8e8e93' },

  // ── 운동 계획 (설정 패널용)
  scheduleDays:         { flexDirection: 'row', justifyContent: 'space-between' },
  scheduleDay:          { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#3a3a3c' },
  scheduleDayActive:    { backgroundColor: 'rgba(79,142,247,0.18)', borderColor: '#4f8ef7' },
  scheduleDayText:      { color: '#636366', fontSize: 13, fontWeight: '600' },
  scheduleDayTextActive:{ color: '#4f8ef7' },
  scheduleInfoBox:      { backgroundColor: '#1c1c1e', borderRadius: 12, padding: 14 },
  scheduleInfoText:     { color: '#8e8e93', fontSize: 14, textAlign: 'center' },

  // ── 공개범위
  gymTitle:              { color: '#fff', fontWeight: '600', fontSize: 15 },
  gymSub:                { color: '#8e8e93', fontSize: 13, marginTop: 4 },
  visibilityRow:           { flexDirection: 'row', gap: 10, marginTop: 12 },
  visibilityBtn:           { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: '#2c2c2e', gap: 6 },
  visibilityBtnSelected:   { backgroundColor: 'rgba(79,142,247,0.15)' },
  visibilityEmoji:         { fontSize: 22 },
  visibilityLabel:         { color: '#8e8e93', fontSize: 12, fontWeight: '500' },
  visibilityLabelSelected: { color: '#4f8ef7' },
});
