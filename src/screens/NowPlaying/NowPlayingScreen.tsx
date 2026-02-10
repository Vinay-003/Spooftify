import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadows } from '../../theme';
import usePlayerStore from '../../store/playerStore';
import { usePlayer } from '../../hooks';

interface NowPlayingScreenProps {
  onClose: () => void;
  onOpenQueue: () => void;
  onOpenLyrics: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - Spacing.xxxl * 2;
const PROGRESS_BAR_HEIGHT = 4;
const PLAY_BUTTON_SIZE = 68;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const NowPlayingScreen: React.FC<NowPlayingScreenProps> = ({
  onClose,
  onOpenQueue,
  onOpenLyrics,
}) => {
  const insets = useSafeAreaInsets();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isShuffled = usePlayerStore((s) => s.isShuffled);

  const {
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    toggleRepeatMode,
    toggleShuffle,
    seekTo,
  } = usePlayer();

  const isPlaying = playbackState === 'playing';
  const progress = duration > 0 ? position / duration : 0;

  // ── Seek slider state ──
  const SLIDER_WIDTH = SCREEN_WIDTH - Spacing.xxxl * 2;
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekDisplayPosition, setSeekDisplayPosition] = useState(0);
  const seekProgress = useSharedValue(0);

  const commitSeek = useCallback(
    (fraction: number) => {
      if (duration <= 0) return;
      const pos = fraction * duration;
      seekTo(pos);
      setIsSeeking(false);
    },
    [duration, seekTo],
  );

  const updateSeekDisplay = useCallback(
    (fraction: number) => {
      setSeekDisplayPosition(fraction * duration);
    },
    [duration],
  );

