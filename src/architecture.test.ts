import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** This file lives directly at `src/`, so its own directory *is* the source root — no path-walking guesswork. */
const SRC_DIR = dirname(fileURLToPath(import.meta.url));

const CONCRETE_REPOSITORY_CLASS_NAMES = ['InMemoryUserDnaRepository', 'InMemoryLearningEventRepository', 'InMemoryTrackDnaRepository'];

/**
 * Matches an actual import or construction of the class — never a
 * prose mention in a comment (several files in this codebase
 * deliberately *discuss*, e.g., "this test never imports
 * InMemoryUserDnaRepository directly" — that sentence must not itself
 * count as a violation).
 */
const referencesConcreteClass = (content: string, className: string): boolean => {
  const importPattern = new RegExp(`import\\s*(type\\s*)?\\{[^}]*\\b${className}\\b[^}]*\\}\\s*from`, 's');
  const constructPattern = new RegExp(`new\\s+${className}\\b`);
  return importPattern.test(content) || constructPattern.test(content);
};

const listTypeScriptFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
};

const INFRASTRUCTURE_DIR = join('modules', 'infrastructure');

/**
 * A static, executable check for M11 Rule 4 ("Application Layer må
 * aldrig kalde new InMemory... eller kende konkrete klasser") and its
 * own DoD requirement ("Bevis for ingen konkrete repository-imports
 * uden for infrastructure") — stronger than a one-time grep documented
 * in a Review Report, this re-verifies the boundary on every test run,
 * including test files (an integration test reaching for a concrete
 * repository is exactly the kind of boundary violation this is meant
 * to catch, not just production code).
 */
describe('architecture boundary — concrete repositories stay inside infrastructure (M11 Rule 1/4)', () => {
  it('is never referenced by any source file outside src/modules/infrastructure', () => {
    const violations: string[] = [];

    for (const file of listTypeScriptFiles(SRC_DIR)) {
      const relativePath = relative(SRC_DIR, file);
      if (relativePath.startsWith(INFRASTRUCTURE_DIR)) continue;

      const content = readFileSync(file, 'utf-8');
      for (const className of CONCRETE_REPOSITORY_CLASS_NAMES) {
        if (referencesConcreteClass(content, className)) {
          violations.push(`${relativePath} imports or constructs ${className}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('sanity check: the scan itself actually finds files, and the class names really do exist somewhere inside infrastructure', () => {
    const allFiles = listTypeScriptFiles(SRC_DIR);
    expect(allFiles.length).toBeGreaterThan(50);

    const infrastructureFiles = allFiles.filter((file) => relative(SRC_DIR, file).startsWith(INFRASTRUCTURE_DIR));
    const infrastructureContent = infrastructureFiles.map((file) => readFileSync(file, 'utf-8')).join('\n');
    for (const className of CONCRETE_REPOSITORY_CLASS_NAMES) {
      expect(infrastructureContent).toContain(className);
    }
  });
});

const OBSERVABILITY_DIR = join('modules', 'observability');

/**
 * M13 Rule 6 ("Ingen modul uden for Observability må kende konkrete
 * metrikimplementeringer" / "Learning Engine må aldrig kende
 * Observability") verified in both directions, statically: nothing
 * outside `observability/` imports from it (it isn't wired into any
 * other module yet — see Review Report), and `observability/` itself
 * never reaches outside its own directory for anything. The second
 * check is stronger than "doesn't import the domain" — Observability's
 * own `Observation` types are deliberately self-contained primitives
 * (M13 design note in `types.ts`), so it needs literally nothing from
 * any sibling module, not even a type.
 */
describe('architecture boundary — Observability has zero coupling with the rest of the domain (M13 Rule 1/6)', () => {
  it('no file outside src/modules/observability imports anything from it', () => {
    const violations: string[] = [];

    for (const file of listTypeScriptFiles(SRC_DIR)) {
      const relativePath = relative(SRC_DIR, file);
      if (relativePath.startsWith(OBSERVABILITY_DIR)) continue;

      const content = readFileSync(file, 'utf-8');
      if (/from\s+['"][^'"]*observability[^'"]*['"]/.test(content)) {
        violations.push(`${relativePath} imports from observability`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no file inside src/modules/observability imports from outside its own directory', () => {
    const violations: string[] = [];

    for (const file of listTypeScriptFiles(join(SRC_DIR, OBSERVABILITY_DIR))) {
      const content = readFileSync(file, 'utf-8');
      // Any relative import escaping the directory starts with "../" — observability only ever uses "./".
      if (/from\s+['"]\.\.\//.test(content)) {
        violations.push(`${relative(SRC_DIR, file)} imports from outside observability/`);
      }
    }

    expect(violations).toEqual([]);
  });
});
