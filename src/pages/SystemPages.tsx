import { useState } from "react";
import { IconCheck, IconDatabase, IconLock, IconRefresh, IconShield } from "../components/icons";
import { facultyDistribution, fmtInt, monthlyAiRate } from "../data";
import { QWEN_CONFIG } from "../lib/humanizer/qwenClient";
import { useAnalysis } from "../state/AnalysisContext";
import { useCorpus } from "../state/CorpusContext";
import { Kpi, MeterBar, PageHead, Pill, Reveal, SectionTitle, Toggle } from "../ui";

/* ================= STATISTIQUES ================= */

function TrendChart() {
  const w = 560;
  const h = 200;
  const pad = 26;
  const maxV = 50;
  const pts = monthlyAiRate.map((d, i) => ({
    x: pad + (i * (w - pad * 2)) / (monthlyAiRate.length - 1),
    y: h - 34 - (d.v / maxV) * (h - 70),
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${h - 30} L${pts[0].x},${h - 30} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="stat-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8bd55" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#e8bd55" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50].map((g) => {
        const y = h - 34 - (g / maxV) * (h - 70);
        return (
          <g key={g}>
            <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(132,148,186,0.14)" strokeDasharray="3 5" />
            <text x={pad - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#5f7096" fontFamily="IBM Plex Mono, monospace">{g} %</text>
          </g>
        );
      })}
      <path d={area} fill="url(#stat-area)" className="spark-fill" />
      <path d={line} fill="none" stroke="#e8bd55" strokeWidth="2.2" strokeLinecap="round" pathLength={1} className="spark-path" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#0b1428" stroke="#e8bd55" strokeWidth="1.6" className="spark-fill" />
          <text x={p.x} y={h - 12} textAnchor="middle" fontSize="8.5" fill="#5f7096" fontFamily="IBM Plex Mono, monospace">{monthlyAiRate[i].m}</text>
        </g>
      ))}
    </svg>
  );
}

