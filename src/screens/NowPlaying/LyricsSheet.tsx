import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../../theme';
import usePlayerStore from '../../store/playerStore';
import type { LyricLine } from '../../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Vertical offset (px) above the active line so it sits ~40% from top. */
const SCROLL_OFFSET = SCREEN_HEIGHT * 0.35;
/** Estimated height per lyric line (px). */
const LINE_HEIGHT_ESTIMATE = 48;

interface LyricsSheetProps {
  onClose: () => void;
}

/**
 * Given sorted lyrics and a playback position, return the index of the
 * currently active lyric line (the last line whose time <= position).
 */
function getActiveLyricIndex(
  lyrics: LyricLine[],
  position: number,
): number {
  let active = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= position) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

const LyricsSheet: React.FC<LyricsSheetProps> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveIndex = useRef(-1);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const position = usePlayerStore((s) => s.position);

  const lyrics: LyricLine[] = currentTrack?.lyrics ?? [];
  const hasLyrics = lyrics.length > 0;

  const activeIndex = useMemo(
    () => (hasLyrics ? getActiveLyricIndex(lyrics, position) : -1),
    [lyrics, position, hasLyrics],
  );

  // Auto-scroll to active line
  useEffect(() => {
    if (!hasLyrics || activeIndex < 0 || isUserScrolling.current) return;
    if (activeIndex === prevActiveIndex.current) return;
    prevActiveIndex.current = activeIndex;

    const yOffset = Math.max(
      0,
      activeIndex * LINE_HEIGHT_ESTIMATE - SCROLL_OFFSET,
    );
    scrollRef.current?.scrollTo({ y: yOffset, animated: true });
  }, [activeIndex, hasLyrics]);

  // Detect user scroll and temporarily disable auto-scroll
  const handleScrollBegin = () => {
    isUserScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  };

  const handleScrollEnd = () => {
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 4000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  return (
    <LinearGradient
      colors={['#2A1A4E', '#1A1040', Colors.background]}
      locations={[0, 0.45, 1]}
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Lyrics</Text>
        <TouchableOpacity
          style={styles.closeButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onClose}
        >
          <Ionicons
            name="chevron-down"
            size={28}
            color={Colors.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* Lyrics Body */}
      {hasLyrics ? (
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={handleScrollBegin}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
        >
          {/* Top padding so lyrics start mid-screen */}
          <View style={{ height: SCROLL_OFFSET }} />

          {lyrics.map((line, index) => {
            let opacity: number;
            if (index === activeIndex) {
              opacity = 1;
            } else if (index < activeIndex) {
              opacity = 0.35;
            } else {
              opacity = 0.45;
            }

            return (
              <Text
                key={`${index}-${line.time}`}
                style={[
                  styles.lyricLine,
                  { opacity },
                  index === activeIndex && styles.lyricLineActive,
                ]}
              >
                {line.text}
              </Text>
            );
          })}

          {/* Bottom padding so last line can scroll to center */}
          <View style={{ height: SCREEN_HEIGHT * 0.5 }} />
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons
              name="musical-notes-outline"
              size={40}
              color="rgba(255,255,255,0.3)"
            />
          </View>
          <Text style={styles.emptyText}>No lyrics available</Text>
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xxl,
  },
  lyricLine: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: FontWeight.bold,
    lineHeight: 40,
    marginBottom: Spacing.sm,
  },
  lyricLineActive: {
    color: Colors.primaryLight,
    transform: [{ scale: 1 }],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
  },
});

export default React.memo(LyricsSheet);
