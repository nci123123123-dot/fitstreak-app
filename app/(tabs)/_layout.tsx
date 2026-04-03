import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HomeIcon, HomeFilledIcon, PersonIcon, PersonFilledIcon,
  PlusIcon, SearchIcon, TrophyIcon,
} from '../../src/components/Icons';

// 탭바 콘텐츠 영역 기본 높이 (아이콘 + 라벨)
const TAB_CONTENT_HEIGHT = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  // 시스템 내비게이션 바(제스처/버튼 모두)를 탭바 안에 흡수
  const tabBarHeight    = TAB_CONTENT_HEIGHT + insets.bottom;
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
          paddingTop: 8,
        },
        tabBarActiveTintColor:   '#ffffff',
        tabBarInactiveTintColor: '#48484a',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: 0.3,
          marginTop: 3,
        },
      }}
    >
      {/* 1 */}
      <Tabs.Screen
        name="home"
        options={{
          title: '피드',
          tabBarIcon: ({ focused }) =>
            focused
              ? <HomeFilledIcon size={24} color="#ffffff" />
              : <HomeIcon size={24} color="#48484a" />,
        }}
      />
      {/* 2 */}
      <Tabs.Screen
        name="search"
        options={{
          title: '검색',
          tabBarIcon: ({ focused }) => (
            <SearchIcon size={24} color={focused ? '#ffffff' : '#48484a'} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      {/* 3 — 정중앙 */}
      <Tabs.Screen
        name="log"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={[styles.recordBtn, { marginBottom: insets.bottom > 0 ? insets.bottom / 2 : 6 }]}>
              <PlusIcon size={22} color="#fff" strokeWidth={2.5} />
            </View>
          ),
        }}
      />
      {/* 4 */}
      <Tabs.Screen
        name="ranking"
        options={{
          title: '랭킹',
          tabBarIcon: ({ focused }) => (
            <TrophyIcon size={24} color={focused ? '#ffffff' : '#48484a'} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      {/* 5 */}
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ focused }) =>
            focused
              ? <PersonFilledIcon size={24} color="#ffffff" />
              : <PersonIcon size={24} color="#48484a" />,
        }}
      />
      <Tabs.Screen name="feed" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  recordBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4f8ef7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f8ef7',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
