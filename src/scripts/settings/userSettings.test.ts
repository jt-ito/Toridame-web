import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserSettings } from './userSettings';

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));

// The test environment has no usable localStorage.
class MemoryStorage {
    private readonly items = new Map<string, string>();

    get length() {
        return this.items.size;
    }

    key(index: number) {
        return [ ...this.items.keys() ][index] ?? null;
    }

    getItem(key: string) {
        return this.items.get(key) ?? null;
    }

    setItem(key: string, value: string) {
        this.items.set(key, String(value));
    }

    clear() {
        this.items.clear();
    }
}

describe('UserSettings', () => {
    let settings: UserSettings;
    let customPrefs: Record<string, string | null>;

    beforeEach(() => {
        vi.stubGlobal('localStorage', new MemoryStorage());
        customPrefs = {};
        customPrefs = {};
        settings = new UserSettings();
        Object.assign(settings, {
            currentUserId: 'user',
            currentApiClient: { updateDisplayPreferences: vi.fn() },
            displayPrefs: { CustomPrefs: customPrefs }
        });
    });

    describe('syncing device settings across devices', () => {
        it('keeps device settings on the device by default', () => {
            settings.set('appTheme', 'dark', false);

            expect(settings.get('appTheme', false)).toBe('dark');
            expect(customPrefs['synced-appTheme']).toBeUndefined();
        });

        it('stores device settings on the account once syncing is on', () => {
            settings.syncAcrossDevices(true);
            settings.set('appTheme', 'dark', false);

            expect(customPrefs['synced-appTheme']).toBe('dark');
        });

        it('reads the account value on a device that has none of its own', () => {
            settings.syncAcrossDevices(true);
            settings.set('appTheme', 'dark', false);
            localStorage.clear();

            expect(settings.get('appTheme', false)).toBe('dark');
        });

        it('stops reading the account value when syncing is turned off', () => {
            settings.syncAcrossDevices(true);
            settings.set('appTheme', 'dark', false);
            localStorage.clear();
            settings.syncAcrossDevices(false);

            expect(settings.get('appTheme', false)).toBeNull();
        });

        it('never syncs settings that depend on the device', () => {
            settings.syncAcrossDevices(true);
            settings.set('allowedAudioChannels', '2', false);
            settings.set('libraryPageSize', '50', false);

            expect(Object.keys(customPrefs).filter(key => key.startsWith('synced-'))).toEqual([]);
        });

        it('makes this device\'s values the account\'s when turned on', () => {
            settings.set('appTheme', 'dark', false);
            settings.set('language', 'fr', false);
            settings.set('allowedAudioChannels', '2', false);

            settings.syncAcrossDevices(true);

            expect(customPrefs['synced-appTheme']).toBe('dark');
            expect(customPrefs['synced-language']).toBe('fr');
            expect(customPrefs['synced-allowedAudioChannels']).toBeUndefined();
        });

        it('does not overwrite the account when it was already on', () => {
            settings.syncAcrossDevices(true);
            customPrefs['synced-appTheme'] = 'light';
            localStorage.setItem('user-appTheme', 'dark');

            settings.syncAcrossDevices(true);

            expect(customPrefs['synced-appTheme']).toBe('light');
        });
    });

    describe('homeHiddenLibraries', () => {
        it('is empty until libraries are hidden', () => {
            expect(settings.homeHiddenLibraries()).toEqual([]);
        });

        it('round trips the hidden libraries', () => {
            settings.homeHiddenLibraries([ 'a', 'b' ]);

            expect(settings.homeHiddenLibraries()).toEqual([ 'a', 'b' ]);
        });

        it('can be emptied again', () => {
            settings.homeHiddenLibraries([ 'a' ]);
            settings.homeHiddenLibraries([]);

            expect(settings.homeHiddenLibraries()).toEqual([]);
        });
    });
});
