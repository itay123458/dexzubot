import { createAutoModerationToggle } from './modules/autoModerationToggle.js';

export default createAutoModerationToggle({
  name: 'anti-promo',
  settingKey: 'antiPromo',
  label: 'Anti Promo',
  description: 'Toggle protection against promotional links and invites',
});
