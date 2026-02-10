import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  BorderRadius,
} from '../../theme';
import usePlayerStore from '../../store/playerStore';
import { usePlayer } from '../../hooks';
import type { Track } from '../../types';

interface QueueScreenProps {
  onClose: () => void;
}

/** Single track row in the upcoming queue list. */
const QueueTrackRow = React.memo(
  ({
    track,
    queueIndex,
    onPress,
    onRemove,
  }: {
    track: Track;
    queueIndex: number;
    onPress: () => void;
    onRemove: () => void;
  }) => (
    <TouchableOpacity
      style={styles.trackRow}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <Image
        source={track.artwork}
        style={styles.trackArtwork}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={onRemove}
      >
        <Ionicons
          name="remove-circle-outline"
          size={22}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  ),
);

const QueueScreen: React.FC<QueueScreenProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const { playTrack, removeFromQueue } = usePlayer();

  const upcomingTracks = queue.slice(currentIndex + 1);

  const handleSkipTo = useCallback(
    async (track: Track, indexInUpcoming: number) => {
      const absoluteIndex = currentIndex + 1 + indexInUpcoming;
      await playTrack(queue, absoluteIndex);
    },
    [currentIndex, queue, playTrack],
  );

  const handleRemove = useCallback(
    async (indexInUpcoming: number) => {
      const absoluteIndex = currentIndex + 1 + indexInUpcoming;
      await removeFromQueue(absoluteIndex);
    },
    [currentIndex, removeFromQueue],
  );

  const renderUpcomingTrack = useCallback(
    ({ item, index }: ListRenderItemInfo<Track>) => (
      <QueueTrackRow
        track={item}
        queueIndex={index}
        onPress={() => handleSkipTo(item, index)}
        onRemove={() => handleRemove(index)}
      />
    ),
    [handleSkipTo, handleRemove],
  );

  const keyExtractor = useCallback(
    (item: Track, index: number) => `${item.id}-${index}`,
    [],
  );

  const ListHeader = useCallback(
    () => (
      <View>
        {/* Now Playing Section */}
        <Text style={styles.sectionLabel}>NOW PLAYING</Text>
        {currentTrack ? (
          <View style={styles.nowPlayingRow}>
            <Image
              source={currentTrack.artwork}
              style={styles.trackArtwork}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.trackInfo}>
              <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>Nothing is playing</Text>
        )}

        {/* Next in Queue Section Header */}
        {upcomingTracks.length > 0 && (
          <Text style={[styles.sectionLabel, styles.nextSectionLabel]}>
            NEXT IN QUEUE
          </Text>
        )}
      </View>
    ),
    [currentTrack, upcomingTracks.length],
  );

  const ListEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="musical-notes-outline"
          size={48}
          color={Colors.textMuted}
        />
        <Text style={styles.emptyTitle}>Your queue is empty</Text>
        <Text style={styles.emptySubtitle}>
          Add songs to your queue to see them here
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onClose}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Queue</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Queue List */}
      <FlatList
        data={upcomingTracks}
        renderItem={renderUpcomingTrack}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const ARTWORK_SIZE = 48;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  headerSpacer: {
    width: 32,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  nextSectionLabel: {
    marginTop: Spacing.xxxl,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  trackArtwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: BorderRadius.xs,
  },
  trackInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  trackTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  nowPlayingTitle: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  trackArtist: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  removeButton: {
    padding: Spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    paddingVertical: Spacing.md,
  },
});

export default React.memo(QueueScreen);
