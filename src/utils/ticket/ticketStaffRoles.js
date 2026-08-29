export function getTicketStaffRoleIds(config = {}) {
  const configuredIds = Array.isArray(config.ticketStaffRoleIds)
    ? config.ticketStaffRoleIds
    : [];
  const legacyId = config.ticketStaffRoleId ? [config.ticketStaffRoleId] : [];

  return [...new Set([...configuredIds, ...legacyId].map(String).filter(Boolean))];
}

export function setTicketStaffRoleIds(config, roleIds) {
  const normalizedIds = [...new Set((roleIds || []).map(String).filter(Boolean))];
  config.ticketStaffRoleIds = normalizedIds;
  config.ticketStaffRoleId = normalizedIds[0] || null;
  return normalizedIds;
}
