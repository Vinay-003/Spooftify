import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
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
  Shadows,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
// Quick-Play Card (glassmorphism 2-column grid)
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
// Featured Card (hero-style horizontal card)
// ---------------------------------------------------------------------------

interface FeaturedCardProps {
  playlist: Playlist;
  onPress: () => void;
}

const FeaturedCard: React.FC<FeaturedCardProps> = React.memo(
  ({ playlist, onPress }) => (
    <TouchableOpacity
      style={styles.featuredCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Image
        source={playlist.artwork}
        style={styles.featuredCardBg}
        contentFit="cover"
        transition={300}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
        style={styles.featuredCardOverlay}
      >
        <Text style={styles.featuredCardTitle} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.featuredCardDesc} numberOfLines={1}>
          {playlist.description}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  ),
);

// ---------------------------------------------------------------------------
// Recently-Played Card
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
      <View style={styles.recentCardArtContainer}>
        <Image
          source={track.artwork}
          style={{
            width: size,
            height: size,
            borderRadius: BorderRadius.md,
            backgroundColor: Colors.surfaceLight,
          }}
          contentFit="cover"
          transition={200}
        />
      </View>
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
const CARD_SIZE = 145;

const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { playTrack } = usePlayer();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);

  const greeting = useMemo(() => getGreeting(), []);

  const quickPlaylists = useMemo(
    () => DEMO_PLAYLISTS.slice(0, QUICK_PLAY_COUNT),
    [],
  );

  const recentData = useMemo(() => {
    if (recentlyPlayed.length > 0) return recentlyPlayed;
    return DEMO_TRACKS.slice(0, RECENT_FALLBACK_COUNT);
  }, [recentlyPlayed]);

  const popularTracks = useMemo(
    () => DEMO_TRACKS.slice(0, POPULAR_COUNT),
    [],
  );

  // Featured playlist (first one)
  const featuredPlaylist = useMemo(() => DEMO_PLAYLISTS[0], []);

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
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Top gradient overlay ---- */}
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
          locations={[0, 0.6, 1]}
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
                  size={22}
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
                  size={22}
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
                  size={22}
                  color={Colors.textPrimary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* ---- Quick play grid ---- */}
          {renderQuickGrid()}
        </LinearGradient>

        {/* ---- Featured Card ---- */}
        <View style={styles.featuredSection}>
          <FeaturedCard
            playlist={featuredPlaylist}
            onPress={() => handlePlaylistPlay(featuredPlaylist)}
          />
        </View>

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
    paddingBottom: Spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  greeting: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  topBarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: Spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---- Quick-play grid (glassmorphism cards) ----
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
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    marginHorizontal: 4,
    height: 58,
  },
  quickCardArt: {
    width: 58,
    height: 58,
  },
  quickCardText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.sm,
  },

  // ---- Featured section ----
  featuredSection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  featuredCard: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.medium,
  },
  featuredCardBg: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: Spacing.xl,
  },
  featuredCardTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.white,
    letterSpacing: -0.3,
  },
  featuredCardDesc: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    color: 'rgba(255,255,255,0.75)',
    marginTop: Spacing.xs,
  },

  // ---- Horizontal lists ----
  horizontalList: {
    paddingHorizontal: Spacing.lg,
  },

  // ---- Recent track card ----
  recentCardArtContainer: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
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
