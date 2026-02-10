import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  BorderRadius,
} from '../../theme';
import {
  DEMO_TRACKS,
  DEMO_PLAYLISTS,
  getPlaylistTracks,
} from '../../data/tracks';
import { SectionHeader, PlaylistCard, TrackRow } from '../../components/common';
import { usePlayer } from '../../hooks';
import usePlayerStore from '../../store/playerStore';
import type { Playlist, Track } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ---------------------------------------------------------------------------
// Quick-Play Card (2-column grid item)
// ---------------------------------------------------------------------------

interface QuickPlayCardProps {
  playlist: Playlist;
  onPress: () => void;
}

const QuickPlayCard: React.FC<QuickPlayCardProps> = React.memo(
  ({ playlist, onPress }) => (
    <TouchableOpacity
      style={styles.quickCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Image
        source={playlist.artwork}
        style={styles.quickCardArt}
        contentFit="cover"
        transition={200}
      />
      <Text style={styles.quickCardText} numberOfLines={2}>
        {playlist.name}
      </Text>
    </TouchableOpacity>
  ),
);

// ---------------------------------------------------------------------------
// Recently-Played Card (uses track data directly)
// ---------------------------------------------------------------------------

interface RecentTrackCardProps {
  track: Track;
  onPress: () => void;
  size: number;
}

const RecentTrackCard: React.FC<RecentTrackCardProps> = React.memo(
  ({ track, onPress, size }) => (
    <TouchableOpacity
      style={{ width: size, marginRight: Spacing.md }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Image
        source={track.artwork}
        style={{
          width: size,
          height: size,
          borderRadius: BorderRadius.xs,
          backgroundColor: Colors.surfaceLight,
        }}
        contentFit="cover"
        transition={200}
      />
      <Text
        style={styles.recentCardTitle}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {track.title}
      </Text>
      <Text
        style={styles.recentCardSubtitle}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {track.artist}
      </Text>
    </TouchableOpacity>
  ),
);

// ---------------------------------------------------------------------------
// Home Screen
// ---------------------------------------------------------------------------

const QUICK_PLAY_COUNT = 6;
const POPULAR_COUNT = 5;
const RECENT_FALLBACK_COUNT = 5;
const CARD_SIZE = 140;

const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playTrack } = usePlayer();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);

  // ---- Greeting ----
  const greeting = useMemo(() => getGreeting(), []);

  // ---- Quick-play playlists (first 6) ----
  const quickPlaylists = useMemo(
    () => DEMO_PLAYLISTS.slice(0, QUICK_PLAY_COUNT),
    [],
  );

  // ---- Recently played section data ----
  const recentData = useMemo(() => {
    if (recentlyPlayed.length > 0) return recentlyPlayed;
    return DEMO_TRACKS.slice(0, RECENT_FALLBACK_COUNT);
  }, [recentlyPlayed]);

  // ---- Popular tracks (first 5) ----
  const popularTracks = useMemo(
    () => DEMO_TRACKS.slice(0, POPULAR_COUNT),
    [],
  );

  // ---- Handlers ----
  const handleQuickPlay = useCallback(
    (playlist: Playlist) => {
      const tracks = getPlaylistTracks(playlist);
      if (tracks.length > 0) {
        playTrack(tracks, 0);
      }
    },
    [playTrack],
  );

  const handlePlaylistPlay = useCallback(
    (playlist: Playlist) => {
      const tracks = getPlaylistTracks(playlist);
      if (tracks.length > 0) {
        playTrack(tracks, 0);
      }
    },
    [playTrack],
  );

  const handleRecentTrackPlay = useCallback(
    (track: Track) => {
      const idx = DEMO_TRACKS.findIndex((t) => t.id === track.id);
      playTrack(DEMO_TRACKS, idx >= 0 ? idx : 0);
    },
    [playTrack],
  );

  const handlePopularTrackPlay = useCallback(
    (index: number) => {
      playTrack(DEMO_TRACKS, index);
    },
    [playTrack],
  );

  // ---- Render helpers ----
  const renderQuickGrid = () => {
    const rows: Playlist[][] = [];
    for (let i = 0; i < quickPlaylists.length; i += 2) {
      rows.push(quickPlaylists.slice(i, i + 2));
    }

    return (
      <View style={styles.quickGrid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.quickRow}>
            {row.map((pl) => (
              <QuickPlayCard
                key={pl.id}
                playlist={pl}
                onPress={() => handleQuickPlay(pl)}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Top gradient overlay ---- */}
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          style={[styles.gradient, { paddingTop: insets.top }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          {/* ---- Top bar ---- */}
          <View style={styles.topBar}>
            <Text style={styles.greeting}>{greeting}</Text>
            <View style={styles.topBarIcons}>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="notifications-outline"
                  size={24}
                  color={Colors.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="time-outline"
                  size={24}
                  color={Colors.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="settings-outline"
                  size={24}
                  color={Colors.textPrimary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* ---- Quick play grid ---- */}
          {renderQuickGrid()}
        </LinearGradient>

        {/* ---- Recently Played ---- */}
        <SectionHeader title="Recently played" />
        <FlatList
          data={recentData}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
          renderItem={({ item }) => (
            <RecentTrackCard
              track={item}
              onPress={() => handleRecentTrackPlay(item)}
              size={CARD_SIZE}
            />
          )}
        />

        {/* ---- Made For You ---- */}
        <SectionHeader title="Made for you" />
        <FlatList
          data={DEMO_PLAYLISTS}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
          renderItem={({ item }) => (
            <PlaylistCard
              playlist={item}
              onPress={() => handlePlaylistPlay(item)}
              size={CARD_SIZE}
            />
          )}
        />

        {/* ---- Popular Tracks ---- */}
        <SectionHeader title="Popular tracks" />
        {popularTracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            onPress={() => handlePopularTrackPlay(index)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default React.memo(HomeScreen);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },

  // ---- Gradient / Top area ----
  gradient: {
    paddingBottom: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  greeting: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  topBarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: Spacing.lg,
  },

  // ---- Quick-play grid ----
  quickGrid: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden',
    marginHorizontal: 4,
    height: 56,
  },
  quickCardArt: {
    width: 56,
    height: 56,
  },
  quickCardText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.sm,
  },

  // ---- Horizontal lists ----
  horizontalList: {
    paddingHorizontal: Spacing.lg,
  },

  // ---- Recent track card ----
  recentCardTitle: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  recentCardSubtitle: {
    fontSize: 11,
    fontWeight: FontWeight.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
