import type { ModuleDeclaration } from '@aihot/contracts/modules';
import { fdeReadingModule } from '../../modules/fde-reading/module.ts';
import { fdeResearchModule } from '../../modules/fde-research/module.ts';
export const MODULES:readonly ModuleDeclaration[]=[fdeReadingModule,fdeResearchModule];
