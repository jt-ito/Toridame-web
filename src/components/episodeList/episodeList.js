/**
 * In-player list for jumping to another item without leaving the player.
 *
 * - Episodes: every season of the series, one group per season.
 * - Movies and videos: the play queue, the folders around the video, and any collection or playlist containing it.
 * - Videos with several versions: version switching that keeps the playback position.
 *
 * Idea and feature set based on the InPlayerEpisodePreview plugin by Namo2 (MIT).
 * @module components/episodeList/episodeList
 */

import escapeHtml from 'escape-html';

import actionSheet from 'components/actionSheet/actionSheet';
import { TICKS_PER_MINUTE } from 'constants/time';
import dialogHelper from 'components/dialogHelper/dialogHelper';
import itemHelper from 'components/itemHelper';
import loading from 'components/loading/loading';
import { playbackManager } from 'components/playback/playbackmanager';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import globalize from 'lib/globalize';
import datetime from 'scripts/datetime';
import dom from 'utils/dom';

import { getEpisodeListSettings, log } from './episodeListSettings';

import 'elements/emby-button/paper-icon-button-light';
import 'elements/emby-playstatebutton/emby-playstatebutton';
import 'elements/emby-ratingbutton/emby-ratingbutton';
import 'elements/emby-select/emby-select';
import './episodeList.scss';

const LIST_FIELDS = 'Overview,PrimaryImageAspectRatio,MediaSourceCount';
const IMAGE_TYPES = 'Primary,Backdrop,Thumb';

// Finding which collections contain a movie means listing every collection's members, so remember it for a while.
const COLLECTION_CACHE_MS = 5 * 60 * 1000;
const collectionCache = new Map();

// Caps so a huge library can't turn one click into thousands of requests or a list too big to render.
const MAX_COLLECTIONS = 200;
const MAX_SUBFOLDERS = 50;
const MAX_LIST_ITEMS = 500;
const MAX_QUEUE_ITEMS = 300;
const MAX_EPISODES = 3000;
const MAX_PLAY_ITEMS = 100;
const REQUEST_BATCH_SIZE = 8;

// Library roots and the like are folders too, but are not "the folder a movie lives in".
const NON_MOVIE_FOLDER_TYPES = [ 'CollectionFolder', 'UserRootFolder', 'AggregateFolder' ];

const isVideo = item => item.Type === 'Video' || item.Type === 'Movie';
const isSubfolder = item => item.Type === 'Folder';

/** Translated text for use in generated HTML. */
const t = (key) => escapeHtml(globalize.translate(key));

/** Runs the requests in small batches instead of firing all of them at once (the server may be a slow one). */
async function mapInBatches(items, mapper) {
    const results = [];
    for (let i = 0; i < items.length; i += REQUEST_BATCH_SIZE) {
        results.push(...await Promise.all(items.slice(i, i + REQUEST_BATCH_SIZE).map(mapper)));
    }
    return results;
}

/** @typedef {{ id: string, name: string, items: object[] }} Group */

function getStats(items) {
    let played = 0;
    let ticks = 0;
    let playedTicks = 0;

    for (const item of items) {
        const runtime = item.RunTimeTicks || 0;
        ticks += runtime;

        if (item.UserData?.Played) {
            played++;
            playedTicks += runtime;
        } else {
            playedTicks += item.UserData?.PlaybackPositionTicks || 0;
        }
    }

    return { played, total: items.length, playedTicks, ticks };
}

