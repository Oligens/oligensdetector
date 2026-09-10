import { analyzeCalibrated } from "../detector/calibratedDetector";
import { anchorCoverage, evaluateRewrite, lexicalNovelty, protectedTermCoverage } from "../ai/innovationLayer";
import type { HumanizeOutcome, HumanizerConfig, HumanizerProgress, HumanizerReport, IterationAnomaly, IterationRecord } from "./humanizerUltimate";

const DEFAULTS: HumanizerConfig = { seuilCible: 0.12, iterationsMax: 6, intensite: 0.78, langue: "mixte", modeAggressif: false };
type Replacement = [RegExp, string[]];

const FR: Replacement[] = [
  [/\bil est important de noter que\b/gi, ["on remarque que", "un point ressort :", "il faut surtout retenir que"]],
  [/\bil convient de souligner que\b/gi, ["on peut souligner que", "un élément ressort :", "il faut relever que"]],
  [/\bil est essentiel de comprendre\b/gi, ["il faut comprendre", "le point clé est", "on comprend mieux"]],
  [/\bil est intéressant de constater\b/gi, ["on observe que", "un fait ressort :", "on voit que"]],
  [/\bdans ce contexte\b/gi, ["ici", "sur ce point", "dans cette situation"]],
  [/\ben ce qui concerne\b/gi, ["pour", "quant à", "sur"]],
  [/\bde manière générale\b/gi, ["globalement", "dans l'ensemble", "en règle générale"]],
  [/\bpar conséquent\b/gi, ["donc", "de ce fait", "ce qui conduit à"]],
  [/\ben conclusion\b/gi, ["pour finir", "au final", "en résumé"]],
  [/\ben définitive\b/gi, ["finalement", "au bout du compte", "au final"]],
  [/\bpremièrement\b/gi, ["d'abord", "pour commencer", "en premier lieu"]],
  [/\bdeuxièmement\b/gi, ["ensuite", "puis", "dans un second temps"]],
  [/\btroisièmement\b/gi, ["enfin", "pour finir"]],
  [/\bdans le cadre de\b/gi, ["dans", "pour", "en vue de"]],
  [/\bde plus\b/gi, ["aussi", "par ailleurs", "en outre"]],
  [/\ben effet\b/gi, ["en réalité", "effectivement", "de fait"]],
  [/\bcependant\b/gi, ["mais", "pourtant", "toutefois"]],
  [/\bnéanmoins\b/gi, ["pourtant", "cependant", "malgré cela"]],
];
const EN: Replacement[] = [
  [/\bit is important to note that\b/gi, ["notably", "one point is that", "what matters is that"]],
  [/\bit should be noted that\b/gi, ["notably", "the point is that", "we can observe that"]],
  [/\bin conclusion\b/gi, ["finally", "overall", "to sum up"]],
  [/\bmoreover\b/gi, ["also", "besides that", "another point is"]],
  [/\bfurthermore\b/gi, ["also", "in addition", "another point is"]],
  [/\btherefore\b/gi, ["so", "as a result", "that means"]],
  [/\bhowever\b/gi, ["but", "still", "yet"]],
  [/\bnevertheless\b/gi, ["still", "yet", "even so"]],
  [/\butilize\b/gi, ["use", "employ", "apply"]],
];
const FR_LEX: Replacement[] = [[/\bmontre\b/gi,["révèle","fait apparaître","met en évidence"]],[/\bpermet\b/gi,["facilite","rend possible","favorise"]],[/\bproblème\b/gi,["difficulté","question","enjeu"]],[/\bimportant\b/gi,["essentiel","majeur","notable"]],[/\butiliser\b/gi,["employer","recourir à","se servir de"]],[/\bbeaucoup\b/gi,["souvent","largement","en grande partie"]]];
const EN_LEX: Replacement[] = [[/\bshows\b/gi,["reveals","highlights","makes clear"]],[/\bimportant\b/gi,["essential","key","significant"]],[/\buse\b/gi,["employ","apply","make use of"]],[/\bmany\b/gi,["several","a range of","numerous"]]];

