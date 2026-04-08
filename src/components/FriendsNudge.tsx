/**
 * 맞팔 친구 운동 현황 + 독려 알림 (Nudge) 카드
 * - 오늘 운동 안 한 맞팔 친구 목록
 * - 1인당 1일 1회 nudge, 하루 총 3회 제한
 */
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

interface FriendStatus {
  id:             string;
  displayName:    string;
  workedOutToday: boolean;
  nudgedToday:    boolean;
}

interface FriendsStatusResponse {
  friends:         FriendStatus[];
  nudgesSentToday: number;
  nudgeLimit:      number;
}

const AVATAR_COLORS = ['#4f8ef7', '#f7a84f', '#30d158', '#bf5af2', '#ff6b6b', '#0dd3c5'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function FriendsNudge() {
  const queryClient = useQueryClient();
  const [nudging, setNudging] = useState<string | null>(null);

  const { data, isLoading } = useQuery<FriendsStatusResponse>({
    queryKey: ['friends-status'],
    queryFn:  () => api.get('/users/me/friends/status'),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: true,
  });

  const nudgeMutation = useMutation({
    mutationFn: (targetId: string) =>
      api.post<{ message: string; remaining: number }>(`/users/${targetId}/nudge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends-status'] });
    },
  });

  async function handleNudge(friendId: string) {
    if (nudging) return;
    setNudging(friendId);
    try {
      await nudgeMutation.mutateAsync(friendId);
    } catch {
      // 에러는 UI 상태로 표시됨
    } finally {
      setNudging(null);
    }
  }

  if (isLoading) return null;
  if (!data) return null;
  if (data.friends.length === 0) return null;

  // 오늘 운동 안 한 친구만 표시
  const lazyFriends = data.friends.filter((f) => !f.workedOutToday);

  // 모든 친구가 오늘 운동 완료한 경우 — 긍정 피드백
  if (lazyFriends.length === 0) {
    return (
      <View style={styles.allDoneWrap}>
        <Text style={styles.allDoneEmoji}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.allDoneTitle}>친구들 모두 오늘 운동 완료!</Text>
          <Text style={styles.allDoneSub}>같이 열심히 하고 있어요</Text>
        </View>
      </View>
    );
  }

  const remaining   = data.nudgeLimit - data.nudgesSentToday;
  const canNudge    = remaining > 0;

  return (
    <View style={styles.wrap}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>아직 운동 안 한 친구</Text>
        <View style={[styles.pill, !canNudge && styles.pillDone]}>
          <Text style={[styles.pillText, !canNudge && styles.pillTextDone]}>
            {canNudge ? `독려 ${remaining}회 남음` : '오늘 독려 완료'}
          </Text>
        </View>
      </View>

      {/* 친구 목록 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {lazyFriends.map((friend) => {
          const isNudging   = nudging === friend.id;
          const alreadyNudged = friend.nudgedToday;
          const disabled    = !canNudge || alreadyNudged || isNudging;

          return (
            <View key={friend.id} style={styles.item}>
              {/* 아바타 */}
              <View style={[styles.avatar, { backgroundColor: avatarColor(friend.displayName) }]}>
                <Text style={styles.avatarText}>{friend.displayName[0]}</Text>
              </View>

              {/* 이름 */}
              <Text style={styles.name} numberOfLines={1}>{friend.displayName}</Text>

              {/* 독려 버튼 */}
              <TouchableOpacity
                style={[
                  styles.nudgeBtn,
                  alreadyNudged && styles.nudgeBtnDone,
                  !canNudge && !alreadyNudged && styles.nudgeBtnDisabled,
                ]}
                onPress={() => handleNudge(friend.id)}
                disabled={disabled}
                activeOpacity={0.75}
              >
                {isNudging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[
                    styles.nudgeBtnText,
                    alreadyNudged && styles.nudgeBtnTextDone,
                  ]}>
                    {alreadyNudged ? '✓ 독려완료' : '💪 독려하기'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pill: {
    backgroundColor: 'rgba(79,142,247,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillDone: {
    backgroundColor: 'rgba(142,142,147,0.1)',
  },
  pillText: {
    color: '#4f8ef7',
    fontSize: 11,
    fontWeight: '700',
  },
  pillTextDone: {
    color: '#636366',
  },

  list: {
    gap: 12,
    paddingRight: 4,
  },
  item: {
    alignItems: 'center',
    gap: 6,
    width: 80,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },

  name: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    width: 72,
  },

  nudgeBtn: {
    backgroundColor: '#4f8ef7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: 'center',
  },
  nudgeBtnDone: {
    backgroundColor: 'rgba(48,209,88,0.15)',
  },
  nudgeBtnDisabled: {
    backgroundColor: 'rgba(142,142,147,0.12)',
  },
  nudgeBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  nudgeBtnTextDone: {
    color: '#30d158',
  },

  allDoneWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(48,209,88,0.08)',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.18)',
  },
  allDoneEmoji: { fontSize: 28 },
  allDoneTitle: { color: '#30d158', fontSize: 14, fontWeight: '700' },
  allDoneSub:   { color: '#4cba6d', fontSize: 12, marginTop: 2 },
});
