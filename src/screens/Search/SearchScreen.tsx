import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '../../theme';
import { TrackRow } from '../../components/common';
import { usePlayer } from '../../hooks';
import { searchYTMusic, getSearchSuggestions, ytResultToTrack } from '../../services/youtube';
import type { Track } from '../../types';

// Category type for browse tiles (local, no longer in shared types)
interface Category {
  id: string;
  name: string;
  color: string;
}

const SEARCH_CATEGORIES: Category[] = [
  { id: 'pop', name: 'Pop', color: '#E8115B' },
  { id: 'hiphop', name: 'Hip-Hop', color: '#BA5D07' },
  { id: 'rock', name: 'Rock', color: '#E61E32' },
  { id: 'indie', name: 'Indie', color: '#608108' },
  { id: 'electronic', name: 'Electronic', color: '#7358FF' },
  { id: 'rnb', name: 'R&B', color: '#DC148C' },
  { id: 'jazz', name: 'Jazz', color: '#477D95' },
  { id: 'classical', name: 'Classical', color: '#8C67AB' },
  { id: 'ambient', name: 'Ambient', color: '#1E3264' },
  { id: 'lofi', name: 'Lo-Fi', color: '#503750' },
  { id: 'chill', name: 'Chill', color: '#2D46B9' },
  { id: 'workout', name: 'Workout', color: '#E13300' },
];

const COLUMN_GAP = Spacing.md;
const NUM_COLUMNS = 2;

// Debounce delay for suggestions
const SUGGESTION_DEBOUNCE = 250;

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
  const { playTrackWithRecommendations } = usePlayer();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearching = query.length > 0;

  // Debounced search suggestions
  useEffect(() => {
    if (!isSearching) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);

    suggestionTimeout.current = setTimeout(async () => {
      try {
        const results = await getSearchSuggestions(query);
        setSuggestions(results.slice(0, 6));
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, SUGGESTION_DEBOUNCE);

    return () => {
      if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    };
  }, [query, isSearching]);

  // Perform actual search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    setShowSuggestions(false);
    Keyboard.dismiss();

    try {
      const results = await searchYTMusic(searchQuery);
      const tracks = results.map(ytResultToTrack);
      setSearchResults(tracks);
    } catch (err) {
      console.warn('[Search] Failed:', err);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update query text — no auto-search, only suggestions
  const handleTextChange = useCallback(
    (text: string) => {
      setQuery(text);

      if (!text.trim()) {
        setSearchResults([]);
        setHasSearched(false);
        setShowSuggestions(false);
        return;
      }
    },
    [],
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      setSuggestions([]);
      setShowSuggestions(false);
      performSearch(suggestion);
    },
    [performSearch],
  );

  const handleCategoryPress = useCallback(
    (category: Category) => {
      setQuery(category.name);
      performSearch(category.name);
    },
    [performSearch],
  );

  const handleTrackPress = useCallback(
    (track: Track, _index: number) => {
      Keyboard.dismiss();
      setShowSuggestions(false);
      playTrackWithRecommendations(track);
    },
    [playTrackWithRecommendations],
  );

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSuggestions([]);
    setShowSuggestions(false);
    Keyboard.dismiss();
  }, []);

  const handleSubmitEditing = useCallback(() => {
    if (query.trim()) {
      performSearch(query);
    }
  }, [query, performSearch]);

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
            onPress={() => handleCategoryPress(item)}
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
    [handleCategoryPress],
  );

  const trackKeyExtractor = useCallback((item: Track) => item.id, []);
  const categoryKeyExtractor = useCallback((item: Category) => item.id, []);

  const ListEmptyResults = useMemo(
    () =>
      hasSearched && !isLoading ? (
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
      ) : null,
    [hasSearched, isLoading],
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
          <TouchableOpacity
            onPress={() => { if (query.trim()) performSearch(query); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="search"
              size={18}
              color={Colors.textMuted}
              style={styles.searchIcon}
            />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, artists..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={handleTextChange}
            onSubmitEditing={handleSubmitEditing}
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

      {/* Search Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={`${suggestion}-${index}`}
              style={styles.suggestionItem}
              onPress={() => handleSuggestionPress(suggestion)}
              activeOpacity={0.6}
            >
              <Ionicons
                name="search-outline"
                size={16}
                color={Colors.textMuted}
                style={styles.suggestionIcon}
              />
              <Text style={styles.suggestionText} numberOfLines={1}>
                {suggestion}
              </Text>
              <Ionicons
                name="arrow-up-outline"
                size={16}
                color={Colors.textMuted}
                style={{ transform: [{ rotate: '-45deg' }] }}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : isSearching && hasSearched ? (
        <FlatList
          key="search-results"
          data={searchResults}
          renderItem={renderTrackItem}
          keyExtractor={trackKeyExtractor}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={ListEmptyResults}
          contentContainerStyle={
            searchResults.length === 0 ? styles.emptyList : styles.resultsList
          }
        />
      ) : (
        <FlatList
          key="categories-grid"
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

  // Suggestions
  suggestionsContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
  },
  suggestionIcon: {
    marginRight: Spacing.md,
  },
  suggestionText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  loadingText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },

  // Results
  resultsList: {
    paddingBottom: 140,
  },

  // Categories — gradient tiles
  categoriesContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 140,
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
