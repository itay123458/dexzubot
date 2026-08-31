const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export const MAX_TIMEOUT_MS = 28 * UNIT_MS.d;

export function parseModerationDuration(input) {
  const match = String(input || '').trim().toLowerCase().match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const durationMs = amount * UNIT_MS[match[2]];
  if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > MAX_TIMEOUT_MS) return null;
  return durationMs;
}

export function formatModerationDuration(durationMs) {
  const units = [
    ['week', UNIT_MS.w],
    ['day', UNIT_MS.d],
    ['hour', UNIT_MS.h],
    ['minute', UNIT_MS.m],
    ['second', UNIT_MS.s],
  ];
  const [label, unitMs] = units.find(([, value]) => durationMs % value === 0) || units.at(-1);
  const amount = Math.floor(durationMs / unitMs);
  return `${amount} ${label}${amount === 1 ? '' : 's'}`;
}
