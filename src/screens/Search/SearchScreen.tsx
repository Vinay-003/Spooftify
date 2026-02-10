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
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../../theme';
import { DEMO_TRACKS, SEARCH_CATEGORIES } from '../../data/tracks';
import { TrackRow } from '../../components/common';
import { usePlayer } from '../../hooks';
import type { Track, Category } from '../../types';

const COLUMN_GAP = Spacing.md;
const NUM_COLUMNS = 2;

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
    ({ item }: { item: Category }) => (
      <View style={styles.categoryWrapper}>
        <TouchableOpacity
          style={[styles.categoryTile, { backgroundColor: item.color }]}
          activeOpacity={0.7}
        >
          <Text style={styles.categoryName}>{item.name}</Text>
        </TouchableOpacity>
      </View>
    ),
    [],
  );

  const trackKeyExtractor = useCallback((item: Track) => item.id, []);
  const categoryKeyExtractor = useCallback((item: Category) => item.id, []);

  const ListEmptyResults = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="search-outline"
          size={48}
          color={Colors.textMuted}
        />
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
            size={20}
            color={Colors.background}
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
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  // Search bar
  searchBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    height: 40,
    paddingHorizontal: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.background,
    height: '100%',
    padding: 0,
  },
  clearButton: {
    marginLeft: Spacing.sm,
  },

  // Categories
  categoriesContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.huge,
  },
  browseTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  categoryRow: {
    justifyContent: 'space-between',
    marginBottom: COLUMN_GAP,
  },
  categoryWrapper: {
    width: `${(100 - (COLUMN_GAP / 3.75)) / NUM_COLUMNS}%` as any,
  },
  categoryTile: {
    borderRadius: BorderRadius.md,
    aspectRatio: 1.65,
    padding: Spacing.md,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  categoryName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
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
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});
