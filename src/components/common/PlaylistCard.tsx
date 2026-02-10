import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '../../theme';
import { Playlist } from '../../types';

interface PlaylistCardProps {
  playlist: Playlist;
  onPress: () => void;
  size?: number;
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  onPress,
  size = 145,
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.artworkContainer}>
        <Image
          source={playlist.artwork}
          style={[
            styles.artwork,
            { width: size, height: size },
          ]}
          contentFit="cover"
          transition={200}
        />
      </View>
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
  artworkContainer: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadows.small,
  },
  artwork: {
    borderRadius: BorderRadius.md,
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
