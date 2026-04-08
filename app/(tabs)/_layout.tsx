import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HomeIcon, HomeFilledIcon, PersonIcon, PersonFilledIcon,
  PlusIcon, SearchIcon, TrophyIcon,
} from '../../src/components/Icons';

const TAB_CONTENT_HEIGHT = 56;

// 탭 아이콘 래퍼 — active 일 때 위에 파란 dot 표시
function TabIconWrap({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return (
    <View style={tabWrap.container}>
      <View style={[tabWrap.dot, focused && tabWrap.dotActive]} />
      {children}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight        = TAB_CONTENT_HEIGHT + insets.bottom;
  const tabBarPaddingBottom = insets.bottom + 4;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor: '#1c1c1e',
          borderTopWidth: 0.5,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor:   '#ffffff',
        tabBarInactiveTintColor: '#48484a',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 2,
        },
      }}
    >
      {/* 홈 */}
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => (
            <TabIconWrap focused={focused}>
              {focused
                ? <HomeFilledIcon size={24} color="#ffffff" />
                : <HomeIcon size={24} color="#48484a" />}
            </TabIconWrap>
          ),
        }}
      />
      {/* 검색 */}
      <Tabs.Screen
        name="search"
        options={{
          title: '검색',
          tabBarIcon: ({ focused }) => (
            <TabIconWrap focused={focused}>
              <SearchIcon size={24} color={focused ? '#ffffff' : '#48484a'} strokeWidth={focused ? 2.2 : 1.8} />
            </TabIconWrap>
          ),
        }}
      />
      {/* 기록 (정중앙 FAB) */}
      <Tabs.Screen
        name="log"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={[styles.recordBtn, { marginBottom: insets.bottom > 0 ? insets.bottom / 2 : 6 }]}>
              <PlusIcon size={24} color="#fff" strokeWidth={2.5} />
            </View>
          ),
        }}
      />
      {/* 랭킹 */}
      <Tabs.Screen
        name="ranking"
        options={{
          title: '랭킹',
          tabBarIcon: ({ focused }) => (
            <TabIconWrap focused={focused}>
              <TrophyIcon size={24} color={focused ? '#ffffff' : '#48484a'} strokeWidth={focused ? 2.2 : 1.8} />
            </TabIconWrap>
          ),
        }}
      />
      {/* 프로필 */}
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ focused }) => (
            <TabIconWrap focused={focused}>
              {focused
                ? <PersonFilledIcon size={24} color="#ffffff" />
                : <PersonIcon size={24} color="#48484a" />}
            </TabIconWrap>
          ),
        }}
      />
      <Tabs.Screen name="feed" options={{ href: null }} />
    </Tabs>
  );
}

const tabWrap = StyleSheet.create({
  container: { alignItems: 'center', gap: 3 },
  dot:       { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: '#4f8ef7' },
});

const styles = StyleSheet.create({
  recordBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#4f8ef7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f8ef7',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
