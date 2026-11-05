# Toridame Web

The web client for **Toridame**, a personal fork of [Jellyfin](https://github.com/jellyfin/jellyfin-web) based on **Jellyfin web 12.4**. It is not affiliated with or endorsed by the Jellyfin project.

It is meant to be used with the [Toridame](https://github.com/jt-ito/Toridame) server. Some features here need the server's changes (the watch history controls and the dashboard options).

## What's different from stock Jellyfin web 12.4

**In the player**
- Skip buttons combine rapid presses into one seek, and show a running "+30 seconds" / "−10 seconds" indicator: a pill in the video player, and a short text beside the time in the now-playing bar and on the remote control page.
- A stalled stream is restarted, and play recovers after the app has been in the background for a long time.
- The next button is greyed out when there is no next item (player, now-playing bar and remote control).
- A built-in **episode list** that floats over the player instead of taking the screen: season chips, an expandable preview per episode, play, played and favorite buttons, a version switcher, and optional spoiler blur. It can coexist with the InPlayerEpisodePreview plugin, and it can be turned off entirely. Its other options are under Settings → Playback.
- The modern layout's player header keeps long titles on one line with an ellipsis.

**Watch history** (needs the Toridame server)
- Settings → Playback → **Watch history**: don't save my watch history, clear Continue Watching, clear all watch history.
- **Remove from Continue Watching** for a single item: in the three-dots menu on a video, and in the multi-select menu you get from a long-press on a card.

**Home and settings**
- Hide a library from the home page without removing access to it.
- A toggle to sync display settings across devices.
- Dashboard → Libraries → Display has the server options for post-scan subtitle extraction and the broken-stream warning (both off by default).
- A guard for the dashboard crash caused by `r.map is not a function`.

## Building

Requires Node.js 24 or newer and npm 11 or newer.

```bash
npm ci
```

```bash
npm run build:production
```

The result is in `dist/`. Other useful commands:

```bash
npm run lint
```

```bash
npm run build:check
```

```bash
npm test
```

```bash
npm start
```

## Using it with the server

Copy or point the server at the `dist` folder, for example as a `jellyfin-web` folder next to the server executable, or with the server's `--webdir` option.

## Staying close to upstream

The history starts from an unmodified Jellyfin web 12.4 snapshot, followed by this fork's changes, so `git diff` between the first two commits shows exactly what changed. The original repository is available as the `upstream` remote. The history is not shared with upstream's, so moving to a newer release means re-applying these changes rather than a plain merge.

## License

GPL-2.0, as for Jellyfin. See [LICENSE](LICENSE). Jellyfin is a trademark of its respective owners.
