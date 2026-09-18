/**
 * COJ CyberText Humanization Core
 * v2.0.1 [2026-09-18]
 * Application développée et signée par COJ (Cleef Oligens Joseph).
 *
 * ████████████████████████████████████████████████████████████████████████████
 * ███╗   ███╗███████╗██████╗  ██████╗ ███████╗ █████╗ ██████╗ ██╗ ██████╗
 * ████╗ ████║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔══██╗██╔══██╗██║██╔═══██╗
 * ██╔████╔██║█████╗  ██████╔╝██║      █████╗  ███████║██████╔╝██║██║   ██║
 * ██║╚██╔╝██║██╔══╝  ██╔══██╗██║      ██╔══╝  ██╔══██║██╔══██╗██║██║   ██║
 * ██║ ╚═╝ ██║███████╗██║  ██║╚██████╗███████╗██║  ██║██████╔╝██║╚██████╔╝
 * ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝
 */

export interface PythonHumanizerConfig {
  intensity?: number;
  warmth?: number;
  seed?: number;
  maxIterations?: number;
}

export interface BurstinessAnalysis {
  coefficient: number;
  avgLength: number;
  stdDev: number;
  entropy: number;
}

export interface NaturalnessScore {
  overall: number;
  burstiness: number;
  entropy: number;
  ttr: number;
  orality: number;
}

export interface HumanizationConfig {
  intensity: number;
  maxIterations: number;
  targetScore: number;
  preserveMeaning: boolean;
  language: "auto" | "fr" | "en";
}

export interface HumanizationResult {
  original: string;
  humanized: string;
  iterations: number;
  initialScore: number;
  finalScore: number;
  improvements: {
    burstiness: number;
    entropy: number;
    ttr: number;
    orality: number;
  };
}

export interface PythonHumanizerResult {
  original_text: string;
  humanized_text: string;
  naturalness_score: number;
  burstiness_before: number;
  burstiness_after: number;
  entropy_before: number;
  entropy_after: number;
  feedback_loops: number;
  changes_applied: number;
  is_natural: boolean;
  detected_language: string;
  engine_used: "coj-cybertext-humanizer-v2";
  fallback_engine: false;
  processing_time_ms: number;
  engine_name: "COJ CyberTextHumanizer";
  engine_version: "2.0.1";
}

class CyberTextHumanizer {
  private readonly FORMAL_CONNECTORS_FR = [
    "il est important de noter","en outre","par conséquent","ainsi","de plus","en effet",
    "c'est pourquoi","d'autre part","toutefois","néanmoins","cependant","dans ce contexte",
    "dans cette optique","sur ce plan","du point de vue","quant à","s'agissant de",
    "en ce qui concerne","par ailleurs","dans le même temps"
  ];
  private readonly FORMAL_CONNECTORS_EN = [
    "it is important to note","furthermore","consequently","thus","in addition","indeed",
    "for this reason","on the other hand","however","nevertheless","nonetheless",
    "in this context","from this perspective","in this regard","regarding","as for",
    "when it comes to","with respect to","moreover","meanwhile"
  ];
  private readonly IDIOMS_FR = [
    "à la limite","entre nous","tu vois","quoi que","quand même","enfin bon","je dirais",
    "si tu veux mon avis","comme ci comme ça","à fond","carrément","genre","quoi","bah ouais",
    "tu comprends","vraiment","un peu trop","presque","tellement","super","c'est clair",
    "ça fait bizarre","on dirait","je sais pas","bon bah","et puis","mais genre","en vrai",
    "quoi dire","comment dire","en gros","en fait","plutôt","juste","enfin","voilà","ça va",
    "c'est sûr","pour sûr","ah bah","tiens donc","c'est dingue","trop cool","pas mal",
    "bien sûr","peut-être","probablement","sûrement"
  ];
  private readonly IDIOMS_EN = [
    "you know","I mean","sort of","kind of","actually","really","pretty much","basically",
    "obviously","definitely","absolutely","totally","literally","figuratively","so to speak",
    "if you will","whatnot","you get it","right","like","um","uh","well","now","then","though",
    "anyway","somehow","somewhat","rather","quite","fairly","pretty","very","extremely",
    "incredibly","honestly","frankly","personally","to be honest","to tell the truth",
    "I guess","I think","maybe","perhaps","probably","likely","possibly","surely","certainly"
  ];
  private readonly HESITATIONS_FR = [
    "euh","hum","ben","alors","donc","voilà","eh bien","enfin","bon","bah","tiens","quoi",
    "comment dire","comment expliquer","je sais pas trop","je dirais"
  ];
  private readonly HESITATIONS_EN = [
    "uh","um","well","so","like","you know","I mean","err","hmm","okay","right","then",
    "now","so yeah","I guess","I think","kind of","sort of","anyway"
  ];

