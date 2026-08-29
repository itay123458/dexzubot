import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { addMoney, getEconomyData, removeMoney, setEconomyData } from '../../utils/economy.js';
import { createError, ErrorTypes } from '../../utils/errorHandler.js';
import economyDashboard from './modules/economy_dashboard.js';

const accountChoices = [
    { name: 'Wallet', value: 'wallet' },
    { name: 'Bank', value: 'bank' },
];

function addTargetAndAmountOptions(subcommand, action) {
    return subcommand
        .addUserOption(option =>
            option.setName('user').setDescription(`User whose balance will be ${action}`).setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount').setDescription('Amount of money').setMinValue(1).setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('account')
                .setDescription('Balance to update')
                .addChoices(...accountChoices)
                .setRequired(false)
        );
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Staff economy management commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand.setName('dashboard').setDescription('Open the economy management dashboard')
        )
        .addSubcommand(subcommand =>
            addTargetAndAmountOptions(
                subcommand.setName('give').setDescription('Give money to a user'),
                'increased',
            )
        )
        .addSubcommand(subcommand =>
            addTargetAndAmountOptions(
                subcommand.setName('take').setDescription('Take money from a user'),
                'decreased',
            )
        )
        .addSubcommand(subcommand =>
            addTargetAndAmountOptions(
                subcommand.setName('set').setDescription('Set a user balance to an exact amount'),
                'set',
            )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset a user wallet and bank balance')
                .addUserOption(option =>
                    option.setName('user').setDescription('User whose balance will be reset').setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('confirm')
                        .setDescription('Confirm that both balances should be reset')
                        .setRequired(true)
                )
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'dashboard') {
            return await economyDashboard.execute(interaction, config, client);
        }

        const target = interaction.options.getUser('user', true);
        if (target.bot) {
            throw createError('Bot economy target', ErrorTypes.VALIDATION, 'Bots do not have economy accounts.');
        }

        const account = interaction.options.getString('account') || 'wallet';
        const amount = interaction.options.getInteger('amount');
        let newBalance;

        if (subcommand === 'give') {
            ({ newBalance } = await addMoney(client, interaction.guildId, target.id, amount, account));
        } else if (subcommand === 'take') {
            ({ newBalance } = await removeMoney(client, interaction.guildId, target.id, amount, account));
        } else if (subcommand === 'set') {
            const data = await getEconomyData(client, interaction.guildId, target.id);
            data[account] = amount;
            if (!await setEconomyData(client, interaction.guildId, target.id, data)) {
                throw createError('Economy balance update failed', ErrorTypes.DATABASE, 'Failed to update the balance.');
            }
            newBalance = amount;
        } else if (subcommand === 'reset') {
            if (!interaction.options.getBoolean('confirm', true)) {
                throw createError('Economy reset not confirmed', ErrorTypes.VALIDATION, 'Reset cancelled because confirmation was not provided.');
            }

            const data = await getEconomyData(client, interaction.guildId, target.id);
            data.wallet = 0;
            data.bank = 0;
            if (!await setEconomyData(client, interaction.guildId, target.id, data)) {
                throw createError('Economy balance reset failed', ErrorTypes.DATABASE, 'Failed to reset the balance.');
            }

            logger.info('[ECONOMY_ADMIN] Balance reset', {
                staffId: interaction.user.id,
                targetUserId: target.id,
                guildId: interaction.guildId,
            });
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Balance Reset', `Reset ${target}'s wallet and bank balance to **$0**.`)],
            });
        }

        logger.info('[ECONOMY_ADMIN] Balance updated', {
            action: subcommand,
            staffId: interaction.user.id,
            targetUserId: target.id,
            guildId: interaction.guildId,
            account,
            amount,
            newBalance,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                'Balance Updated',
                `${target}'s ${account} balance is now **$${newBalance.toLocaleString()}**.`,
            )],
        });
    },
};
