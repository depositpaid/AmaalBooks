import { Tabs } from 'expo-router';
import { StyleSheet, Platform, View, Text } from 'react-native';
import { Library, Bookmark, Mic, Search, Settings } from 'lucide-react-native';
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
          title: 'Library',
          tabBarIcon: ({ size, color }) => (
            <Library size={size} color={color} strokeWidth={2} />
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
          title: 'Bookmarks',
          tabBarIcon: ({ size, color }) => (
            <Bookmark size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Edit',
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
