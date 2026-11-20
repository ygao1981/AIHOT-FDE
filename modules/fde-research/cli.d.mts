import type {ArticleInput,Research} from './core.mjs';
export class CodexError extends Error { code:string; constructor(code:string) }
export function childEnvironment(env:NodeJS.ProcessEnv,home:string):Record<string,string>;
export function argumentsFor(directory:string,model:string,effort?:string):string[];
export function runCodex(article:ArticleInput,options?:{env?:NodeJS.ProcessEnv;binary?:string;home?:string;model?:string;timeoutMs?:number}):Promise<{result:Research;usage:Record<string,number>|null;model:string}>;
