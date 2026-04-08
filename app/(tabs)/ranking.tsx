import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { api } from '../../src/api/client';
import { FlameIcon, ChevronRightIcon } from '../../src/components/Icons';
import FriendProfileModal from '../../src/components/FriendProfileModal';

const AVATAR_COLORS = ['#4f8ef7', '#f7a84f', '#30d158', '#bf5af2', '#ff6b6b', '#0dd3c5'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface RankEntry {
  id: string;
  displayName: string;
  profilePhoto: string | null;
  currentStreak: number;
  longestStreak: number;
  workedOutToday: boolean;
  isMe: boolean;
  todaySlotLabel: string | null;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function RankingScreen() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['friendsRanking'],
    queryFn:  () => api.get<{ ranking: RankEntry[] }>('/users/me/friends/ranking'),
  });

  // 탭 포커스마다 최신 데이터 갱신
  useFocusEffect(
    useCallback(() => { refetch(); }, [])
  );

  const ranking = data?.ranking ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>친구 랭킹</Text>
        <Text style={styles.headerSub}>스트릭 기준</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#4f8ef7" style={{ marginTop: 60 }} />
      ) : ranking.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={styles.emptyTitle}>아직 랭킹이 없어요</Text>
          <Text style={styles.emptySub}>친구를 추가하면 같이 경쟁할 수 있어요</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/search')} activeOpacity={0.8}>
            <Text style={styles.emptyBtnText}>친구 찾기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={ranking}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#4f8ef7" />
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          ListHeaderComponent={
            ranking.length >= 3 ? <Podium top3={ranking.slice(0, 3)} onSelect={setSelectedUserId} /> : null
          }
          renderItem={({ item, index }) => (
            <RankRow entry={item} rank={index + 1} onPress={item.isMe ? undefined : () => setSelectedUserId(item.id)} />
          )}
        />
      )}

      {selectedUserId && (
        <FriendProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </SafeAreaView>
  );
}

