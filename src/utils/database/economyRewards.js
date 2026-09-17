// Ordinary economy writes may hold a snapshot while an invite claim credits the wallet.
// Carry the observed reward total with snapshots and merge only unseen credits.
export function mergeInviteRewardCredits(current, incoming) {
    const credited = current.inviteRewardCredits ?? 0;
    const observed = incoming.inviteRewardCredits;
    if (!Number.isSafeInteger(credited) || credited < 0 || (observed !== undefined && (!Number.isSafeInteger(observed) || observed < 0 || observed > credited))) {
        throw new Error('Invalid invite reward credit marker');
    }
    const unseen = observed === undefined ? 0 : credited - observed;
    const wallet = (incoming.wallet ?? incoming.balance ?? 0) + unseen;
    if (!Number.isFinite(wallet) || wallet < 0 || wallet > Number.MAX_SAFE_INTEGER) throw new Error('Invalid economy wallet');
    return {...incoming, wallet, inviteRewardCredits:credited};
}

export async function saveEconomyPreservingInviteCredits(pool, table, guildId, userId, incoming) {
    const connection=await pool.connect();
    try {
        await connection.query('BEGIN');
        await connection.query(`INSERT INTO ${table} (guild_id,user_id,balance,bank,data,updated_at)
            VALUES ($1,$2,0,0,'{}',CURRENT_TIMESTAMP) ON CONFLICT (guild_id,user_id) DO NOTHING`,[guildId,userId]);
        const result=await connection.query(`SELECT balance,bank,data FROM ${table} WHERE guild_id=$1 AND user_id=$2 FOR UPDATE`,[guildId,userId]);
        if(!result.rows.length) throw new Error('Economy account disappeared');
        const merged=mergeInviteRewardCredits(result.rows[0].data || {},incoming);
        await connection.query(`UPDATE ${table} SET balance=$3,bank=$4,data=$5,updated_at=CURRENT_TIMESTAMP WHERE guild_id=$1 AND user_id=$2`,[guildId,userId,merged.wallet,merged.bank ?? 0,merged]);
        await connection.query('COMMIT');
        return true;
    } catch(error) {
        await connection.query('ROLLBACK').catch(()=>{});
        throw error;
    } finally { connection.release(); }
}