  const tapGesture = Gesture.Tap().onEnd((event) => {
    const fraction = Math.max(0, Math.min(event.x / SLIDER_WIDTH, 1));
    seekProgress.value = fraction;
    runOnJS(commitSeek)(fraction);
  });

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      const fraction = Math.max(0, Math.min(event.x / SLIDER_WIDTH, 1));
      seekProgress.value = fraction;
      runOnJS(setIsSeeking)(true);
      runOnJS(updateSeekDisplay)(fraction);
    })
    .onUpdate((event) => {
      const fraction = Math.max(0, Math.min(event.x / SLIDER_WIDTH, 1));
      seekProgress.value = fraction;
      runOnJS(updateSeekDisplay)(fraction);
    })
    .onEnd(() => {
      runOnJS(commitSeek)(seekProgress.value);
    });

  const seekGesture = Gesture.Race(panGesture, tapGesture);

  const seekFillStyle = useAnimatedStyle(() => ({
    width: `${(isSeeking ? seekProgress.value : progress) * 100}%`,
  }));

  const seekThumbStyle = useAnimatedStyle(() => ({
    left: `${(isSeeking ? seekProgress.value : progress) * 100}%`,
  }));

  const displayPosition = isSeeking ? seekDisplayPosition : position;
  const displayRemaining = duration > 0 ? duration - displayPosition : 0;

  // Placeholder state when no track is playing
  if (!currentTrack) {
    return (
      <LinearGradient
        colors={[Colors.surfaceLight, Colors.background]}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.topBarButton}>
            <Ionicons name="chevron-down" size={28} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.topBarCenter}>
            <Text style={styles.topBarLabel}>Not Playing</Text>
          </View>
          <View style={styles.topBarButton} />
        </View>

        <View style={styles.placeholderArtwork}>
          <Ionicons name="musical-notes" size={80} color={Colors.textMuted} />
        </View>

        <View style={styles.trackInfoSection}>
          <View style={styles.trackInfoLeft}>
            <Text style={styles.trackTitle}>No track selected</Text>
            <Text style={styles.trackArtist}>Choose something to play</Text>
          </View>
        </View>
      </LinearGradient>
    );
  }

  const repeatIconName: keyof typeof Ionicons.glyphMap =
    repeatMode === 'track' ? 'repeat' : 'repeat';

  return (
    <LinearGradient
      colors={[Colors.gradientStart, Colors.surface, Colors.background]}
      locations={[0, 0.5, 1]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.topBarButton}>
          <Ionicons name="chevron-down" size={28} color={Colors.white} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onOpenLyrics} style={styles.topBarCenter}>
          <Text style={styles.topBarLabel} numberOfLines={1}>
            {currentTrack.album || 'Now Playing'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={12} style={styles.topBarButton}>
          <Ionicons name="ellipsis-horizontal" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Album Artwork */}
      <View style={styles.artworkContainer}>
        <View style={styles.artworkGlow} />
        <Image
          source={currentTrack.artwork}
          style={styles.artwork}
          contentFit="cover"
          transition={300}
        />
      </View>

      {/* Track Info */}
      <View style={styles.trackInfoSection}>
        <View style={styles.trackInfoLeft}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
        </View>
        <TouchableOpacity hitSlop={12} style={styles.heartButton}>
          <Ionicons name="heart-outline" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar — draggable */}
      <GestureDetector gesture={seekGesture}>
        <Animated.View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <Animated.View style={[styles.progressFillContainer, seekFillStyle]}>
              <LinearGradient
                colors={['#4F8EF7', Colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.progressFill}
              />
            </Animated.View>
            <Animated.View
              style={[styles.progressThumb, seekThumbStyle]}
            />
          </View>
        </Animated.View>
      </GestureDetector>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
        <Text style={styles.timeText}>
          {duration > 0 ? `-${formatTime(displayRemaining)}` : '0:00'}
        </Text>
      </View>

      {/* Controls Row */}
      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={toggleShuffle} hitSlop={12}>
          <Ionicons
            name="shuffle"
            size={24}
            color={isShuffled ? Colors.primary : Colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToPrevious} hitSlop={8} style={styles.skipButton}>
          <Ionicons name="play-skip-back" size={28} color={Colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlayPause}
          style={styles.playButton}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={30}
            color={Colors.background}
            style={!isPlaying ? styles.playIconOffset : undefined}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToNext} hitSlop={8} style={styles.skipButton}>
          <Ionicons name="play-skip-forward" size={28} color={Colors.white} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleRepeatMode} hitSlop={12}>
          <View style={styles.repeatContainer}>
            <Ionicons
              name={repeatIconName}
              size={24}
              color={repeatMode !== 'off' ? Colors.primary : Colors.textSecondary}
            />
            {repeatMode === 'track' && <View style={styles.repeatDot} />}
          </View>
        </TouchableOpacity>
      </View>

      {/* Bottom Row */}
      <View style={[styles.bottomRow, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity hitSlop={12} style={styles.bottomButton}>
          <Ionicons name="phone-portrait-outline" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity hitSlop={12} style={styles.bottomButton}>
          <Ionicons name="share-outline" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onOpenQueue} hitSlop={12} style={styles.bottomButton}>
          <Ionicons name="list" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xxxl,
  },

  // ── Top Bar ──────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    marginTop: Spacing.sm,
  },
  topBarButton: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Spacing.sm,
  },
  topBarLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Artwork ──────────────────────────────────────────
  artworkContainer: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  artworkGlow: {
    position: 'absolute',
    width: ARTWORK_SIZE * 0.85,
    height: ARTWORK_SIZE * 0.85,
    borderRadius: ARTWORK_SIZE * 0.425,
    backgroundColor: Colors.secondary,
    opacity: 0.08,
    top: ARTWORK_SIZE * 0.1,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: BorderRadius.lg,
    ...Shadows.large,
  },
  placeholderArtwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceElevated,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
  },

  // ── Track Info ───────────────────────────────────────
  trackInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xxxl,
  },
  trackInfoLeft: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  trackTitle: {
    color: Colors.white,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  trackArtist: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.regular,
    marginTop: 4,
    lineHeight: 22,
  },
  heartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Progress ─────────────────────────────────────────
  progressContainer: {
    marginTop: Spacing.xxl,
    height: 28,
    justifyContent: 'center',
  },
  progressBackground: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'visible',
  },
  progressFillContainer: {
    height: PROGRESS_BAR_HEIGHT,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
  },
  progressThumb: {
    position: 'absolute',
    top: -(12 - PROGRESS_BAR_HEIGHT) / 2,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4F8EF7',
    ...Shadows.small,
  },

  // ── Time Labels ──────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  timeText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },

  // ── Controls ─────────────────────────────────────────
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xxl,
  },
  skipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.medium,
  },
  playIconOffset: {
    marginLeft: 3,
  },
  repeatContainer: {
    alignItems: 'center',
  },
  repeatDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 2,
  },

  // ── Bottom Row ───────────────────────────────────────
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingHorizontal: Spacing.xxl,
  },
  bottomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(NowPlayingScreen);
