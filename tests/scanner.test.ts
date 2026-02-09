import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanCodebase } from '../src/analyzer/scanner.js';
import { getPatternCatalog, getPatternsForDomain } from '../src/analyzer/pattern-catalog.js';
import type { InputSchema } from '../src/schemas/input.schema.js';

// ---------------------------------------------------------------------------
// Helpers — temporary directory management
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
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
    optimizationGoals: ['performance'],
    constraints: {
      licenseAllowlist: [],
      excludedLibraries: [],
    },
    priorityFocusAreas: [],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = createTmpDir();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Pattern catalog tests
// ---------------------------------------------------------------------------

describe('Pattern catalog', () => {
  it('returns at least 1 pattern per required domain', () => {
    const requiredDomains = [
      'i18n',
      'seo',
      'ab-testing-experimentation',
      'analytics-tracking',
      'ai-model-serving',
      'agent-architecture',
      'content-marketing',
      'cross-border-ecommerce',
      'payments-billing',
      'observability',
      'error-monitoring',
      'logging-tracing-metrics',
      'auth-security',
      'security-hardening',
      'caching-rate-limit',
      'feature-flags-config',
      'design-system',
      'state-management',
      'data-fetching-caching',
      'forms-ux',
      'validation-feedback',
      'notifications-inapp',
      'empty-loading-error-states',
      'a11y-accessibility',
      'error-handling-resilience',
      'realtime-collaboration',
      'file-upload-media',
      'database-orm-migrations',
      'code-organization',
      'testing-strategy',
      'performance-web-vitals',
    ] as const;

    const catalog = getPatternCatalog();

    for (const domain of requiredDomains) {
      const domainPatterns = catalog.filter((p) => p.domain === domain);
      expect(domainPatterns.length, `Expected at least 1 pattern for domain "${domain}"`).toBeGreaterThanOrEqual(1);
    }
  });

  it('getPatternsForDomain filters correctly', () => {
    const i18nPatterns = getPatternsForDomain('i18n');
    expect(i18nPatterns.length).toBeGreaterThanOrEqual(1);
    for (const p of i18nPatterns) {
      expect(p.domain).toBe('i18n');
    }
  });

  it('getPatternsForDomain returns empty array for unknown domain', () => {
    const patterns = getPatternsForDomain('nonexistent-domain');
    expect(patterns).toEqual([]);
  });

  it('all patterns have unique ids', () => {
    const catalog = getPatternCatalog();
    const ids = catalog.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all patterns have valid confidence base between 0 and 1', () => {
    const catalog = getPatternCatalog();
    for (const p of catalog) {
      expect(p.confidenceBase).toBeGreaterThanOrEqual(0);
      expect(p.confidenceBase).toBeLessThanOrEqual(1);
    }
  });

  it('patterns contain NO hardcoded library recommendations', () => {
    const catalog = getPatternCatalog();
    for (const p of catalog) {
      // PatternDefinition should only have detection fields
      expect(p).not.toHaveProperty('suggestedLibrary');
      expect(p).not.toHaveProperty('suggestedVersion');
      expect(p).not.toHaveProperty('license');
      expect(p).not.toHaveProperty('bestPractice');
      expect(p).not.toHaveProperty('alternatives');
    }
  });
});

// ---------------------------------------------------------------------------
// Scanner — known code pattern matching
// ---------------------------------------------------------------------------

