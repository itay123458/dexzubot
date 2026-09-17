import { pgConfig } from '../config/database/postgres.js';
import { DEFAULT_ECONOMY_DATA } from '../utils/constants.js';
import { BotConfig } from '../config/bot.js';

export function findRewardInviter(before, after) {
    if (!before) return null;
    const previous = new Map(before.map(invite => [invite.code, invite]));
    const changes = after.filter(invite => !previous.has(invite.code) || invite.uses !== previous.get(invite.code).uses);
    if (changes.length !== 1 || before.some(invite => !after.some(current => current.code === invite.code))) return null;
    const invite = changes[0];
    const old = previous.get(invite.code);
    return old && Number.isInteger(old.uses) && Number.isInteger(invite.uses) && invite.uses - old.uses === 1 && old.inviterId === invite.inviterId ? invite.inviterId : null;
}

export function recordRewardJoin(state, member, inviterId, config, now = Date.now()) {
    const prior = state.members[member.id];
    const eligible = !prior && !member.user.bot && inviterId && inviterId !== member.id
        && Number.isFinite(member.user.createdTimestamp)
        && now - member.user.createdTimestamp >= config.minAccountDays * 86400000;
    state.members[member.id] = {
        inviterId: eligible ? inviterId : null,
        joinedAt: member.joinedTimestamp || now,
        leftAt: null,
        reason: prior ? 'rejoin' : eligible ? null : 'unqualified',
    };
}

export function summarizeRewards(state, userId, config, now = Date.now()) {
    const retained = Object.values(state.members).filter(member => member.inviterId === userId && !member.leftAt);
    const qualifiedInvites = retained.filter(member => now - member.joinedAt >= config.minimumStayHours * 3600000).length;
    const claims = state.claims[userId] || {};
    const milestones = config.milestones.map(milestone => ({...milestone, claimed: Object.hasOwn(claims, String(milestone.invites)), eligible: qualifiedInvites >= milestone.invites}));
    return {qualifiedInvites, pendingInvites: retained.length-qualifiedInvites, milestones,
        claimableCoins: milestones.filter(item => item.eligible && !item.claimed).reduce((sum,item)=>sum+item.coins,0),
        claimedCoins: Object.values(claims).reduce((sum,item)=>sum+item.coins,0)};
}

// A guild lock protects the ledger; PostgreSQL commits the markers and wallet together.
// No memory fallback: rewards must survive a process restart.
export function createInviteRewardsStore(pool) {
    return {
        async transaction(guildId, operation) {
            const connection = await pool.connect();
            try {
                await connection.query('BEGIN');
                await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`beta-invite-rewards:${guildId}`]);
                const key = `beta_invite_rewards:${guildId}`;
                const result = await connection.query(`SELECT value FROM ${pgConfig.tables.temp_data} WHERE key = $1 FOR UPDATE`, [key]);
                const state = result.rows[0]?.value || { members: {}, claims: {} };
                if (!state.members || !state.claims) throw new Error('Invalid invite rewards ledger');
                const credit = async (userId, coins) => {
                    await connection.query(`INSERT INTO ${pgConfig.tables.guilds} (id, created_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`, [guildId]);
                    await connection.query(`INSERT INTO ${pgConfig.tables.users} (id, created_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`, [userId]);
                    const defaults = {...DEFAULT_ECONOMY_DATA, wallet: BotConfig.economy?.startingBalance ?? DEFAULT_ECONOMY_DATA.wallet};
                    await connection.query(`INSERT INTO ${pgConfig.tables.economy} (guild_id, user_id, balance, bank, data, updated_at)
                        VALUES ($1,$2,$3,0,$4,CURRENT_TIMESTAMP) ON CONFLICT (guild_id,user_id) DO NOTHING`, [guildId,userId,defaults.wallet,defaults]);
                    await connection.query(`UPDATE ${pgConfig.tables.economy} SET balance = balance + $3,
                        data = jsonb_set(jsonb_set(COALESCE(data, '{}'::jsonb), '{wallet}', to_jsonb(balance + $3)), '{inviteRewardCredits}', to_jsonb(COALESCE((data->>'inviteRewardCredits')::bigint, 0) + $3)), updated_at = CURRENT_TIMESTAMP
                        WHERE guild_id = $1 AND user_id = $2`, [guildId,userId,coins]);
                };
                const output = await operation(state, credit);
                await connection.query(`INSERT INTO ${pgConfig.tables.temp_data} (key,value,expires_at) VALUES ($1,$2,NULL)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = NULL`, [key,JSON.stringify(state)]);
                await connection.query('COMMIT');
                return output;
            } catch (error) {
                await connection.query('ROLLBACK').catch(() => {});
                throw error;
            } finally { connection.release(); }
        },
    };
}

export async function applyRewardClaim(state, userId, config, credit, now = Date.now()) {
    const summary = summarizeRewards(state, userId, config, now);
    if (!summary.claimableCoins) return {...summary, awardedCoins: 0};
    await credit(userId, summary.claimableCoins);
    state.claims[userId] ||= {};
    for (const milestone of summary.milestones.filter(item => item.eligible && !item.claimed)) {
        state.claims[userId][String(milestone.invites)] = {coins: milestone.coins, claimedAt: now};
    }
    return {...summarizeRewards(state,userId,config,now), awardedCoins: summary.claimableCoins};
}

export async function reconcileRewardMembers(state, guild, userId, now = Date.now()) {
    for (const [id, record] of Object.entries(state.members)) {
        if (record.inviterId !== userId || record.leftAt) continue;
        let member;
        try { member = await guild.members.fetch({user:id,force:true}); }
        catch (error) {
            if (error.code !== 10007) throw error;
            record.leftAt = now;
            continue;
        }
        if (member.user.bot || member.joinedTimestamp !== record.joinedAt) {
            record.inviterId = null;
            record.reason = 'membership_changed';
        }
    }
}



export function seedExistingRewardMembers(state, members, now=Date.now()) {
    for(const member of members) {
        state.members[member.id] ||= {inviterId:null,joinedAt:member.joinedTimestamp || now,leftAt:null,reason:'preexisting'};
    }
}
