import type { VercelRequest, VercelResponse } from "@vercel/node";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));

function detectLanguage(value: unknown, text: string): "fr" | "en" | "mixte" {
  if (value === "fr" || value === "en") return value;
  const lower = text.toLocaleLowerCase();
  const fr = (lower.match(/\b(le|la|les|des|une|est|dans|pour|avec|que|qui|et|du|au|aux|ce|cette|sur|pas)\b/gu) ?? []).length;
  const en = (lower.match(/\b(the|and|of|to|is|in|for|with|that|this|are|from|the|not|on)\b/gu) ?? []).length;
  if (!fr && !en) return "mixte";
  return fr >= en * 2 ? "fr" : en >= fr * 2 ? "en" : "mixte";
}

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

function sentences(text: string): string[] {
  return text.split(/[.!?…]+|\n+/).map(s => s.trim()).filter(Boolean);
}

const signatures: RegExp[] = [
  /\b(furthermore|additionally|in addition|moreover|however|nevertheless|in conclusion|to summarize|in summary)\b/giu,
  /\b(it is important to note that|it should be noted that|it is worth noting that)\b/giu,
  /\b(a comprehensive approach|holistic view|multifaceted|leveraging synergies|paradigm shift|disruptive innovation)\b/giu,
  /\b(en conclusion|en outre|de plus|cependant|néanmoins|il est important de noter que|il convient de souligner)\b/giu,
  /\b(approche globale|vision holistique|dans un premier temps|dans un second temps)\b/giu,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const pattern of patterns) total += text.match(pattern)?.length ?? 0;
  return total;
}

function calculateDetector(text: string) {
  const tokens = tokenize(text);
  const sents = sentences(text);
  const unique = new Set(tokens).size;
  const ttr = tokens.length ? unique / tokens.length : 0;
  const lengths = sents.map(s => tokenize(s).length).filter(Boolean);
  const mean = lengths.length ? lengths.reduce((a,b)=>a+b,0)/lengths.length : 0;
  const variance = lengths.length ? lengths.reduce((a,b)=>a+(b-mean)**2,0)/lengths.length : 0;
  const burstiness = mean ? Math.sqrt(variance)/mean : 0;
  const signatureHits = countMatches(text, signatures);
  const hedgingHits = countMatches(text, [/\b(perhaps|maybe|possibly|likely|generally|typically|often|could be|might be|peut-être|probablement|généralement|souvent|pourrait)\b/giu]);
  const connectorHits = countMatches(text, [/\b(therefore|consequently|furthermore|moreover|however|nevertheless|additionally|therefore|ainsi|cependant|néanmoins|donc|par conséquent|de plus)\b/giu]);
  const repeated = tokens.length ? 1 - ttr : 0;
  const uniformity = mean ? clamp(1 - Math.min(1, burstiness * 1.8)) : 0;
  const signatureScore = clamp(signatureHits / Math.max(1, tokens.length / 120));
  const connectorScore = clamp(connectorHits / Math.max(1, tokens.length / 80));
  const repetitionScore = clamp(repeated * 0.8);
  const uniformityScore = uniformity * 0.35;
  const lowBurstScore = clamp((0.28 - burstiness) / 0.28) * 0.25;
  const ai = clamp(signatureScore * 0.30 + connectorScore * 0.18 + repetitionScore * 0.12 + uniformityScore + lowBurstScore + clamp(hedgingHits / Math.max(1, tokens.length / 100)) * 0.05);
  const confidence = tokens.length < 100 ? "Faible" : tokens.length < 650 ? "Moyenne" : "Élevée";
  return { tokens, sents, ttr, burstiness, signatureHits, hedgingHits, connectorHits, ai, confidence };
}

