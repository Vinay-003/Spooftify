import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
  type GestureResponderEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadows } from '../../theme';
import usePlayerStore from '../../store/playerStore';
import { usePlayer } from '../../hooks';

interface NowPlayingScreenProps {
  onClose: () => void;
  onOpenQueue: () => void;
  onOpenLyrics: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - Spacing.xxl * 2;
const PROGRESS_BAR_HEIGHT = 4;
const PROGRESS_HIT_SLOP = 12;
const PLAY_BUTTON_SIZE = 64;

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

  const handleSeek = useCallback(
    (event: GestureResponderEvent) => {
      if (duration <= 0) return;
      const { locationX } = event.nativeEvent;
      const barWidth = SCREEN_WIDTH - Spacing.xxl * 2;
      const clamped = Math.max(0, Math.min(locationX, barWidth));
      const seekPosition = (clamped / barWidth) * duration;
      seekTo(seekPosition);
    },
    [duration, seekTo],
  );

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
      colors={[Colors.surfaceLight, Colors.background]}
      locations={[0, 0.6]}
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
        <TouchableOpacity hitSlop={12}>
          <Ionicons name="heart-outline" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <Pressable
        onPress={handleSeek}
        style={styles.progressContainer}
        hitSlop={{ top: PROGRESS_HIT_SLOP, bottom: PROGRESS_HIT_SLOP }}
      >
        <View style={styles.progressBackground}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          <View
            style={[
              styles.progressThumb,
              { left: `${progress * 100}%` },
            ]}
          />
        </View>
      </Pressable>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(position)}</Text>
        <Text style={styles.timeText}>
          {duration > 0 ? `-${formatTime(duration - position)}` : '0:00'}
        </Text>
      </View>

      {/* Controls Row */}
      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={toggleShuffle} hitSlop={12}>
          <Ionicons
            name="shuffle"
            size={24}
            color={isShuffled ? Colors.primary : Colors.white}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToPrevious} hitSlop={8}>
          <Ionicons name="play-skip-back" size={32} color={Colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlayPause}
          style={styles.playButton}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={30}
            color={Colors.black}
            style={!isPlaying ? styles.playIconOffset : undefined}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToNext} hitSlop={8}>
          <Ionicons name="play-skip-forward" size={32} color={Colors.white} />
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleRepeatMode} hitSlop={12}>
          <View style={styles.repeatContainer}>
            <Ionicons
              name={repeatIconName}
              size={24}
              color={repeatMode !== 'off' ? Colors.primary : Colors.white}
            />
            {repeatMode === 'track' && <View style={styles.repeatDot} />}
          </View>
        </TouchableOpacity>
      </View>

      {/* Bottom Row */}
      <View style={[styles.bottomRow, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity hitSlop={12}>
          <Ionicons name="phone-portrait-outline" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity hitSlop={12}>
          <Ionicons name="share-outline" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onOpenQueue} hitSlop={12}>
          <Ionicons name="list" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
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
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Artwork ──────────────────────────────────────────
  artworkContainer: {
    alignItems: 'center',
    marginTop: Spacing.xxl,
    ...Shadows.large,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: BorderRadius.md,
  },
  placeholderArtwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: BorderRadius.md,
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
    fontSize: 20,
    fontWeight: FontWeight.bold,
    lineHeight: 26,
  },
  trackArtist: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.regular,
    marginTop: 2,
    lineHeight: 22,
  },

  // ── Progress ─────────────────────────────────────────
  progressContainer: {
    marginTop: Spacing.xxl,
    height: PROGRESS_BAR_HEIGHT + PROGRESS_HIT_SLOP * 2,
    justifyContent: 'center',
  },
  progressBackground: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: '#535353',
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'visible',
  },
  progressFill: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: Colors.white,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -(12 - PROGRESS_BAR_HEIGHT) / 2,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.white,
  },

  // ── Time Labels ──────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  timeText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
  },

  // ── Controls ─────────────────────────────────────────
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconOffset: {
    marginLeft: 3, // visually center the play triangle
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
    paddingHorizontal: Spacing.lg,
  },
});

export default React.memo(NowPlayingScreen);
