import axios from 'axios';

// Public channel-page data is a fallback, not an official stable API. Fail closed
// if YouTube changes its structure or redirects to another channel/consent page.
export function parseChannelUploads(html, channelId) {
    const match = String(html).match(/(?:var\s+ytInitialData\s*=|window\["ytInitialData"\]\s*=)\s*(\{.*?\});\s*<\/script>/s);
    if (!match) throw new Error('YouTube channel data is unavailable');
    const data = JSON.parse(match[1]);
    if (data.metadata?.channelMetadataRenderer?.externalId !== channelId) throw new Error('YouTube channel identity could not be verified');
    const videos = new Map();
    const add = (id, title) => {
        if (/^[\w-]{11}$/.test(id || '') && title && !videos.has(id)) videos.set(id, {
            id, title, url: `https://www.youtube.com/watch?v=${id}`,
            thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            // Do not invent a publication timestamp from relative UI text.
            publishedAt: '',
        });
    };
    const walk = value => {
        if (!value || typeof value !== 'object') return;
        const classic = value.videoRenderer;
        if (classic && !classic.upcomingEventData) add(classic.videoId, classic.title?.runs?.map(run => run.text).join('') || classic.title?.simpleText);
        const modern = value.lockupViewModel;
        if (modern?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') add(modern.contentId, modern.metadata?.lockupMetadataViewModel?.title?.content);
        const short = value.shortsLockupViewModel;
        if (short) add(short.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId, short.overlayMetadata?.primaryText?.content || short.accessibilityText?.split(', ')[0]);
        for (const child of Object.values(value)) if (typeof child === 'object') walk(child);
    };
    // Only the selected upload tab; never include recommendations or menus.
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
    const selected = tabs?.find(tab => tab.tabRenderer?.selected)?.tabRenderer;
    if (!selected?.content) throw new Error('YouTube upload tab is unavailable');
    walk(selected.content);
    if (!videos.size) throw new Error('YouTube upload tab contained no recognizable videos');
    return [...videos.values()].slice(0, 30);
}

export async function fetchChannelUploads(channelId, tab) {
    const response = await axios.get(`https://www.youtube.com/channel/${channelId}/${tab}`, {
        responseType: 'text', timeout: 10_000, maxContentLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': 'DexzuBot/1.0', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    return parseChannelUploads(response.data, channelId);
}

export function selectPageUploads(groups, previousGroups, postedIds) {
    const snapshots = { ...previousGroups };
    const candidates = [];
    for (const [tab, videos] of Object.entries(groups)) {
        const previous = previousGroups[tab];
        const known = new Set(previous || postedIds);
        const anchor = videos.findIndex(video => known.has(video.id));
        // No common anchor: establish a baseline rather than backfilling old
        // uploads or guessing their age. Failed deliveries are retried separately.
        if (anchor >= 0) candidates.push(...videos.slice(0, anchor));
        snapshots[tab] = videos.map(video => video.id);
    }
    return { snapshots, candidates };
}
