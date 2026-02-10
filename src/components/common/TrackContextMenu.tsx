import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../../theme';
import { usePlayer } from '../../hooks';
import type { Track } from '../../types';

interface TrackContextMenuProps {
  track: Track | null;
  visible: boolean;
  onClose: () => void;
}

const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  track,
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { playNext, addToQueue } = usePlayer();

  const handlePlayNext = useCallback(async () => {
    if (!track) return;
    onClose();
    await playNext(track);
  }, [track, playNext, onClose]);

  const handleAddToQueue = useCallback(async () => {
    if (!track) return;
    onClose();
    await addToQueue(track);
  }, [track, addToQueue, onClose]);

  if (!track) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
          onPress={() => {}}
        >
          {/* Track info header */}
          <View style={styles.trackHeader}>
            <Image
              source={
                typeof track.artwork === 'string'
                  ? { uri: track.artwork }
                  : track.artwork
              }
              style={styles.artwork}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Menu options */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.6}
            onPress={handlePlayNext}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="play-forward" size={22} color={Colors.textPrimary} />
            </View>
            <Text style={styles.menuItemText}>Play Next</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.6}
            onPress={handleAddToQueue}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="list" size={22} color={Colors.textPrimary} />
            </View>
            <Text style={styles.menuItemText}>Add to Queue</Text>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity
            style={[styles.menuItem, styles.cancelItem]}
            activeOpacity={0.6}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default React.memo(TrackContextMenu);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.lg,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
  },
  trackInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  trackTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  trackArtist: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.glassBorder,
    marginBottom: Spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuItemText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  cancelItem: {
    justifyContent: 'center',
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.glassBorder,
  },
  cancelText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
    textAlign: 'center',
    flex: 1,
  },
});