describe('Scanner — code pattern matching', () => {
  it('detects hand-rolled pluralization (i18n domain)', async () => {
    writeFile('src/utils.ts', `
      function formatCount(count: number) {
        return count === 1 ? 'item' : 'items';
      }
    `);

    const result = await scanCodebase(makeInput());

    const i18nDetections = result.detections.filter((d) => d.domain === 'i18n');
    expect(i18nDetections.length).toBeGreaterThanOrEqual(1);
    expect(i18nDetections[0]!.patternCategory).toBe('i18n-manual-pluralization');
    // Detection no longer contains suggestedLibrary — that's the AI agent's job
  });

  it('detects hand-rolled meta tag injection (seo domain)', async () => {
    writeFile('src/seo.ts', `
      const meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    `);

    const result = await scanCodebase(makeInput());

    const seoDetections = result.detections.filter((d) => d.domain === 'seo');
    expect(seoDetections.length).toBeGreaterThanOrEqual(1);
    expect(seoDetections[0]!.patternCategory).toBe('seo-manual-meta-tags');
  });

  it('detects hand-rolled A/B testing (ab-testing-experimentation domain)', async () => {
    writeFile('src/experiment.ts', `
      const variant = Math.random() < 0.5 ? 'control' : 'treatment';
    `);

    const result = await scanCodebase(makeInput());

    const abDetections = result.detections.filter((d) => d.domain === 'ab-testing-experimentation');
    expect(abDetections.length).toBeGreaterThanOrEqual(1);
    expect(abDetections[0]!.patternCategory).toBe('ab-test-manual-random-split');
  });

  it('detects hand-rolled JWT handling (auth-security domain)', async () => {
    writeFile('src/auth.ts', `
      const payload = Buffer.from(token.split('.')[1], 'base64').toString();
    `);

    const result = await scanCodebase(makeInput());

    const authDetections = result.detections.filter((d) => d.domain === 'auth-security');
    expect(authDetections.length).toBeGreaterThanOrEqual(1);
    expect(authDetections[0]!.patternCategory).toBe('auth-manual-jwt-handling');
  });

  it('detects console.log usage (observability domain)', async () => {
    writeFile('src/service.ts', `
      function processOrder(order: Order) {
        console.log('Processing order', order.id);
      }
    `);

    const result = await scanCodebase(makeInput());

    const obsDetections = result.detections.filter((d) => d.domain === 'observability');
    expect(obsDetections.length).toBeGreaterThanOrEqual(1);
    expect(obsDetections[0]!.patternCategory).toBe('observability-manual-logging');
  });

  it('detects hardcoded colors in JSX (design-system domain)', async () => {
    writeFile('src/Card.tsx', `
      export function Card() {
        return <div className="bg-[#1a1a2e] text-[#e0e0e0]">card</div>;
      }
    `);

    const result = await scanCodebase(makeInput());

    const dsDetections = result.detections.filter((d) => d.domain === 'design-system');
    expect(dsDetections.length).toBeGreaterThanOrEqual(1);
    expect(dsDetections[0]!.patternCategory).toBe('design-hardcoded-colors');
  });

  it('detects inline styles in JSX (design-system domain)', async () => {
    writeFile('src/Box.tsx', `
      export function Box() {
        return <div style={{ padding: '16px', color: 'red' }}>box</div>;
      }
    `);

    const result = await scanCodebase(makeInput());

    const dsDetections = result.detections.filter((d) => d.domain === 'design-system');
    expect(dsDetections.length).toBeGreaterThanOrEqual(1);
    expect(dsDetections.some(d => d.patternCategory === 'design-inline-styles')).toBe(true);
  });

  it('detects className string concatenation (design-system domain)', async () => {
    writeFile('src/Button.tsx', `
      export function Button({ active }: { active: boolean }) {
        return <button className={active ? 'bg-blue-500' : 'bg-gray-500'}>click</button>;
      }
    `);

    const result = await scanCodebase(makeInput());

    const dsDetections = result.detections.filter((d) => d.domain === 'design-system');
    expect(dsDetections.length).toBeGreaterThanOrEqual(1);
    expect(dsDetections.some(d => d.patternCategory === 'design-no-cn-utility')).toBe(true);
  });

  it('produces detections with valid structure (no suggestedLibrary)', async () => {
    writeFile('src/app.ts', `
      const count = items.length === 1 ? 'item' : 'items';
      console.log('Count:', count);
    `);

    const result = await scanCodebase(makeInput());

    expect(result.detections.length).toBeGreaterThan(0);

    for (const detection of result.detections) {
      expect(detection.filePath).toBeTruthy();
      expect(detection.lineRange.start).toBeLessThanOrEqual(detection.lineRange.end);
      expect(detection.lineRange.start).toBeGreaterThanOrEqual(1);
      expect(detection.patternCategory).toBeTruthy();
      expect(detection.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(detection.confidenceScore).toBeLessThanOrEqual(1);
      expect(detection.domain).toBeTruthy();
      // No suggestedLibrary — recommendations come from the AI agent
      expect(detection).not.toHaveProperty('suggestedLibrary');
    }
  });
});

// ---------------------------------------------------------------------------
// Scanner — monorepo workspace detection
// ---------------------------------------------------------------------------

describe('Scanner — monorepo workspace detection', () => {
  it('detects a single package.json workspace', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'my-app',
      dependencies: { react: '^18.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    }));
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput());

    expect(result.workspaces.length).toBeGreaterThanOrEqual(1);
    const rootWorkspace = result.workspaces.find((w) => w.root === '.');
    expect(rootWorkspace).toBeDefined();
    expect(rootWorkspace!.language).toBe('typescript');
    expect(rootWorkspace!.dependencies).toHaveProperty('react');
    expect(rootWorkspace!.dependencies).toHaveProperty('typescript');
  });

  it('detects multiple workspaces in a monorepo', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'monorepo-root',
      dependencies: {},
    }));
    writeFile('packages/frontend/package.json', JSON.stringify({
      name: '@app/frontend',
      dependencies: { react: '^18.0.0' },
    }));
    writeFile('packages/backend/package.json', JSON.stringify({
      name: '@app/backend',
      dependencies: { express: '^4.0.0' },
    }));
    writeFile('packages/frontend/src/index.tsx', 'export const App = () => <div />;');
    writeFile('packages/backend/src/index.ts', 'export const server = {};');

    const result = await scanCodebase(makeInput());

    expect(result.workspaces.length).toBeGreaterThanOrEqual(3);

    const roots = result.workspaces.map((w) => w.root);
    expect(roots).toContain('.');
    expect(roots).toContain(path.join('packages', 'frontend'));
    expect(roots).toContain(path.join('packages', 'backend'));
  });

  it('detects mixed package managers (npm + pip)', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'js-app',
      dependencies: { express: '^4.0.0' },
    }));
    writeFile('ml/pyproject.toml', `
[project]
name = "ml-service"

[project.dependencies]
torch = ">=2.0.0"
numpy = ">=1.24.0"
`);
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput({
      projectMetadata: {
        repoPath: tmpDir,
        languages: ['typescript', 'python'],
        packageManagers: ['npm', 'pip'],
        currentLibraries: {},
      },
    }));

    const packageManagers = result.workspaces.map((w) => w.packageManager);
    expect(packageManagers).toContain('npm');
    expect(packageManagers).toContain('pip');
  });

  it('detects pnpm as package manager when pnpm-lock.yaml exists', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'pnpm-app',
      dependencies: { react: '^18.0.0' },
    }));
    writeFile('pnpm-lock.yaml', 'lockfileVersion: 5.4');
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput());

    const rootWorkspace = result.workspaces.find((w) => w.root === '.');
    expect(rootWorkspace).toBeDefined();
    expect(rootWorkspace!.packageManager).toBe('pnpm');
  });
});

