import command from './community-beta.js';
import { SlashCommandBuilder } from 'discord.js';
export default {...command,data:Object.assign(new SlashCommandBuilder(),command.data).setName('community')};
