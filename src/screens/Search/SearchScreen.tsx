import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '../../theme';
import { DEMO_TRACKS, SEARCH_CATEGORIES } from '../../data/tracks';
import { TrackRow } from '../../components/common';
import { usePlayer } from '../../hooks';
import type { Track, Category } from '../../types';

const COLUMN_GAP = Spacing.md;
const NUM_COLUMNS = 2;

// Color pairs for category gradient tiles
const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  pop: ['#E8115B', '#A50D40'],
  hiphop: ['#BA5D07', '#8A4305'],
  rock: ['#E61E32', '#A31525'],
  indie: ['#608108', '#425905'],
  electronic: ['#7358FF', '#5240C0'],
  rnb: ['#DC148C', '#9E0F65'],
  jazz: ['#477D95', '#2F5566'],
  classical: ['#8C67AB', '#6A4D82'],
  ambient: ['#1E3264', '#142248'],
  lofi: ['#503750', '#3A2839'],
  chill: ['#2D46B9', '#1E3080'],
  workout: ['#E13300', '#A32600'],
};

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState('');

  const isSearching = query.length > 0;

  const filteredTracks = useMemo(() => {
    if (!isSearching) return [];
    const q = query.toLowerCase();
    return DEMO_TRACKS.filter(
      (track) =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q),
    );
  }, [query, isSearching]);

  const handleTrackPress = useCallback(
    (track: Track, index: number) => {
      Keyboard.dismiss();
      playTrack(filteredTracks, index);
    },
    [playTrack, filteredTracks],
  );

  const handleClearSearch = useCallback(() => {
    setQuery('');
    Keyboard.dismiss();
  }, []);

  const renderTrackItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackRow
        track={item}
        onPress={() => handleTrackPress(item, index)}
        showArtwork
      />
    ),
    [handleTrackPress],
  );

  const renderCategoryItem = useCallback(
    ({ item }: { item: Category }) => {
      const gradient = CATEGORY_GRADIENTS[item.id] || [item.color, Colors.surfaceLight];
      return (
        <View style={styles.categoryWrapper}>
          <TouchableOpacity
            style={styles.categoryTile}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.categoryGradient}
            >
              <Text style={styles.categoryName}>{item.name}</Text>
              <View style={styles.categoryIconBg}>
                <Ionicons
                  name="musical-notes"
                  size={20}
                  color="rgba(255,255,255,0.3)"
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    },
    [],
  );

  const trackKeyExtractor = useCallback((item: Track) => item.id, []);
  const categoryKeyExtractor = useCallback((item: Category) => item.id, []);

  const ListEmptyResults = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons
            name="search-outline"
            size={40}
            color={Colors.textMuted}
          />
        </View>
        <Text style={styles.emptyTitle}>No results found</Text>
        <Text style={styles.emptySubtitle}>
          Try searching for something else
        </Text>
      </View>
    ),
    [],
  );

  const CategoriesHeader = useMemo(
    () => (
      <Text style={styles.browseTitle}>Browse All</Text>
    ),
    [],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color={Colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="What do you want to listen to?"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {isSearching ? (
        <FlatList
          data={filteredTracks}
          renderItem={renderTrackItem}
          keyExtractor={trackKeyExtractor}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={ListEmptyResults}
          contentContainerStyle={filteredTracks.length === 0 && styles.emptyList}
        />
      ) : (
        <FlatList
          data={SEARCH_CATEGORIES}
          renderItem={renderCategoryItem}
          keyExtractor={categoryKeyExtractor}
          numColumns={NUM_COLUMNS}
          ListHeaderComponent={CategoriesHeader}
          contentContainerStyle={styles.categoriesContainer}
          columnWrapperStyle={styles.categoryRow}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },

  // Search bar — glass style
  searchBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    height: 44,
    paddingHorizontal: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
    height: '100%',
    padding: 0,
  },
  clearButton: {
    marginLeft: Spacing.sm,
  },

  // Categories — gradient tiles
  categoriesContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.huge,
  },
  browseTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
    letterSpacing: -0.3,
  },
  categoryRow: {
    justifyContent: 'space-between',
    marginBottom: COLUMN_GAP,
  },
  categoryWrapper: {
    width: `${(100 - (COLUMN_GAP / 3.75)) / NUM_COLUMNS}%` as any,
  },
  categoryTile: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.small,
  },
  categoryGradient: {
    aspectRatio: 1.65,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  categoryName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  categoryIconBg: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});