  public analyzeBurstiness(text: string): BurstinessAnalysis {
    if (!text || typeof text !== "string") return { coefficient: 0, avgLength: 0, stdDev: 0, entropy: 0 };
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (!sentences.length) return { coefficient: 0, avgLength: 0, stdDev: 0, entropy: 0 };
    const lengths = sentences.map(s => s.trim().length);
    const avgLength = lengths.reduce((a,b) => a+b,0) / lengths.length;
    const variance = lengths.reduce((sum,len) => sum + Math.pow(len-avgLength,2),0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = avgLength > 0 ? stdDev / avgLength : 0;
    const freq: Record<number,number> = {};
    lengths.forEach(len => { freq[len] = (freq[len] || 0) + 1; });
    let entropy = 0;
    for (const value of Object.values(freq)) {
      const p = value / lengths.length;
      entropy -= p > 0 ? p * Math.log2(p) : 0;
    }
    return { coefficient, avgLength, stdDev, entropy };
  }

  public calculateLexicalDiversity(text: string): { entropy: number; ttr: number } {
    if (!text || typeof text !== "string") return { entropy: 0, ttr: 0 };
    const words = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}_'\s]/gu," ").split(/\s+/).filter(Boolean);
    if (!words.length) return { entropy: 0, ttr: 0 };
    const freq: Record<string,number> = {};
    words.forEach(word => { freq[word] = (freq[word] || 0) + 1; });
    let entropy = 0;
    for (const value of Object.values(freq)) {
      const p = value / words.length;
      entropy -= p > 0 ? p * Math.log2(p) : 0;
    }
    return { entropy, ttr: Object.keys(freq).length / words.length };
  }

  public evaluateNaturalness(text: string): number {
    if (!text || typeof text !== "string") return 0;
    const burstiness = this.analyzeBurstiness(text);
    const lexical = this.calculateLexicalDiversity(text);
    const normalizedBurstiness = Math.min(burstiness.coefficient * 10, 1);
    const normalizedEntropy = Math.min(lexical.entropy / 5, 1);
    const normalizedTTR = Math.min(lexical.ttr * 3, 1);
    const lower = text.toLocaleLowerCase();
    const markers = [...this.IDIOMS_FR,...this.IDIOMS_EN,...this.HESITATIONS_FR,...this.HESITATIONS_EN];
    const orality = Math.min(markers.filter(m => lower.includes(m.toLocaleLowerCase())).length / 10, 1);
    return Math.round((normalizedBurstiness*30 + normalizedEntropy*20 + normalizedTTR*20 + orality*30)*100)/100;
  }

  public humanizeText(text: string, intensity = 0.7): string {
    if (!text || typeof text !== "string") return "";
    return this.humanizeTextAdvanced(text, {
      intensity: Math.max(0.1,Math.min(1,intensity)),
      maxIterations: 3,
      targetScore: 60 + intensity*30,
      preserveMeaning: true,
      language: "auto"
    }).humanized;
  }

