import React, { useCallback, useMemo } from 'react';
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
  Shadows,
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
    onPress,
    onRemove,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
  }: {
    track: Track;
    onPress: () => void;
    onRemove: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
  }) => (
    <View style={styles.trackRow}>
      {/* Reorder buttons */}
      {(onMoveUp || onMoveDown) && (
        <View style={styles.reorderButtons}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={!canMoveUp}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            style={styles.reorderBtn}
          >
            <Ionicons
              name="chevron-up"
              size={16}
              color={canMoveUp ? Colors.textSecondary : Colors.textDisabled}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={!canMoveDown}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            style={styles.reorderBtn}
          >
            <Ionicons
              name="chevron-down"
              size={16}
              color={canMoveDown ? Colors.textSecondary : Colors.textDisabled}
            />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.trackRowContent}
        activeOpacity={0.6}
        onPress={onPress}
      >
        <View style={styles.trackArtworkContainer}>
          <Image
            source={typeof track.artwork === 'string' ? { uri: track.artwork } : track.artwork}
            style={styles.trackArtwork}
            contentFit="cover"
            recyclingKey={track.id}
          />
        </View>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.removeButton}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={onRemove}
      >
        <Ionicons
          name="remove-circle-outline"
          size={22}
          color={Colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  ),
);

const QueueScreen: React.FC<QueueScreenProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const userQueueCount = usePlayerStore((s) => s.userQueueCount);
  const { playTrack, removeFromQueue, reorderQueue } = usePlayer();

  // Memoize derived arrays to avoid re-creating on every progress update.
  // Only recompute when queue contents, currentIndex, or userQueueCount change.
  const userQueueTracks = useMemo(
    () => queue.slice(currentIndex + 1, currentIndex + 1 + userQueueCount),
    [queue, currentIndex, userQueueCount],
  );
  const upNextTracks = useMemo(
    () => queue.slice(currentIndex + 1 + userQueueCount),
    [queue, currentIndex, userQueueCount],
  );

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

  const handleMoveUp = useCallback(
    async (indexInUserQueue: number) => {
      if (indexInUserQueue <= 0) return;
      const fromAbsolute = currentIndex + 1 + indexInUserQueue;
      const toAbsolute = currentIndex + 1 + (indexInUserQueue - 1);
      await reorderQueue(fromAbsolute, toAbsolute);
    },
    [currentIndex, reorderQueue],
  );

  const handleMoveDown = useCallback(
    async (indexInUserQueue: number) => {
      if (indexInUserQueue >= userQueueCount - 1) return;
      const fromAbsolute = currentIndex + 1 + indexInUserQueue;
      const toAbsolute = currentIndex + 1 + (indexInUserQueue + 1);
      await reorderQueue(fromAbsolute, toAbsolute);
    },
    [currentIndex, userQueueCount, reorderQueue],
  );

  // Reorder within the Up Next (recommendations) section
  const handleUpNextMoveUp = useCallback(
    async (indexInUpNext: number) => {
      if (indexInUpNext <= 0) return;
      const fromAbsolute = currentIndex + 1 + userQueueCount + indexInUpNext;
      const toAbsolute = currentIndex + 1 + userQueueCount + (indexInUpNext - 1);
      await reorderQueue(fromAbsolute, toAbsolute);
    },
    [currentIndex, userQueueCount, reorderQueue],
  );

  const handleUpNextMoveDown = useCallback(
    async (indexInUpNext: number) => {
      const upNextLength = queue.length - (currentIndex + 1 + userQueueCount);
      if (indexInUpNext >= upNextLength - 1) return;
      const fromAbsolute = currentIndex + 1 + userQueueCount + indexInUpNext;
      const toAbsolute = currentIndex + 1 + userQueueCount + (indexInUpNext + 1);
      await reorderQueue(fromAbsolute, toAbsolute);
    },
    [currentIndex, userQueueCount, queue.length, reorderQueue],
  );

  const renderUpcomingTrack = useCallback(
    ({ item, index }: ListRenderItemInfo<Track>) => {
      // Offset index by userQueueCount since Up Next tracks come after user queue
      const upcomingIndex = userQueueCount + index;
      const upNextLength = queue.length - (currentIndex + 1 + userQueueCount);
      return (
        <QueueTrackRow
          track={item}
          onPress={() => handleSkipTo(item, upcomingIndex)}
          onRemove={() => handleRemove(upcomingIndex)}
          onMoveUp={() => handleUpNextMoveUp(index)}
          onMoveDown={() => handleUpNextMoveDown(index)}
          canMoveUp={index > 0}
          canMoveDown={index < upNextLength - 1}
        />
      );
    },
    [handleSkipTo, handleRemove, handleUpNextMoveUp, handleUpNextMoveDown, userQueueCount, queue.length, currentIndex],
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
            <View style={styles.trackArtworkContainer}>
              <Image
                source={typeof currentTrack.artwork === 'string' ? { uri: currentTrack.artwork } : currentTrack.artwork}
                style={styles.trackArtwork}
                contentFit="cover"
                recyclingKey={currentTrack.id}
              />
            </View>
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

        {/* My Queue Section (user-added tracks) with reorder controls */}
        {userQueueTracks.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, styles.nextSectionLabel]}>
              MY QUEUE
            </Text>
            {userQueueTracks.map((track, index) => (
              <QueueTrackRow
                key={`user-${track.id}-${index}`}
                track={track}
                onPress={() => handleSkipTo(track, index)}
                onRemove={() => handleRemove(index)}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
                canMoveUp={index > 0}
                canMoveDown={index < userQueueTracks.length - 1}
              />
            ))}
          </>
        )}

        {/* Up Next Section Header (recommendations) */}
        {upNextTracks.length > 0 && (
          <Text style={[styles.sectionLabel, styles.nextSectionLabel]}>
            UP NEXT
          </Text>
        )}
      </View>
    ),
    [currentTrack, userQueueTracks, upNextTracks.length, handleSkipTo, handleRemove, handleMoveUp, handleMoveDown],
  );

  const ListEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons
            name="musical-notes-outline"
            size={36}
            color={Colors.textMuted}
          />
        </View>
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

      {/* Queue List — Up Next (recommendations) section */}
      <FlatList
        data={upNextTracks}
        renderItem={renderUpcomingTrack}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={userQueueTracks.length === 0 ? ListEmpty : null}
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
    borderBottomColor: Colors.glassBorder,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  headerSpacer: {
    width: 36,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.5,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  nextSectionLabel: {
    marginTop: Spacing.xxxl,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.md,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  trackRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reorderButtons: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
    width: 24,
  },
  reorderBtn: {
    paddingVertical: 2,
  },
  trackArtworkContainer: {
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  trackArtwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: BorderRadius.sm,
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
    fontWeight: FontWeight.semibold,
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
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
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
