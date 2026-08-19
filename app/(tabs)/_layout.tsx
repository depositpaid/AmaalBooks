import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { House, Search, Settings, Star } from 'lucide-react-native';
import { AppColors, AppFonts } from '@/lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: AppColors.black[800],
          borderTopColor: AppColors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 60 : 88,
          paddingBottom: Platform.OS === 'web' ? 8 : 28,
          paddingTop: 10,
          paddingHorizontal: 16,
        },
        tabBarActiveTintColor: AppColors.primary,
        tabBarInactiveTintColor: AppColors.textMuted,
        tabBarLabelStyle: {
          fontFamily: AppFonts.sansMedium,
          fontSize: 11,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => (
            <House size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ size, color }) => (
            <Search size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ size, color }) => (
            <Star size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
