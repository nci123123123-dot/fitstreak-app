import {
  View, Text, StyleSheet, Modal, ScrollView, Image,
  TouchableOpacity, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { FlameIcon, DumbbellIcon, XCircleIcon } from './Icons';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_W - 20 * 2 - 8) / 3;

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

function sortMonFirst(days: number[]) {
  return [...days].sort((a, b) => MON_FIRST.indexOf(a) - MON_FIRST.indexOf(b));
}

function parsePhoto(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  try {
    const p = JSON.parse(photoUrl);
    return p.back ?? null;
  } catch {
    return photoUrl.startsWith('data:') ? photoUrl : null;
  }
}

interface RecentLog {
  id: string;
  localDate: string;
  note: string | null;
  photoUrl: string | null;
  gpsVerified: boolean;
}

interface FriendProfile {
  user: { id: string; displayName: string; profilePhoto: string | null; createdAt: string };
  stats: { currentStreak: number; longestStreak: number; lastLogDate: string | null; totalWorkouts: number; followerCount: number; followingCount: number };
  schedule: { daysOfWeek: number[] };
  splitSlots: { label: string }[];
  recentLogs: RecentLog[];
  isFollowing: boolean;
}

const AVATAR_COLORS = ['#4f8ef7', '#f7a84f', '#30d158', '#bf5af2', '#ff6b6b', '#0dd3c5'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface Props {
  userId: string;
  onClose: () => void;
}

export default function FriendProfileModal({ userId, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<FriendProfile>({
    queryKey: ['profile', userId],
    queryFn:  () => api.get(`/users/${userId}/profile`),
    staleTime: 60_000,
  });

  const todayKST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const workedOutToday = data?.stats.lastLogDate === todayKST;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeBtn}>닫기</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>친구 프로필</Text>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#4f8ef7" size="large" />
          </View>
        ) : !data ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>프로필을 불러올 수 없어요</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* 프로필 상단 */}
            <View style={styles.profileTop}>
              {data.user.profilePhoto ? (
                <Image source={{ uri: data.user.profilePhoto }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: avatarColor(data.user.displayName) }]}>
                  <Text style={styles.avatarLetter}>{data.user.displayName[0]}</Text>
                </View>
              )}
              <Text style={styles.displayName}>{data.user.displayName}</Text>

              {/* 오늘 운동 뱃지 */}
              {workedOutToday && (
                <View style={styles.todayBadge}>
                  <FlameIcon size={13} color="#30d158" />
                  <Text style={styles.todayBadgeText}>오늘 운동 완료</Text>
                </View>
              )}
            </View>

            {/* 스탯 카드 */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{data.stats.currentStreak}</Text>
                <Text style={styles.statLabel}>현재 스트릭</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{data.stats.longestStreak}</Text>
                <Text style={styles.statLabel}>최장 스트릭</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{data.stats.totalWorkouts}</Text>
                <Text style={styles.statLabel}>총 운동 횟수</Text>
              </View>
            </View>

            {/* 운동 계획 */}
            {data.schedule.daysOfWeek.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>운동 계획</Text>
                <View style={styles.daysRow}>
                  {sortMonFirst(data.schedule.daysOfWeek).map(d => (
                    <View key={d} style={styles.dayChip}>
                      <Text style={styles.dayChipText}>{WEEKDAY_LABELS[d]}</Text>
                    </View>
                  ))}
                  <Text style={styles.daysCount}>주 {data.schedule.daysOfWeek.length}회</Text>
                </View>
              </View>
            )}

            {/* 운동 분할 */}
            {data.splitSlots.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>운동 분할</Text>
                <View style={styles.splitGrid}>
                  {data.splitSlots.map((slot, i) => (
                    <View key={i} style={styles.splitChip}>
                      <DumbbellIcon size={11} color="#4f8ef7" />
                      <Text style={styles.splitChipText}>{slot.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 최근 운동 기록 */}
            {data.recentLogs.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>최근 운동 기록</Text>
                <View style={styles.photosGrid}>
                  {data.recentLogs.map(log => {
                    const photo = parsePhoto(log.photoUrl);
                    return (
                      <View key={log.id} style={styles.photoCell}>
                        {photo ? (
                          <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
                        ) : (
                          <View style={styles.photoEmpty}>
                            <DumbbellIcon size={22} color="#3a3a3c" strokeWidth={1.5} />
                          </View>
                        )}
                        <Text style={styles.photoDate}>
                          {log.localDate.slice(5).replace('-', '/')}
                        </Text>
                        {log.gpsVerified && (
                          <View style={styles.gpsPin}>
                            <Text style={styles.gpsPinText}>📍</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={{ height: insets.bottom + 24 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1c1c1e' },
  headerTitle:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeBtn:     { color: '#4f8ef7', fontSize: 16 },

  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:    { color: '#636366', fontSize: 15 },

  scroll:       { padding: 20, gap: 14 },

  profileTop:   { alignItems: 'center', paddingVertical: 16, gap: 10 },
  avatar:       { width: 88, height: 88, borderRadius: 44 },
  avatarFallback:{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 36, fontWeight: '800' },
  displayName:  { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  todayBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(48,209,88,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  todayBadgeText:{ color: '#30d158', fontSize: 13, fontWeight: '600' },

  statsRow:     { flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 18, padding: 20 },
  statItem:     { flex: 1, alignItems: 'center', gap: 4 },
  statNum:      { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  statLabel:    { color: '#636366', fontSize: 12, fontWeight: '500' },
  statDivider:  { width: 1, backgroundColor: '#2c2c2e', marginVertical: 4 },

  card:         { backgroundColor: '#1c1c1e', borderRadius: 18, padding: 16, gap: 12 },
  cardTitle:    { color: '#fff', fontSize: 15, fontWeight: '700' },

  daysRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  dayChip:      { backgroundColor: 'rgba(79,142,247,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  dayChipText:  { color: '#4f8ef7', fontSize: 14, fontWeight: '700' },
  daysCount:    { color: '#636366', fontSize: 13, marginLeft: 4 },

  splitGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(79,142,247,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  splitChipText:{ color: '#4f8ef7', fontSize: 13, fontWeight: '600' },

  photosGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  photoCell:    { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photo:        { width: '100%', height: '100%' },
  photoEmpty:   { width: '100%', height: '100%', backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' },
  photoDate:    { position: 'absolute', bottom: 4, left: 6, color: '#fff', fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  gpsPin:       { position: 'absolute', top: 4, right: 4 },
  gpsPinText:   { fontSize: 10 },
});
