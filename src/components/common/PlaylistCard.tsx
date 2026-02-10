import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../../theme';
import { Playlist } from '../../types';

interface PlaylistCardProps {
  playlist: Playlist;
  onPress: () => void;
  size?: number;
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  onPress,
  size = 140,
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Image
        source={playlist.artwork}
        style={[
          styles.artwork,
          { width: size, height: size },
        ]}
        contentFit="cover"
        transition={200}
      />
      <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
        {playlist.name}
      </Text>
      {playlist.description ? (
        <Text
          style={styles.description}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {playlist.description}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

export default React.memo(PlaylistCard);

const styles = StyleSheet.create({
  container: {
    marginRight: Spacing.md,
  },
  artwork: {
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.surfaceLight,
  },
  name: {
    fontSize: 13,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  description: {
    fontSize: 11,
    fontWeight: FontWeight.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
