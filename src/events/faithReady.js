import { Events } from 'discord.js';
import { initializeFaith } from '../services/faithService.js';
export default { name: Events.ClientReady, once: true, execute(client) { initializeFaith(client); } };