  public humanizeTextAdvanced(text: string, config?: Partial<HumanizationConfig>): HumanizationResult {
    if (!text || typeof text !== "string") {
      return { original:"",humanized:"",iterations:0,initialScore:0,finalScore:0,
        improvements:{burstiness:0,entropy:0,ttr:0,orality:0} };
    }
    const fullConfig: HumanizationConfig = {
      intensity:0.7,maxIterations:3,targetScore:75,preserveMeaning:true,language:"auto",...config
    };
    let currentText = text;
    const initialScore = this.evaluateNaturalness(currentText);
    const initialAnalysis = this.analyzeBurstiness(currentText);
    const initialLexical = this.calculateLexicalDiversity(currentText);
    let iteration = 0;
    while (iteration < Math.max(1,fullConfig.maxIterations)) {
      currentText = this.applyHumanizationStep(currentText,fullConfig);
      if (this.evaluateNaturalness(currentText) >= fullConfig.targetScore) break;
      iteration++;
    }
    const finalAnalysis = this.analyzeBurstiness(currentText);
    const finalLexical = this.calculateLexicalDiversity(currentText);
    return {
      original:text,humanized:currentText,
      iterations:Math.min(iteration+1,Math.max(1,fullConfig.maxIterations)),
      initialScore,finalScore:this.evaluateNaturalness(currentText),
      improvements:{
        burstiness:finalAnalysis.coefficient-initialAnalysis.coefficient,
        entropy:finalLexical.entropy-initialLexical.entropy,
        ttr:finalLexical.ttr-initialLexical.ttr,
        orality:this.calculateOralityScore(currentText)-this.calculateOralityScore(text)
      }
    };
  }

  private applyHumanizationStep(text:string,config:HumanizationConfig):string {
    let result=this.removeFormalConnectors(text,config.language);
    result=this.addSentenceVariability(result,config.intensity);
    result=this.injectIdioms(result,config.intensity,config.language);
    result=this.injectHesitations(result,config.intensity);
    return this.breakRepetitivePatterns(result);
  }

  private removeFormalConnectors(text:string,lang:"auto"|"fr"|"en"):string {
    let result=text;
    const detected=lang==="auto"?this.detectLanguage(text):lang;
    const connectors=detected==="fr"?this.FORMAL_CONNECTORS_FR:this.FORMAL_CONNECTORS_EN;
    for (const connector of connectors) result=result.replace(new RegExp("\\b"+connector+"\\b","gi"),"");
    return result.replace(/\s+/g," ").replace(/\s([.!?])/g,"$1").trim();
  }

  private addSentenceVariability(text:string,intensity:number):string {
    const sentences=text.split(/(?<=[.!?])\\s+/);
    const out:string[]=[];
    for (const sentence of sentences) {
      if (Math.random()<intensity*0.3 && sentence.length>100 && Math.random()<0.5) {
        const words=sentence.split(" "),mid=Math.floor(words.length/2);
        out.push(words.slice(0,mid).join(" ")+".",words.slice(mid).join(" ")+".");
      } else if (Math.random()<intensity*0.3 && sentence.length<30 && out.length && Math.random()<0.3) {
        const last=out.pop(); out.push(last ? last+" "+sentence : sentence);
      } else out.push(sentence);
    }
    return out.join(" ");
  }

  private injectIdioms(text:string,intensity:number,lang:"auto"|"fr"|"en"):string {
    const detected=lang==="auto"?this.detectLanguage(text):lang;
    const idioms=detected==="fr"?this.IDIOMS_FR:this.IDIOMS_EN;
    const sentences=text.split(/(?<=[.!?])\\s+/);
    return sentences.map(sentence=>{
      if (!sentence.trim() || Math.random()>=intensity*0.15) return sentence;
      const idiom=idioms[Math.floor(Math.random()*idioms.length)];
      const position=Math.random();
      if(position<0.3) return idiom+", "+sentence;
      if(position<0.6){const words=sentence.split(" "),at=Math.floor(words.length/2);
        return words.slice(0,at).join(" ")+" "+idiom+" "+words.slice(at).join(" ");}
      return sentence+" "+idiom;
    }).join(" ");
  }

