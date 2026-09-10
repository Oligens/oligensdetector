import { analyzeCalibrated } from "./calibratedDetector";
import { evaluateOligensMl, runOligensMlCalibration, type OligensMlMetrics } from "./oligensMlCalibration";

export type OligensBenchmarkCategory = "humain" | "ia" | "paraphrase" | "humanise" | "traduction" | "court" | "mixte";

export interface OligensBenchmarkSample {
  id: string;
  category: OligensBenchmarkCategory;
  expectedIA: boolean;
  text: string;
}

const HUMAN = `Depuis plusieurs années, la place publique du quartier change lentement. Les habitants ne parlent pas tous de la même manière de cette transformation. Certains apprécient les nouveaux commerces, tandis que d'autres regrettent la disparition de petits ateliers installés depuis longtemps. Au marché, les discussions sont souvent plus nuancées que sur les réseaux sociaux. Une vendeuse expliquait récemment que les clients reviennent surtout le samedi, quand les familles prennent davantage le temps de discuter. Cette observation ne suffit pas à tirer une conclusion générale, mais elle montre que les usages évoluent par petites touches. Pour comprendre le phénomène, il faut donc regarder les habitudes quotidiennes plutôt que de se limiter aux annonces officielles.`;

const AI = `L'intelligence artificielle transforme progressivement les méthodes de travail dans de nombreux secteurs. Cette évolution offre des opportunités significatives en matière de productivité, d'automatisation et d'analyse des données. Il est important de noter que l'adoption de ces technologies doit néanmoins s'accompagner d'une réflexion sur les compétences, la gouvernance et la responsabilité. Dans ce contexte, les organisations peuvent mettre en place une stratégie structurée permettant d'identifier les besoins, de mesurer les résultats et d'améliorer continuellement les processus. Une telle approche contribue à favoriser une intégration équilibrée et durable de l'intelligence artificielle.`;

const PARAPHRASE = `Depuis quelques années, les façons de travailler se transforment dans plusieurs domaines. Les outils numériques peuvent accélérer certaines tâches et faciliter l'examen de grandes quantités d'informations. Mais cette évolution ne règle pas automatiquement les questions de compétence, de contrôle ou de responsabilité. Une organisation qui adopte ces outils doit donc définir ses besoins, observer les effets obtenus et ajuster ses pratiques au fil du temps. Le changement est alors moins une simple acquisition technique qu'une adaptation progressive des méthodes de travail.`;

const HUMANIZED = `On parle beaucoup des outils d'intelligence artificielle, mais leur arrivée dans le travail quotidien est moins simple qu'on pourrait le croire. Ils font gagner du temps, oui, surtout lorsqu'il faut trier beaucoup d'informations. Pourtant, une équipe peut vite se retrouver avec de nouvelles questions : qui vérifie les résultats, qui décide, et que fait-on lorsque l'outil se trompe ? Dans une petite structure, ces problèmes apparaissent parfois avant même que les responsables aient eu le temps d'écrire une véritable politique. Il vaut mieux commencer modestement, tester les usages et corriger ce qui ne fonctionne pas.`;

const TRANSLATION = `Artificial intelligence is changing the way many organizations work. These tools can reduce repetitive tasks and help teams examine large amounts of information. However, the use of such systems also creates questions about skills, responsibility and verification. An organization should therefore define its needs, measure the results and adjust its practices when necessary. The technological change is not only a matter of purchasing software; it also requires people to adapt their daily methods.`;

const SHORT = `Les habitants discutent de cette transformation avec des avis différents. Certains y voient une occasion de moderniser le quartier, tandis que d'autres restent prudents.`;

const MIXED = `La réunion a commencé assez tard, parce que plusieurs personnes étaient encore dans les embouteillages. Une fois installés, les participants ont repris les chiffres du trimestre précédent et comparé les résultats avec les objectifs annoncés. Il est important de noter que cette analyse permet d'identifier les principaux écarts et de mettre en place des mesures correctives adaptées. Après cette présentation, une participante a demandé si les chiffres avaient été vérifiés auprès des équipes de terrain. La discussion est alors devenue beaucoup plus concrète : on a parlé des retards de livraison, des erreurs de saisie et même d'un fournisseur qui avait changé ses conditions sans prévenir.`;

export const OLIGENS_BENCHMARK_CORPUS: OligensBenchmarkSample[] = [
  { id: "human-001", category: "humain", expectedIA: false, text: HUMAN },
  { id: "ai-001", category: "ia", expectedIA: true, text: AI },
  { id: "paraphrase-001", category: "paraphrase", expectedIA: false, text: PARAPHRASE },
  { id: "humanized-001", category: "humanise", expectedIA: false, text: HUMANIZED },
  { id: "translation-001", category: "traduction", expectedIA: true, text: TRANSLATION },
  { id: "short-001", category: "court", expectedIA: false, text: SHORT },
  { id: "mixed-001", category: "mixte", expectedIA: true, text: MIXED },
];

export interface OligensBenchmarkResult extends OligensMlMetrics {
  threshold: number;
  byCategory: Record<OligensBenchmarkCategory, { samples: number; averageScoreIA: number; flaggedAsIA: number }>;
  predictions: Array<{ id: string; category: OligensBenchmarkCategory; expectedIA: boolean; scoreIA: number; verdict: string }>;
}

export function runOligensBenchmark(samples: OligensBenchmarkSample[] = OLIGENS_BENCHMARK_CORPUS, threshold = .5): OligensBenchmarkResult {
  const predictions = samples.map((sample) => {
    const calibrated = analyzeCalibrated(sample.text, "generic");
    const result = runOligensMlCalibration(sample.text, calibrated.features);
    return { id: sample.id, category: sample.category, expectedIA: sample.expectedIA, scoreIA: result.scoreIA, verdict: result.verdict };
  });
  const metrics = evaluateOligensMl(predictions.map(({ expectedIA, scoreIA }) => ({ expectedIA, scoreIA })), threshold);
  const categories = {} as OligensBenchmarkResult["byCategory"];
  for (const category of ["humain", "ia", "paraphrase", "humanise", "traduction", "court", "mixte"] as OligensBenchmarkCategory[]) {
    const rows = predictions.filter((p) => p.category === category);
    categories[category] = { samples: rows.length, averageScoreIA: rows.length ? rows.reduce((sum, row) => sum + row.scoreIA, 0) / rows.length : 0, flaggedAsIA: rows.filter((row) => row.scoreIA >= threshold).length };
  }
  return { ...metrics, threshold, byCategory: categories, predictions };
}
