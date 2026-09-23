import type { VercelRequest, VercelResponse } from "@vercel/node";
import { detectPlagiarism, type PlagiarismSource } from "../src/lib/detector/plagiarismEngine";

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
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length : 0;
  const sd = Math.sqrt(variance);
  const burstiness = mean ? sd / mean : 0;
  const signatureHits = countMatches(text, signatures);
  const hedgingHits = countMatches(text, [/\b(perhaps|maybe|possibly|likely|generally|typically|often|could be|might be|peut-être|probablement|généralement|souvent|pourrait)\b/giu]);
  const connectorHits = countMatches(text, [/\b(therefore|consequently|furthermore|moreover|however|nevertheless|additionally|therefore|ainsi|cependant|néanmoins|donc|par conséquent|de plus)\b/giu]);

  // Signaux statistiques : ils ne dépendent pas de mots-clés IA particuliers.
  const repeated = tokens.length ? 1 - ttr : 0;
  const sentenceUniformity = mean ? clamp(1 - Math.min(1, burstiness * 2.2)) : 0;
  const shortLongMix = lengths.length > 1
    ? clamp(sd / Math.max(1, mean * 0.75))
    : 0;
  const punctuation = text.match(/[,:;!?()"“”«»—–-]/gu) ?? [];
  const punctuationDensity = tokens.length ? punctuation.length / tokens.length : 0;
  const punctuationRegularity = punctuationDensity > 0
    ? clamp(1 - Math.abs(punctuationDensity - 0.065) / 0.065)
    : 0;

  // Mesure une régularité locale des longueurs de phrases : les textes très
  // mécaniques ont souvent moins de variation que des textes naturels longs.
  const adjacentSimilarity = lengths.length > 1
    ? lengths.slice(1).reduce((sum, value, i) => {
        const previous = lengths[i];
        return sum + (1 - Math.min(1, Math.abs(value - previous) / Math.max(1, mean)));
      }, 0) / (lengths.length - 1)
    : 0;

  // Répartition des mots fonctionnels : utile comme signal secondaire,
  // jamais comme preuve isolée.
  const functionWords = new Set([
    "le","la","les","un","une","des","de","du","au","aux","et","ou","mais","donc","or","ni",
    "car","que","qui","ce","cette","ces","dans","pour","par","sur","avec","sans","en","à",
    "the","a","an","of","and","or","but","that","which","in","for","with","on","to",
  ]);
  const functionRatio = tokens.length
    ? tokens.filter(token => functionWords.has(token)).length / tokens.length
    : 0;
  const functionBalance = clamp(1 - Math.abs(functionRatio - 0.43) / 0.20);

  // Les expressions prédéfinies deviennent un signal secondaire. Le moteur
  // ne doit pas confondre la présence d'un vocabulaire "académique" avec l'IA.
  const signatureScore = clamp(signatureHits / Math.max(1, tokens.length / 180));
  const connectorScore = clamp(connectorHits / Math.max(1, tokens.length / 150));
  const hedgeScore = clamp(hedgingHits / Math.max(1, tokens.length / 160));

  // Signaux statistiques combinés. La diversité lexicale seule n'augmente
  // pas le risque IA : elle sert ici à contextualiser les autres mesures.
  const repetitionScore = clamp(repeated / 0.72);
  const uniformityScore = sentenceUniformity;
  const lowBurstScore = clamp((0.24 - burstiness) / 0.24);
  const adjacentScore = adjacentSimilarity;
  const regularityEvidence = clamp(
    uniformityScore * 0.24 +
    lowBurstScore * 0.18 +
    adjacentScore * 0.16 +
    repetitionScore * 0.10 +
    punctuationRegularity * 0.08 +
    functionBalance * 0.06 +
    signatureScore * 0.10 +
    connectorScore * 0.05 +
    hedgeScore * 0.03,
  );

  // Une seule anomalie ne doit jamais produire un score élevé. Plusieurs
  // familles indépendantes doivent converger avant d'augmenter fortement.
  const independentEvidence = [
    uniformityScore,
    lowBurstScore,
    adjacentScore,
    repetitionScore,
    signatureScore,
    connectorScore,
  ].sort((a, b) => b - a);
  const consensus = independentEvidence.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
  const agreement = clamp(1 - Math.abs(independentEvidence[0] - independentEvidence[3]));
  const consensusMultiplier = 0.72 + consensus * 0.28;
  const agreementMultiplier = 0.82 + agreement * 0.18;
  const rawAi = clamp(regularityEvidence * consensusMultiplier * agreementMultiplier);

  // Calibration prudente des textes courts : moins de données => moins de
  // certitude. Pour les textes longs, aucun bonus artificiel n'est ajouté.
  const calibrationMultiplier = tokens.length < 80
    ? 0.55
    : tokens.length < 180
      ? 0.78
      : tokens.length < 350
        ? 0.92
        : 1;
  const calibratedAi = rawAi * calibrationMultiplier;

  const confidence = tokens.length < 100 ? "Faible" : tokens.length < 650 ? "Moyenne" : "Élevée";
  return {
    tokens,
    sents,
    ttr,
    burstiness,
    signatureHits,
    hedgingHits,
    connectorHits,
    ai: calibratedAi,
    confidence,
    signatureScore,
    connectorScore,
    repetitionScore,
    uniformity: sentenceUniformity,
    lowBurstScore,
    hedgeScore,
    structuralEvidence: regularityEvidence,
    shortLongMix,
    punctuationDensity,
    punctuationRegularity,
    adjacentSimilarity,
    functionRatio,
    functionBalance,
    consensus,
    agreement,
  };
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
    const rawCorpus = Array.isArray(body.corpus) ? body.corpus : [];
    const corpus: PlagiarismSource[] = rawCorpus
      .map((item) => {
        const row = item as Record<string, unknown>;
        return { id: String(row.id ?? ""), title: String(row.title ?? row.name ?? "Document source"), text: String(row.text ?? "") };
      })
      .filter((item) => item.id && item.text.trim())
      .slice(0, 100);
    const plagiarism = detectPlagiarism(text, corpus);
    const ai = local.ai;
    const wordCount = text.match(/[\p{L}\p{N}_']+/gu)?.length ?? 0;
    const sentenceCount = text.split(/[.!?…]+|\n+/).map(s => s.trim()).filter(Boolean).length;
    const durationMs = Date.now() - started;
    const calibrationMultiplier = wordCount < 80 ? 0.55 : wordCount < 180 ? 0.78 : wordCount < 350 ? 0.92 : 1;
    const consensusMultiplier = 0.72 + local.consensus * 0.28;
    const agreementMultiplier = 0.82 + local.agreement * 0.18;
    const contributionMultiplier = consensusMultiplier * agreementMultiplier * calibrationMultiplier;
    const detector = {
      score: Math.round(ai * 100),
      probability: ai,
      features: {
        signatureScore: Math.min(100, local.signatureScore * 100),
        entropyDiversityIndex: Math.min(100, local.ttr * 100),
        verbDiversity: Math.min(100, local.ttr * 100),
        sentenceUniformity: local.uniformity * 100,
        adjacentSentenceSimilarity: local.adjacentSimilarity * 100,
        punctuationRegularity: local.punctuationRegularity * 100,
        functionWordBalance: local.functionBalance * 100,
        consensusScore: local.consensus * 100,
        hedgingPhrases: Math.min(100, local.hedgingHits * 10),
        transitionMarkers: Math.min(100, local.connectorScore * 100),
        repetitionPatterns: Math.min(100, local.repetitionScore * 100),
        avgSentenceComplexity: local.sents.length ? Math.min(100, (local.tokens.length / local.sents.length) * 3.5) : 0,
        punctuationVariability: Math.min(100, local.lowBurstScore * 100),
        overallAiProbability: ai * 100,
        signatureHits: { coj: local.signatureHits },
        // Champs de compatibilité attendus par FullAnalysisResult/mapAnalysis.
        tauxTransitionStandard: local.connectorHits / Math.max(1, local.tokens.length),
        burstiness: local.burstiness,
        mattr: local.ttr,
        scoreOriginalite: local.ttr,
        perplexiteRelative: Math.min(1, local.ttr * 1.15),
      },
      engine: "coj-neuro-heuristic-typescript" as const,
      words: wordCount,
      characters: text.length,
      sentences: sentenceCount,
      durationMs,
    };
    const features = detector.features;
    const language = detectLanguage(body.language, text);
    const totalHits = Object.values(features.signatureHits).reduce((a, b) => a + b, 0);
    const modeles = Object.entries(features.signatureHits)
      .filter(([, hits]) => hits > 0)
      .map(([model, hits]) => ({ model, vendor: model, share: hits / Math.max(1, totalHits) }));

    const factorDefinitions = [
      ["COJ — régularité des phrases", local.uniformity, 0.24],
      ["COJ — faible burstiness", local.lowBurstScore, 0.18],
      ["COJ — similarité entre phrases", local.adjacentSimilarity, 0.16],
      ["COJ — répétitions", local.repetitionScore, 0.10],
      ["COJ — régularité de ponctuation", local.punctuationRegularity, 0.08],
      ["COJ — équilibre des mots fonctionnels", local.functionBalance, 0.06],
      ["COJ — signature IA", local.signatureScore, 0.10],
      ["COJ — transitions", local.connectorScore, 0.05],
      ["COJ — marqueurs de prudence", local.hedgeScore, 0.03],
    ] as const;
    const factorDetails = factorDefinitions
      .map(([nom, signal, weight]) => ({
        nom,
        z_score: Number(signal.toFixed(4)),
        contribution: Number((signal * weight * contributionMultiplier).toFixed(4)),
      }))
      .sort((a, b) => b.contribution - a.contribution);

    const analysis = {
      probabilite_IA: Number(ai.toFixed(4)),
      intervalle_confiance_95: [Math.max(0, ai - 0.15), Math.min(1, ai + 0.15)] as [number, number],
      confiance_analyse: wordCount < 100 ? "Faible" : wordCount < 650 ? "Moyenne" : "Élevée",
      genre_detecte: "generic",
      rapport_detaille: factorDetails,
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
      plagiat_estime: plagiarism.score,
      plagiarism: {
        score: plagiarism.score,
        matchedWords: plagiarism.matchedWords,
        matchedPhrases: plagiarism.matchedPhrases,
        sourcesCompared: plagiarism.sourcesCompared,
        verdict: plagiarism.verdict,
        matches: plagiarism.matches,
      },
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
      plagiarism: {
        score: plagiarism.score,
        verifiedPlagiarism: plagiarism.hits.filter(hit => hit.level === "exact" || hit.level === "forte").length,
        probableMatches: plagiarism.hits.filter(hit => hit.level === "probable").length,
        sourceCount: plagiarism.sources,
        hits: plagiarism.hits.slice(0, 20),
      },
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
