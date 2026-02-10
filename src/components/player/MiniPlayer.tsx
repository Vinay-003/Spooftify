import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Layout } from '../../theme';
import usePlayerStore from '../../store/playerStore';
import { usePlayer } from '../../hooks';

interface MiniPlayerProps {
  onPress: () => void;
}

const MINI_PLAYER_HEIGHT = Layout.miniPlayerHeight;
const ART_SIZE = 40;
const PROGRESS_HEIGHT = 2;

const MiniPlayer: React.FC<MiniPlayerProps> = ({ onPress }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);

  const { togglePlayPause } = usePlayer();

  // Don't render when there's no track
  if (!currentTrack) return null;

  const isPlaying = playbackState === 'playing';
  const progress = duration > 0 ? position / duration : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={styles.container}
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
            size={18}
            color={Colors.white}
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
            size={22}
            color={Colors.white}
          />
        </TouchableOpacity>
      </View>

      {/* Thin progress bar at bottom edge */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${progress * 100}%` },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: Colors.surfaceLight,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  artwork: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: BorderRadius.xs,
  },
  trackInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
    marginRight: Spacing.sm,
    justifyContent: 'center',
  },
  title: {
    color: Colors.white,
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
    padding: Spacing.sm,
  },
  progressBarContainer: {
    height: PROGRESS_HEIGHT,
    backgroundColor: Colors.transparent,
    width: '100%',
  },
  progressBarFill: {
    height: PROGRESS_HEIGHT,
    backgroundColor: Colors.primary,
  },
});

export default React.memo(MiniPlayer);
