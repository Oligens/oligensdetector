import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { IconArrow, IconCheck, IconEye, IconFile, IconFolder, IconRefresh, IconScan, IconTrash, IconUpload } from "../components/icons";
import { fmtInt } from "../data";
import type { LocalHit } from "../lib/verify/localCorpus";
import { PageHead, Pill, Reveal } from "../ui";
import { useCorpus } from "../state/CorpusContext";
import { useAnalysis } from "../state/AnalysisContext";
import { VerifyReportView, useVerify } from "./VerifyPage";

const kindCls: Record<string, string> = {
  pdf: "border-rose-400/35 bg-rose-400/10 text-rose-400",
  docx: "border-azure-400/35 bg-azure-400/10 text-azure-300",
  txt: "border-ink-400/30 bg-white/5 text-ink-300",
  md: "border-jade-400/30 bg-jade-400/10 text-jade-400",
  rtf: "border-ink-400/30 bg-white/5 text-ink-300",
};

/* ══════════════ /corpus — liste des dossiers (CRUD) ══════════════ */

export default function CorpusListPage() {
  const { folders, addFolder, deleteFolder } = useCorpus();
  const { toast } = useAnalysis();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const totalDocs = folders.reduce((a, f) => a + f.files.length, 0);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const folder = addFolder(n, theme.trim());
    setName("");
    setTheme("");
    toast("Dossier créé", `« ${folder.name} » est prêt — ajoutez-y des documents puis lancez un scan ciblé.`);
    navigate(`/corpus/${folder.id}`);
  };

  return (
    <>
      <PageHead
        kicker="Organisation & regroupement par thématiques / projets"
        title="Corpus & dossiers"
        actions={
          <span className="rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 font-mono text-[12px] font-bold text-gold-300">
            {folders.length} dossiers · {totalDocs} documents
          </span>
        }
      />

      {/* Formulaire de création */}
      <Reveal>
        <section className="glass mb-5 rounded-2xl p-5">
          <p className="label-caps mb-3 text-ink-500">Créer un dossier thématique</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Nom du dossier (ex. Mémoires Droit 2026)…"
              className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-night-900/60 px-3.5 py-2.5 text-[13px] text-ink-200 outline-none transition-colors placeholder:text-ink-500 focus:border-gold-400/50"
            />
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Thématique (ex. Droit)"
              className="w-44 rounded-lg border border-white/10 bg-night-900/60 px-3.5 py-2.5 text-[13px] text-ink-200 outline-none transition-colors placeholder:text-ink-500 focus:border-gold-400/50"
            />
            <button onClick={create} disabled={!name.trim()} className="btn-gold px-4 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-40">
              + Créer
            </button>
          </div>
          <p className="mt-2.5 text-[11px] text-ink-500">
            Le dossier devient une <span className="text-gold-300">base de comparaison locale</span> : chaque scan ciblé croise le document
            suspect avec ses documents internes (règle du plagiat conditionnel).
          </p>
        </section>
      </Reveal>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {folders.map((f, i) => {
          const mots = f.files.reduce((a, d) => a + d.mots, 0);
          return (
            <Reveal key={f.id} delay={i * 70}>
              <article className="glass card-hover group flex h-full flex-col rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold-400/25 bg-gold-400/[0.08] text-gold-300 transition-transform duration-300 group-hover:-translate-y-1">
                    <IconFolder className="h-5 w-5" />
                  </span>
                  <Pill tone="gold">{f.theme}</Pill>
                </div>
                <h3 className="mt-3.5 text-[13.5px] font-semibold leading-snug text-ink-100">{f.name}</h3>
                <p className="mt-1 font-mono text-[10.5px] text-ink-500">
                  {f.files.length} document{f.files.length > 1 ? "s" : ""} · {fmtInt(mots)} mots · créé le {f.createdAt}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 pt-1">
                  <button onClick={() => navigate(`/corpus/${f.id}`)} className="btn-ghost flex-1 px-2 py-1.5 text-[11.5px]">
                    <IconEye className="h-3.5 w-3.5" /> Ouvrir
                  </button>
                  <button onClick={() => navigate(`/corpus/scan?id=${f.id}`)} className="btn-gold flex-1 px-2 py-1.5 text-[11.5px]">
                    <IconScan className="h-3.5 w-3.5" /> Scanner
                  </button>
                  <button
                    onClick={() => {
                      if (confirmDelete === f.id) {
                        deleteFolder(f.id);
                        setConfirmDelete(null);
                        toast("Dossier supprimé", `« ${f.name} » et ses documents ont été retirés.`);
                      } else {
                        setConfirmDelete(f.id);
                        window.setTimeout(() => setConfirmDelete((v) => (v === f.id ? null : v)), 3000);
                      }
                    }}
                    className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors ${
                      confirmDelete === f.id ? "border-rose-400/60 bg-rose-400/15 text-rose-400" : "border-white/10 text-ink-500 hover:border-rose-400/40 hover:text-rose-400"
                    }`}
                    aria-label={confirmDelete === f.id ? "Confirmer la suppression" : "Supprimer le dossier"}
                    title={confirmDelete === f.id ? "Confirmer ?" : "Supprimer"}
                  >
                    {confirmDelete === f.id ? <IconCheck className="h-4 w-4" /> : <IconTrash className="h-4 w-4" />}
                  </button>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}

/* ══════════════ /corpus/:id — documents du dossier ══════════════ */

export function CorpusDetailPage() {
  const { id } = useParamsSafe();
  const { getFolder, addFile, removeFile, renameFolder } = useCorpus();
  const { toast } = useAnalysis();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const folder = id ? getFolder(id) : undefined;

  const importFiles = async (files: FileList | null) => {
    if (!files || !folder) return;
    const list = Array.from(files);
    for (const file of list) {
      setImporting(`Extraction de ${file.name}…`);
      try {
        const { extractTextFromFile } = await import("../lib/detector/textExtractor");
        const text = await extractTextFromFile(file);
        if (!text.trim()) {
          toast("Fichier vide", `${file.name} ne contient aucun texte extractible.`);
          continue;
        }
        addFile(folder.id, {
          name: file.name,
          kind: (file.name.split(".").pop()?.toLowerCase() ?? "txt") as "pdf" | "docx" | "txt" | "md" | "rtf",
          sizeKo: Math.max(1, Math.round(file.size / 1024)),
          mots: text.trim().split(/\s+/).length,
          text,
        });
        toast("Document ajouté", `${file.name} rejoint « ${folder.name} » (${fmtInt(text.trim().split(/\s+/).length)} mots indexés).`);
      } catch {
        toast("Extraction impossible", `${file.name} n'a pas pu être lu.`);
      }
    }
    setImporting(null);
  };

  if (!folder) {
    return (
      <div className="glass grid place-items-center rounded-2xl border-dashed px-6 py-20 text-center">
        <IconFolder className="h-12 w-12 text-ink-500" />
        <p className="mt-4 font-display text-[15px] font-bold text-ink-100">Dossier introuvable</p>
        <p className="mt-2 text-[12.5px] text-ink-400">Ce dossier a peut-être été supprimé.</p>
        <Link to="/corpus" className="btn-gold mt-5 px-4 py-2.5 text-[13px]">
          Retour aux corpus
        </Link>
      </div>
    );
  }

  const mots = folder.files.reduce((a, d) => a + d.mots, 0);

  return (
    <>
      <PageHead
        kicker={`Dossier thématique · ${folder.theme}`}
        title={folder.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/corpus" className="btn-ghost px-3.5 py-2 text-[12.5px]">
              ← Tous les corpus
            </Link>
            <button
              onClick={() => {
                setRenameValue(folder.name);
                setRenaming((v) => !v);
              }}
              className="btn-ghost px-3.5 py-2 text-[12.5px]"
            >
              Renommer
            </button>
            <button onClick={() => navigate(`/corpus/scan?id=${folder.id}`)} className="btn-gold px-4 py-2 text-[12.5px]">
              <IconScan className="h-4 w-4" /> Scanner contre ce corpus
            </button>
          </div>
        }
      />

      {renaming && (
        <Reveal>
          <div className="glass mb-5 flex flex-wrap items-center gap-2.5 rounded-xl p-4">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) {
                  renameFolder(folder.id, renameValue.trim());
                  setRenaming(false);
                  toast("Dossier renommé", `Nouveau nom : « ${renameValue.trim()} ».`);
                }
              }}
              className="min-w-[240px] flex-1 rounded-lg border border-gold-400/40 bg-night-900/60 px-3.5 py-2 text-[13px] text-ink-100 outline-none focus:border-gold-400/70"
            />
            <button
              onClick={() => {
                if (renameValue.trim()) {
                  renameFolder(folder.id, renameValue.trim());
                  setRenaming(false);
                  toast("Dossier renommé", `Nouveau nom : « ${renameValue.trim()} ».`);
                }
              }}
              className="btn-gold px-4 py-2 text-[12.5px]"
            >
              Enregistrer
            </button>
            <button onClick={() => setRenaming(false)} className="btn-ghost px-3.5 py-2 text-[12.5px]">
              Annuler
            </button>
          </div>
        </Reveal>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Documents" value={String(folder.files.length)} />
        <Stat label="Mots indexés" value={fmtInt(mots)} />
        <Stat label="Volume" value={`${fmtInt(folder.files.reduce((a, d) => a + d.sizeKo, 0))} Ko`} />
        <Stat label="Thématique" value={folder.theme} />
      </div>

      <Reveal delay={100}>
        <section className="glass mt-5 rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Documents du dossier</h2>
            <div className="flex items-center gap-2">
              {importing && (
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-azure-300">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-azure-400" /> {importing}
                </span>
              )}
              <button onClick={() => fileRef.current?.click()} className="btn-gold px-4 py-2 text-[12.5px]">
                <IconUpload className="h-4 w-4" /> Ajouter des fichiers
              </button>
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.rtf" className="hidden" onChange={(e) => void importFiles(e.target.files)} />
            </div>
          </div>

          {folder.files.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-ink-500/25 px-6 py-14 text-center">
              <IconFile className="h-10 w-10 text-ink-500" />
              <p className="mt-3 text-[13px] font-semibold text-ink-300">Aucun document dans ce dossier</p>
              <p className="mx-auto mt-1.5 max-w-[340px] text-[12px] leading-relaxed text-ink-500">
                Ajoutez des PDF, DOCX ou TXT : leur texte est extrait et indexé, puis sert de base de comparaison lors des
                scans ciblés.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {folder.files.map((d) => (
                <li key={d.id} className="group flex items-center gap-3.5 rounded-lg px-2 py-3 transition-colors duration-300 hover:bg-white/[0.035]">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border font-mono text-[9px] font-bold uppercase ${kindCls[d.kind] ?? kindCls.txt}`}>
                    {d.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-100" title={d.name}>{d.name}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                      {fmtInt(d.mots)} mots · {fmtInt(d.sizeKo)} Ko · ajouté le {d.addedAt}
                    </p>
                  </div>
                  <button onClick={() => setPreview(preview === d.id ? null : d.id)} className="btn-ghost shrink-0 px-3 py-1.5 text-[11.5px]">
                    <IconEye className="h-3.5 w-3.5" /> {preview === d.id ? "Masquer" : "Aperçu"}
                  </button>
                  <button
                    onClick={() => {
                      removeFile(folder.id, d.id);
                      toast("Document retiré", `${d.name} a été sorti du dossier.`);
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-ink-500 transition-colors hover:border-rose-400/40 hover:text-rose-400"
                    aria-label={`Retirer ${d.name}`}
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                  {preview === d.id && (
                    <div className="basis-full">
                      <p className="mt-2 rounded-lg border border-white/[0.06] bg-night-900/50 p-3.5 text-[12px] leading-relaxed text-ink-300">
                        {d.text.slice(0, 600)}
                        {d.text.length > 600 && <span className="text-ink-500"> … ({fmtInt(d.mots)} mots au total)</span>}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Reveal>
      <div className="glass card-hover rounded-2xl p-4">
        <p className="label-caps text-ink-500">{label}</p>
        <p className="mt-2 truncate font-display text-[19px] font-bold leading-none text-gold-300" title={value}>{value}</p>
      </div>
    </Reveal>
  );
}

/* ══════════════ /corpus/scan?id= — scan ciblé sur le dossier ══════════════ */

export function CorpusScanPage() {
  const [params] = useSearchParams();
  const id = params.get("id");
  const { getFolder } = useCorpus();
  const { toast } = useAnalysis();
  const { state, run } = useVerify();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const folder = id ? getFolder(id) : undefined;

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  const localBase = useMemo<LocalHit[]>(() => {
    if (!folder) return [];
    const hits: LocalHit[] = [];
    for (const file of folder.files) {
      const sentences = file.text.split(/[.!?]\s+/).filter((s) => s.trim().split(/\s+/).length >= 8);
      for (const s of sentences.slice(0, 12)) {
        hits.push({
          doc: { id: file.id, title: file.name, authors: [], year: new Date().getFullYear(), kind: "Document du corpus", excerpts: [] },
          excerpt: s.trim(),
          score: 0,
        });
      }
    }
    return hits;
  }, [folder]);

  const launch = useCallback(async () => {
    if (!folder || words < 40 || state.running) return;
    const overrides = { localBase, localBaseLabel: `Corpus « ${folder.name} » (${folder.files.length} documents)` };
    await run(text, `Scan_cible_${folder.name.replace(/\s+/g, "_").slice(0, 24)}.txt`, { useWeb: true, useQwen: true }, overrides);
    toast("Scan ciblé terminé", `Document croisé avec ${localBase.length} extraits du dossier « ${folder.name} ».`);
  }, [folder, text, words, localBase, state.running, run, toast]);

  if (!folder) {
    return (
      <div className="glass grid place-items-center rounded-2xl border-dashed px-6 py-20 text-center">
        <IconFolder className="h-12 w-12 text-ink-500" />
        <p className="mt-4 font-display text-[15px] font-bold text-ink-100">Corpus introuvable</p>
        <p className="mt-2 text-[12.5px] text-ink-400">Sélectionnez un dossier valide pour lancer un scan ciblé.</p>
        <Link to="/corpus" className="btn-gold mt-5 px-4 py-2.5 text-[13px]">
          Retour aux corpus
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHead
        kicker="Scan ciblé — le dossier sert de base de comparaison locale"
        title={`Scanner contre « ${folder.name} »`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/corpus/${folder.id}`} className="btn-ghost px-3.5 py-2 text-[12.5px]">
              ← Dossier
            </Link>
            <Pill tone="gold">
              {folder.files.length} document{folder.files.length > 1 ? "s" : ""} · {fmtInt(localBase.length)} extraits indexés
            </Pill>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Reveal>
          <section className="glass flex h-full flex-col rounded-2xl p-5">
            <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Document suspect à vérifier</h2>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-500">
              Chaque phrase sera comparée aux documents du dossier (similarité lexicale) puis au web. Sans référence valide,
              toute similarité forte est qualifiée de <span className="font-semibold text-rose-400">plagiat avéré</span>.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={state.running}
              placeholder="Collez le texte suspect (minimum 40 mots) ou importez un fichier…"
              className="mt-3.5 h-64 w-full flex-1 resize-none rounded-xl border border-white/10 bg-night-900/60 p-3.5 text-[12.5px] leading-relaxed text-ink-200 outline-none transition-colors duration-300 placeholder:text-ink-500 focus:border-gold-400/50 disabled:opacity-60"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={`font-mono text-[11px] ${words === 0 ? "text-ink-500" : words < 40 ? "text-ember-400" : "text-jade-400"}`}>
                {fmtInt(words)} mots {words > 0 && words < 40 && "· min. 40"}
              </span>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-2 text-[12px]">
                  <IconUpload className="h-3.5 w-3.5" /> Importer
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      const { extractTextFromFile } = await import("../lib/detector/textExtractor");
                      setText((await extractTextFromFile(f)).slice(0, 20000));
                    } catch {
                      toast("Extraction impossible", "Ce document n'a pas pu être lu.");
                    }
                  }}
                />
                <button onClick={() => void launch()} disabled={words < 40 || state.running} className="btn-gold px-4 py-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40">
                  <IconScan className="h-4 w-4" /> {state.running ? "Scan en cours…" : "Lancer le scan ciblé"}
                </button>
              </div>
            </div>
            <div className="mt-3.5 rounded-lg border border-white/[0.06] bg-night-900/40 p-3.5">
              <p className="label-caps text-ink-500">Base de comparaison active</p>
              <ul className="mt-2 space-y-1.5">
                {folder.files.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-[11.5px] text-ink-300">
                    <IconFile className="h-3.5 w-3.5 shrink-0 text-gold-400" />
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-ink-500">{fmtInt(d.mots)} mots</span>
                  </li>
                ))}
                {folder.files.length === 0 && (
                  <li className="text-[11.5px] text-ember-400">
                    Dossier vide — ajoutez des documents dans le dossier pour enrichir la comparaison.
                  </li>
                )}
              </ul>
            </div>
          </section>
        </Reveal>

        <Reveal delay={120}>
          <section className="flex h-full flex-col gap-4">
            {state.running ? (
              <PhasePanel label={state.phaseLabel} />
            ) : state.report ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-ink-500">
                    Croisement avec « {folder.name} » · {fmtInt(state.report.words)} mots · {state.report.generatedAt}
                  </p>
                  <Pill tone={state.report.similarity.plagiatsAveres > 0 ? "bad" : "ok"}>
                    {state.report.similarity.plagiatsAveres} plagiat{state.report.similarity.plagiatsAveres > 1 ? "s" : ""} avéré{state.report.similarity.plagiatsAveres > 1 ? "s" : ""}
                  </Pill>
                </div>
                <VerifyReportView report={state.report} />
              </>
            ) : (
              <div className="glass grid flex-1 place-items-center rounded-2xl border-dashed px-6 py-16 text-center">
                <div>
                  <IconRefresh className="floaty mx-auto h-11 w-11 text-gold-400/70" />
                  <p className="mt-4 font-display text-[15px] font-bold text-ink-100">Résultats du scan ciblé</p>
                  <p className="mx-auto mt-2 max-w-[340px] text-[12.5px] leading-relaxed text-ink-400">
                    Le rapport appliquera la règle du plagiat conditionnel sur les similarités trouvées dans le dossier,
                    complétées par le web et la vérification croisée LLM.
                  </p>
                </div>
              </div>
            )}
          </section>
        </Reveal>
      </div>
    </>
  );
}

