import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, FontWeight, Spacing, BorderRadius, Layout } from '../../theme';
import usePlayerStore from '../../store/playerStore';
import { usePlayer } from '../../hooks';

interface MiniPlayerProps {
  onPress: () => void;
  onDismiss?: () => void;
}

const MINI_PLAYER_HEIGHT = Layout.miniPlayerHeight;
const ART_SIZE = 40;
const PROGRESS_HEIGHT = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DISMISS_THRESHOLD = SCREEN_WIDTH * 0.35;

const MiniPlayer: React.FC<MiniPlayerProps> = ({ onPress, onDismiss }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);

  const { togglePlayPause, dismissPlayer } = usePlayer();

  const translateX = useSharedValue(0);

  const handleDismiss = () => {
    dismissPlayer();
    onDismiss?.();
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX(15)
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Only allow swiping right
      translateX.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      if (event.translationX > DISMISS_THRESHOLD || event.velocityX > 600) {
        // Dismiss: slide out to the right
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
          runOnJS(handleDismiss)();
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: 1 - translateX.value / SCREEN_WIDTH,
  }));

  if (!currentTrack) return null;

  const isPlaying = playbackState === 'playing';
  const progress = duration > 0 ? position / duration : 0;

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.container, swipeStyle]}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={onPress}
          style={styles.touchable}
        >
          {/* Main content row */}
          <View style={styles.content}>
            {/* Album art */}
            <Image
              source={currentTrack.artwork}
              style={styles.artwork}
              contentFit="cover"
              transition={200}
            />

            {/* Track info */}
            <View style={styles.trackInfo}>
              <Text style={styles.title} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            </View>

            {/* Right controls */}
            <TouchableOpacity hitSlop={12} style={styles.iconButton}>
              <Ionicons
                name="phone-portrait-outline"
                size={16}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                togglePlayPause();
              }}
              hitSlop={12}
              style={styles.playPauseButton}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color={Colors.white}
              />
            </TouchableOpacity>
          </View>

          {/* Gradient progress bar at bottom edge */}
          <View style={styles.progressBarContainer}>
            <LinearGradient
              colors={['#4F8EF7', Colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.progressBarFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    height: MINI_PLAYER_HEIGHT,
    overflow: 'hidden',
  },
  touchable: {
    flex: 1,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  artwork: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: BorderRadius.sm,
  },
  trackInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
    justifyContent: 'center',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    lineHeight: 17,
  },
  artist: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: FontWeight.regular,
    lineHeight: 15,
    marginTop: 1,
  },
  iconButton: {
    padding: Spacing.sm,
  },
  playPauseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarContainer: {
    height: PROGRESS_HEIGHT,
    backgroundColor: Colors.transparent,
    width: '100%',
  },
  progressBarFill: {
    height: PROGRESS_HEIGHT,
  },
});

export default React.memo(MiniPlayer);
