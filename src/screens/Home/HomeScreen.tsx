import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
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
import { SectionHeader, TrackContextMenu } from '../../components/common';
import { usePlayer } from '../../hooks';
import usePlayerStore from '../../store/playerStore';
import {
  getHomeFeed,
  searchYTMusic,
  ytResultToTrack,
  type YTHomeSection,
  type YTSearchResult,
} from '../../services/youtube';
import type { Track } from '../../types';
import { useNavigation } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// MMKV cache for home feed (stale-while-revalidate)
// ---------------------------------------------------------------------------

const HOME_CACHE_KEY = 'home-feed-cache';

interface HomeFeedCache {
  trending: YTSearchResult[];
  sections: YTHomeSection[];
  cachedAt: number;
}

let _homeStorage: any = null;
function getHomeStorage() {
  if (!_homeStorage) {
    try {
      const { createMMKV } = require('react-native-mmkv');
      _homeStorage = createMMKV({ id: 'home-cache' });
    } catch {
      _homeStorage = {
        set: () => {},
        getString: () => undefined,
      };
    }
  }
  return _homeStorage;
}

function readHomeCache(): HomeFeedCache | null {
  try {
    const raw = getHomeStorage().getString(HOME_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HomeFeedCache;
  } catch {
    return null;
  }
}

function writeHomeCache(data: HomeFeedCache) {
  try {
    getHomeStorage().set(HOME_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

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
// Trending Track Card (for YT Music home sections)
// ---------------------------------------------------------------------------

interface TrendingCardProps {
  item: YTSearchResult;
  onPress: () => void;
  onLongPress: () => void;
  size: number;
}

const TrendingCard: React.FC<TrendingCardProps> = React.memo(
  ({ item, onPress, onLongPress, size }) => (
    <TouchableOpacity
      style={{ width: size, marginRight: Spacing.md }}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.recentCardArtContainer}>
        <Image
          source={{ uri: item.artwork }}
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
        {item.title}
      </Text>
      <Text
        style={styles.recentCardSubtitle}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.artist}
      </Text>
    </TouchableOpacity>
  ),
);

// ---------------------------------------------------------------------------
// Quick-Play Card (glassmorphism 2-column grid)
// ---------------------------------------------------------------------------

interface QuickPlayCardProps {
  item: YTSearchResult;
  onPress: () => void;
  onLongPress: () => void;
}

const QuickPlayCard: React.FC<QuickPlayCardProps> = React.memo(
  ({ item, onPress, onLongPress }) => (
    <TouchableOpacity
      style={styles.quickCard}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.artwork }}
        style={styles.quickCardArt}
        contentFit="cover"
        transition={200}
      />
      <Text style={styles.quickCardText} numberOfLines={2}>
        {item.title}
      </Text>
    </TouchableOpacity>
  ),
);

// ---------------------------------------------------------------------------
// Recently-Played Card
// ---------------------------------------------------------------------------

interface RecentTrackCardProps {
  track: Track;
  onPress: () => void;
  onLongPress: () => void;
  size: number;
}

