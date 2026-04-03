import { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { SearchIcon } from '../../src/components/Icons';

interface SearchUser {
  id: string;
  displayName: string;
  profilePhoto: string | null;
  isFollowing: boolean;
  isFollower: boolean;
}

export default function SearchScreen() {
  const [query, setQuery]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQ(text.trim()), 350);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['userSearch', debouncedQ],
    queryFn:  () => api.get<{ users: SearchUser[] }>(`/users/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled:  debouncedQ.length > 0,
    staleTime: 30_000,
  });

  const users = data?.users ?? [];

  async function toggleFollow(target: SearchUser) {
    if (pendingIds.has(target.id)) return;
    setPendingIds(prev => new Set(prev).add(target.id));
    try {
      if (target.isFollowing) {
        await api.delete(`/users/${target.id}/follow`);
      } else {
        await api.post(`/users/${target.id}/follow`);
      }
      queryClient.setQueryData(['userSearch', debouncedQ], (old: any) => {
        if (!old) return old;
        return {
          users: old.users.map((u: SearchUser) =>
            u.id === target.id ? { ...u, isFollowing: !u.isFollowing } : u
          ),
        };
      });
      // prefix matching으로 ['profile', userId] 형태까지 모두 무효화
      queryClient.invalidateQueries({ queryKey: ['profile'], exact: false });
    } finally {
      setPendingIds(prev => { const s = new Set(prev); s.delete(target.id); return s; });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 검색 바 */}
      <View style={styles.searchBar}>
        <SearchIcon size={18} color="#636366" />
        <TextInput
          style={styles.input}
          placeholder="이메일로 친구 찾기"
          placeholderTextColor="#636366"
          value={query}
          onChangeText={handleChange}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {isFetching && <ActivityIndicator size="small" color="#4f8ef7" />}
      </View>

      {/* 결과 */}
      {debouncedQ.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>이메일을 입력해서{'\n'}친구를 찾아보세요</Text>
        </View>
      ) : !isFetching && users.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🤷</Text>
          <Text style={styles.emptyText}>"{debouncedQ}"와 일치하는{'\n'}사용자가 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
          renderItem={({ item }) => {
            const pending = pendingIds.has(item.id);
            return (
              <View style={styles.userRow}>
                {/* 아바타 */}
                {item.profilePhoto ? (
                  <Image source={{ uri: item.profilePhoto }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarLetter}>{item.displayName[0]}</Text>
                  </View>
                )}

                {/* 이름 + 팔로워 뱃지 */}
                <View style={styles.nameCol}>
                  <Text style={styles.displayName}>{item.displayName}</Text>
                  {item.isFollower && !item.isFollowing && (
                    <Text style={styles.followerBadge}>나를 팔로우해요</Text>
                  )}
                  {item.isFollower && item.isFollowing && (
                    <Text style={styles.mutualBadge}>서로 팔로우</Text>
                  )}
                </View>

                {/* 팔로우/팔로잉 버튼 */}
                <TouchableOpacity
                  style={[styles.followBtn, item.isFollowing && styles.followingBtn]}
                  onPress={() => toggleFollow(item)}
                  disabled={pending}
                >
                  {pending ? (
                    <ActivityIndicator size="small" color={item.isFollowing ? '#8e8e93' : '#fff'} />
                  ) : (
                    <Text style={[styles.followBtnText, item.isFollowing && styles.followingBtnText]}>
                      {item.isFollowing ? '팔로잉' : '팔로우'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
  },
  input: { flex: 1, color: '#fff', fontSize: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
  emptyIcon: { fontSize: 44 },
  emptyText: { color: '#636366', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1c1c1e',
  },
  avatar:        { width: 48, height: 48, borderRadius: 24 },
  avatarFallback:{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#1c3a6e', alignItems: 'center', justifyContent: 'center' },
  avatarLetter:  { color: '#fff', fontSize: 20, fontWeight: '700' },

  nameCol:       { flex: 1, gap: 3 },
  displayName:   { color: '#fff', fontSize: 16, fontWeight: '600' },
  followerBadge: { color: '#8e8e93', fontSize: 12 },
  mutualBadge:   { color: '#4f8ef7', fontSize: 12 },

  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#4f8ef7',
    minWidth: 74,
    alignItems: 'center',
  },
  followingBtn:     { backgroundColor: '#2c2c2e' },
  followBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  followingBtnText: { color: '#8e8e93' },
});
