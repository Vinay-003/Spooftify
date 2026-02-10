import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, Spacing, Layout, BorderRadius, FontWeight, Shadows } from '../theme';
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

const TAB_ICON_MAP: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Search: { active: 'search', inactive: 'search-outline' },
  'Your Library': { active: 'library', inactive: 'library-outline' },
};

// ── Floating Tab Bar ─────────────────────────────────────────────────────────

interface FloatingTabBarProps extends BottomTabBarProps {
  hasMiniPlayer: boolean;
  onMiniPlayerPress: () => void;
  translateY: SharedValue<number>;
}

function FloatingTabBar({
  state,
  descriptors,
  navigation,
  hasMiniPlayer,
  onMiniPlayerPress,
  translateY,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  // Animate the whole floating bar: fade + slide down as player sheet expands
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [SCREEN_HEIGHT * 0.6, SCREEN_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const ty = interpolate(
      translateY.value,
      [SCREEN_HEIGHT * 0.6, SCREEN_HEIGHT],
      [40, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY: ty }] };
  });

  return (
    <Animated.View
      style={[
        floatingStyles.wrapper,
        { bottom: Math.max(insets.bottom, Spacing.sm) + 6 },
        animatedStyle,
      ]}
    >
      <BlurView intensity={100} tint="dark" style={floatingStyles.container}>
        {/* MiniPlayer section — only when a track is active */}
        {hasMiniPlayer && (
          <MiniPlayer onPress={onMiniPlayerPress} />
        )}

        {/* Separator line between mini player and tabs */}
        {hasMiniPlayer && <View style={floatingStyles.separator} />}

        {/* Tab icons row */}
        <View style={floatingStyles.tabRow}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;
            const icons = TAB_ICON_MAP[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
            const iconName = isFocused ? icons.active : icons.inactive;

            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : typeof options.title === 'string'
                  ? options.title
                  : route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onPress={onPress}
                onLongPress={onLongPress}
                style={floatingStyles.tabItem}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={iconName}
                  size={18}
                  color={isFocused ? Colors.textPrimary : Colors.textMuted}
                />
                <Text
                  style={[
                    floatingStyles.tabLabel,
                    { color: isFocused ? Colors.textPrimary : Colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </Animated.View>
  );
}

const floatingStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
  },
  container: {
    backgroundColor: 'rgba(15, 25, 65, 0.9)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    ...Shadows.medium,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
});

// ── Main Navigator ───────────────────────────────────────────────────────────

export default function AppNavigator() {
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

  const hasMiniPlayer = currentTrack !== null;

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => (
      <FloatingTabBar
        {...props}
        hasMiniPlayer={hasMiniPlayer}
        onMiniPlayerPress={expandPlayer}
        translateY={translateY}
      />
    ),
    [hasMiniPlayer, expandPlayer, translateY],
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <NavigationContainer theme={DarkTheme}>
        <Tab.Navigator
          tabBar={renderTabBar}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Search" component={SearchScreen} />
          <Tab.Screen name="Your Library" component={LibraryScreen} />
        </Tab.Navigator>
      </NavigationContainer>

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
