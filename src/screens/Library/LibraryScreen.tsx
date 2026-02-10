import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  BorderRadius,
} from '../../theme';
import { TrackRow } from '../../components/common';
import { usePlayer } from '../../hooks';
import usePlayerStore from '../../store/playerStore';
import type { Track } from '../../types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionLabelProps {
  title: string;
}

const SectionLabel = React.memo<SectionLabelProps>(({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
));

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { playTrackWithRecommendations } = usePlayer();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);
  const likedSongs = usePlayerStore((s) => s.likedSongs);

  const handleTrackPress = useCallback(
    (track: Track) => {
      playTrackWithRecommendations(track);
    },
    [playTrackWithRecommendations],
  );

  // Build flat list data: Liked Songs banner → liked tracks → Recently Played header → recent tracks
  type ListItem =
    | { type: 'liked-banner' }
    | { type: 'section'; title: string }
    | { type: 'track'; data: Track; section: 'liked' | 'recent' };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];

    // Liked Songs banner card
    items.push({ type: 'liked-banner' as const });

    // Liked songs tracks
    for (const t of likedSongs) {
      items.push({ type: 'track' as const, data: t, section: 'liked' });
    }

    // Recently Played section
    if (recentlyPlayed.length > 0) {
      items.push({ type: 'section' as const, title: 'Recently Played' });
      for (const t of recentlyPlayed) {
        items.push({ type: 'track' as const, data: t, section: 'recent' });
      }
    }

    return items;
  }, [likedSongs, recentlyPlayed]);

  const keyExtractor = useCallback(
    (item: ListItem, index: number) => {
      if (item.type === 'liked-banner') return 'liked-banner';
      if (item.type === 'section') return `section-${item.title}`;
      return `${item.section}-${item.data.id}-${index}`;
    },
    [],
  );

  const renderItem: ListRenderItem<ListItem> = useCallback(
    ({ item }) => {
      if (item.type === 'liked-banner') {
        return (
          <View style={styles.likedBanner}>
            <LinearGradient
              colors={[Colors.primary, Colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.likedBannerGradient}
            >
              <View style={styles.likedBannerContent}>
                <View style={styles.likedBannerIcon}>
                  <Ionicons name="heart" size={28} color={Colors.white} />
                </View>
                <View style={styles.likedBannerTextContainer}>
                  <Text style={styles.likedBannerTitle}>Liked Songs</Text>
                  <Text style={styles.likedBannerCount}>
                    {likedSongs.length}{' '}
                    {likedSongs.length === 1 ? 'song' : 'songs'}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        );
      }

      if (item.type === 'section') {
        return <SectionLabel title={item.title} />;
      }

      return (
        <TrackRow
          track={item.data}
          onPress={() => handleTrackPress(item.data)}
          showArtwork
        />
      );
    },
    [handleTrackPress, likedSongs.length],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Library</Text>
      </View>

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
              Like songs and play music to see them here.
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

  // Liked Songs banner
  likedBanner: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  likedBannerGradient: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  likedBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  likedBannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likedBannerTextContainer: {
    marginLeft: Spacing.lg,
    flex: 1,
  },
  likedBannerTitle: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    letterSpacing: -0.3,
  },
  likedBannerCount: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },

  // List
  listContent: {
    paddingBottom: 130,
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
    paddingTop: 80,
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
    textAlign: 'center',
    paddingHorizontal: Spacing.xl * 2,
  },
});

export default React.memo(LibraryScreen);