function PhasePanel({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-gold-400/20 bg-night-900/50 p-6">
      <p className="label-caps text-ink-500">Moteur hybride — scan ciblé</p>
      <p className="mt-2 font-mono text-[12px] text-gold-300">{label}</p>
      <div className="mt-8 grid place-items-center">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gold-400 border-r-gold-400/40 [animation-duration:1.1s]" />
          <div className="absolute inset-2.5 animate-spin rounded-full border-2 border-transparent border-b-azure-400 border-l-azure-400/40 [animation-direction:reverse] [animation-duration:1.7s]" />
          <div className="absolute inset-0 grid place-items-center">
            <IconScan className="h-7 w-7 text-gold-300 gold-text-glow" />
          </div>
        </div>
      </div>
      <div className="mt-8">
        <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
          <div className="bar-slide h-full w-[38%] rounded-full bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
        </div>
      </div>
      <p className="mt-auto pt-6 text-center font-mono text-[10px] leading-relaxed text-ink-500">
        Similarités corpus → web → CrossRef → LLM AgweStream
        <br />
        <IconArrow className="mr-1 inline h-3 w-3" /> la règle du plagiat conditionnel s'applique à chaque correspondance
      </p>
    </div>
  );
}

/* Helper — lecture du paramètre :id */
function useParamsSafe() {
  return useParams<{ id: string }>();
}
