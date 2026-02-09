import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanCodebase } from '../src/analyzer/scanner.js';
import { analyzeCodeOrganization } from '../src/analyzer/code-organization-analyzer.js';
import { getPatternCatalog } from '../src/analyzer/pattern-catalog.js';
import type { InputSchema } from '../src/schemas/input.schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'code-org-test-'));
}

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

function makeInput(overrides?: Partial<InputSchema>): InputSchema {
  return {
    projectMetadata: {
      repoPath: tmpDir,
      languages: ['typescript'],
      packageManagers: ['npm'],
      currentLibraries: {},
    },
    optimizationGoals: ['improve code organization'],
    constraints: { licenseAllowlist: [], excludedLibraries: [] },
    priorityFocusAreas: [],
    ...overrides,
  };
}

beforeEach(() => { tmpDir = createTmpDir(); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// Scanner pattern tests (regex-based, file content)
// ---------------------------------------------------------------------------

describe('Code organization — scanner patterns', () => {
  it('detects deep relative imports (3+ levels)', async () => {
    writeFile('src/features/auth/hooks/useAuth.ts', `
      import { config } from '../../../config/app';
      import { db } from '../../../lib/database';
    `);

    const result = await scanCodebase(makeInput());
    const orgDetections = result.detections.filter(d => d.domain === 'code-organization');
    expect(orgDetections.length).toBeGreaterThanOrEqual(1);
    expect(orgDetections.some(d => d.patternCategory === 'org-deep-relative-import')).toBe(true);
  });

  it('does NOT flag shallow relative imports', async () => {
    writeFile('src/components/Button.ts', `
      import { theme } from '../theme';
      import { cn } from '../utils/cn';
    `);

    const result = await scanCodebase(makeInput());
    const deepImports = result.detections.filter(d => d.patternCategory === 'org-deep-relative-import');
    expect(deepImports.length).toBe(0);
  });

  it('detects wildcard barrel re-exports in index files', async () => {
    writeFile('src/components/index.ts', `
      export * from './Button';
      export * from './Card';
      export * from './Modal';
    `);

    const result = await scanCodebase(makeInput());
    const barrelDetections = result.detections.filter(d => d.patternCategory === 'org-barrel-reexport-wildcard');
    expect(barrelDetections.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag barrel re-exports in non-index files', async () => {
    writeFile('src/components/reexports.ts', `
      export * from './Button';
    `);

    const result = await scanCodebase(makeInput());
    const barrelDetections = result.detections.filter(d => d.patternCategory === 'org-barrel-reexport-wildcard');
    expect(barrelDetections.length).toBe(0);
  });

  it('detects imports from catch-all utils directories', async () => {
    writeFile('src/features/dashboard.ts', `
      import { formatDate } from '../utils/formatDate';
      import { debounce } from '../helpers/debounce';
    `);

    const result = await scanCodebase(makeInput());
    const catchAllDetections = result.detections.filter(d => d.patternCategory === 'org-catch-all-utils-import');
    expect(catchAllDetections.length).toBeGreaterThanOrEqual(1);
  });

  it('code-organization patterns exist in pattern catalog', () => {
    const catalog = getPatternCatalog();
    const orgPatterns = catalog.filter(p => p.domain === 'code-organization');
    expect(orgPatterns.length).toBe(3);
    const ids = orgPatterns.map(p => p.id);
    expect(ids).toContain('org-deep-relative-import');
    expect(ids).toContain('org-barrel-reexport-wildcard');
    expect(ids).toContain('org-catch-all-utils-import');
  });
});

// ---------------------------------------------------------------------------
// Structural analysis tests (filesystem-based)
// ---------------------------------------------------------------------------

describe('Code organization — god directory detection', () => {
  it('detects directory with >15 source files', () => {
    for (let i = 0; i < 20; i++) {
      writeFile(`src/components/Component${i}.tsx`, `export const C${i} = () => {};`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const godDirs = result.findings.filter(f => f.type === 'god-directory');
    expect(godDirs.length).toBeGreaterThanOrEqual(1);
    expect(godDirs[0]!.paths[0]).toContain('components');
    expect(godDirs[0]!.domain).toBe('code-organization');
  });

  it('does NOT flag directory with <=15 source files', () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`src/components/Component${i}.tsx`, `export const C${i} = () => {};`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const godDirs = result.findings.filter(f => f.type === 'god-directory');
    expect(godDirs.length).toBe(0);
  });

  it('marks >30 files as critical severity', () => {
    for (let i = 0; i < 35; i++) {
      writeFile(`src/all/file${i}.ts`, `export const x${i} = ${i};`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const godDirs = result.findings.filter(f => f.type === 'god-directory');
    expect(godDirs.length).toBeGreaterThanOrEqual(1);
    expect(godDirs[0]!.severity).toBe('critical');
  });
});

describe('Code organization — mixed naming convention detection', () => {
  it('detects mixed kebab-case and camelCase in same directory', () => {
    writeFile('src/utils/format-date.ts', 'export function formatDate() {}');
    writeFile('src/utils/format-number.ts', 'export function formatNumber() {}');
    writeFile('src/utils/parseJson.ts', 'export function parseJson() {}');
    writeFile('src/utils/validateInput.ts', 'export function validateInput() {}');

    const result = analyzeCodeOrganization(tmpDir);
    const mixedNaming = result.findings.filter(f => f.type === 'mixed-naming-convention');
    expect(mixedNaming.length).toBeGreaterThanOrEqual(1);
    expect(mixedNaming[0]!.domain).toBe('code-organization');
  });

  it('does NOT flag directory with consistent naming', () => {
    writeFile('src/utils/format-date.ts', 'export function formatDate() {}');
    writeFile('src/utils/format-number.ts', 'export function formatNumber() {}');
    writeFile('src/utils/parse-json.ts', 'export function parseJson() {}');

    const result = analyzeCodeOrganization(tmpDir);
    const mixedNaming = result.findings.filter(f => f.type === 'mixed-naming-convention');
    expect(mixedNaming.length).toBe(0);
  });
});

describe('Code organization — deep nesting detection', () => {
  it('detects directory nesting >5 levels from src/', () => {
    writeFile('src/features/auth/hooks/internal/helpers/deep/util.ts', 'export const x = 1;');

    const result = analyzeCodeOrganization(tmpDir);
    const deepNesting = result.findings.filter(f => f.type === 'deep-nesting');
    expect(deepNesting.length).toBeGreaterThanOrEqual(1);
    expect(deepNesting[0]!.domain).toBe('code-organization');
  });

  it('does NOT flag reasonable nesting depth', () => {
    writeFile('src/features/auth/hooks/useAuth.ts', 'export const useAuth = () => {};');

    const result = analyzeCodeOrganization(tmpDir);
    const deepNesting = result.findings.filter(f => f.type === 'deep-nesting');
    expect(deepNesting.length).toBe(0);
  });
});

describe('Code organization — barrel bloat detection', () => {
  it('detects index file with >10 re-exports', () => {
    const reexports = Array.from({ length: 15 }, (_, i) =>
      `export { Component${i} } from './Component${i}';`
    ).join('\n');
    writeFile('src/components/index.ts', reexports);
    // Create the referenced files so they exist
    for (let i = 0; i < 15; i++) {
      writeFile(`src/components/Component${i}.ts`, `export const Component${i} = {};`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const barrelBloat = result.findings.filter(f => f.type === 'barrel-bloat');
    expect(barrelBloat.length).toBeGreaterThanOrEqual(1);
    expect(barrelBloat[0]!.domain).toBe('code-organization');
  });

  it('does NOT flag index file with <=10 re-exports', () => {
    const reexports = Array.from({ length: 5 }, (_, i) =>
      `export { Component${i} } from './Component${i}';`
    ).join('\n');
    writeFile('src/components/index.ts', reexports);

    const result = analyzeCodeOrganization(tmpDir);
    const barrelBloat = result.findings.filter(f => f.type === 'barrel-bloat');
    expect(barrelBloat.length).toBe(0);
  });
});

describe('Code organization — catch-all directory detection', () => {
  it('detects utils/ directory with >10 files', () => {
    for (let i = 0; i < 15; i++) {
      writeFile(`src/utils/util${i}.ts`, `export function util${i}() { return ${i}; }`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const catchAll = result.findings.filter(f => f.type === 'catch-all-directory');
    expect(catchAll.length).toBeGreaterThanOrEqual(1);
    expect(catchAll[0]!.description).toContain('utils');
  });

  it('detects helpers/ directory with >10 files', () => {
    for (let i = 0; i < 12; i++) {
      writeFile(`src/helpers/helper${i}.ts`, `export function helper${i}() {}`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const catchAll = result.findings.filter(f => f.type === 'catch-all-directory');
    expect(catchAll.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag non-catch-all directories', () => {
    for (let i = 0; i < 15; i++) {
      writeFile(`src/services/service${i}.ts`, `export class Service${i} {}`);
    }

    const result = analyzeCodeOrganization(tmpDir);
    const catchAll = result.findings.filter(f => f.type === 'catch-all-directory');
    expect(catchAll.length).toBe(0);
  });
});

describe('Code organization — mixed export style detection', () => {
  it('detects file with default export + 3+ named exports', () => {
    writeFile('src/service.ts', [
      'export default function createService() { return {}; }',
      'export function helper1() { return 1; }',
      'export function helper2() { return 2; }',
      'export const CONFIG = {};',
    ].join('\n'));

    const result = analyzeCodeOrganization(tmpDir);
    const mixedExports = result.findings.filter(f =>
      f.metadata?.issue === 'mixed-export-style'
    );
    expect(mixedExports.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag files with only named exports', () => {
    writeFile('src/utils.ts', [
      'export function a() {}',
      'export function b() {}',
      'export function c() {}',
      'export function d() {}',
    ].join('\n'));

    const result = analyzeCodeOrganization(tmpDir);
    const mixedExports = result.findings.filter(f =>
      f.metadata?.issue === 'mixed-export-style'
    );
    expect(mixedExports.length).toBe(0);
  });

  it('does NOT flag index barrel files', () => {
    writeFile('src/components/index.ts', [
      'export default {};',
      'export function a() {}',
      'export function b() {}',
      'export function c() {}',
    ].join('\n'));

    const result = analyzeCodeOrganization(tmpDir);
    const mixedExports = result.findings.filter(f =>
      f.metadata?.issue === 'mixed-export-style'
    );
    expect(mixedExports.length).toBe(0);
  });
});

describe('Code organization — circular dependency detection', () => {
  it('detects simple A → B → A circular dependency', () => {
    writeFile('src/a.ts', `import { b } from './b';\nexport const a = 'a';`);
    writeFile('src/b.ts', `import { a } from './a';\nexport const b = 'b';`);

    const result = analyzeCodeOrganization(tmpDir);
    const cycles = result.findings.filter(f => f.type === 'circular-dependency');
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.circularDependencyCount).toBeGreaterThanOrEqual(1);
  });

  it('detects A → B → C → A circular dependency', () => {
    writeFile('src/a.ts', `import { b } from './b';\nexport const a = 'a';`);
    writeFile('src/b.ts', `import { c } from './c';\nexport const b = 'b';`);
    writeFile('src/c.ts', `import { a } from './a';\nexport const c = 'c';`);

    const result = analyzeCodeOrganization(tmpDir);
    const cycles = result.findings.filter(f => f.type === 'circular-dependency');
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag acyclic dependencies', () => {
    writeFile('src/a.ts', `import { b } from './b';\nexport const a = 'a';`);
    writeFile('src/b.ts', `import { c } from './c';\nexport const b = 'b';`);
    writeFile('src/c.ts', `export const c = 'c';`);

    const result = analyzeCodeOrganization(tmpDir);
    const cycles = result.findings.filter(f => f.type === 'circular-dependency');
    expect(cycles.length).toBe(0);
    expect(result.stats.circularDependencyCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: scanner includes code organization findings
// ---------------------------------------------------------------------------

describe('Code organization — scanner integration', () => {
  it('includes code organization findings in structuralFindings', async () => {
    // Create a god directory
    for (let i = 0; i < 20; i++) {
      writeFile(`src/components/C${i}.tsx`, `export const C${i} = () => {};`);
    }
    writeFile('package.json', JSON.stringify({
      name: 'test-app', dependencies: {},
    }));

    const result = await scanCodebase(makeInput());

    expect(result.structuralFindings).toBeDefined();
    const godDirs = result.structuralFindings!.filter(f => f.type === 'god-directory');
    expect(godDirs.length).toBeGreaterThanOrEqual(1);
  });

  it('includes codeOrganizationStats in scan result', async () => {
    writeFile('src/index.ts', 'export const x = 1;');
    writeFile('package.json', JSON.stringify({
      name: 'test-app', dependencies: {},
    }));

    const result = await scanCodebase(makeInput());

    expect(result.codeOrganizationStats).toBeDefined();
    expect(result.codeOrganizationStats!.totalSourceFiles).toBeGreaterThanOrEqual(1);
    expect(typeof result.codeOrganizationStats!.maxDirectoryDepth).toBe('number');
    expect(typeof result.codeOrganizationStats!.circularDependencyCount).toBe('number');
  });

  it('runs code organization analysis even for single-package projects', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'single-app', dependencies: {},
    }));
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput());

    // Code organization runs for ALL projects, unlike design system analysis
    expect(result.codeOrganizationStats).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stats accuracy
// ---------------------------------------------------------------------------

describe('Code organization — stats', () => {
  it('counts source files correctly', () => {
    writeFile('src/a.ts', 'export const a = 1;');
    writeFile('src/b.tsx', 'export const b = 2;');
    writeFile('src/c.js', 'export const c = 3;');
    writeFile('src/d.json', '{}'); // not a source file
    writeFile('src/e.md', '# Readme'); // not a source file

    const result = analyzeCodeOrganization(tmpDir);
    expect(result.stats.totalSourceFiles).toBe(3);
  });

  it('tracks naming conventions accurately', () => {
    writeFile('src/my-component.ts', 'export const x = 1;');
    writeFile('src/my-utils.ts', 'export const y = 2;');
    writeFile('src/MyService.ts', 'export class MyService {}');
    writeFile('src/MyHelper.ts', 'export class MyHelper {}');

    const result = analyzeCodeOrganization(tmpDir);
    expect(result.stats.namingConventions['kebab-case']).toBe(2);
    expect(result.stats.namingConventions['PascalCase']).toBe(2);
  });
});
