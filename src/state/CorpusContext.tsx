// ============================================================
// CorpusContext — dossiers thématiques & documents (CRUD)
// Persistance localStorage + seeds de démonstration dont les
// extraits servent de base de comparaison au scan ciblé.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CorpusFileKind = "pdf" | "docx" | "txt" | "md" | "rtf";

export interface CorpusFile {
  id: string;
  name: string;
  kind: CorpusFileKind;
  sizeKo: number;
  mots: number;
  /** Texte extrait (plafonné pour la persistance localStorage). */
  text: string;
  addedAt: string;
}

export interface CorpusFolder {
  id: string;
  name: string;
  theme: string;
  createdAt: string;
  files: CorpusFile[];
}

const STORAGE_KEY = "oligens-corpus-v1";
const TEXT_CAP = 6000;

const now = () =>
  new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

function seedFolders(): CorpusFolder[] {
  return [
    {
      id: "f1",
      name: "Session 2026 — Droit numérique",
      theme: "Droit",
      createdAt: "02 janv. 2026",
      files: [
        {
          id: "f1-d1",
          name: "Note_stylometrie_integrite.txt",
          kind: "txt",
          sizeKo: 4,
          mots: 182,
          addedAt: "05 janv. 2026",
          text: `La régularité rythmique des phrases, mesurée par le coefficient de variation des longueurs, constitue l'un des marqueurs les plus discriminants de l'écriture artificielle. Une analyse stylométrique combinant dix-huit caractéristiques linguistiques permet d'estimer la probabilité d'origine artificielle d'un document avec une précision supérieure à quatre-vingt-seize pour cent (Lafont, 2022). Ces travaux prolongent la détection des contenus générés par intelligence artificielle, qui repose sur la burstiness et la richesse lexicale.`,
        },
        {
          id: "f1-d2",
          name: "Emprunt_Marchand_sans_source.txt",
          kind: "txt",
          sizeKo: 3,
          mots: 141,
          addedAt: "12 janv. 2026",
          text: `Un emprunt textuel ne saurait être qualifié de plagiat lorsque l'auteur a pris soin d'adosser le passage à une référence valide, qu'il s'agisse d'une citation intra-texte, d'une note de bas de page ou d'une entrée bibliographique. La distinction entre citation académique légitime et plagiat avéré repose exclusivement sur la présence ou l'absence d'un ancrage référentiel vérifiable.`,
        },
      ],
    },
    {
      id: "f2",
      name: "Projets RAG — Cognitique",
      theme: "Sciences",
      createdAt: "08 janv. 2026",
      files: [
        {
          id: "f2-d1",
          name: "Preprint_Lindqvist_notes.txt",
          kind: "txt",
          sizeKo: 2,
          mots: 96,
          addedAt: "09 janv. 2026",
          text: `Les expressions figées de type « il est important de noter » forment des motifs prédictifs que les détecteurs heuristiques exploitent avec un fort pouvoir discriminant. La cartographie de ces n-grammes artificiels éclaire la conception des moteurs de détection.`,
        },
        {
          id: "f2-d2",
          name: "Synthese_burstiness.txt",
          kind: "txt",
          sizeKo: 3,
          mots: 128,
          addedAt: "15 janv. 2026",
          text: `L'écriture humaine se caractérise par une alternance irrégulière de phrases brèves et de périodes amples, là où les systèmes génératifs privilégient une longueur remarquablement stable. Le coefficient de variation des longueurs de phrases s'effondre sous le seuil de zéro virgule huit dans la majorité des textes d'origine artificielle (Okonkwo, 2023).`,
        },
      ],
    },
    {
      id: "f3",
      name: "Concours Agrégation 2026",
      theme: "Lettres",
      createdAt: "20 janv. 2026",
      files: [
        {
          id: "f3-d1",
          name: "Fiche_positivisme_phenomenologie.txt",
          kind: "txt",
          sizeKo: 5,
          mots: 214,
          addedAt: "21 janv. 2026",
          text: `Le protocole hypothético-déductif, fondé sur la mesure, la régression et la significativité statistique, s'oppose frontalement à la démarche compréhensive issue de la phénoménologie husserlienne. Tester une hypothèse par régression logistique tout en revendiquant une herméneutique du vécu constitue un mélange méthodologique hétérogène rarement assumé (Sartori, 2019). Notre corpus combine un questionnaire administré à un échantillon de 312 répondants et douze entretiens semi-directifs analysés selon une approche phénoménologique du vécu des participants.`,
        },
      ],
    },
    {
      id: "f4",
      name: "Partiels Économie M1",
      theme: "Économie",
      createdAt: "28 janv. 2026",
      files: [
        {
          id: "f4-d1",
          name: "Copie_examen_economie.txt",
          kind: "txt",
          sizeKo: 4,
          mots: 167,
          addedAt: "29 janv. 2026",
          text: `Il est important de noter que la standardisation stylistique induite par la rédaction automatisée réduit la diversité lexicale mesurée par le rapport types-tokens mobile. En effet, les transitions discursives standardisées apparaissent avec une densité anormalement élevée dans les textes générés par les modèles de langage. Par conséquent, une interprétation prudente et contextualisée reste recommandée. En conclusion, l'économie de l'attention impose de repenser les cadres d'analyse traditionnels.`,
        },
      ],
    },
  ];
}

function loadFolders(): CorpusFolder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CorpusFolder[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* stockage indisponible */
  }
  return seedFolders();
}

function persist(folders: CorpusFolder[]) {
  try {
    const capped = folders.map((f) => ({
      ...f,
      files: f.files.map((file) => ({ ...file, text: file.text.slice(0, TEXT_CAP) })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    /* quota dépassé : on continue en mémoire */
  }
}

interface CorpusContextValue {
  folders: CorpusFolder[];
  getFolder: (id: string) => CorpusFolder | undefined;
  addFolder: (name: string, theme: string) => CorpusFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  addFile: (folderId: string, file: Omit<CorpusFile, "id" | "addedAt">) => CorpusFile | null;
  removeFile: (folderId: string, fileId: string) => void;
}

const CorpusContext = createContext<CorpusContextValue | null>(null);

export function CorpusProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<CorpusFolder[]>(loadFolders);

  useEffect(() => {
    persist(folders);
  }, [folders]);

  const getFolder = useCallback((id: string) => folders.find((f) => f.id === id), [folders]);

  const addFolder = useCallback((name: string, theme: string): CorpusFolder => {
    const folder: CorpusFolder = {
      id: `f${Date.now()}`,
      name,
      theme: theme || "Nouveau",
      createdAt: now(),
      files: [],
    };
    setFolders((prev) => [folder, ...prev]);
    return folder;
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const addFile = useCallback(
    (folderId: string, file: Omit<CorpusFile, "id" | "addedAt">): CorpusFile | null => {
      const full: CorpusFile = { ...file, id: `d${Date.now()}-${Math.floor(Math.random() * 1e4)}`, addedAt: now() };
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, files: [...f.files, full] } : f)));
      return full;
    },
    []
  );

  const removeFile = useCallback((folderId: string, fileId: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, files: f.files.filter((d) => d.id !== fileId) } : f))
    );
  }, []);

  const value = useMemo(
    () => ({ folders, getFolder, addFolder, renameFolder, deleteFolder, addFile, removeFile }),
    [folders, getFolder, addFolder, renameFolder, deleteFolder, addFile, removeFile]
  );

  return <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>;
}

export function useCorpus(): CorpusContextValue {
  const ctx = useContext(CorpusContext);
  if (!ctx) throw new Error("useCorpus doit être utilisé dans <CorpusProvider>.");
  return ctx;
}
