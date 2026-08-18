import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppColors, AppFonts, AppSpacing, AppRadius } from '@/lib/theme';
import { BookOpen } from 'lucide-react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <BookOpen size={56} color={AppColors.textMuted} strokeWidth={1} />
        <Text style={styles.text}>This page doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to your library</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: AppColors.background,
    gap: AppSpacing.md,
  },
  text: {
    fontSize: 18,
    fontFamily: AppFonts.sans,
    color: AppColors.text,
  },
  link: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: AppColors.primary,
    borderRadius: AppRadius.md,
  },
  linkText: {
    fontFamily: AppFonts.sansMedium,
    fontSize: 14,
    color: AppColors.white,
  },
});