const RecentTrackCard: React.FC<RecentTrackCardProps> = React.memo(
  ({ track, onPress, onLongPress, size }) => (
    <TouchableOpacity
      style={{ width: size, marginRight: Spacing.md }}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.recentCardArtContainer}>
        <Image
          source={track.isYT ? { uri: track.artwork as string } : track.artwork}
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

const CARD_SIZE = 145;

const HomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playTrack, playTrackWithRecommendations } = usePlayer();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);

  const greeting = useMemo(() => getGreeting(), []);

  // Context menu state — one shared menu for all cards
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const openContextMenu = useCallback((track: Track) => {
    setMenuTrack(track);
    setMenuVisible(true);
  }, []);

  const closeContextMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  // Live YT Music data
  const [homeSections, setHomeSections] = useState<YTHomeSection[]>([]);
  const [quickPlayTracks, setQuickPlayTracks] = useState<YTSearchResult[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<YTSearchResult[]>([]);
  const [isLoadingHome, setIsLoadingHome] = useState(true);

  // Fetch home feed on mount — stale-while-revalidate via MMKV
  useEffect(() => {
    let cancelled = false;

    // 1. Load from cache immediately (no spinner if cache exists)
    const cached = readHomeCache();
    if (cached && cached.trending.length > 0) {
      setTrendingTracks(cached.trending.slice(0, 10));
      setQuickPlayTracks(cached.trending.slice(0, 6));
      setHomeSections(cached.sections.slice(0, 4));
      setIsLoadingHome(false); // Show cached UI instantly
    }

    // 2. Fetch fresh data in background
    async function loadHome() {
      try {
        const [trending, sections] = await Promise.all([
          searchYTMusic('trending hits 2025'),
          getHomeFeed(),
        ]);

        if (cancelled) return;

        const freshTrending = trending.slice(0, 10);
        const freshSections = sections.slice(0, 4);

        setTrendingTracks(freshTrending);
        setQuickPlayTracks(trending.slice(0, 6));
        setHomeSections(freshSections);

        // Write to cache
        writeHomeCache({
          trending,
          sections: freshSections,
          cachedAt: Date.now(),
        });
      } catch (err) {
        console.warn('[Home] Failed to load:', err);
      } finally {
        if (!cancelled) setIsLoadingHome(false);
      }
    }

    loadHome();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleQuickPlay = useCallback(
    (item: YTSearchResult) => {
      const track = ytResultToTrack(item);
      playTrackWithRecommendations(track);
    },
    [playTrackWithRecommendations],
  );

  const handleTrendingPlay = useCallback(
    (items: YTSearchResult[], index: number) => {
      const tracks = items.map(ytResultToTrack);
      playTrack(tracks, index);
    },
    [playTrack],
  );

  const handleRecentTrackPlay = useCallback(
    (track: Track) => {
      const recentList = recentlyPlayed.length > 0 ? recentlyPlayed : [];
      const idx = recentList.findIndex((t) => t.id === track.id);
      playTrack(recentList, idx >= 0 ? idx : 0);
    },
    [playTrack, recentlyPlayed],
  );

  const handleSectionPlay = useCallback(
    (section: YTHomeSection, index: number) => {
      const track = ytResultToTrack(section.items[index]);
      playTrackWithRecommendations(track);
    },
    [playTrackWithRecommendations],
  );

  const renderQuickGrid = () => {
    if (quickPlayTracks.length === 0) return null;

    const rows: YTSearchResult[][] = [];
    for (let i = 0; i < quickPlayTracks.length; i += 2) {
      rows.push(quickPlayTracks.slice(i, i + 2));
    }

    return (
      <View style={styles.quickGrid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.quickRow}>
            {row.map((item) => (
              <QuickPlayCard
                key={item.videoId}
                item={item}
                onPress={() => handleQuickPlay(item)}
                onLongPress={() => openContextMenu(ytResultToTrack(item))}
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
          {isLoadingHome ? (
            <View style={styles.quickGridLoading}>
              <ActivityIndicator size="small" color={Colors.textMuted} />
            </View>
          ) : (
            renderQuickGrid()
          )}
        </LinearGradient>

        {/* ---- Recently Played (max 8, "Show more" → Library tab) ---- */}
        {recentlyPlayed.length > 0 && (
          <>
            <SectionHeader
              title="Recently played"
              actionText={recentlyPlayed.length > 8 ? 'Show more' : undefined}
              onAction={
                recentlyPlayed.length > 8
                  ? () => navigation.navigate('Your Library' as never)
                  : undefined
              }
            />
            <FlatList
              data={recentlyPlayed.slice(0, 8)}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <RecentTrackCard
                  track={item}
                  onPress={() => handleRecentTrackPlay(item)}
                  onLongPress={() => openContextMenu(item)}
                  size={CARD_SIZE}
                />
              )}
            />
          </>
        )}

        {/* ---- Trending ---- */}
        {trendingTracks.length > 0 && (
          <>
            <SectionHeader title="Trending Now" />
            <FlatList
              data={trendingTracks}
              keyExtractor={(item) => item.videoId}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item, index }) => (
                <TrendingCard
                  item={item}
                  onPress={() => handleTrendingPlay(trendingTracks, index)}
                  onLongPress={() => openContextMenu(ytResultToTrack(item))}
                  size={CARD_SIZE}
                />
              )}
            />
          </>
        )}

        {/* ---- YT Music Home Sections ---- */}
        {homeSections.map((section, sectionIdx) => (
          <React.Fragment key={`section-${sectionIdx}`}>
            <SectionHeader title={section.title} />
            <FlatList
              data={section.items.slice(0, 10)}
              keyExtractor={(item) => item.videoId}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item, index }) => (
                <TrendingCard
                  item={item}
                  onPress={() => handleSectionPlay(section, index)}
                  onLongPress={() => openContextMenu(ytResultToTrack(item))}
                  size={CARD_SIZE}
                />
              )}
            />
          </React.Fragment>
        ))}

        {/* ---- Loading indicator at bottom while fetching ---- */}
        {isLoadingHome && (
          <View style={styles.sectionLoading}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
            <Text style={styles.loadingText}>Loading music...</Text>
          </View>
        )}
      </ScrollView>

      {/* Shared context menu for all cards */}
      <TrackContextMenu
        track={menuTrack}
        visible={menuVisible}
        onClose={closeContextMenu}
      />
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

  // ---- Quick-play grid ----
  quickGrid: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  quickGridLoading: {
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
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

  // ---- Horizontal lists ----
  horizontalList: {
    paddingHorizontal: Spacing.lg,
  },

  // ---- Recent / Trending track card ----
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

  // ---- Loading ----
  sectionLoading: {
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});
