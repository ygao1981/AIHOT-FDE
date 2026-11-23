import { defineWebModule } from '@aihot/web/modules';
import { IconDoc } from '../../apps/web/app/components/icons.tsx';
export const fdeResearchWeb=defineWebModule({name:'fde-research',
 sidebar:{section:'内容',items:[{to:'/research',label:'研究与选题',icon:IconDoc}]},
 tools:[{to:'/research',label:'研究与选题',icon:<IconDoc size={20}/>}],
});
