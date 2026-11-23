import type { WebModule } from '@aihot/web/modules';
import { fdeReadingWeb } from '../../modules/fde-reading/web.tsx';
import { fdeResearchWeb } from '../../modules/fde-research/web.tsx';
export const WEB_MODULES:readonly WebModule[]=[fdeReadingWeb,fdeResearchWeb];