// ---------------------------------------------------------------------------
// Scanner — empty codebase handling
// ---------------------------------------------------------------------------

describe('Scanner — empty codebase handling', () => {
  it('returns empty detections for an empty directory', async () => {
    // tmpDir is already empty
    const result = await scanCodebase(makeInput());

    expect(result.detections).toEqual([]);
  });

  it('returns empty detections when no patterns match', async () => {
    writeFile('src/index.ts', `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `);

    const result = await scanCodebase(makeInput());

    expect(result.detections).toEqual([]);
  });

  it('returns empty result for non-existent repo path', async () => {
    const result = await scanCodebase(makeInput({
      projectMetadata: {
        repoPath: '/nonexistent/path/that/does/not/exist',
        languages: ['typescript'],
        packageManagers: ['npm'],
        currentLibraries: {},
      },
    }));

    expect(result.detections).toEqual([]);
    expect(result.workspaces).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scanner — skips non-source directories
// ---------------------------------------------------------------------------

describe('Scanner — directory filtering', () => {
  it('skips node_modules directory', async () => {
    writeFile('node_modules/some-lib/index.js', `
      console.log('This is a library');
    `);
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput());

    // Should not detect console.log in node_modules
    const nodeModuleDetections = result.detections.filter((d) =>
      d.filePath.includes('node_modules'),
    );
    expect(nodeModuleDetections).toEqual([]);
  });

  it('skips .git directory', async () => {
    writeFile('.git/hooks/pre-commit', `
      console.log('pre-commit hook');
    `);
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput());

    const gitDetections = result.detections.filter((d) =>
      d.filePath.includes('.git'),
    );
    expect(gitDetections).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Structural analysis — design system architecture detection
// ---------------------------------------------------------------------------

describe('Scanner — structural analysis', () => {
  it('detects missing token layer in monorepo with UI package', async () => {
    // Root
    writeFile('package.json', JSON.stringify({ name: 'monorepo', dependencies: {} }));
    // UI package but no tokens package
    writeFile('packages/ui/package.json', JSON.stringify({
      name: '@app/ui',
      dependencies: { react: '^18.0.0' },
    }));
    writeFile('packages/ui/src/index.ts', 'export const Button = () => {};');

    const result = await scanCodebase(makeInput());

    expect(result.structuralFindings).toBeDefined();
    expect(result.structuralFindings!.length).toBeGreaterThan(0);
    const missingToken = result.structuralFindings!.find((f) => f.type === 'missing-layer');
    expect(missingToken).toBeDefined();
    expect(missingToken!.domain).toBe('design-system');
    expect(missingToken!.severity).toBe('critical');
  });

  it('detects complete design system layers', async () => {
    writeFile('package.json', JSON.stringify({ name: 'monorepo', dependencies: {} }));
    writeFile('packages/design-tokens/package.json', JSON.stringify({
      name: '@app/design-tokens', dependencies: {},
    }));
    writeFile('packages/design-tokens/src/index.ts', 'export const colors = {};');
    writeFile('packages/tailwind-config/package.json', JSON.stringify({
      name: '@app/tailwind-config', dependencies: { '@app/design-tokens': 'workspace:*' },
    }));
    writeFile('packages/tailwind-config/src/preset.ts', 'export default {};');
    writeFile('packages/ui/package.json', JSON.stringify({
      name: '@app/ui', dependencies: { '@app/tailwind-config': 'workspace:*' },
    }));
    writeFile('packages/ui/src/index.ts', 'export const Button = () => {};');

    const result = await scanCodebase(makeInput());

    expect(result.designSystemLayers).toBeDefined();
    expect(result.designSystemLayers!.hasTokens).toBe(true);
    expect(result.designSystemLayers!.hasConfig).toBe(true);
    expect(result.designSystemLayers!.hasUI).toBe(true);
    // No missing-layer findings
    const missingLayer = result.structuralFindings?.filter((f) => f.type === 'missing-layer') ?? [];
    expect(missingLayer.length).toBe(0);
  });

  it('detects hardcoded colors in tailwind config', async () => {
    writeFile('package.json', JSON.stringify({ name: 'monorepo', dependencies: {} }));
    writeFile('packages/ui/package.json', JSON.stringify({
      name: '@app/ui', dependencies: {},
    }));
    writeFile('packages/ui/src/index.ts', 'export const x = 1;');
    writeFile('packages/ui/tailwind.config.ts', `
      export default {
        theme: {
          colors: {
            primary: '#1a1a2e',
            secondary: '#16213e',
          },
        },
      };
    `);

    const result = await scanCodebase(makeInput());

    const hardcoded = result.structuralFindings?.find((f) => f.type === 'hardcoded-config-values');
    expect(hardcoded).toBeDefined();
    expect(hardcoded!.domain).toBe('design-system');
  });

  it('skips structural analysis for non-monorepo projects', async () => {
    writeFile('package.json', JSON.stringify({
      name: 'single-app', dependencies: { react: '^18.0.0' },
    }));
    writeFile('src/index.ts', 'export const x = 1;');

    const result = await scanCodebase(makeInput());

    // Single workspace — no structural analysis
    expect(result.structuralFindings).toBeUndefined();
    expect(result.designSystemLayers).toBeUndefined();
  });
});