export function StatisticsPage() {
  const { analysesCount } = useAnalysis();
  const models = [
    { name: "GPT-4o", vendor: "OpenAI", v: 38 },
    { name: "Gemini 1.5 Pro", vendor: "Google", v: 24 },
    { name: "Claude 3.5 Sonnet", vendor: "Anthropic", v: 16 },
    { name: "Llama 3.1 70B", vendor: "Meta", v: 12 },
    { name: "Mistral Large 2", vendor: "Mistral AI", v: 10 },
  ];

  return (
    <>
      <PageHead
        kicker="Performances du moteur v2.1 & tendances institutionnelles"
        title="Statistiques"
        actions={<button className="btn-ghost px-3.5 py-2 text-[12.5px]">Exporter (CSV)</button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Taux IA moyen (févr.)" value="47" unit="%" accent sub="+3 pts vs janvier" />
        <Kpi label="Analyses cumulées" value={fmtInt(analysesCount)} sub="session incluse" />
        <Kpi label="Débit moteur" value="8 450" unit="mots/s" sub="pic mesuré à 11 200" />
        <Kpi label="Usage Web Worker" value="18" unit="%" sub="documents > 10 000 mots" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <section className="glass card-hover h-full rounded-2xl p-5">
            <SectionTitle title="Taux de risque IA mensuel" right={<span className="font-mono text-[10px] text-ink-500">12 derniers mois · tous corpus</span>} />
            <TrendChart />
          </section>
        </Reveal>
        <Reveal delay={100}>
          <section className="glass card-hover h-full rounded-2xl p-5">
            <SectionTitle title="Modèles les plus détectés" right={<span className="font-mono text-[10px] text-ink-500">févr. 2026</span>} />
            <div className="space-y-3.5">
              {models.map((mo, i) => (
                <div key={mo.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <p className="text-[12.5px] font-semibold text-ink-200">
                      {mo.name}
                      <span className="ml-2 text-[10.5px] font-normal text-ink-500">{mo.vendor}</span>
                    </p>
                    <span className="font-mono text-[12px] font-semibold text-gold-300">{mo.v} %</span>
                  </div>
                  <MeterBar value={mo.v * 2} height={i === 0 ? 6 : 4} color={i === 0 ? "linear-gradient(90deg,#b08427,#e8bd55,#f8e3a4)" : "linear-gradient(90deg,#2b4fa6,#5b8def)"} />
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      </div>

      <Reveal delay={140}>
        <section className="glass mt-5 rounded-2xl p-5">
          <SectionTitle title="Répartition par faculté" right={<span className="font-mono text-[10px] text-ink-500">% du volume analysé</span>} />
          <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 md:grid-cols-2">
            {facultyDistribution.map((f) => (
              <div key={f.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-300">{f.name}</span>
                  <span className="font-mono text-[12px] font-semibold text-ink-100">{f.v} %</span>
                </div>
                <MeterBar value={f.v * 2.4} height={5} color="linear-gradient(90deg,#2b4fa6,#5b8def,#8fb0f5)" />
              </div>
            ))}
          </div>
        </section>
      </Reveal>
    </>
  );
}

/* ================= PARAMÈTRES ================= */

export function SettingsPage() {
  const { toast } = useAnalysis();
  const [seuil, setSeuil] = useState(50);
  const [minMots, setMinMots] = useState(30);
  const [workerSeuil, setWorkerSeuil] = useState(10000);
  const [flagAuto, setFlagAuto] = useState(true);
  const [archive90, setArchive90] = useState(true);
  const [purge, setPurge] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState<string>(QWEN_CONFIG.apiKey);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const Slider = ({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) => (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-ink-300">{label}</span>
        <span className="font-mono text-[12px] font-semibold text-gold-300">
          {fmtInt(value)} {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: "#e8bd55" }} />
    </div>
  );

  return (
    <>
      <PageHead
        kicker="Clés d'API · profils · sécurité & conformité"
        title="Paramètres"
        actions={
          <button onClick={() => toast("Paramètres enregistrés", "La configuration a été propagée au moteur v2.1 et aux 3 nœuds d'analyse.")} className="btn-gold px-4 py-2 text-[12.5px]">
            <IconCheck className="h-4 w-4" /> Enregistrer
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Reveal>
          <section className="glass rounded-2xl p-5">
            <SectionTitle title="Règles de tolérance heuristique" right={<Pill tone="gold">Voie 3</Pill>} />
            <div className="space-y-5">
              <Slider label="Seuil d'alerte (risque IA)" value={seuil} min={25} max={75} step={5} unit="%" onChange={setSeuil} />
              <Slider label="Nombre minimal de mots" value={minMots} min={30} max={300} step={10} unit="mots" onChange={setMinMots} />
              <Slider label="Bascule Web Worker" value={workerSeuil} min={5000} max={20000} step={500} unit="mots" onChange={setWorkerSeuil} />
            </div>
            <div className="mt-5 space-y-2.5 border-t border-white/[0.06] pt-4">
              <Toggle on={flagAuto} onChange={setFlagAuto} label="Signalement automatique au-delà du seuil" hint="Notifie la commission d'intégrité académique" />
              <Toggle on={archive90} onChange={setArchive90} label="Archivage automatique 90 jours" hint="Puis purge chiffrée irréversible" />
            </div>
          </section>
        </Reveal>

        <div className="space-y-5">
          <Reveal delay={80}>
            <section className="glass rounded-2xl p-5">
              <SectionTitle title="Clé d'API DashScope / Qwen" right={<Pill tone="info">{QWEN_CONFIG.model}</Pill>} />
              <label className="label-caps text-ink-500">Clé secrète AgweStream</label>
              <div className="mt-2 flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-night-900/60 px-3.5 py-2 font-mono text-[11px] text-ink-200 outline-none transition-colors focus:border-gold-400/50"
                />
                <button onClick={() => setShowKey((v) => !v)} className="btn-ghost shrink-0 px-3 py-2 text-[12px]">
                  {showKey ? "Masquer" : "Révéler"}
                </button>
                <button
                  onClick={() => {
                    setApiKey("sk-ws-" + Math.random().toString(16).slice(2, 18));
                    toast("Clé régénérée", "L'ancienne clé est révoquée dans 24 h.");
                  }}
                  className="btn-ghost shrink-0 px-3 py-2 text-[12px]"
                >
                  <IconRefresh className="h-3.5 w-3.5" /> Régénérer
                </button>
              </div>
              <label className="label-caps mt-4 block text-ink-500">Endpoint (mode compatible OpenAI)</label>
              <input
                defaultValue={QWEN_CONFIG.baseUrl}
                className="mt-2 w-full rounded-lg border border-white/10 bg-night-900/60 px-3.5 py-2 font-mono text-[10.5px] text-ink-200 outline-none transition-colors focus:border-gold-400/50"
              />
              <p className="mt-2.5 text-[10.5px] leading-snug text-ink-500">
                Workspace <span className="font-mono text-gold-300">{QWEN_CONFIG.workspaceId}</span> · utilisée par l'Humaniseur
                hybride et la vérification croisée sémantique.
              </p>
            </section>
          </Reveal>

          <Reveal delay={140}>
            <section className="glass rounded-2xl p-5">
              <SectionTitle title="Conformité RGPD" right={<Pill tone="ok">UE · eIDAS</Pill>} />
              <div className="space-y-2.5">
                <Toggle on={purge} onChange={setPurge} label="Purge automatique des documents analysés" hint="Dès la remise du rapport certifié" />
                <Toggle on onChange={() => undefined} label="Hébergement exclusivement européen" hint="OVHcloud Gravelines · réplication Dublin" disabled />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => toast("Registre exporté", "registre_traitements_2026.xlsx — 34 lignes, prêt pour la DPO.")} className="btn-ghost px-3 py-2 text-[12px]">
                  <IconShield className="h-3.5 w-3.5" /> Exporter le registre
                </button>
                <button
                  onClick={() => {
                    if (!confirmPurge) {
                      setConfirmPurge(true);
                      window.setTimeout(() => setConfirmPurge(false), 3000);
                      return;
                    }
                    setConfirmPurge(false);
                    toast("Purge exécutée", "12 480 documents supprimés · certificat d'effacement émis.");
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                    confirmPurge ? "border-rose-400/60 bg-rose-400/15 text-rose-400" : "border-rose-400/30 text-rose-400 hover:bg-rose-400/10"
                  }`}
                >
                  <IconLock className="h-3.5 w-3.5" /> {confirmPurge ? "Confirmer la purge ?" : "Purger les documents"}
                </button>
              </div>
            </section>
          </Reveal>
        </div>
      </div>
    </>
  );
}

/* ================= BASE INSTITUTIONNELLE ================= */

interface Source {
  id: string;
  name: string;
  docs: number;
  last: string;
  syncing: boolean;
}

export function BaseInstitutionnellePage() {
  const { toast } = useAnalysis();
  const [sources, setSources] = useState<Source[]>([
    { id: "s1", name: "Bibliothèque numérique", docs: 52480, last: "il y a 1 h", syncing: false },
    { id: "s2", name: "HAL institutionnel", docs: 36904, last: "il y a 3 h", syncing: false },
    { id: "s3", name: "Thèses en ligne (STAR)", docs: 18230, last: "hier", syncing: false },
    { id: "s4", name: "Revues internes Open Access", docs: 20823, last: "il y a 2 j", syncing: false },
  ]);
  const [logs, setLogs] = useState<string[]>([
    "09:42:11 · RAG privé — index vectoriel chargé (84,2 Go, 128 437 docs)",
    "09:42:09 · Connexion chiffrée TLS 1.3 établie avec le SGBD institutionnel",
    "09:41:57 · Session Administrateur Institution ouverte (a.delcourt)",
  ]);

  const sync = (id: string) => {
    const name = sources.find((s) => s.id === id)?.name ?? "source";
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, syncing: true } : s)));
    window.setTimeout(() => {
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, syncing: false, last: "à l'instant" } : s)));
      setLogs((prev) => [`${new Date().toLocaleTimeString("fr-FR")} · Synchronisation « ${name} » terminée — +${Math.floor(Math.random() * 180)} nouveaux documents`, ...prev].slice(0, 6));
      toast("Synchronisation terminée", `« ${name} » est à jour.`);
    }, 1600);
  };

  return (
    <>
      <PageHead
        kicker="Archives & corpus institutionnels (RAG privé)"
        title="Base institutionnelle"
        actions={
          <span className="inline-flex items-center gap-2 rounded-lg border border-jade-400/25 bg-jade-400/[0.06] px-3 py-1.5">
            <span className="live-dot h-2 w-2 rounded-full bg-jade-400" />
            <span className="font-mono text-[11px] text-jade-400">RAG privé · connecté</span>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Documents archivés" value={fmtInt(128437)} accent sub="toutes sources confondues" />
        <Kpi label="Volume indexé" value="84,2" unit="Go" sub="chiffré AES-256" />
        <Kpi label="Latence moyenne" value="42" unit="ms" sub="recherche vectorielle top-10" />
        <Kpi label="Sources actives" value={`${sources.length} / 4`} sub="protocoles SWORD & OAI-PMH" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <section className="glass h-full rounded-2xl p-5">
            <SectionTitle icon={<IconDatabase className="h-4 w-4" />} title="Sources connectées" />
            <ul className="divide-y divide-white/[0.05]">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-2 py-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/[0.08] text-gold-300">
                    <IconDatabase className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-100">{s.name}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                      {fmtInt(s.docs)} documents · dernière synchro : {s.last}
                    </p>
                  </div>
                  <button onClick={() => sync(s.id)} disabled={s.syncing} className="btn-ghost shrink-0 px-3 py-1.5 text-[11.5px] disabled:opacity-50">
                    <IconRefresh className={`h-3.5 w-3.5 ${s.syncing ? "animate-spin" : ""}`} />
                    {s.syncing ? "Synchro…" : "Synchroniser"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
        <Reveal delay={100}>
          <section className="glass h-full rounded-2xl p-5">
            <SectionTitle title="Journal de connexion" right={<span className="live-dot h-2 w-2 rounded-full bg-jade-400" />} />
            <ul className="space-y-2.5">
              {logs.map((l, i) => (
                <li key={l} className={`rounded-lg border border-white/[0.06] bg-night-900/50 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed ${i === 0 ? "text-gold-300" : "text-ink-400"}`}>
                  {l}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      </div>
    </>
  );
}

/* ================= BASE DOCUMENTAIRE (/database) ================= */

export function KnowledgeBasePage() {
  const { toast } = useAnalysis();
  const { folders } = useCorpus();
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(["corpus-thematiques", "biblio-numerique", "hal", "star", "revues-oa"].map((k) => [k, true]))
  );
  const [indexing, setIndexing] = useState(false);

  const totalWords = folders.reduce((a, f) => a + f.files.reduce((b, d) => b + d.mots, 0), 0);
  const active = Object.values(enabled).filter(Boolean).length;

  return (
    <>
      <PageHead
        kicker="Gestion de la base documentaire globale de l'institution"
        title="Base documentaire"
        actions={
          <span className="rounded-lg border border-jade-400/25 bg-jade-400/[0.06] px-3 py-1.5 font-mono text-[11px] text-jade-400">
            index vectoriel · {active}/5 sources actives
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Corpus locaux" value={String(folders.reduce((a, f) => a + f.files.length, 0))} accent sub="dossiers thématiques" />
        <Kpi label="Mots des corpus locaux" value={fmtInt(totalWords)} sub={`${folders.length} dossiers thématiques`} />
        <Kpi label="Intégrité de l'index" value="97" unit="%" sub="0 shard corrompu" />
        <Kpi label="Dernière réindexation" value="02:00" sub="cette nuit · 4 min 12 s" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <section className="glass h-full rounded-2xl p-5">
            <SectionTitle icon={<IconDatabase className="h-4 w-4" />} title="Sources de la base globale" />
            <ul className="divide-y divide-white/[0.05]">
              {[
                { id: "corpus-thematiques", name: "Corpus thématiques locaux", detail: `${folders.length} dossiers · gérés dans « Corpus & dossiers »` },
                { id: "biblio-numerique", name: "Bibliothèque numérique", detail: "52 480 documents · SWORD" },
                { id: "hal", name: "HAL institutionnel", detail: "36 904 documents · OAI-PMH" },
                { id: "star", name: "Thèses en ligne (STAR)", detail: "18 230 documents · dépôts nationaux" },
                { id: "revues-oa", name: "Revues internes Open Access", detail: "20 823 documents · DOI Crossref" },
              ].map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-100">{s.name}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">{s.detail}</p>
                  </div>
                  {!enabled[s.id] && <Pill tone="info">hors index</Pill>}
                  <Toggle on={enabled[s.id] ?? false} onChange={(v) => setEnabled((prev) => ({ ...prev, [s.id]: v }))} label="" />
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        <Reveal delay={100}>
          <section className="glass h-full rounded-2xl p-5">
            <SectionTitle title="Maintenance de l'index" />
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (indexing) return;
                  setIndexing(true);
                  window.setTimeout(() => {
                    setIndexing(false);
                    toast("Réindexation terminée", "128 437 documents ré-embeddés en 4 min 12 s.");
                  }, 1800);
                }}
                disabled={indexing}
                className="btn-gold w-full px-4 py-2.5 text-[12.5px] disabled:opacity-50"
              >
                <IconRefresh className={`h-4 w-4 ${indexing ? "animate-spin" : ""}`} />
                {indexing ? "Réindexation en cours…" : "Réindexer la base"}
              </button>
              <button onClick={() => toast("Optimisation planifiée", "Le compactage HNSW sera exécuté à 02:00.")} className="btn-ghost w-full px-4 py-2.5 text-[12.5px]">
                Compacter l'index HNSW
              </button>
              <div className="glass-soft rounded-xl p-3.5">
                <p className="label-caps text-ink-500">Santé de l'index</p>
                <div className="mt-2">
                  <MeterBar value={97} height={5} color="linear-gradient(90deg,#1d8a5f,#3ddc97)" />
                </div>
                <p className="mt-1.5 font-mono text-[10.5px] text-ink-400">intégrité 97 % · 0 shard corrompu</p>
              </div>
            </div>
          </section>
        </Reveal>
      </div>
    </>
  );
}
