---
name: analyze-and-recommend-third-party-optimizations
description: >-
  Scan a codebase to identify hand-rolled implementations that should be replaced
  by third-party libraries, identify missing capabilities, and detect code
  organization issues (directory structure, naming, circular deps, barrel bloat).
  Produce structured migration plans with Context7-verified recommendations.
  Use when analyzing technical debt, auditing dependency health, reviewing
  hand-rolled code, planning library migrations, assessing capability gaps,
  or auditing project structure and module organization.
---

# Analyze and Recommend Third-Party Optimizations

## Architecture

```
Scanner (deterministic)          →  AI Agent (generative)           →  Pipeline (deterministic)
1. Regex: detect hand-rolled code   1. Recommend library replacements    Score, plan, audit,
2. FS: detect code org issues       2. Identify capability gaps          filter, serialize
   (god-dirs, circular deps,        3. Recommend org patterns + tooling
    naming, barrel bloat)            using knowledge + Context7
```

**Design constraints**:
- No hardcoded library recommendations — evaluate project context dynamically
- Two analysis modes: **replacement** (hand-rolled code found) and **gap** (capability missing entirely)

## Standard Operating Procedure

### Step 1: Validate Input

Parse and validate `InputSchema` JSON via Zod. Read `src/schemas/input.schema.ts` for the full schema.

### Step 2: Scan Codebase

Run `scanCodebase(input)`. The scanner:

1. Detect workspace roots for monorepo support
2. Match code against 30+ domain patterns (i18n, auth, state-management, code-organization, etc.)
3. Run structural analysis: design system layers (monorepo), code organization (all projects)
4. Record each detection with: file path, line range, pattern category, confidence score, domain
5. Return `ScanResult` with:
   - `detections` — hand-rolled code patterns found
   - `structuralFindings` — architectural + code organization issues
   - `codeOrganizationStats` — project-wide metrics (file counts, naming conventions, circular dep count)
   - `workspaces` — monorepo workspace info

Detections and findings contain no recommendations — only facts. The AI agent interprets them.

### Step 2.5: Gap Analysis (AI Agent)

Beyond scanner detections, analyze what the project is **missing entirely**. Inspect:

1. **Installed dependencies** — identify low-level tools that should be upgraded to platform-level solutions
2. **Monorepo structure** — identify missing architectural layers (e.g., shared token package, shared config preset)
3. **Cross-cutting concerns** — identify absent capabilities: structured logging, error monitoring, rate limiting, event-driven workflows, transactional email, type-safe API layer
4. **Architecture patterns** — identify opportunities for multi-package solutions (e.g., design-tokens → tailwind-config → ui three-layer architecture for design systems)

Analyze at three levels of depth:
- **Single library gap**: missing one tool (e.g., no form validation library)
- **Ecosystem gap**: missing a coordinated set of tools (e.g., no observability stack)
- **Architecture gap**: missing an entire structural layer (e.g., no design system, no shared config)

Provide each gap as a `GapRecommendation`. Read `src/index.ts` for the interface. Pass gaps via the `gaps` option in `analyze()`.

**Design system gaps** — Two paths depending on project maturity:
- **No existing frontend**: Scaffold from reference repos. Read `references/design-system-sources.md` for curated sources and sparse-checkout workflow.
- **Existing frontend without formal design system**: First extract the spec (audit → tokens → classify → document) via `references/design-system-extraction.md`, then implement the architecture via `references/design-system-sources.md`.

### Step 2.7: Code Organization Analysis

#### Phase A — Deterministic: Collect facts (MUST use tools, DO NOT estimate)

You cannot infer file counts, naming conventions, or import cycles from knowledge. You MUST read the filesystem.

**If using the npm library** — `scanResult.structuralFindings` and `scanResult.codeOrganizationStats` already contain all findings. Skip to Phase B.

**If not using the npm library** — run these shell commands to collect facts:

```bash
# 1. God directories: find directories with >15 source files
find src -type d -exec sh -c 'count=$(find "$1" -maxdepth 1 -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) | wc -l); [ "$count" -gt 15 ] && echo "$1: $count files"' _ {} \;

# 2. Mixed naming: list filenames per directory for manual inspection
ls -1 src/components/  # check if kebab-case and camelCase are mixed

# 3. Deep nesting: find directories >5 levels deep from src/
find src -mindepth 6 -type d

# 4. Barrel bloat: count re-exports in index files
grep -c "export.*from" src/**/index.ts

# 5. Catch-all directories: count files in utils/helpers/shared
find src/utils src/helpers src/shared src/common src/lib -maxdepth 1 -type f 2>/dev/null | wc -l

# 6. Circular dependencies: use npx if madge is not installed
npx madge --circular --extensions ts,tsx src/

# 7. Deep relative imports: find ../../../ patterns
grep -rn "from ['\"]\.\.\/\.\.\/\.\.\/" src/ --include="*.ts" --include="*.tsx"
```

Record each finding with: **directory/file path, count, type**. These are facts.

#### Phase B — Generative: Recommend solutions (use your knowledge + Context7)

For each finding from Phase A, apply the decision tree below. **Do NOT recommend tools without Context7 verification.**

