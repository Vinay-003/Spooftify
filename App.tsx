import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setupPlayer } from './src/services/trackPlayerService';
import usePlayerStore from './src/store/playerStore';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const loadRecentlyPlayed = usePlayerStore((s) => s.loadRecentlyPlayed);

  useEffect(() => {
    async function init() {
      try {
        await setupPlayer();
        loadRecentlyPlayed();
      } catch (error) {
        console.warn('Failed to setup player:', error);
      } finally {
        setIsReady(true);
      }
    }
    init();
  }, [loadRecentlyPlayed]);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
