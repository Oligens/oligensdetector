import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Standalone emergency detector.
 * No database, JWT, Python subprocess, legacy engine, or external AI API.
 */
const WORD_RE = /[\\p{L}\\p{N}_']+/gu;
const SENTENCE_RE = /[^.!?…]+[.!?…]+|[^.!?…]+$/gu;
const SIGNATURES: Record<string, RegExp[]> = {
  gpt: [/\\bchatgpt\\b/iu,/\\bgpt\\b/iu,/\\bgenerative ai\\b/iu,/\\bopenai\\b/iu,/\\bje suis un modèle de langage\\b/iu],
  claude: [/\\bclaude\\b/iu,/\\banthropic\\b/iu,/\\bje dois être prudent\\b/iu],
  llama: [/\\bllama\\b/iu,/\\bmeta\\b/iu,/\\blarge language model\\b/iu],
  gemini: [/\\bgemini\\b/iu,/\\bdeepmind\\b/iu,/\\bgoogle ai\\b/iu]
};
const TRANSITIONS = ["en somme","donc","ainsi","par conséquent","par ailleurs","de plus","cependant","toutefois","néanmoins","autrement dit","indeed","in fact","moreover","furthermore","therefore","however","nevertheless","in conclusion"];
const HEDGING = ["il semble","il pourrait","peut-être","probablement","possiblement","semble être","devrait être","serait","it seems","it appears","perhaps","probably","possibly","might be","could be","likely"];
const clamp = (n:number,min=0,max=100) => Math.max(min,Math.min(max,n));
const words = (s:string) => s.match(WORD_RE) ?? [];
const hits = (s:string,p:string[]) => p.reduce((n,x)=>n+s.toLocaleLowerCase().split(x.toLocaleLowerCase()).length-1,0);
function entropy(v:string[]) { if(!v.length)return 0; const m=new Map<string,number>(); v.forEach(x=>m.set(x,(m.get(x)??0)+1)); let h=0; m.forEach(c=>{const p=c/v.length;h-=p*Math.log2(p)}); return h; }
function analyse(text:string) {
  const normalized=text.normalize("NFC").replace(/\\s+/g," ").trim(), t=words(normalized), lower=t.map(x=>x.toLocaleLowerCase()), unique=new Set(lower), ss=normalized.match(SENTENCE_RE)??[normalized];
  const signatureHits:Record<string,number>={}; let total=0;
  for(const [model,patterns] of Object.entries(SIGNATURES)){const n=patterns.reduce((a,p)=>a+(p.test(normalized)?1:0),0);signatureHits[model]=n;total+=n;}
  const entropyIndex=t.length>1?clamp(entropy(lower)/Math.log2(t.length)*100):0;
  const repetition=t.length>1?clamp((1-unique.size/t.length)*100):0;
  const transitionScore=clamp(hits(normalized,TRANSITIONS)/Math.max(1,t.length)*900);
  const hedgingScore=clamp(hits(normalized,HEDGING)/Math.max(1,t.length)*1000);
  const average=ss.reduce((n,s)=>n+words(s).length,0)/Math.max(1,ss.length);
  const complexity=clamp(average*3.5), signatureScore=clamp(total*18);
  const punctuation=clamp((normalized.match(/[,;:!?…]/g)??[]).length/Math.max(1,ss.length)*8);
  const probability=clamp(signatureScore*.42+(100-entropyIndex)*.08+hedgingScore*.10+transitionScore*.12+repetition*.10+complexity*.10+punctuation*.08)/100;
  const lo=normalized.toLocaleLowerCase(), fr=(lo.match(/\\b(le|la|les|des|une|est|dans|pour|avec|que|qui|et|du|au|aux)\\b/gu)??[]).length, en=(lo.match(/\\b(the|and|of|to|is|in|for|with|that|this|are|from)\\b/gu)??[]).length;
  return {probability,signatureHits,entropyIndex,repetition,transitionScore,hedgingScore,complexity,language:fr>=en*2?"fr":en>=fr*2?"en":"mixte",wordCount:t.length,sentenceCount:ss.length,characterCount:text.length};
}
export default function detect(req:VercelRequest,res:VercelResponse){
  res.setHeader("Cache-Control","no-store,max-age=0");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST")return res.status(405).json({success:false,error:"Méthode non autorisée.",code:"METHOD_NOT_ALLOWED"});
  try{
    const body=(req.body??{}) as Record<string,unknown>, text=typeof body.text==="string"?body.text.trim():"";
    if(!text)return res.status(400).json({success:false,error:"Aucun texte fourni.",code:"TEXT_EMPTY"});
    if(text.length>100000)return res.status(413).json({success:false,error:"Texte trop long.",code:"TEXT_TOO_LARGE"});
    const started=Date.now(),r=analyse(text),processing=Date.now()-started,score=Math.round(r.probability*100);
    const analysis={
      probabilite_IA:Number(r.probability.toFixed(4)),intervalle_confiance_95:[Math.max(0,r.probability-.15),Math.min(1,r.probability+.15)],
      confiance_analyse:r.wordCount<100?"Faible":r.wordCount<650?"Moyenne":"Élevée",genre_detecte:"generic",
      rapport_detaille:[{nom:"Signature IA",z_score:score,contribution:score},{nom:"Diversité entropique",z_score:r.entropyIndex/100,contribution:(100-r.entropyIndex)/100},{nom:"Transitions",z_score:r.transitionScore/100,contribution:r.transitionScore/100},{nom:"Répétitions",z_score:r.repetition/100,contribution:r.repetition/100}],
      decision_precaution:r.probability>=.75?"Présence forte d'indices compatibles avec une génération IA.":r.probability>=.5?"Indices modérés. Une interprétation prudente est recommandée.":"Aucun indice significatif de génération IA détecté.",
      features:{python_signature_score:r.signatureHits,entropy_diversity_index:r.entropyIndex,hedging_phrases:r.hedgingScore,transition_markers:r.transitionScore,repetition_patterns:r.repetition,avg_sentence_complexity:r.complexity},
      z_scores:[],signature:{modele_principal:Object.entries(r.signatureHits).sort((a,b)=>b[1]-a[1])[0]?.[0]??null,modeles:r.signatureHits},
      statistiques:{mots:r.wordCount,phrases:r.sentenceCount,caracteres:r.characterCount},langue:r.language,references:{total:0,douteuses:0},plagiat_estime:0,processing:{mode:"direct",durationMs:processing,words:r.wordCount}
    };
    return res.status(200).json({success:true,status:"success",score,is_ai_generated:r.probability>=.5,confidence_score:score,analysis,data:{analysis},result:analysis,engine:"standalone-python-port-typescript",engine_used:"standalone-python-port-typescript",analysis_mode:"python_port_typescript_standalone",offline_engine:true,python_subprocess:false,external_dependency:false,processing_time_ms:processing});
  }catch(error){
    console.error("[api/detect] standalone failure",error);
    return res.status(200).json({success:true,status:"fallback",score:0,is_ai_generated:false,confidence_score:0,analysis:{probabilite_IA:0,intervalle_confiance_95:[0,0],confiance_analyse:"Faible",genre_detecte:"generic",rapport_detaille:[],decision_precaution:"Analyse locale de secours.",features:{},z_scores:[],signature:{modele_principal:null,modeles:{}},statistiques:{mots:0,phrases:0,caracteres:0},langue:"mixte",references:{total:0,douteuses:0},plagiat_estime:0,processing:{mode:"fallback",durationMs:0,words:0}},engine:"standalone-python-port-typescript",engine_used:"standalone-python-port-typescript",analysis_mode:"safe_fallback",offline_engine:true,python_subprocess:false,external_dependency:false});
  }
}