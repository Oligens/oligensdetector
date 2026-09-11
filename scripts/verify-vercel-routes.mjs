import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const repoRoot = new URL("../", import.meta.url);
const forbiddenImport = /(?:\.\/|\.\.\/)+api\/services\/database|(?:from|import)\s*[^\n]*api\/services\/database/g;
const forbiddenPath = /api\/services\/database(?:\.(?:js|mjs|cjs|ts|tsx))?\b/g;
const conflictingRoute = "api/[route].ts";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const rootPath = repoRoot.pathname;
const files = await walk(rootPath);
const violations = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  if (forbiddenImport.test(text) || forbiddenPath.test(text)) {
    violations.push(relative(rootPath, file));
  }
  forbiddenImport.lastIndex = 0;
  forbiddenPath.lastIndex = 0;
}

const routePath = join(rootPath, conflictingRoute);
try {
  await readFile(routePath, "utf8");
  violations.push(conflictingRoute);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (violations.length > 0) {
  console.error("Vercel route integrity check failed:");
  for (const file of [...new Set(violations)]) console.error(` - ${file}`);
  console.error("Remove legacy api/services/database references and conflicting api/[route].ts before deploying.");
  process.exit(1);
}

console.log("Vercel route integrity check passed: no api/services/database references and no conflicting api/[route].ts route.");
