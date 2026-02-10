import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Modal,
} from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, Spacing, Layout } from '../theme';
import HomeScreen from '../screens/Home/HomeScreen';
import SearchScreen from '../screens/Search/SearchScreen';
import LibraryScreen from '../screens/Library/LibraryScreen';
import NowPlayingScreen from '../screens/NowPlaying/NowPlayingScreen';
import QueueScreen from '../screens/Queue/QueueScreen';
import LyricsSheet from '../screens/NowPlaying/LyricsSheet';
import MiniPlayer from '../components/player/MiniPlayer';
import usePlayerStore from '../store/playerStore';
import { useTrackProgress } from '../hooks';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Tab = createBottomTabNavigator();

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: 'transparent',
    notification: Colors.primary,
  },
};

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

function TabIcon({
  name,
  focused,
  size,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  size: number;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={focused ? Colors.textPrimary : Colors.textMuted}
    />
  );
}

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  // Keep TrackPlayer state synced to store globally
  useTrackProgress();

  // Player sheet state
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  // Animation values for the player sheet
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const context = useSharedValue(0);

  const TAB_BAR_HEIGHT = Layout.tabBarHeight + insets.bottom;
  const MINI_PLAYER_HEIGHT = Layout.miniPlayerHeight;
  const SNAP_TOP = 0;
  const SNAP_BOTTOM = SCREEN_HEIGHT;

  const expandPlayer = useCallback(() => {
    setIsPlayerExpanded(true);
    translateY.value = withSpring(SNAP_TOP, SPRING_CONFIG);
  }, [translateY]);

  const collapsePlayer = useCallback(() => {
    translateY.value = withSpring(SNAP_BOTTOM, SPRING_CONFIG, () => {
      runOnJS(setIsPlayerExpanded)(false);
    });
  }, [translateY]);

  const openQueue = useCallback(() => {
    setShowQueue(true);
  }, []);

  const closeQueue = useCallback(() => {
    setShowQueue(false);
  }, []);

  const openLyrics = useCallback(() => {
    setShowLyrics(true);
  }, []);

  const closeLyrics = useCallback(() => {
    setShowLyrics(false);
  }, []);

  // Gesture for dragging the player sheet
  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = translateY.value;
    })
    .onUpdate((event) => {
      const newValue = context.value + event.translationY;
      translateY.value = Math.max(SNAP_TOP, Math.min(newValue, SNAP_BOTTOM));
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const currentPos = translateY.value;
      const midPoint = SCREEN_HEIGHT * 0.4;

      // Fling detection
      if (velocity > 800) {
        translateY.value = withSpring(SNAP_BOTTOM, SPRING_CONFIG, () => {
          runOnJS(setIsPlayerExpanded)(false);
        });
        return;
      }
      if (velocity < -800) {
        translateY.value = withSpring(SNAP_TOP, SPRING_CONFIG);
        return;
      }

      // Position-based snap
      if (currentPos < midPoint) {
        translateY.value = withSpring(SNAP_TOP, SPRING_CONFIG);
      } else {
        translateY.value = withSpring(SNAP_BOTTOM, SPRING_CONFIG, () => {
          runOnJS(setIsPlayerExpanded)(false);
        });
      }
    });

  // Animated styles for the full player sheet
  const playerSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Animated style for mini player opacity (fade out as sheet comes up)
  const miniPlayerOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [SCREEN_HEIGHT * 0.5, SCREEN_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Animated style for tab bar (slide down as player expands)
  const tabBarOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [SCREEN_HEIGHT * 0.7, SCREEN_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const hasMiniPlayer = currentTrack !== null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <NavigationContainer theme={DarkTheme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: Colors.surface,
              borderTopWidth: 0,
              borderTopColor: Colors.glassBorder,
              height: TAB_BAR_HEIGHT,
              paddingBottom: insets.bottom,
              paddingTop: Spacing.xs,
              elevation: 0,
            },
            tabBarActiveTintColor: Colors.textPrimary,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '600',
              marginTop: 2,
            },
          }}
        >
          <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{
              tabBarIcon: ({ focused, size }) => (
                <TabIcon
                  name={focused ? 'home' : 'home-outline'}
                  focused={focused}
                  size={size}
                />
              ),
            }}
          />
          <Tab.Screen
            name="Search"
            component={SearchScreen}
            options={{
              tabBarIcon: ({ focused, size }) => (
                <TabIcon
                  name={focused ? 'search' : 'search-outline'}
                  focused={focused}
                  size={size}
                />
              ),
            }}
          />
          <Tab.Screen
            name="Your Library"
            component={LibraryScreen}
            options={{
              tabBarIcon: ({ focused, size }) => (
                <TabIcon
                  name={focused ? 'library' : 'library-outline'}
                  focused={focused}
                  size={size}
                />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>

      {/* Mini Player - above tab bar */}
      {hasMiniPlayer && (
        <Animated.View
          style={[
            styles.miniPlayerContainer,
            { bottom: TAB_BAR_HEIGHT },
            miniPlayerOpacity,
          ]}
        >
          <MiniPlayer onPress={expandPlayer} />
        </Animated.View>
      )}

      {/* Full Player Sheet - gesture driven */}
      {(isPlayerExpanded || hasMiniPlayer) && (
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.playerSheet,
              playerSheetStyle,
              !isPlayerExpanded && styles.playerSheetHidden,
            ]}
          >
            <View style={styles.dragHandle}>
              <View style={styles.dragHandleBar} />
            </View>
            <NowPlayingScreen
              onClose={collapsePlayer}
              onOpenQueue={openQueue}
              onOpenLyrics={openLyrics}
            />
          </Animated.View>
        </GestureDetector>
      )}

      {/* Queue Modal */}
      <Modal
        visible={showQueue}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeQueue}
      >
        <View style={styles.modalContainer}>
          <QueueScreen onClose={closeQueue} />
        </View>
      </Modal>

      {/* Lyrics Modal */}
      <Modal
        visible={showLyrics}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeLyrics}
      >
        <View style={styles.modalContainer}>
          <LyricsSheet onClose={closeLyrics} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  miniPlayerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  playerSheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: Colors.background,
    zIndex: 20,
  },
  playerSheetHidden: {
    display: 'none',
  },
  dragHandle: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  dragHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceHighlight,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
