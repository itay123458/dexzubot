import { createAutoModerationToggle } from './modules/autoModerationToggle.js';

export default createAutoModerationToggle({
  name: 'anti-ping',
  settingKey: 'antiPing',
  label: 'Anti Ping',
  description: 'Toggle protection against user, role, and everyone pings',
});
