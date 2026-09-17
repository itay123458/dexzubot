import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { createError, ErrorTypes } from '../errorHandler.js';

const forms = {
  report: [
    { id: 'member', label: 'Member username or ID', required: true, short: true, max: 200 },
    { id: 'incident', label: 'What happened?', required: true },
    { id: 'evidence', label: 'Evidence or links', required: false },
    { id: 'details', label: 'Additional details', required: false },
  ],
  partnership: [
    { id: 'community', label: 'Server or community name', required: true, short: true, max: 200 },
    { id: 'link', label: 'Invite or community link', required: true, short: true },
    { id: 'members', label: 'Member count', required: true, short: true, max: 100 },
    { id: 'partnership', label: 'What partnership would you like?', required: true },
    { id: 'details', label: 'Additional information', required: false },
  ],
};
const generic = [{ id: 'reason', label: 'Why are you creating this ticket?', required: true }];

export function createTicketFormModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(category ? `create_ticket_modal:beta:${category}` : 'create_ticket_modal')
    .setTitle(category === 'report' ? 'Report a Member' : category === 'partnership' ? 'Partnership Request' : category === 'support' ? 'General Support' : 'Create a Ticket');
  for (const field of forms[category] || generic) {
    const input = new TextInputBuilder().setCustomId(field.id).setLabel(field.label)
      .setStyle(field.short ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(field.required).setMaxLength(field.max || 1000);
    if (field.id === 'reason') input.setPlaceholder('Describe your issue...');
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

export function normalizeTicketForm(category, values) {
  const definitions = forms[category];
  if (!definitions) throw createError('Invalid ticket form', ErrorTypes.VALIDATION, 'Please reopen the ticket form.');
  return Object.fromEntries(definitions.map(field => {
    const value = typeof values?.[field.id] === 'string' ? values[field.id].trim() : '';
    if (field.required && !value) throw createError(`${field.label} is required`, ErrorTypes.VALIDATION, `${field.label} is required. Please reopen the form.`);
    if (value.length > (field.max || 1000)) throw createError(`${field.label} is too long`, ErrorTypes.VALIDATION, `${field.label} is too long. Please shorten it and try again.`);
    return [field.id, value];
  }));
}

export function readTicketForm(category, fields) {
  // Forms opened before an update still submit their original single reason field.
  if (!forms[category] || fields.fields?.has('reason')) {
    return { reason: fields.getTextInputValue('reason'), formFields: null };
  }
  const formFields = normalizeTicketForm(category, Object.fromEntries(forms[category].map(field => [field.id, fields.getTextInputValue(field.id)])));
  return { reason: formFields.incident || formFields.partnership, formFields };
}

export function ticketFormEmbedFields(category, values) {
  return (forms[category] || []).filter(field => values[field.id]).map(field => ({
    name: field.label,
    value: values[field.id].length > 700 ? `${values[field.id].slice(0, 650)}…\nFull details in the attached form.` : values[field.id],
    inline: false,
  }));
}

export function ticketFormText(category, values) {
  return (forms[category] || []).filter(field => values[field.id])
    .map(field => `${field.label}\n${values[field.id]}`).join('\n\n');
}