function formatDuration(ticks) {
    const minutes = Math.round(ticks / TICKS_PER_MINUTE);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** How far through a group the user is, in the form the settings ask for. */
function getProgressText(group, watchCountMode) {
    const { played, total, playedTicks, ticks } = getStats(group.items);

    if (watchCountMode === 'count') {
        return `${played}/${total}`;
    }

    return watchCountMode === 'time' ? `${formatDuration(playedTicks)} / ${formatDuration(ticks)}` : '';
}

/** One group per season of the item's series (empty seasons are skipped, except the current one). */
async function getEpisodeGroups(apiClient, item, settings) {
    const userId = apiClient.getCurrentUserId();
    // Missing and unaired episodes are only listed when asked for.
    const isMissing = settings.showMissing ? undefined : false;
    const [ seasons, episodes ] = await Promise.all([
        apiClient.getSeasons(item.SeriesId, { userId, isMissing }),
        // One request for the whole series: seasons are grouped client-side so every group can show its watched progress.
        apiClient.getEpisodes(item.SeriesId, { userId, isMissing, Limit: MAX_EPISODES, Fields: LIST_FIELDS, EnableImageTypes: IMAGE_TYPES })
    ]);

    const bySeason = new Map();
    for (const episode of episodes.Items) {
        if (!bySeason.has(episode.SeasonId)) {
            bySeason.set(episode.SeasonId, []);
        }
        bySeason.get(episode.SeasonId).push(episode);
    }

    const groups = seasons.Items
        .filter(season => bySeason.has(season.Id) || season.Id === item.SeasonId)
        .map(season => ({ id: season.Id, name: season.Name, items: bySeason.get(season.Id) || [] }));

    // Episodes that don't belong to a listed season (e.g. a series without seasons)
    return groups.length ? groups : [{ id: item.SeriesId, name: item.SeriesName, items: episodes.Items }];
}

/** The current play queue, when something other than just this video is queued. */
async function getQueueGroup(apiClient, queue, currentId) {
    if (!queue || queue.length < 2) {
        return null;
    }

    // The ids go into the request URL, so only ask for a window around the playing item.
    const current = Math.max(0, queue.findIndex(queued => queued.Id === currentId));
    const start = Math.max(0, Math.min(current - 50, queue.length - MAX_QUEUE_ITEMS));
    const ids = queue.slice(start, start + MAX_QUEUE_ITEMS).map(queued => queued.Id);
    const { Items: items } = await apiClient.getItems(apiClient.getCurrentUserId(), {
        Ids: ids.join(','),
        Fields: LIST_FIELDS,
        EnableImageTypes: IMAGE_TYPES
    });
    items.sort((a, b) => ids.indexOf(a.Id) - ids.indexOf(b.Id));

    return { id: 'queue', name: globalize.translate('PlayQueue'), items };
}

async function getChildren(apiClient, parentId) {
    const { Items: children } = await apiClient.getItems(apiClient.getCurrentUserId(), {
        ParentId: parentId,
        SortBy: 'SortName',
        Limit: MAX_LIST_ITEMS,
        Fields: LIST_FIELDS,
        EnableImageTypes: IMAGE_TYPES
    });
    return children;
}

/**
 * Lists a stacked video's additional parts (e.g. files named "Part 1"/"Part 2" that are merged into one
 * library item) right after it, so each part can be started on its own.
 */
async function expandAdditionalParts(apiClient, items) {
    const userId = apiClient.getCurrentUserId();
    const partsById = new Map(await mapInBatches(items.filter(item => item.PartCount > 1), async item => {
        const { Items: parts } = await apiClient.getAdditionalVideoParts(userId, item.Id);
        return [ item.Id, parts ];
    }));

    return items.flatMap(item => [ item, ...(partsById.get(item.Id) ?? []) ]);
}

/** One group per subfolder (plus the loose videos), the way the library is laid out on disk. */
async function buildFolderGroups(apiClient, children, looseVideosGroupId) {
    const folders = children.filter(isSubfolder);
    if (folders.length > MAX_SUBFOLDERS) {
        log('warn', `listing only the first ${MAX_SUBFOLDERS} of ${folders.length} folders`);
    }

    const subfolders = await mapInBatches(folders.slice(0, MAX_SUBFOLDERS), async folder => ({
        folder,
        videos: (await getChildren(apiClient, folder.Id)).filter(isVideo)
    }));

    const groups = subfolders
        .filter(({ videos }) => videos.length)
        .map(({ folder, videos }) => ({ id: folder.Id, name: folder.Name, items: videos }));

    const looseVideos = children.filter(isVideo);
    if (looseVideos.length) {
        groups.push({ id: looseVideosGroupId, name: globalize.translate('EpisodeListVideos'), items: looseVideos });
    }

    return groups;
}

async function getFolderGroups(apiClient, folder) {
    const children = await getChildren(apiClient, folder.Id);

    if (children.some(isSubfolder)) {
        return buildFolderGroups(apiClient, children, folder.Id);
    }

    if (folder.ParentId) {
        const parent = await apiClient.getItem(apiClient.getCurrentUserId(), folder.ParentId);
        if (parent?.IsFolder) {
            return buildFolderGroups(apiClient, await getChildren(apiClient, parent.Id), parent.Id);
        }
    }

    return [{ id: folder.Id, name: folder.Name, items: children.filter(isVideo) }];
}

/**
 * Groups for the folder around a video: other videos of a home-video folder, or (when enabled) the other
 * videos in the folder of a movie.
 */
async function getVideoFolderGroups(apiClient, item, settings) {
    if (!item.ParentId) {
        return [];
    }

    const parent = await apiClient.getItem(apiClient.getCurrentUserId(), item.ParentId);
    if (!parent?.IsFolder) {
        return [];
    }

    let groups = [];
    if (item.Type === 'Video') {
        groups = await getFolderGroups(apiClient, parent);
    } else if (item.Type === 'Movie' && settings.movieFolderSiblings && !NON_MOVIE_FOLDER_TYPES.includes(parent.Type)) {
        const videos = (await getChildren(apiClient, parent.Id)).filter(isVideo);
        if (videos.length > 1) {
            groups = [{ id: parent.Id, name: parent.Name, items: videos }];
        }
    }

    if (settings.additionalParts) {
        await Promise.all(groups.map(async group => {
            group.items = await expandAdditionalParts(apiClient, group.items);
        }));
    }

    return groups;
}

async function getCollections(apiClient) {
    const userId = apiClient.getCurrentUserId();
    const cached = collectionCache.get(userId);
    if (cached && Date.now() - cached.at < COLLECTION_CACHE_MS) {
        return cached.collections;
    }

    const { Items: all } = await apiClient.getItems(userId, {
        IncludeItemTypes: 'BoxSet,Playlist',
        Recursive: true,
        SortBy: 'SortName',
        Limit: MAX_COLLECTIONS,
        Fields: '',
        EnableImages: false,
        EnableUserData: false
    });

    if (all.length >= MAX_COLLECTIONS) {
        log('warn', `only the first ${MAX_COLLECTIONS} collections are searched`);
    }

    const collections = await mapInBatches(all, async collection => {
        const { Items: members } = await apiClient.getItems(userId, {
            ParentId: collection.Id,
            Fields: '',
            EnableImages: false,
            EnableUserData: false
        });
        return { id: collection.Id, name: collection.Name, type: collection.Type, memberIds: new Set(members.map(m => m.Id)) };
    });
    collections.sort((a, b) => a.name.localeCompare(b.name));

    log('debug', `scanned ${collections.length} collections`);
    collectionCache.set(userId, { at: Date.now(), collections });
    return collections;
}

/** One group for every collection or playlist that contains the item. */
async function getContainingCollectionGroups(apiClient, item) {
    const userId = apiClient.getCurrentUserId();
    const containing = (await getCollections(apiClient)).filter(collection => collection.memberIds.has(item.Id));

    return Promise.all(containing.map(async collection => {
        const { Items: items } = await apiClient.getItems(userId, {
            ParentId: collection.id,
            // Collections read best in release order; playlists keep the order the user gave them.
            SortBy: collection.type === 'BoxSet' ? 'PremiereDate,ProductionYear,SortName' : undefined,
            Fields: LIST_FIELDS,
            EnableImageTypes: IMAGE_TYPES
        });
        return { id: collection.id, name: collection.name, items };
    }));
}

function playVersion(item, mediaSourceId, startPositionTicks) {
    playbackManager.play({
        ids: [item.Id],
        serverId: item.ServerId,
        mediaSourceId,
        startPositionTicks
    });
}

/** Let the user switch the playing video to another version without losing their place. */
function setUpVersionSwitcher(dlg, item, sources, options) {
    if (!sources || sources.length < 2) {
        return;
    }

    const select = dlg.querySelector('.selectVersion');
    select.innerHTML = sources
        .map(source => `<option value="${escapeHtml(source.Id)}">${escapeHtml(source.Name)}</option>`)
        .join('');
    select.value = options.mediaSourceId || sources[0].Id;
    dlg.querySelector('.fldVersion').classList.remove('hide');

    select.addEventListener('change', () => {
        playVersion(item, select.value, options.getPositionTicks?.() ?? 0);
        dialogHelper.close(dlg);
    });
}

/** Ask which version of a listed item to play. */
async function chooseVersionAndPlay(apiClient, listed, current, options) {
    const { MediaSources: sources } = await apiClient.getItem(apiClient.getCurrentUserId(), listed.Id);
    if (!sources?.length) {
        return false;
    }

    const isCurrent = listed.Id === current.Id;

    let mediaSourceId;
    try {
        mediaSourceId = await actionSheet.show({
            title: globalize.translate('LabelVersion'),
            items: sources.map(source => ({
                id: source.Id,
                name: source.Name,
                selected: isCurrent && source.Id === options.mediaSourceId
            }))
        });
    } catch {
        return false; // dismissed
    }

    playVersion(listed, mediaSourceId, isCurrent ? options.getPositionTicks?.() ?? 0 : undefined);
    return true;
}

/** The picture shown in a row's preview: a still for episodes, otherwise the widest image the item has. */
function getThumbnailUrl(apiClient, listed) {
    const tags = listed.ImageTags || {};
    const image = (type, tag, extra) => apiClient.getScaledImageUrl(listed.Id, { type, tag, maxWidth: 480, ...extra });

    if (tags.Primary && (listed.Type === 'Episode' || listed.PrimaryImageAspectRatio > 1.2)) {
        return image('Primary', tags.Primary);
    }
    if (tags.Thumb) {
        return image('Thumb', tags.Thumb);
    }
    if (listed.BackdropImageTags?.length) {
        return image('Backdrop', listed.BackdropImageTags[0]);
    }

    return tags.Primary ? image('Primary', tags.Primary) : null;
}

/** "Ends at 14:19", for when it is started now. */
function getEndsAtText(listed) {
    const remaining = (listed.RunTimeTicks || 0) - (listed.UserData?.PlaybackPositionTicks || 0);
    if (remaining <= 0) {
        return '';
    }

    return globalize.translate('EndsAtValue', datetime.getDisplayTime(new Date(Date.now() + remaining / 10000)));
}

function getPreviewHtml(apiClient, listed, settings) {
    const date = listed.PremiereDate ? datetime.toLocaleDateString(datetime.parseISO8601Date(listed.PremiereDate, true)) : '';
    const runtime = listed.RunTimeTicks ? formatDuration(listed.RunTimeTicks) : '';
    const meta = [ date, runtime, getEndsAtText(listed) ]
        .filter(Boolean)
        .map(text => `<span>${escapeHtml(text)}</span>`)
        .join('');

    const thumbnailUrl = getThumbnailUrl(apiClient, listed);
    const thumbnail = thumbnailUrl ? `<img class="episodeListPreviewImage" src="${escapeHtml(thumbnailUrl)}" alt="" loading="lazy">` : '';
    const overview = settings.showDescription && listed.Overview ? `<p class="episodeListOverview">${escapeHtml(listed.Overview)}</p>` : '';

    return `
        <div class="episodeListMeta">${meta}</div>
        <div class="episodeListPreviewBody">${thumbnail}${overview}</div>`;
}

function getUserDataButtonsHtml(listed) {
    const userData = listed.UserData || {};
    const attributes = `data-id="${escapeHtml(listed.Id)}" data-serverid="${escapeHtml(listed.ServerId)}" data-itemtype="${escapeHtml(listed.Type)}"`;
    let html = '';

    if (itemHelper.canMarkPlayed(listed)) {
        html += `<button is="emby-playstatebutton" type="button" class="paper-icon-button-light" ${attributes} data-played="${!!userData.Played}"><span class="material-icons check" aria-hidden="true"></span></button>`;
    }

    if (itemHelper.canRate(listed)) {
        html += `<button is="emby-ratingbutton" type="button" class="paper-icon-button-light" ${attributes} data-likes="${userData.Likes ?? ''}" data-isfavorite="${!!userData.IsFavorite}"><span class="material-icons favorite" aria-hidden="true"></span></button>`;
    }

    return html;
}

function getRowHtml(listed, isCurrent, showIndex, settings) {
    const userData = listed.UserData || {};
    const percentage = Math.round(Math.min(100, userData.PlayedPercentage || 0));
    const showProgress = settings.showProgress && !userData.Played && percentage > 0;
    const index = showIndex && listed.IndexNumber != null ? `<span class="episodeListIndex">${escapeHtml(String(listed.IndexNumber))}</span>` : '';
    const versions = settings.alternateVersions && listed.MediaSourceCount > 1 ?
        `<button is="paper-icon-button-light" class="btnItemVersions" title="${t('LabelVersion')}"><span class="material-icons layers" aria-hidden="true"></span></button>` : '';

    const classes = [ 'episodeListRow', isCurrent && 'is-current', userData.Played && 'is-played' ].filter(Boolean).join(' ');
    const blur = !settings.blurOnlyUnwatched || !userData.Played ? ' data-blur' : '';

    return `
        <div class="${classes}" data-id="${escapeHtml(listed.Id)}"${blur}>
            <div class="episodeListRowHeader focusable" role="button" tabindex="0" aria-expanded="false">
                ${index}
                <span class="episodeListName">${escapeHtml(listed.Name)}</span>
                <span class="episodeListActions">
                    <button is="paper-icon-button-light" class="btnPlayItem" title="${t('Play')}"${isCurrent ? ' disabled' : ''}><span class="material-icons play_arrow" aria-hidden="true"></span></button>
                    ${versions}
                    ${getUserDataButtonsHtml(listed)}
                </span>
            </div>
            <div class="episodeListPreview"></div>
            ${showProgress ? `<div class="episodeListProgress"><div style="width: ${percentage}%"></div></div>` : ''}
        </div>`;
}

/** Opens the preview of one row and closes the others. */
function setExpanded(container, apiClient, items, settings, expandedId) {
    const itemsById = new Map(items.map(i => [i.Id, i]));

    for (const row of container.querySelectorAll('.episodeListRow')) {
        const isExpanded = row.getAttribute('data-id') === expandedId;
        const listed = itemsById.get(row.getAttribute('data-id'));

        row.classList.toggle('is-expanded', isExpanded);
        row.querySelector('.episodeListRowHeader').setAttribute('aria-expanded', String(isExpanded));
        row.querySelector('.episodeListPreview').innerHTML = isExpanded && listed ? getPreviewHtml(apiClient, listed, settings) : '';
    }
}

function renderItems(dlg, apiClient, group, item, settings) {
    const container = dlg.querySelector('.episodeListItems');
    const isEpisode = item.Type === 'Episode';

    container.innerHTML = group.items.length ?
        group.items.map(listed => getRowHtml(listed, listed.Id === item.Id, isEpisode, settings)).join('') :
        `<p class="episodeListEmpty">${t('EpisodeListNothing')}</p>`;

    // The playing item opens in full, the way you would want to look it up.
    const current = group.items.find(listed => listed.Id === item.Id);
    setExpanded(container, apiClient, group.items, settings, current?.Id);

    const scroller = dlg.querySelector('.episodeListScroller');
    const currentRow = container.querySelector('.is-current');
    if (currentRow) {
        scroller.scrollTop = Math.max(0, currentRow.offsetTop - scroller.clientHeight / 3);
    } else {
        scroller.scrollTop = 0;
    }
}

/** Start a listed item. Episodes carry on into the next ones; other videos play on from the chosen one. */
function playListed(listed, group, isEpisode) {
    const startPositionTicks = listed.UserData?.PlaybackPositionTicks || 0;
    const index = Math.max(0, group.items.findIndex(i => i.Id === listed.Id));
    const ids = isEpisode ? [ listed.Id ] : group.items.slice(index, index + MAX_PLAY_ITEMS).map(i => i.Id);

    playbackManager.play({ ids, serverId: listed.ServerId, startPositionTicks });
}

/**
 * Show the list for the video that is currently playing.
 * @param {object} item The item being played.
 * @param {object} [options] Playback details.
 * @param {string} [options.mediaSourceId] The version being played.
 * @param {function(): number} [options.getPositionTicks] Returns the current playback position in ticks.
 * @returns {Promise<void>} Resolves when the panel is closed.
 */
export default async function showEpisodeList(item, options = {}) {
    if (!item) {
        return;
    }

    const apiClient = ServerConnections.getApiClient(item.ServerId);
    const isEpisode = item.Type === 'Episode' && !!item.SeriesId;
    const settings = getEpisodeListSettings();
    log('debug', 'opening for', item.Type, item.Id);

    // No fixed size: a sized dialog turns into a full-screen page on anything but a big window.
    const dlg = dialogHelper.createDialog({
        removeOnClose: true,
        scrollY: false,
        entryAnimationDuration: 140
    });
    dlg.classList.add('episodeListDialog');
    if (settings.blur === 'description' || settings.blur === 'both') {
        dlg.classList.add('episodeListDialog--blurDescription');
    }
    if (settings.blur === 'thumbnail' || settings.blur === 'both') {
        dlg.classList.add('episodeListDialog--blurThumbnail');
    }
    if (settings.layout === 'sideBySide') {
        dlg.classList.add('episodeListDialog--sideBySide');
    }
    if (!settings.showProgress) {
        dlg.classList.add('episodeListDialog--hideProgress');
    }

    const rawTitle = isEpisode ? item.SeriesName : item.Name;
    const dialogTitle = rawTitle ? escapeHtml(rawTitle) : t('Episodes');

    dlg.innerHTML = `
        <div class="episodeListHeader">
            <button is="paper-icon-button-light" class="btnCancel" title="${t('ButtonBack')}">
                <span class="material-icons arrow_back" aria-hidden="true"></span>
            </button>
            <h2 class="episodeListTitle">${dialogTitle}</h2>
            <span class="episodeListStats hide"></span>
        </div>
        <div class="episodeListGroups hide"></div>
        <div class="selectContainer fldVersion hide">
            <select is="emby-select" class="selectVersion" label="${t('LabelVersion')}"></select>
        </div>
        <div class="episodeListScroller">
            <div class="episodeListItems"></div>
        </div>`;

    const groupsElement = dlg.querySelector('.episodeListGroups');
    const statsElement = dlg.querySelector('.episodeListStats');
    const container = dlg.querySelector('.episodeListItems');
    let groups = [];
    let selectedGroupId;
    let isClosed = false;
    dlg.addEventListener('close', () => {
        isClosed = true;
    });

    const getSelectedGroup = () => groups.find(group => group.id === selectedGroupId) ?? { items: [] };

    // Rebuild the group chips while keeping the selection (more groups can arrive after the first render).
    const showGroups = (selectedId) => {
        selectedGroupId = selectedId ?? groups[0]?.id;
        const selected = getSelectedGroup();

        groupsElement.innerHTML = groups
            .map(group => `<button type="button" class="episodeListChip${group.id === selectedGroupId ? ' is-selected' : ''}" data-group-id="${escapeHtml(group.id)}">${escapeHtml(group.name)}</button>`)
            .join('');
        groupsElement.classList.toggle('hide', groups.length < 2);
        groupsElement.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest', inline: 'center' });

        const progress = selected.items ? getProgressText(selected, settings.watchCount) : '';
        statsElement.innerHTML = progress ? `<span class="material-icons task_alt" aria-hidden="true"></span>${escapeHtml(progress)}` : '';
        statsElement.classList.toggle('hide', !progress);

        renderItems(dlg, apiClient, selected, item, settings);
    };

    groupsElement.addEventListener('click', e => {
        const chip = dom.parentWithClass(e.target, 'episodeListChip');
        if (chip) {
            showGroups(chip.getAttribute('data-group-id'));
        }
    });

    const findListed = (element) => {
        const id = dom.parentWithClass(element, 'episodeListRow')?.getAttribute('data-id');
        return getSelectedGroup().items.find(i => i.Id === id);
    };

    // Picking a version of a listed item.
    container.addEventListener('click', e => {
        const button = dom.parentWithClass(e.target, 'btnItemVersions');
        const listed = button && findListed(button);
        if (!listed) {
            return;
        }

        chooseVersionAndPlay(apiClient, listed, item, options)
            .then(played => played && dialogHelper.close(dlg))
            .catch(err => log('error', 'failed to switch version', err));
    });

    container.addEventListener('click', e => {
        const play = dom.parentWithClass(e.target, 'btnPlayItem');
        if (play) {
            const listed = findListed(play);
            if (listed && !play.disabled) {
                playListed(listed, getSelectedGroup(), isEpisode);
                if (settings.autoClose) {
                    dialogHelper.close(dlg);
                }
            }
            return;
        }

        // The played, favorite and version buttons do their own thing; the rest of a row opens or closes its preview.
        const header = dom.parentWithClass(e.target, 'episodeListRowHeader');
        if (header && !dom.parentWithClass(e.target, 'episodeListActions')) {
            toggleRow(header);
        }
    });

    container.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('episodeListRowHeader')) {
            e.preventDefault();

            // The player listens for these keys on the document too, where Space pauses the video.
            e.stopPropagation();
            toggleRow(e.target);
        }
    });

    function toggleRow(header) {
        const row = dom.parentWithClass(header, 'episodeListRow');
        const id = row.getAttribute('data-id');
        setExpanded(container, apiClient, getSelectedGroup().items, settings, row.classList.contains('is-expanded') ? null : id);
    }

    dlg.querySelector('.btnCancel').addEventListener('click', () => dialogHelper.close(dlg));

    const opened = dialogHelper.open(dlg);

    let fullItem = item;
    loading.show();
    try {
        // The playing item as the server knows it: parent folder and versions.
        fullItem = await apiClient.getItem(apiClient.getCurrentUserId(), item.Id);

        if (isEpisode) {
            groups = await getEpisodeGroups(apiClient, item, settings);
            showGroups(item.SeasonId || groups[0]?.id);
        } else {
            const queueGroup = await getQueueGroup(apiClient, await playbackManager.getPlaylist(), item.Id);
            groups = queueGroup ? [queueGroup] : [];
            groups.push(...await getVideoFolderGroups(apiClient, fullItem, settings));

            const initial = groups.find(group => group.id === 'queue') ?? groups.find(group => group.items.some(i => i.Id === item.Id)) ?? groups[0];
            showGroups(initial?.id);
        }
    } catch (err) {
        log('error', 'failed to load items', err);
    } finally {
        loading.hide();
    }

    if (settings.alternateVersions) {
        setUpVersionSwitcher(dlg, item, fullItem.MediaSources, options);
    }

    if (!isEpisode && settings.searchCollections) {
        getContainingCollectionGroups(apiClient, item)
            .then(collectionGroups => {
                if (isClosed || !collectionGroups.length) {
                    return;
                }

                groups = [...groups, ...collectionGroups];
                showGroups(selectedGroupId || groups[0].id);
            })
            .catch(err => log('error', 'failed to load collections', err));
    }

    return opened;
}
