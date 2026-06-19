// ESM resolve hook: rewrite the tsconfig "@/..." path alias to repo-root file
// URLs so the factory engine (which imports "@/lib/db") runs under raw node
// --experimental-strip-types. Harness-only; not part of the Next build.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, extname } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  // 1) tsconfig "@/..." alias → repo-root .ts file.
  if (specifier.startsWith('@/')) {
    const abs = join(ROOT, specifier.slice(2));
    return { url: pathToFileURL(abs + '.ts').href, shortCircuit: true };
  }

  // 2) Extensionless relative imports between engine modules (e.g. "./gate",
  //    "../lib/db") — strip-types needs an explicit .ts. Append it when a .ts
  //    file exists next to the importer.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && extname(specifier) === '') {
    const parentURL = context.parentURL;
    if (parentURL && parentURL.startsWith('file:')) {
      const baseDir = dirname(fileURLToPath(parentURL));
      const candidate = join(baseDir, specifier + '.ts');
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}