| Finding type | You MUST do | You MUST NOT do |
|---|---|---|
| `god-directory` | Read the files in that dir, group by domain, recommend split. Reference: Next.js App Router colocation, Linear feature-packages. | Guess file count. Say "probably too many files." |
| `mixed-naming-convention` | Check project framework → pick ONE convention. Next.js pages=kebab, React components=PascalCase, utils=camelCase. | Recommend "both are fine." Must pick one. |
| `deep-nesting` | Recommend `@/` path aliases. Read `tsconfig.json` to check if paths already exist. Generate the config change. | Say "consider flattening" without generating the actual config. |
| `barrel-bloat` | Recommend direct imports or namespace imports. Context7 verify `knip` for dead export detection. | Ignore it. Barrel bloat causes tree-shaking failures. |
| `catch-all-directory` | Read the actual files, group by domain (date, string, validation, etc.), recommend specific directory structure. | Say "split by concern" without reading what's actually in the files. |
| `circular-dependency` | Read the files in the cycle, understand WHY they import each other, recommend dependency inversion or extract shared module. Context7 verify `eslint-plugin-import`. | Just say "remove circular deps." Must explain the refactoring. |
| `org-deep-relative-import` | Same as `deep-nesting` — recommend path aliases. | Skip it. |
| `org-barrel-reexport-wildcard` | Recommend named re-exports `export { X } from` instead of `export *`. Explain namespace pollution risk. | Ignore it. |
| `org-catch-all-utils-import` | Same as `catch-all-directory` — recommend domain-specific modules. | Skip it. |

#### Phase B examples

**Example 1 — god-directory finding**:
```
Fact: src/components/ has 23 source files
```
Read those 23 files. You find: Button, Card, Modal, Table, Form, Input, Select, Checkbox...

Recommend:
```
src/components/
├── ui/          ← primitives (Button, Input, Select, Checkbox)
├── data/        ← data display (Table, Card, DataGrid)
├── overlay/     ← overlays (Modal, Dialog, Drawer, Tooltip)
└── form/        ← form elements (Form, FormField, FormError)
```
Reference: shadcn/ui organizes by interaction type. Radix UI uses similar grouping.

**Example 2 — circular-dependency finding**:
```
Fact: src/auth/session.ts → src/db/user.ts → src/auth/session.ts
```
Read both files. You find: `session.ts` imports `getUserById`, `user.ts` imports `getSession` for auth checks.

Recommend: Extract `src/auth/types.ts` with shared interfaces. Both files import from types instead of each other. Context7 verify `eslint-plugin-import/no-cycle`.

**Example 3 — mixed-naming finding**:
```
Fact: src/utils/ has kebab-case (5 files) + camelCase (3 files)
```
Check package.json → framework is Next.js → convention is kebab-case for files.

Recommend: Rename the 3 camelCase files. Context7 verify `eslint-plugin-unicorn/filename-case` for CI enforcement.

#### Skip rules

Skip a code organization finding if:
- Directory is in `tests/`, `__tests__/`, `__mocks__/`, `fixtures/`, `generated/`, `.storybook/`
- File is auto-generated (has `// @generated` or `/* eslint-disable */` at top)
- Directory has <3 files (too few to judge naming convention)

### Step 3: Recommend Solutions (AI Agent)

For each scanner detection, recommend a **solution**. Consider:

1. **Stack coherence** — don't recommend libraries in isolation; consider how they fit the project's overall stack (e.g., recommending Stripe should trigger consideration of Resend for transactional email and PostHog for payment funnel analytics)
2. **Ecosystem composition** — recommend companion libraries that work together
3. **Rationale** — explain WHY this choice fits this project's framework, runtime, and scale
4. **Anti-patterns** — what NOT to use and why
5. **Alternatives** — different solutions for different architectural contexts
6. **Migration snippet** — for each recommendation, read the detected code (file path + line range from scanner) and generate a concrete before/after code example showing the migration
7. **Context7 verification** — call `resolve-library-id` + `query-docs` to confirm the library exists and get latest version/docs

Read `src/index.ts` for the `LibraryRecommendation` interface. Return `null` to skip a detection.

**Skip a detection if**:
- Code has comments explaining why it is custom
- Detection is in test/mock/fixture files
- Library is already in project dependencies (suggest version update instead)
- Hand-rolled code is simpler than the library (3-line utility vs 50KB dep)

### Step 4–7: Score, Plan, Audit, Serialize

The pipeline handles these automatically:
- **Scoring**: confidence-based dimension scores (overridable by AI agent via `dimensionHints`)
- **Migration plan**: auto-grouped by risk (low/medium/high), sorted by file co-location
- **UX audit**: provide via `uxAudit` option in `analyze()`. Evaluate 8 categories: accessibility, error/empty/loading states, form validation, performance feel, copy consistency, design system alignment. For each, assess status (present/partial/missing) based on project code and `currentLibraries`.
- **Constraints**: license allowlist filtering, dependency conflict detection, JSON serialization

### Optional Steps

- **Step 8**: Vulnerability scan via OSV database (`vulnClient`)
- **Step 9**: Auto-update existing dependencies (`registryClient`)
- **Step 10**: PR auto-creation via GitHub/GitLab (`platformClient` + `gitOps`)

## MCP Integration

Prefer MCP tools when available; fall back to shell commands if not.

- **Context7 MCP** (required) — `resolve-library-id` + `query-docs` for library verification
- **GitHub MCP** (preferred for PRs) — structured PR create/update/query; fallback: `gh` CLI
- **Git MCP / GitKraken MCP** (preferred for scaffold) — structured repo browse/sparse-checkout; fallback: `git` CLI

## Output

Single `OutputSchema` JSON containing:
- `recommendedChanges` — replacement recommendations with scores, verification, adapter strategies
- `gapAnalysis` (optional) — missing capabilities with prioritized recommendations
- `filesToDelete` — file paths to remove after migration
- `linesSavedEstimate` — total lines saved
- `uxAudit` — UX completeness checklist (8 categories)
- `migrationPlan` — phased plan with deletion checklist
- `vulnerabilityReport` (optional)
- `updatePlan` (optional)
- `pullRequests` (optional)

Read `src/schemas/output.schema.ts` for the full schema.
