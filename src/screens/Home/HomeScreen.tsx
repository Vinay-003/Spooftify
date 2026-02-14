import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Modal,
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
  getCollectionDetails,
  getHomeFeed,
  isPlayableResult,
  isLikelyVideoId,
  searchYTMusic,
  ytResultToTrack,
  type YTCollectionDetails,
  type YTHomeSection,
  type YTSearchResult,
} from '../../services/youtube';
import type { Track } from '../../types';
import { useNavigation } from '@react-navigation/native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

function sanitizeTracks(tracks: YTSearchResult[]): YTSearchResult[] {
  return tracks.filter((t) => {
    if (isLikelyVideoId(t.videoId)) return true;
    if (!t.browseId) return false;
    return t.entityType === 'album' || t.entityType === 'playlist';
  });
}

function sanitizeSections(sections: YTHomeSection[]): YTHomeSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: sanitizeTracks(section.items),
    }))
    .filter((section) => section.items.length > 0);
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
  const [collectionVisible, setCollectionVisible] = useState(false);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [activeCollection, setActiveCollection] = useState<YTCollectionDetails | null>(null);
  const collectionRequestRef = useRef(0);

  // Fetch home feed on mount — stale-while-revalidate via MMKV
  useEffect(() => {
    let cancelled = false;

    // 1. Load from cache immediately (no spinner if cache exists)
    const cached = readHomeCache();
    if (cached && cached.trending.length > 0) {
      const cachedTrending = sanitizeTracks(cached.trending);
      const cachedSections = sanitizeSections(cached.sections);
      if (cachedTrending.length > 0 || cachedSections.length > 0) {
        setTrendingTracks(cachedTrending.slice(0, 10));
        setQuickPlayTracks(cachedTrending.slice(0, 6));
        setHomeSections(cachedSections.slice(0, 4));
        setIsLoadingHome(false); // Show cached UI instantly
      }
    }

    // 2. Fetch fresh data in background
    async function loadHome() {
      try {
        const [trending, sections] = await Promise.all([
          searchYTMusic('trending hits 2025'),
          getHomeFeed(),
        ]);

        if (cancelled) return;

        const safeTrending = sanitizeTracks(trending);
        const safeSections = sanitizeSections(sections);

        const freshTrending = safeTrending.slice(0, 10);
        const freshSections = safeSections.slice(0, 4);

        setTrendingTracks(freshTrending);
        setQuickPlayTracks(safeTrending.slice(0, 6));
        setHomeSections(freshSections);

        // Write to cache
        writeHomeCache({
          trending: safeTrending,
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

  const openCollection = useCallback((item: YTSearchResult) => {
    const id = item.browseId || item.videoId;
    if (!id) return;

    const requestId = ++collectionRequestRef.current;
    setCollectionVisible(true);
    setCollectionLoading(true);
    setCollectionError('');
    setActiveCollection(null);

    getCollectionDetails(id, item.entityType === 'playlist' ? 'playlist' : 'album')
      .then((details) => {
        if (requestId !== collectionRequestRef.current) return;
        setActiveCollection(details);
        if (details.tracks.length === 0) {
          setCollectionError('No playable songs were found in this collection.');
        }
      })
      .catch(() => {
        if (requestId !== collectionRequestRef.current) return;
        setCollectionError('Failed to load this collection.');
      })
      .finally(() => {
        if (requestId !== collectionRequestRef.current) return;
        setCollectionLoading(false);
      });
  }, []);

  const openTrackContextMenu = useCallback(
    (item: YTSearchResult) => {
      if (!isPlayableResult(item)) return;
      openContextMenu(ytResultToTrack(item));
    },
    [openContextMenu],
  );

  const handleQuickPlay = useCallback(
    (item: YTSearchResult) => {
      if (!isPlayableResult(item)) {
        openCollection(item);
        return;
      }
      const track = ytResultToTrack(item);
      playTrackWithRecommendations(track);
    },
    [openCollection, playTrackWithRecommendations],
  );

  const handleTrendingPlay = useCallback(
    (items: YTSearchResult[], index: number) => {
      const playable = items
        .map((item, idx) => ({ item, idx }))
        .filter((entry) => isPlayableResult(entry.item));
      if (playable.length === 0) return;

      const tracks = playable.map((entry) => ytResultToTrack(entry.item));
      const mappedIndex = playable.findIndex((entry) => entry.idx === index);
      playTrack(tracks, mappedIndex >= 0 ? mappedIndex : 0);
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
    (item: YTSearchResult) => {
      if (!isPlayableResult(item)) {
        openCollection(item);
        return;
      }

      const track = ytResultToTrack(item);
      playTrackWithRecommendations(track);
    },
    [openCollection, playTrackWithRecommendations],
  );

  const closeCollectionModal = useCallback(() => {
    collectionRequestRef.current += 1;
    setCollectionVisible(false);
    setCollectionLoading(false);
  }, []);

  const playCollectionFromIndex = useCallback(
    (startIndex: number) => {
      if (!activeCollection || activeCollection.tracks.length === 0) return;
      const tracks = activeCollection.tracks.map(ytResultToTrack);
      playTrack(tracks, startIndex);
      setCollectionVisible(false);
    },
    [activeCollection, playTrack],
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
                onLongPress={() => openTrackContextMenu(item)}
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
                  onPress={() => {
                    if (!isPlayableResult(item)) {
                      openCollection(item);
                      return;
                    }
                    handleTrendingPlay(trendingTracks, index);
                  }}
                  onLongPress={() => openTrackContextMenu(item)}
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
                  onPress={() => handleSectionPlay(item)}
                  onLongPress={() => openTrackContextMenu(item)}
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

      <Modal
        visible={collectionVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeCollectionModal}
      >
        <View style={styles.collectionModalOverlay}>
          <View
            style={[
              styles.collectionModalSheet,
              {
                paddingTop: insets.top + Spacing.lg,
                paddingBottom: Math.max(insets.bottom, Spacing.lg),
              },
            ]}
          >
            <View style={styles.collectionModalTopBar}>
              <TouchableOpacity
                style={styles.collectionCloseBtn}
                onPress={closeCollectionModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-down" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.collectionTopBarTitle}>
                {activeCollection?.entityType === 'playlist' ? 'Playlist' : 'Album'}
              </Text>
              <View style={styles.collectionTopBarSpacer} />
            </View>

            {collectionLoading ? (
              <View style={styles.collectionCenterState}>
                <ActivityIndicator size="small" color={Colors.textMuted} />
                <Text style={styles.collectionStateText}>Loading songs...</Text>
              </View>
            ) : collectionError && !activeCollection ? (
              <View style={styles.collectionCenterState}>
                <Text style={styles.collectionStateText}>{collectionError}</Text>
              </View>
            ) : activeCollection ? (
              <ScrollView
                style={styles.collectionBody}
                contentContainerStyle={styles.collectionBodyContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.collectionHero}>
                  <Image
                    source={{ uri: activeCollection.artwork }}
                    style={styles.collectionHeroArtwork}
                    contentFit="cover"
                    transition={200}
                  />
                  <Text style={styles.collectionTitle}>{activeCollection.title}</Text>
                  <Text style={styles.collectionSubtitle} numberOfLines={2}>
                    {activeCollection.artist || activeCollection.subtitle}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.collectionPlayButton,
                      activeCollection.tracks.length === 0 && styles.collectionPlayButtonDisabled,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => playCollectionFromIndex(0)}
                    disabled={activeCollection.tracks.length === 0}
                  >
                    <Ionicons name="play" size={18} color={Colors.black} />
                    <Text style={styles.collectionPlayText}>Play</Text>
                  </TouchableOpacity>
                  {collectionError ? (
                    <Text style={styles.collectionInlineError}>{collectionError}</Text>
                  ) : null}
                </View>

                <View style={styles.collectionTrackList}>
                  {activeCollection.tracks.map((track, index) => (
                    <TouchableOpacity
                      key={`${track.videoId}-${index}`}
                      style={styles.collectionTrackRow}
                      activeOpacity={0.7}
                      onPress={() => playCollectionFromIndex(index)}
                      onLongPress={() => openTrackContextMenu(track)}
                    >
                      <Text style={styles.collectionTrackIndex}>{index + 1}</Text>
                      <View style={styles.collectionTrackMeta}>
                        <Text style={styles.collectionTrackTitle} numberOfLines={1}>
                          {track.title}
                        </Text>
                        <Text style={styles.collectionTrackArtist} numberOfLines={1}>
                          {track.artist}
                        </Text>
                      </View>
                      <Ionicons name="play" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.collectionCenterState}>
                <Text style={styles.collectionStateText}>No collection selected.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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

  // ---- Collection modal ----
  collectionModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  collectionModalSheet: {
    maxHeight: SCREEN_HEIGHT * 0.9,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  collectionModalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  collectionCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionTopBarTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  collectionTopBarSpacer: {
    width: 32,
  },
  collectionCenterState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  collectionStateText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  collectionBody: {
    flex: 1,
  },
  collectionBodyContent: {
    paddingBottom: Spacing.xl,
  },
  collectionHero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  collectionHeroArtwork: {
    width: 180,
    height: 180,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceLight,
    marginBottom: Spacing.md,
  },
  collectionTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  collectionSubtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  collectionPlayButton: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.round,
    minWidth: 120,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  collectionPlayButtonDisabled: {
    opacity: 0.45,
  },
  collectionPlayText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.black,
  },
  collectionInlineError: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  collectionTrackList: {
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.glassBorder,
  },
  collectionTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.glassBorder,
  },
  collectionTrackIndex: {
    width: 24,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  collectionTrackMeta: {
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  collectionTrackTitle: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  collectionTrackArtist: {
    marginTop: 2,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
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