const normalize = (s: string) => s.replace(/[ \t]+/g," ").replace(/\s+([,.;!?…])/g,"$1").replace(/([.!?…])\s*([.!?…])/g,"$1").replace(/(^|[.!?…]\s+)(\p{Ll})/gu,(_m,pre:string,c:string)=>pre+c.toUpperCase()).trim();
const sentences = (s:string) => s.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map(x=>x.trim()).filter(Boolean) ?? [];
function rngSeed(s:string){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return()=>{h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;};}
function pick<T>(a:T[],r:()=>number){return a[Math.min(a.length-1,Math.floor(r()*a.length))];}
function applyRules(text:string,rules:Replacement[],r:()=>number,p:number){let out=text;for(const [re,opts] of rules)out=out.replace(re,m=>r()<p?pick(opts,r):m);return out;}

function reshape(text:string,r:()=>number,intensity:number,variant:number){
  const ss=sentences(text);if(ss.length<3)return text;const out:string[]=[];
  for(const s of ss){
    const w=s.split(/\s+/);
    if(w.length>=28&&r()<0.80*intensity){
      const commas=[...s.matchAll(/,\s+/g)].map(m=>m.index??-1).filter(x=>x>30&&x<s.length-30);
      if(commas.length){const cut=pick(commas,r);const left=s.slice(0,cut).trim().replace(/[,;:]$/g,"");const right=s.slice(cut+1).trim();out.push(left+". "+right.charAt(0).toUpperCase()+right.slice(1));continue;}
    }
    if(w.length<=9&&out.length&&r()<0.22*intensity){const prev=out.pop()!;out.push(prev.replace(/[.!?…]+$/g,"")+"; "+s.charAt(0).toLowerCase()+s.slice(1));continue;}
    if(variant===2&&w.length>18&&r()<0.20*intensity){const semi=s.indexOf("; ");if(semi>10){const a=s.slice(0,semi),b=s.slice(semi+2);out.push(a+". "+b.charAt(0).toUpperCase()+b.slice(1));continue;}}
    out.push(s);
  }
  return out.join(" ");
}

