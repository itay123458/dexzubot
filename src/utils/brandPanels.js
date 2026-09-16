import { createEmbed } from './embeds.js';

// Reuse the same support presentation for setup, edits, and reposts.
export function createSupportPanelEmbed(config = {}, thumbnail = null) {
  return createEmbed({
    title: 'Support Tickets',
    description: config.ticketPanelMessage || 'Welcome to DexzuBot support. Open a private ticket and our team will help you.',
    color: 'primary',
    thumbnail,
    fields: [
      { name: 'Community support', value: 'Questions, access issues, or help finding your way around the dungeon.' },
      { name: 'Reports & concerns', value: 'Share the details and any relevant evidence privately with the team.' },
      { name: 'Before you open a ticket', value: 'Describe what you need clearly. Use the button below to start your conversation.' },
    ],
    footer: 'DexzuBot · Private support',
  });
}