// ── 시상대 (상위 3명) ────────────────────────────────
function Podium({ top3, onSelect }: { top3: RankEntry[]; onSelect: (id: string) => void }) {
  const order = [top3[1], top3[0], top3[2]].filter(Boolean); // 2nd, 1st, 3rd 순서
  const heights = [70, 90, 55];
  const ranks = [2, 1, 3];

  return (
    <View style={podiumStyles.wrap}>
      {order.map((entry, i) => (
        <TouchableOpacity key={entry.id} style={podiumStyles.col} onPress={entry.isMe ? undefined : () => onSelect(entry.id)} activeOpacity={entry.isMe ? 1 : 0.7}>
          {/* 아바타 */}
          <View style={[podiumStyles.avatarRing, ranks[i] === 1 && podiumStyles.avatarRingGold]}>
            {entry.profilePhoto ? (
              <Image source={{ uri: entry.profilePhoto }} style={podiumStyles.avatar} />
            ) : (
              <View style={[podiumStyles.avatarFallback, { backgroundColor: entry.isMe ? '#2a3a6e' : avatarColor(entry.displayName) }]}>
                <Text style={podiumStyles.avatarLetter}>{entry.displayName[0]}</Text>
              </View>
            )}
          </View>
          <Text style={podiumStyles.medal}>{MEDAL[ranks[i] - 1]}</Text>
          <Text style={[podiumStyles.name, entry.isMe && podiumStyles.nameMe]} numberOfLines={1}>
            {entry.isMe ? '나' : entry.displayName}
          </Text>

          {/* 스트릭 */}
          <View style={podiumStyles.streakBadge}>
            <FlameIcon size={13} color="#f7a84f" />
            <Text style={podiumStyles.streakText}>{entry.currentStreak}일</Text>
          </View>

          {/* 시상대 블록 */}
          <View style={[podiumStyles.block, { height: heights[i] }]}>
            <Text style={podiumStyles.blockRank}>{ranks[i]}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── 랭킹 행 (4위 이하) ──────────────────────────────
function RankRow({ entry, rank, onPress }: { entry: RankEntry; rank: number; onPress?: () => void }) {
  return (
    <TouchableOpacity style={[rowStyles.row, entry.isMe && rowStyles.rowMe]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Text style={rowStyles.rank}>{rank}</Text>

      {entry.profilePhoto ? (
        <Image source={{ uri: entry.profilePhoto }} style={rowStyles.avatar} />
      ) : (
        <View style={[rowStyles.avatarFallback, { backgroundColor: entry.isMe ? '#2a3a6e' : avatarColor(entry.displayName) }]}>
          <Text style={rowStyles.avatarLetter}>{entry.displayName[0]}</Text>
        </View>
      )}

      <View style={rowStyles.info}>
        <Text style={rowStyles.name}>
          {entry.isMe ? `나 (${entry.displayName})` : entry.displayName}
        </Text>
        <View style={rowStyles.subRow}>
          <Text style={rowStyles.longest}>최장 {entry.longestStreak}일</Text>
          {entry.todaySlotLabel && (
            <View style={rowStyles.splitBadge}>
              <Text style={rowStyles.splitBadgeText}>{entry.todaySlotLabel}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={rowStyles.right}>
        {entry.workedOutToday && (
          <View style={rowStyles.todayBadge}>
            <Text style={rowStyles.todayText}>오늘 완료</Text>
          </View>
        )}
        <View style={rowStyles.streakBadge}>
          <FlameIcon size={14} color="#f7a84f" />
          <Text style={rowStyles.streakNum}>{entry.currentStreak}</Text>
          <Text style={rowStyles.streakUnit}>일</Text>
        </View>
        {!entry.isMe && <ChevronRightIcon size={16} color="#3a3a3c" strokeWidth={2} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0a0a0a' },
  headerBar:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub:   { color: '#636366', fontSize: 13 },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 80 },
  emptyIcon:   { fontSize: 48 },
  emptyTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub:    { color: '#636366', fontSize: 14 },
  emptyBtn:    { marginTop: 8, backgroundColor: '#4f8ef7', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13 },
  emptyBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});

const podiumStyles = StyleSheet.create({
  wrap:          { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8, gap: 12 },
  col:           { flex: 1, alignItems: 'center', gap: 4 },
  avatarRing:    { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#3a3a3c', overflow: 'hidden' },
  avatarRingGold:{ borderColor: '#f7a84f', borderWidth: 2.5 },
  avatar:        { width: '100%', height: '100%' },
  avatarFallback:{ width: '100%', height: '100%', backgroundColor: '#1c3a6e', alignItems: 'center', justifyContent: 'center' },
  avatarMe:      { backgroundColor: '#2a3a6e' },
  avatarLetter:  { color: '#fff', fontSize: 22, fontWeight: '800' },
  medal:         { fontSize: 20 },
  name:          { color: '#8e8e93', fontSize: 12, fontWeight: '600', maxWidth: 80, textAlign: 'center' },
  nameMe:        { color: '#4f8ef7' },
  streakBadge:   { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(247,168,79,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  streakText:    { color: '#f7a84f', fontSize: 12, fontWeight: '700' },
  block:         { width: '100%', backgroundColor: '#1c1c1e', borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8 },
  blockRank:     { color: '#3a3a3c', fontSize: 16, fontWeight: '800' },
});

const rowStyles = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1c1c1e', gap: 14 },
  rowMe:         { backgroundColor: 'rgba(79,142,247,0.06)' },
  rank:          { color: '#636366', fontSize: 15, fontWeight: '700', width: 24, textAlign: 'center' },
  avatar:        { width: 44, height: 44, borderRadius: 22 },
  avatarFallback:{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1c3a6e', alignItems: 'center', justifyContent: 'center' },
  avatarMe:      { backgroundColor: '#2a3a6e' },
  avatarLetter:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  info:           { flex: 1, gap: 2 },
  name:           { color: '#fff', fontSize: 15, fontWeight: '600' },
  subRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  longest:        { color: '#636366', fontSize: 12 },
  splitBadge:     { backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  splitBadgeText: { color: '#4f8ef7', fontSize: 11, fontWeight: '600' },
  right:         { alignItems: 'flex-end', gap: 4 },
  todayBadge:    { backgroundColor: 'rgba(48,209,88,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  todayText:     { color: '#30d158', fontSize: 11, fontWeight: '600' },
  streakBadge:   { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  streakNum:     { color: '#f7a84f', fontSize: 18, fontWeight: '800' },
  streakUnit:    { color: '#f7a84f', fontSize: 12, fontWeight: '600' },
});
