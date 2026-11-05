/**
 * Per-device settings of the in-player episode list. Each value is stored under `episodeList-<name>`;
 * the Playback preferences page binds its controls to them with a `data-episodelist="<name>"` attribute.
 * @module components/episodeList/episodeListSettings
 */

import * as userSettings from 'scripts/settings/userSettings';

export const EPISODE_LIST_DEFAULTS = {
    // Master switch for the built-in list; off hides its button for every kind of video
    enabled: true,

    // Which videos get the list button
    enableEpisodes: true,
    enableMovies: true,
    enableVideos: true,

    // What the list shows
    showDescription: true,
    showProgress: true,
    watchCount: 'count', // 'count' | 'time' | 'off'
    showMissing: false,
    searchCollections: true,
    movieFolderSiblings: false,
    additionalParts: true,
    alternateVersions: true,

    // Which list's button the player shows when the InPlayerEpisodePreview plugin is installed too.
    // 'plugin' leaves things as they were for existing users; the built-in button only appears without the plugin.
    source: 'plugin', // 'plugin' | 'native'

    // How it behaves
    layout: 'sideBySide', // 'stacked' | 'sideBySide'
    blur: 'none', // 'none' | 'description' | 'thumbnail' | 'both'
    blurUnwatchedOnly: false,
    autoClose: true,
    logLevel: 'warn' // 'debug' | 'info' | 'warn' | 'error' | 'none'
};

// Stored values come from storage, so anything outside these falls back to the default.
const ALLOWED_VALUES = {
    source: [ 'plugin', 'native' ],
    watchCount: [ 'count', 'time', 'off' ],
    layout: [ 'stacked', 'sideBySide' ],
    blur: [ 'none', 'description', 'thumbnail', 'both' ],
    logLevel: [ 'debug', 'info', 'warn', 'error', 'none' ]
};

/**
 * Read the settings, with defaults for anything unset or invalid.
 * @returns {Record<string, any>} The settings by name.
 */
export function getEpisodeListSettings() {
    const settings = {};

    for (const [ name, defaultValue ] of Object.entries(EPISODE_LIST_DEFAULTS)) {
        const stored = userSettings.get(`episodeList-${name}`, false);

        if (typeof defaultValue === 'boolean') {
            settings[name] = stored === 'true' || stored === 'false' ? stored === 'true' : defaultValue;
        } else {
            settings[name] = ALLOWED_VALUES[name]?.includes(stored) ? stored : defaultValue;
        }
    }

    return settings;
}

/**
 * Whether the list button is enabled for the given kind of video.
 * @param {string} itemType The type of the playing item.
 * @returns {boolean} True if the list is enabled for it.
 */
export function isEpisodeListEnabled(itemType) {
    const { enabled, enableEpisodes, enableMovies, enableVideos } = getEpisodeListSettings();
    if (!enabled) {
        return false;
    }

    return { Episode: enableEpisodes, Movie: enableMovies, Video: enableVideos }[itemType] === true;
}

export function setEpisodeListSetting(name, value) {
    userSettings.set(`episodeList-${name}`, String(value), false);
}

const LOG_LEVELS = [ 'debug', 'info', 'warn', 'error', 'none' ];

/**
 * Console logger for the episode list that honours the configured log level.
 * @param {string} level The level of the message.
 * @param {...*} args What to log.
 */
export function log(level, ...args) {
    const stored = userSettings.get('episodeList-logLevel', false);
    const configured = LOG_LEVELS.includes(stored) ? stored : EPISODE_LIST_DEFAULTS.logLevel;

    if (LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(configured)) {
        console[level]('[EpisodeList]', ...args);
    }
}
