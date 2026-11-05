/** The InPlayerEpisodePreview plugin, whose feature is now part of the video player. */
const IN_PLAYER_EPISODE_PREVIEW_ID = '73833d5f0bcb45dcab8b7ce668f4345d';

/**
 * Whether the plugin's feature ships with Jellyfin now.
 * Ids show up with and without dashes depending on where they come from.
 */
export const isBuiltInFeature = (pluginId?: string | null) =>
    pluginId?.replace(/-/g, '').toLowerCase() === IN_PLAYER_EPISODE_PREVIEW_ID;
