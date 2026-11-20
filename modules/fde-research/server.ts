import type { ServerModule } from '@aihot/backend/modules';
import { researchNotes } from '@aihot/backend/publication/fde-research';
export const fdeResearchServer:ServerModule={name:'fde-research',http(app){
  app.get('/api/fde/research',async(req,reply)=>{
    const before=(req.query as {before?:unknown}).before;
    reply.header('Cache-Control','no-store');
    return researchNotes(typeof before==='string'?before:undefined);
  });
}};
