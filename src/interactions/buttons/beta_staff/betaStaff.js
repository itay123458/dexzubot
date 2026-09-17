import { handleStaffInteraction } from '../../../services/betaStaffService.js';
import { withErrorHandling } from '../../../utils/errorHandler.js';
export default { name:'beta_staff', execute:withErrorHandling(handleStaffInteraction,{command:'beta-staff'}) };
