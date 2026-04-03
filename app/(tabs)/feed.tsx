import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api/client';

interface FeedLog {
  id: string;
  localDate: string;
  note: string | null;
  gpsVerified: boolean;
  loggedAt: string;
  user: { id: string; displayName: string };
  reactions: { type: string; userId: string }[];
}

export default function FeedScreen() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed'],
    queryFn:  () => api.get<{ logs: FeedLog[] }>('/workouts/feed'),
  });

  const reactMutation = useMutation({
    mutationFn: ({ logId, type }: { logId: string; type: string }) =>
      api.post(`/workouts/${logId}/reactions`, { type }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  function renderItem({ item }: { item: FeedLog }) {
    const date = new Date(item.loggedAt).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const reactionCounts = item.reactions.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    }, {});

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.user.displayName[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{item.user.displayName}</Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>
          {item.gpsVerified && (
            <View style={styles.gpsBadge}>
              <Text style={styles.gpsBadgeText}>📍 인증</Text>
            </View>
          )}
        </View>

        {item.note ? (
          <Text style={styles.note}>{item.note}</Text>
        ) : (
          <Text style={styles.noNote}>운동 완료 💪</Text>
        )}

        <View style={styles.reactionRow}>
          {(['like', 'fire', 'strong'] as const).map((type) => {
            const emoji = type === 'like' ? '👍' : type === 'fire' ? '🔥' : '💪';
            const count = reactionCounts[type] ?? 0;
            return (
              <TouchableOpacity
                key={type}
                style={styles.reactionBtn}
                onPress={() => reactMutation.mutate({ logId: item.id, type })}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 0 && <Text style={styles.reactionCount}>{count}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>친구 피드</Text>
      {isLoading ? (
        <ActivityIndicator color="#4f8ef7" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.logs ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#4f8ef7" />}
          ListEmptyComponent={
            <Text style={styles.empty}>팔로우한 친구의 운동 기록이 없어요.{'\n'}친구를 팔로우해보세요!</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  title:     { color: '#fff', fontSize: 26, fontWeight: '800', padding: 20, paddingBottom: 12 },
  list:      { padding: 16, gap: 12 },

  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4f8ef7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  userName:   { color: '#fff', fontWeight: '700' },
  dateText:   { color: '#555', fontSize: 12 },
  gpsBadge:   { backgroundColor: '#1a2e1a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  gpsBadgeText: { color: '#4caf50', fontSize: 11, fontWeight: '700' },

  note:   { color: '#ccc', lineHeight: 22, marginBottom: 12 },
  noNote: { color: '#555', fontStyle: 'italic', marginBottom: 12 },

  reactionRow: { flexDirection: 'row', gap: 8 },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#222', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { color: '#aaa', fontSize: 13, fontWeight: '600' },

  empty: { textAlign: 'center', color: '#555', marginTop: 60, lineHeight: 26 },
});
