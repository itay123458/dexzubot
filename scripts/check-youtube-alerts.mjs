// Isolated regression checks: mocked HTTP, in-memory storage, no Discord login.
import assert from 'node:assert/strict';
import axios from 'axios';
import { parseChannelUploads, selectPageUploads } from '../src/services/youtubeDiscovery.js';
import { checkGuild, pollYouTubeAlerts, YOUTUBE_CHANNEL_ID } from '../src/services/youtubeAlertService.js';

const old = 'oldVideo001', fresh = 'newVideo002';
const page = ids => `<script>var ytInitialData = ${JSON.stringify({
    metadata: { channelMetadataRenderer: { externalId: YOUTUBE_CHANNEL_ID } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: {
        items: ids.map(id => ({ lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: id, metadata: { lockupMetadataViewModel: { title: { content: id } } } } })),
    } } }] } },
})};</script>`;
const videos = parseChannelUploads(page([fresh, old]), YOUTUBE_CHANNEL_ID);
assert.equal(videos.length, 2);
assert.throws(() => parseChannelUploads(page([old]), 'wrong-channel'));
assert.throws(() => parseChannelUploads('<html>Consent required</html>', YOUTUBE_CHANNEL_ID));
assert.equal(selectPageUploads({ videos }, {}, []).candidates.length, 0, 'First sight must not backfill');
assert.deepEqual(selectPageUploads({ videos }, { videos: [old] }, []).candidates.map(v => v.id), [fresh]);
assert.deepEqual(selectPageUploads({ videos }, {}, [old]).candidates.map(v => v.id), [fresh]);

const guildId = '1533088766821007390';
const historyKey = `temp:youtube-alert-history:${guildId}`;
const configKey = `guild:${guildId}:config`;
const data = new Map([[configKey, { youtubeAlert: { enabled: true, channelId: '1533088767441637398', lastVideoId: old } }], [historyKey, { videoIds: [old], deliveries: [], updatedAt: new Date().toISOString() }]]);
const sent = [];
let fail = false;
const channel = { id: '1533088767441637398', isTextBased: () => true,
    client: { user: { id: 'bot', displayAvatarURL: () => 'https://example.com/avatar.png' } },
    messages: { fetch: async () => [] },
    send: async payload => { if (fail) throw new Error('Simulated Discord failure'); sent.push(payload); return { id: String(sent.length) }; },
};
const guild = { id: guildId, channels: { fetch: async () => channel } };
const client = { guilds: { cache: new Map([[guildId, guild]]) }, db: {
    get: async (key, fallback) => structuredClone(data.get(key) ?? fallback),
    set: async (key, value) => { data.set(key, structuredClone(value)); return true; },
} };
const originalGet = axios.get;
try {
    axios.get = async url => {
        if (url.includes('/feeds/')) throw new Error('HTTP 404');
        return { data: page([fresh, old]) };
    };
    await Promise.all([pollYouTubeAlerts(client), pollYouTubeAlerts(client)]);
    assert.equal(sent.length, 1, '404 fallback + concurrent poll sends once');
    await pollYouTubeAlerts(client);
    await pollYouTubeAlerts({ ...client });
    assert.equal(sent.length, 1, 'Persistent history prevents repeats after restart');
    assert.equal(data.get(historyKey).lastError, null);
    const next = parseChannelUploads(page(['nextVideo03', fresh, old]), YOUTUBE_CHANNEL_ID);
    const batch = []; batch.discoveryGroups = { videos: next };
    fail = true;
    await checkGuild(client, guild, batch);
    assert.equal(data.get(historyKey).deliveries[0].status, 'failed');
    fail = false;
    data.get(historyKey).deliveries[0].nextRetryAt = null;
    await checkGuild({ ...client }, guild, []);
    assert.equal(sent.length, 2, 'Failed page discovery survives restart and retries without source');
    assert.equal(data.get(historyKey).deliveries[0].status, 'sent');
    axios.get = async () => { throw new Error('offline'); };
    await pollYouTubeAlerts(client);
    assert.match(data.get(historyKey).lastError, /All YouTube discovery sources failed/);
    assert.equal(sent.length, 2);
    console.log('PASS: parsing, identity guard, safe baseline, feed-404 fallback, concurrent polls, restart deduplication, persistent retry, total outage');
} finally { axios.get = originalGet; }
