import { MessageFlags } from 'discord.js';

const json = value => typeof value?.toJSON === 'function' ? value.toJSON() : structuredClone(value);
const text = content => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 1 });

/** Opt-in presentation layer. Never changes custom IDs, permissions, or handlers. */
export function toContainerMessage(payload = {}) {
  const { embeds = [], components = [], content, flags = 0, ...rest } = payload;
  const cards = [];
  const rows = components.map(json);
  let textLength = 0;
  const addText = value => {
    textLength += value.length;
    return text(value);
  };
  for (const [index, source] of embeds.entries()) {
    const embed = json(source);
    const children = [];
    if (embed.image?.url) children.push({ type: 12, items: [{ media: { url: embed.image.url }, description: embed.title || 'DexzuBot panel artwork' }] });
    const heading = [
      embed.author?.name ? `-# ${embed.author.name}` : null,
      embed.title ? `## ${embed.url ? `[${embed.title}](${embed.url})` : embed.title}` : null,
      embed.description,
    ].filter(Boolean).join('\n\n');
    if (heading) {
      const display = addText(heading);
      if (embed.thumbnail?.url) {
        children.push({ type: 9, components: [display], accessory: { type: 11, media: { url: embed.thumbnail.url }, description: 'Panel icon' } });
      } else children.push(display);
    }
    if (embed.fields?.length) {
      if (children.length) children.push(separator());
      children.push(addText(embed.fields.map(field => `**${field.name}**\n${field.value}`).join('\n\n')));
    }
    // Action rows belong inside the final card, before its footer.
    if (index === embeds.length - 1 && rows.length) {
      if (children.length) children.push(separator());
      children.push(...rows);
    }
    const footer = [embed.footer?.text, embed.timestamp ? `<t:${Math.floor(new Date(embed.timestamp).getTime() / 1000)}:f>` : null].filter(Boolean).join(' · ');
    if (footer) children.push(addText(`-# ${footer}`));
    if (children.length) cards.push({ type: 17, accent_color: embed.color ?? 0x65b4ff, components: children });
  }
  if (!embeds.length && rows.length) cards.push({ type: 17, accent_color: 0x65b4ff, components: rows });
  if (content) cards.unshift(addText(String(content)));
  if (textLength > 4000) throw new RangeError('Panel text exceeds Discord’s 4000-character limit. Shorten the panel content.');
  const count = items => items.reduce((sum, item) => sum + 1 + (item.components ? count(item.components) : 0) + (item.accessory ? 1 : 0), 0);
  if (count(cards) > 40) throw new RangeError('Panel exceeds Discord’s 40-component limit.');
  if (!cards.length) throw new RangeError('A panel must contain visible content.');
  return {
    ...rest,
    allowedMentions: rest.allowedMentions ?? { parse: [] },
    flags: Number(flags?.bitfield ?? flags) | MessageFlags.IsComponentsV2,
    content: null,
    embeds: [],
    components: cards,
  };
}

/** Keep V2 content visible when a collector expires; disable only its controls. */
export function disablePanelControls(components = []) {
  return components.map(value => {
    const item = json(value);
    if ([2, 3, 5, 6, 7, 8].includes(item.type)) item.disabled = true;
    if (item.components) item.components = disablePanelControls(item.components);
    if (item.accessory) item.accessory = disablePanelControls([item.accessory])[0];
    return item;
  });
}
