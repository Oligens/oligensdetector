export interface SanitizedDocument {
  originalText: string;
  activeText: string;
  bibliographyText: string;
  citationText: string;
  notesText: string;
  excludedBlocks: number;
}

const SECTION_HEADING = /^(?:\s*(?:#{1,6}\s*)?(?:bibliographie|bibliography|références|references|sources|notes(?:\s+de\s+bas\s+de\s+page)?|footnotes)\s*:?[ \t]*)(?:\r?\n|$)/imu;
const NEXT_SECTION = /^\s*(?:#{1,6}\s*)?(?:bibliographie|bibliography|références|references|sources|notes(?:\s+de\s+bas\s+de\s+page)?|footnotes|annexes?|appendices?)\s*:?[ \t]*$/imu;

function maskFormalCitations(text: string): { active: string; citations: string; count: number } {
  const chunks: string[] = [];
  let count = 0;
  const active = text
    // Markdown block quotations / indented formal excerpts.
    .replace(/^\s*>.*(?:\r?\n|$)/gim, (match) => {
      count++;
      chunks.push(match);
      return "\n";
    })
    // Quoted excerpts. Keep line breaks so sentence/paragraph positions remain stable.
    .replace(/[“”"«»](?:.|\r?\n)*?[”"«»]/g, (match) => {
      count++;
      chunks.push(match);
      return match.replace(/\S/g, " ");
    });
  return { active, citations: chunks.join("\n"), count };
}

function isolateSections(text: string): { active: string; bibliography: string; notes: string; count: number } {
  const lines = text.split(/\r?\n/);
  const active: string[] = [];
  const bibliography: string[] = [];
  const notes: string[] = [];
  let section: "active" | "bibliography" | "notes" = "active";
  let count = 0;

  for (const line of lines) {
    const heading = line.match(/^\s*(?:#{1,6}\s*)?(.+?)\s*:?[ \t]*$/u)?.[1]?.trim().toLowerCase();
    const isBibliography = heading ? /^(?:bibliographie|bibliography|références|references|sources)$/.test(heading) : false;
    const isNotes = heading ? /^(?:notes?|notes de bas de page|footnotes?)$/.test(heading) : false;
    const isNewSection = heading ? /^(?:annexes?|appendices?)$/.test(heading) : false;

    if (isBibliography) {
      section = "bibliography";
      bibliography.push(line);
      count++;
      continue;
    }
    if (isNotes) {
      section = "notes";
      notes.push(line);
      count++;
      continue;
    }
    if (isNewSection) {
      section = "active";
      active.push(line);
      continue;
    }

    if (section === "bibliography") bibliography.push(line);
    else if (section === "notes") notes.push(line);
    else active.push(line);
  }

  return { active: active.join("\n"), bibliography: bibliography.join("\n"), notes: notes.join("\n"), count };
}

/**
 * Removes document-level material that should not influence active prose
 * stylometry or plagiarism. The original document is never mutated.
 */
export function sanitizeDocument(text: string): SanitizedDocument {
  const originalText = text.replace(/\r\n?/g, "\n");
  const sections = isolateSections(originalText);
  const quoted = maskFormalCitations(sections.active);
  const activeText = quoted.active.replace(/\n{3,}/g, "\n\n").trim();

  return {
    originalText,
    activeText,
    bibliographyText: sections.bibliography.trim(),
    citationText: quoted.citations.trim(),
    notesText: sections.notes.trim(),
    excludedBlocks: sections.count + quoted.count,
  };
}
