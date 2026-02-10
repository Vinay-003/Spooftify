import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ListRenderItem,
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
import { DEMO_PLAYLISTS, DEMO_TRACKS, getPlaylistTracks } from '../../data/tracks';
import usePlayerStore from '../../store/playerStore';
import { usePlayer } from '../../hooks';
import type { Playlist, Track } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterChip = 'Playlists' | 'Recently Played' | 'Artists';

const FILTER_CHIPS: FilterChip[] = ['Playlists', 'Recently Played', 'Artists'];

type SortOption = 'Recents' | 'Alphabetical' | 'Creator';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PlaylistRowProps {
  playlist: Playlist;
  onPress: (playlist: Playlist) => void;
}

const PlaylistRow = React.memo<PlaylistRowProps>(({ playlist, onPress }) => {
  const trackCount = playlist.tracks.length;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.6}
      onPress={() => onPress(playlist)}
    >
      <View style={styles.rowArtworkContainer}>
        <Image
          source={playlist.artwork}
          style={styles.rowArtwork}
          contentFit="cover"
          transition={200}
        />
      </View>
      <View style={styles.rowTextContainer}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          Playlist &middot; {trackCount} {trackCount === 1 ? 'song' : 'songs'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

interface TrackRowProps {
  track: Track;
  onPress: (track: Track) => void;
}

const TrackRow = React.memo<TrackRowProps>(({ track, onPress }) => (
  <TouchableOpacity
    style={styles.row}
    activeOpacity={0.6}
    onPress={() => onPress(track)}
  >
    <View style={styles.rowArtworkContainer}>
      <Image
        source={track.artwork}
        style={styles.rowArtwork}
        contentFit="cover"
        transition={200}
      />
    </View>
    <View style={styles.rowTextContainer}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {track.title}
      </Text>
      <Text style={styles.rowSubtitle} numberOfLines={1}>
        {track.artist} &middot; {track.album}
      </Text>
    </View>
  </TouchableOpacity>
));

interface SectionHeaderProps {
  title: string;
}

const SectionHeader = React.memo<SectionHeaderProps>(({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
));

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { playTrack } = usePlayer();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);

  const [activeFilter, setActiveFilter] = useState<FilterChip | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('Recents');

  const cycleSortOption = useCallback(() => {
    setSortOption((prev) => {
      if (prev === 'Recents') return 'Alphabetical';
      if (prev === 'Alphabetical') return 'Creator';
      return 'Recents';
    });
  }, []);

  const sortedPlaylists = useMemo(() => {
    const list = [...DEMO_PLAYLISTS];
    switch (sortOption) {
      case 'Alphabetical':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'Creator':
        return list.sort((a, b) =>
          (a.description ?? '').localeCompare(b.description ?? ''),
        );
      case 'Recents':
      default:
        return list;
    }
  }, [sortOption]);

  const handlePlaylistPress = useCallback(
    (playlist: Playlist) => {
      const tracks = getPlaylistTracks(playlist);
      if (tracks.length > 0) {
        playTrack(tracks, 0);
      }
    },
    [playTrack],
  );

  const handleTrackPress = useCallback(
    (track: Track) => {
      const idx = DEMO_TRACKS.findIndex((t) => t.id === track.id);
      playTrack(DEMO_TRACKS, idx >= 0 ? idx : 0);
    },
    [playTrack],
  );

  const handleFilterPress = useCallback((chip: FilterChip) => {
    setActiveFilter((prev) => (prev === chip ? null : chip));
  }, []);

  type ListItem =
    | { type: 'playlist'; data: Playlist }
    | { type: 'track'; data: Track }
    | { type: 'section'; title: string };

  const listData: ListItem[] = useMemo(() => {
    if (activeFilter === 'Playlists') {
      return sortedPlaylists.map((p) => ({ type: 'playlist' as const, data: p }));
    }

    if (activeFilter === 'Recently Played') {
      return recentlyPlayed.map((t) => ({ type: 'track' as const, data: t }));
    }

    if (activeFilter === 'Artists') {
      const seen = new Set<string>();
      const items: ListItem[] = [];
      for (const t of DEMO_TRACKS) {
        if (!seen.has(t.artist)) {
          seen.add(t.artist);
          items.push({ type: 'track' as const, data: t });
        }
      }
      return items;
    }

    const items: ListItem[] = [];
    items.push({ type: 'section' as const, title: 'Playlists' });
    for (const p of sortedPlaylists) {
      items.push({ type: 'playlist' as const, data: p });
    }
    if (recentlyPlayed.length > 0) {
      items.push({ type: 'section' as const, title: 'Recently Played' });
      for (const t of recentlyPlayed) {
        items.push({ type: 'track' as const, data: t });
      }
    }
    return items;
  }, [activeFilter, sortedPlaylists, recentlyPlayed]);

  const keyExtractor = useCallback(
    (item: ListItem, index: number) =>
      item.type === 'section'
        ? `section-${item.title}`
        : item.type === 'playlist'
          ? `pl-${item.data.id}`
          : `tr-${(item.data as Track).id}-${index}`,
    [],
  );

  const renderItem: ListRenderItem<ListItem> = useCallback(
    ({ item }) => {
      if (item.type === 'section') {
        return <SectionHeader title={item.title} />;
      }
      if (item.type === 'playlist') {
        return (
          <PlaylistRow
            playlist={item.data as Playlist}
            onPress={handlePlaylistPress}
          />
        );
      }
      return (
        <TrackRow track={item.data as Track} onPress={handleTrackPress} />
      );
    },
    [handlePlaylistPress, handleTrackPress],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Library</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons
              name="search-outline"
              size={22}
              color={Colors.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons
              name="add"
              size={26}
              color={Colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContainer}
        style={styles.chipScroll}
      >
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilter === chip;
          return (
            <TouchableOpacity
              key={chip}
              style={[styles.chip, isActive && styles.chipActive]}
              activeOpacity={0.7}
              onPress={() => handleFilterPress(chip)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort bar */}
      <TouchableOpacity
        style={styles.sortBar}
        activeOpacity={0.7}
        onPress={cycleSortOption}
      >
        <Ionicons
          name="swap-vertical-outline"
          size={16}
          color={Colors.textSecondary}
        />
        <Text style={styles.sortText}>{sortOption}</Text>
      </TouchableOpacity>

      {/* Library list */}
      <FlatList
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons
                name="library-outline"
                size={36}
                color={Colors.textMuted}
              />
            </View>
            <Text style={styles.emptyText}>
              {activeFilter === 'Recently Played'
                ? 'No recently played tracks yet.'
                : 'Nothing here yet.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    letterSpacing: -0.5,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },

  // Filter chips
  chipScroll: {
    flexGrow: 0,
  },
  chipContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  chipTextActive: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },

  // Sort bar
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  sortText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // List
  listContent: {
    paddingBottom: 130,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    height: 72,
  },
  rowArtworkContainer: {
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  rowArtwork: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
  },
  rowTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  rowTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  rowSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  // Section headers
  sectionHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  sectionHeaderText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    letterSpacing: -0.3,
  },

  // Empty state
  emptyContainer: {
    paddingTop: Spacing.huge,
    alignItems: 'center',
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
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
});

export default React.memo(LibraryScreen);