function fallback(text:string){
  const swaps:Array<[RegExp,string]>=[[/\bcependant\b/i,"mais"],[/\bnéanmoins\b/i,"pourtant"],[/\bpar conséquent\b/i,"donc"],[/\ben conclusion\b/i,"pour finir"],[/\bdans le cadre de\b/i,"dans"],[/\bil est important de noter que\b/i,"on remarque que"];
  for(const [re,to] of swaps)if(re.test(text))return normalize(text.replace(re,to));
  const m=text.match(/[^.!?…]{120,}[.!?…]/);if(m){const i=m[0].indexOf(", ");if(i>35&&i<m[0].length-35)return normalize(text.replace(m[0],m[0].slice(0,i)+". "+m[0].slice(i+2).replace(/^\p{Ll}/u,c=>c.toUpperCase())));}return text;
}

function candidateScore(original:string,candidate:string){
  const q=evaluateRewrite(original,candidate);
  const anchors=anchorCoverage(original,candidate);
  const protectedTerms=protectedTermCoverage(original,candidate);
  const novelty=Math.min(1,lexicalNovelty(original,candidate)/0.12);
  const change=q.changeRatio;
  // Selection is based on writing quality and preservation of meaning, not on
  // trying to drive a detector to a particular score.
  const changeFit = change < 0.06 ? change / 0.06 : change <= 0.32 ? 1 : Math.max(0, 1 - (change - 0.32) / 0.40);
  return q.qualityScore*0.42 + anchors*0.25 + protectedTerms*0.15 + novelty*0.08 + changeFit*0.10;
}

function anomalies(r:ReturnType<typeof analyzeCalibrated>):IterationAnomaly[]{return(r.rapport_detaille??[]).filter(x=>Math.abs(x.contribution)>0.02).slice(0,6);}

export const naturalHumanizer = { async humanize(text:string,config:Partial<HumanizerConfig>={},onProgress?:(p:HumanizerProgress)=>void):Promise<HumanizeOutcome>{
  const cfg={...DEFAULTS,...config},original=normalize(text);if(!original)return {texteFinal:"",rapport:{proba_initiale:0,proba_finale:0,reduction_pourcent:0,iterations_realisees:0,historique:[],features_finales:[],decision:"Aucun texte à humaniser.",config:cfg}};
  const initial=analyzeCalibrated(original);let current=original,best=original,bestScore=-Infinity;const history:IterationRecord[]=[];const passes=Math.max(2,Math.min(12,cfg.iterationsMax));let iterations=0;
  for(let i=1;i<=passes;i++){
    iterations=i;const before=analyzeCalibrated(current),an=anomalies(before);history.push({iteration:i,proba:before.probabilite_IA,anomalies:an});onProgress?.({iteration:i,total:passes,proba:before.probabilite_IA,phase:"Réécriture naturelle "+i+"/"+passes,anomalies:an});
    const intensity=Math.max(0.35,Math.min(0.98,cfg.intensite+(cfg.modeAggressif?0.08:0)));const candidates:string[]=[];const isEn=/\b(the|and|of|to|is|in|with|this)\b/i.test(current);
    for(let v=0;v<6;v++){
      const r=rngSeed(current+":"+i+":"+v);let c=applyRules(current,isEn?EN:FR,r,Math.min(0.96,0.72+intensity*0.24));c=applyRules(c,isEn?EN_LEX:FR_LEX,r,0.18+intensity*0.28);c=reshape(c,r,intensity,v%3);c=normalize(c);if(c&&c!==current)candidates.push(c);
    }
    const ranked=candidates.map(c=>({c,s:candidateScore(original,c),q:evaluateRewrite(original,c)})).sort((a,b)=>b.s-a.s);
    const selected=ranked[0];
    if(selected)current=selected.c;
    const q=evaluateRewrite(original,current);const preservation=anchorCoverage(original,current)*protectedTermCoverage(original,current);const total=q.qualityScore*preservation;
    if(current!==original&&total>bestScore){best=current;bestScore=total;}
    // Require a meaningful editorial change before accepting completion.
    if(i>=2&&best!==original&&q.changeRatio>=0.08)break;
    await new Promise<void>(resolve=>{if(typeof requestAnimationFrame==="function")requestAnimationFrame(()=>resolve());else setTimeout(resolve,0);});
  }
  if(best===original)best=fallback(original);
  const finalText=normalize(best),final=analyzeCalibrated(finalText),changed=finalText!==original,changeRatio=evaluateRewrite(original,finalText).changeRatio;
  const report:HumanizerReport={proba_initiale:initial.probabilite_IA,proba_finale:final.probabilite_IA,reduction_pourcent:(initial.probabilite_IA-final.probabilite_IA)*100,iterations_realisees:iterations,historique:history,features_finales:final.rapport_detaille,decision:changed?"Réécriture terminée : formulation, rythme et structure retravaillés avec contrôle du sens.":"Aucune transformation suffisamment sûre n'a été trouvée.",config:cfg,warning:changed?`Transformation stylistique appliquée (${Math.round(changeRatio*100)} % de variation mesurée). Le moteur ne cherche pas à garantir un score particulier auprès d'un détecteur externe.`:"Le texte n'a pas été modifié car aucune transformation suffisamment sûre n'a été trouvée."};
  onProgress?.({iteration:iterations,total:passes,proba:final.probabilite_IA,phase:changed?"Finalisation et contrôle qualité":"Contrôle terminé",anomalies:anomalies(final)});return {texteFinal:finalText,rapport:report};
}};