  private injectHesitations(text:string,intensity:number):string {
    const hesitations=[...this.HESITATIONS_FR,...this.HESITATIONS_EN];
    const out:string[]=[];
    for(const word of text.split(/\s+/).filter(Boolean)){
      out.push(word);
      if(Math.random()<intensity*0.05 && Math.random()<0.65)
        out.push(hesitations[Math.floor(Math.random()*hesitations.length)]);
    }
    return out.join(" ");
  }

  private breakRepetitivePatterns(text:string):string {
    const alternatives=["also","plus","though","however","still","even"];
    return text.replace(/\\b(and|or|but|so|yet)\\b/gi,match =>
      Math.random()<0.3 ? alternatives[Math.floor(Math.random()*alternatives.length)] : match);
  }

  public detectLanguage(text:string):"fr"|"en" {
    const lower=text.toLocaleLowerCase();
    const fr=["le ","la ","les ","de ","du ","des ","et ","est ","dans ","pour "];
    const en=["the ","a ","an ","and ","is ","are ","in ","for ","to ","of "];
    const frCount=fr.filter(x=>lower.includes(x)).length;
    const enCount=en.filter(x=>lower.includes(x)).length;
    return frCount>enCount?"fr":"en";
  }

  private calculateOralityScore(text:string):number {
    const lower=text.toLocaleLowerCase();
    const markers=[...this.IDIOMS_FR,...this.IDIOMS_EN,...this.HESITATIONS_FR,...this.HESITATIONS_EN];
    return markers.length ? markers.filter(m=>lower.includes(m.toLocaleLowerCase())).length/markers.length : 0;
  }
}

const humanizer=new CyberTextHumanizer();

export function humanizeText(text:string,intensity=0.7):string {
  return humanizer.humanizeText(text,intensity);
}
export function humanizeTextAdvanced(text:string,config?:Partial<HumanizationConfig>):HumanizationResult {
  return humanizer.humanizeTextAdvanced(text,config);
}
export function analyzeBurstiness(text:string):BurstinessAnalysis {
  return humanizer.analyzeBurstiness(text);
}
export function evaluateNaturalness(text:string):number {
  return humanizer.evaluateNaturalness(text);
}
export function calculateLexicalDiversity(text:string):{entropy:number;ttr:number} {
  return humanizer.calculateLexicalDiversity(text);
}

export function runPythonHumanizerPort(text:string,config:PythonHumanizerConfig={}):PythonHumanizerResult {
  const started=Date.now();
  const original=text.trim();
  const intensity=Math.max(0.1,Math.min(1,config.intensity ?? 0.7));
  const maxIterations=Math.max(1,Math.min(10,Math.floor(config.maxIterations ?? 3)));
  const result=humanizer.humanizeTextAdvanced(original,{
    intensity,maxIterations,targetScore:60+intensity*30,preserveMeaning:true,language:"auto"
  });
  const beforeBurst=humanizer.analyzeBurstiness(result.original);
  const afterBurst=humanizer.analyzeBurstiness(result.humanized);
  const beforeLex=humanizer.calculateLexicalDiversity(result.original);
  const afterLex=humanizer.calculateLexicalDiversity(result.humanized);
  return {
    original_text:result.original,
    humanized_text:result.humanized,
    naturalness_score:result.finalScore,
    burstiness_before:beforeBurst.coefficient,
    burstiness_after:afterBurst.coefficient,
    entropy_before:beforeLex.entropy,
    entropy_after:afterLex.entropy,
    feedback_loops:result.iterations,
    changes_applied:result.humanized===result.original?0:1,
    is_natural:result.finalScore>=72,
    detected_language:humanizer.detectLanguage(result.original),
    engine_used:"coj-cybertext-humanizer-v2",
    fallback_engine:false,
    processing_time_ms:Date.now()-started,
    engine_name:"COJ CyberTextHumanizer",
    engine_version:"2.0.1"
  };
}

export { CyberTextHumanizer };
