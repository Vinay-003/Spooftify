import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../../theme';
import { Track } from '../../types';
import usePlayerStore from '../../store/playerStore';

interface TrackRowProps {
  track: Track;
  index?: number;
  onPress: () => void;
  onLongPress?: () => void;
  showArtwork?: boolean;
  showIndex?: boolean;
}

const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  onPress,
  onLongPress,
  showArtwork = true,
  showIndex = false,
}) => {
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = currentTrackId === track.id;

  const handleMenuPress = useCallback(() => {
    // Menu action placeholder
  }, []);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
    >
      {showIndex && index != null ? (
        <View style={styles.indexContainer}>
          <Text
            style={[
              styles.indexText,
              isPlaying && styles.activeText,
            ]}
          >
            {index}
          </Text>
        </View>
      ) : showArtwork ? (
        <View style={styles.artworkContainer}>
          <Image
            source={track.artwork}
            style={styles.artwork}
            contentFit="cover"
            transition={200}
          />
        </View>
      ) : null}

      <View style={styles.info}>
        <Text
          style={[styles.title, isPlaying && styles.activeText]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.menuButton}
        onPress={handleMenuPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={18}
          color={Colors.textMuted}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

export default React.memo(TrackRow);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: Spacing.lg,
  },
  indexContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    color: Colors.textSecondary,
  },
  artworkContainer: {
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  artist: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    color: Colors.textSecondary,
  },
  activeText: {
    color: Colors.primary,
  },
  menuButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
});
