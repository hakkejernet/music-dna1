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
const APPLICATION_LAYER_DIR = join('modules', 'applicationLayer');

/**
 * M13 established Observability with zero coupling in either
 * direction. M14 Rule 1 deliberately narrows that: Application Layer
 * now integrates with `ObservationSink`, and Infrastructure's
 * Composition Root must construct and wire the concrete
 * `InMemoryObservationSink` — both are legitimate, explicitly-required
 * exceptions to the original "nothing imports observability" rule.
 * Everything else (`learningEngine`, `rankingEngine`, `queue`,
 * `candidateProviders`, `enrichment`, `persistence`, `trackDna`,
 * `userDna`, `feedbackPipeline`, `result`, `domainErrors`) must still
 * know nothing about it.
 */
describe('architecture boundary — Observability integration is confined to Application Layer + Infrastructure wiring (M13 Rule 1/6, M14 Rule 1)', () => {
  it('no file outside applicationLayer/, infrastructure/, or observability/ itself imports anything from observability', () => {
    const violations: string[] = [];

    for (const file of listTypeScriptFiles(SRC_DIR)) {
      const relativePath = relative(SRC_DIR, file);
      if (relativePath.startsWith(OBSERVABILITY_DIR) || relativePath.startsWith(APPLICATION_LAYER_DIR) || relativePath.startsWith(INFRASTRUCTURE_DIR)) {
        continue;
      }

      const content = readFileSync(file, 'utf-8');
      if (/from\s+['"][^'"]*observability[^'"]*['"]/.test(content)) {
        violations.push(`${relativePath} imports from observability`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('only Application Layer references the ObservationSink interface — Infrastructure wires only the concrete InMemoryObservationSink (M14 Rule 1)', () => {
    const violations: string[] = [];
    const observationSinkInterfacePattern = /import\s*(type\s*)?\{[^}]*\bObservationSink\b[^}]*\}\s*from/s;

    for (const file of listTypeScriptFiles(join(SRC_DIR, INFRASTRUCTURE_DIR))) {
      const content = readFileSync(file, 'utf-8');
      if (observationSinkInterfacePattern.test(content)) {
        violations.push(`${relative(SRC_DIR, file)} imports the ObservationSink interface — only Application Layer may know that contract`);
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
