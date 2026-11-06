export interface ArticleInput { title:string; url:string; body:string; truncated:boolean }
export interface Research {
 relevance:'relevant'|'unrelated'|'uncertain'; category:string; score:number;
 stage:'proposal'|'demo'|'pilot'|'production'|'not_disclosed';
 title:string; summary:string; problem:string; solution:string; outcome:string;
 lessons:string[]; limitations:string[]; evidence:Array<{quote:string;claim:string}>;
 ideas:Array<{title:string;angle:string}>;
}
export const VERSION:string; export const PROMPT_HASH:string; export const INSTRUCTION:string;
export const SCHEMA:Record<string,unknown>; export const CATEGORIES:string[]; export const LABELS:string[];
export function normalized(value:unknown):string;
export function inputFor(article:{title:string;url:string;body:string},maxChars?:number):ArticleInput;
export function fingerprint(article:ArticleInput,model?:string):string;
export function precheck(article:ArticleInput):'needs_body'|'skip'|'candidate';
export function validateResult(raw:unknown,article:ArticleInput):Research;
export function markdown(result:Research,article:ArticleInput):string;
