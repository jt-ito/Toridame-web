import { useQuery } from '@tanstack/react-query';

import { useApi } from './useApi';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/jt-ito/Toridame/releases/latest';

const parse = (version?: string | null) => (version ?? '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);

/** True if `latest` is a higher dotted version than `current` (e.g. "10.11.3" > "10.11.0"). */
export const isNewerVersion = (latest?: string | null, current?: string | null) => {
    const a = parse(latest);
    const b = parse(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff) return diff > 0;
    }
    return false;
};

/**
 * Latest Toridame release, fetched from GitHub by the browser. Admins only, since only they can act on it.
 * Fails quietly (no result) if GitHub is unreachable.
 */
export const useLatestRelease = () => {
    const { user } = useApi();

    return useQuery({
        queryKey: [ 'LatestRelease' ],
        queryFn: async ({ signal }) => {
            const response = await fetch(LATEST_RELEASE_URL, { signal });
            if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
            const { tag_name: tag, html_url: url } = await response.json();
            // Only ever hand back a link to the project itself, whatever the response says.
            const safeUrl = String(url).startsWith('https://github.com/jt-ito/') ? String(url) : undefined;
            return { version: String(tag).replace(/^v/i, ''), url: safeUrl };
        },
        enabled: !!user?.Policy?.IsAdministrator,
        staleTime: 6 * 60 * 60 * 1000,
        retry: false
    });
};
