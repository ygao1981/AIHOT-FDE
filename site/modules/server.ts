import type { ServerModule } from '@aihot/backend/modules';
import { fdeResearchServer } from '../../modules/fde-research/server.ts';
export const SERVER_MODULES:readonly ServerModule[]=[fdeResearchServer];
