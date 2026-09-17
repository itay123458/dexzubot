import command from './beta-staff.js';
import { SlashCommandBuilder } from 'discord.js';
export default {...command,data:Object.assign(new SlashCommandBuilder(),command.data).setName('staff')};
