export interface CorpusDoc{id:string;title:string;authors:string[];year:number;kind:string;excerpts:string[]}
export const LOCAL_CORPUS_STATS={docs:0,volume:"0 Go",latencyMs:0};
export const LOCAL_CORPUS:CorpusDoc[]=[];
export const VERIFY_STOPWORDS=new Set(["le","la","les","des","un","une","de","du","au","aux","ce","cet","cette","ces","et","ou","que","qui","dont","où","en","dans","par","pour","sur","sous","avec","sans","est","sont","était","étaient","a","ont","ne","pas","plus","moins","se","sa","son","ses","leur","leurs","il","elle","on","nous","vous","je","tu","y","the","a","an","of","to","in","and","or","is","are","was","were","be","been","that","this","with","for","as","at","by","from"]);
export function tokenSet(s:string){const out=new Set<string>();for(const m of s.toLowerCase().match(/[\p{L}\p{N}']+/gu)??[])if(!VERIFY_STOPWORDS.has(m))out.add(m);return out}
export function jaccard(a:Set<string>,b:Set<string>){if(a.size===0||b.size===0)return 0;let inter=0;for(const t of a)if(b.has(t))inter++;const union=a.size+b.size-inter;return union>0?inter/union:0}
export interface LocalHit{doc:CorpusDoc;excerpt:string;score:number}
export function searchLocalCorpus(_sentence:string,_limit=3):LocalHit[]{return[]}
export function findInCorpus(_author:string|null,_year:number|null):CorpusDoc|null{return null}