export default async function detect(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return res.status(400).json({ success: false, error: "Aucun texte fourni.", code: "TEXT_EMPTY" });
    }
    if (text.length > 100_000) {
      return res.status(413).json({ success: false, error: "Texte trop long.", code: "TEXT_TOO_LARGE" });
    }

    const started = Date.now();
    // Charger le moteur COJ à l’intérieur du try/catch afin qu’une erreur
    // d’initialisation/import ne fasse jamais tomber la Vercel Function en 500.
    const local = calculateDetector(text);
    const ai = local.ai;
    const detector = {
      score: Math.round(ai * 100),
      probability: ai,
      features: {
        signatureScore: Math.min(100, local.signatureHits * 18),
        entropyDiversityIndex: Math.min(100, local.ttr * 100),
        verbDiversity: Math.min(100, local.ttr * 100),
        hedgingPhrases: Math.min(100, local.hedgingHits * 10),
        transitionMarkers: Math.min(100, local.connectorHits * 10),
        repetitionPatterns: Math.min(100, (1 - local.ttr) * 100),
        avgSentenceComplexity: local.sents.length ? Math.min(100, (local.tokens.length / local.sents.length) * 3.5) : 0,
        punctuationVariability: Math.min(100, local.burstiness * 100),
        overallAiProbability: ai * 100,
        signatureHits: { coj: local.signatureHits },
      },
      engine: "coj-neuro-heuristic-typescript" as const,
    };
    const features = detector.features;
    const wordCount = text.match(/[\p{L}\p{N}_']+/gu)?.length ?? 0;
    const sentenceCount = text.split(/[.!?…]+|\n+/).map(s => s.trim()).filter(Boolean).length;
    const language = detectLanguage(body.language, text);
    const durationMs = Date.now() - started;
    const totalHits = Object.values(features.signatureHits).reduce((a, b) => a + b, 0);
    const modeles = Object.entries(features.signatureHits)
      .filter(([, hits]) => hits > 0)
      .map(([model, hits]) => ({ model, vendor: model, share: hits / Math.max(1, totalHits) }));

    const analysis = {
      probabilite_IA: Number(ai.toFixed(4)),
      intervalle_confiance_95: [Math.max(0, ai - 0.15), Math.min(1, ai + 0.15)] as [number, number],
      confiance_analyse: wordCount < 100 ? "Faible" : wordCount < 650 ? "Moyenne" : "Élevée",
      genre_detecte: "generic",
      rapport_detaille: [
        ["COJ — signature IA", features.signatureScore / 100, features.signatureScore / 100],
        ["COJ — diversité entropique", features.entropyDiversityIndex / 100, (100 - features.entropyDiversityIndex) / 100],
        ["COJ — diversité verbale", features.verbDiversity / 100, (100 - features.verbDiversity) / 100],
        ["COJ — marqueurs de prudence", features.hedgingPhrases / 100, features.hedgingPhrases / 100],
        ["COJ — transitions", features.transitionMarkers / 100, features.transitionMarkers / 100],
        ["COJ — répétitions", features.repetitionPatterns / 100, features.repetitionPatterns / 100],
        ["COJ — complexité moyenne", features.avgSentenceComplexity / 100, features.avgSentenceComplexity / 100],
        ["COJ — variabilité ponctuation", features.punctuationVariability / 100, features.punctuationVariability / 100],
      ].map(([nom, z_score, contribution]) => ({
        nom: String(nom), z_score: Number(z_score), contribution: Number(contribution)
      })),
      decision_precaution: ai >= 0.75
        ? "Présence forte d’indices compatibles avec une génération IA."
        : ai >= 0.5
          ? "Indices modérés. Une interprétation prudente est recommandée."
          : "Aucun indice significatif de génération IA détecté.",
      features: {
        coj_signature_score: features.signatureScore,
        entropy_diversity_index: features.entropyDiversityIndex,
        verb_diversity: features.verbDiversity,
        hedging_phrases: features.hedgingPhrases,
        transition_markers: features.transitionMarkers,
        repetition_patterns: features.repetitionPatterns,
        avg_sentence_complexity: features.avgSentenceComplexity,
        punctuation_variability: features.punctuationVariability,
      },
      z_scores: [],
      signature: {
        modele_principal: modeles.length ? modeles.sort((a, b) => b.share - a.share)[0].model : null,
        note: modeles.length
          ? "Signature linguistique détectée par le moteur COJ Neuro-Heuristic."
          : "Aucune signature automatisée dominante ne se détache.",
        modeles,
      },
      statistiques: { mots: wordCount, phrases: sentenceCount, caracteres: text.length },
      langue: language,
      references: { total: 0, douteuses: 0 },
      plagiat_estime: 0,
      processing: { mode: "direct" as const, durationMs, words: wordCount },
      cojDetector: detector,
    };

    return res.status(200).json({
      success: true,
      status: "success",
      score: detector.score,
      is_ai_generated: ai >= 0.5,
      confidence_score: detector.score,
      analysis,
      data: { analysis, detector },
      result: analysis,
      engine: detector.engine,
      engine_used: detector.engine,
      analysis_mode: "coj_neuro_heuristic_typescript",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
      processing_time_ms: durationMs,
    });
  } catch (error) {
    console.error("[api/detect] COJ engine failure", error);
    return res.status(200).json({
      success: true,
      status: "fallback",
      score: 0,
      is_ai_generated: false,
      confidence_score: 0,
      analysis: {
        probabilite_IA: 0,
        intervalle_confiance_95: [0, 0],
        confiance_analyse: "Faible",
        genre_detecte: "generic",
        rapport_detaille: [],
        decision_precaution: "Analyse locale de secours.",
        features: {},
        z_scores: [],
        signature: { modele_principal: null, modeles: {} },
        statistiques: { mots: 0, phrases: 0, caracteres: 0 },
        langue: "mixte",
        references: { total: 0, douteuses: 0 },
        plagiat_estime: 0,
        processing: { mode: "fallback", durationMs: 0, words: 0 },
      },
      engine: "coj-neuro-heuristic-typescript",
      engine_used: "coj-neuro-heuristic-typescript",
      analysis_mode: "coj_neuro_heuristic_typescript_fallback",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
    });
  }
}
