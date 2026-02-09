# Design System Extraction from Existing Code

**Scope**: This is a sub-workflow of Step 2.5 (Gap Analysis). It is invoked when the AI agent determines a project has an existing frontend but no formal design system. The parent SKILL handles detection (scanner + structure analyzer); this reference handles the extraction and codification workflow.

**Boundary**: This workflow produces a design system SPEC (tokens, component classification, documentation structure). The technical IMPLEMENTATION (monorepo packages, build pipeline) is handled separately via `references/design-system-sources.md`.

**Sequence**: Audit existing code (this file) → Define spec → Implement architecture (design-system-sources.md)

## Principles

### 1. Source Uniqueness

All tokens, components, and patterns MUST come from existing code. Do not introduce new visual styles, design languages, or interaction patterns. The design system codifies what already works.

### 2. Reuse First

If the codebase already has a reusable atomic component, use it. Do not create duplicates. Merge components that are visually or behaviorally identical but named differently.

### 3. Abstract, Don't Refactor

The goal is abstraction and constraint, not large-scale refactoring. New and old implementations can coexist. New development must follow the design system; old code migrates incrementally.

### 4. Style Normalization

Inline CSS in the codebase must be abstracted into:
- Design tokens (CSS custom properties)
- Tailwind utility classes
- Component props

No inline CSS in design system components.

### 5. Minimum Viable Spec

Only codify high-frequency, cross-page, reusable UI/UX. One-off implementations stay outside the design system. The spec should be "enough to be useful", not "covers everything".

### 6. Docs Are the Spec

The design system documentation IS the authoritative spec. No separate design docs, no verbal conventions. The doc structure, naming, and examples themselves are the constraints.

## Extraction Workflow

### Phase 1: Audit existing code

1. Run the scanner to detect hand-rolled patterns (`design-system` domain: hardcoded colors, inline styles, className concatenation)
2. Run the structure analyzer to assess monorepo architecture (missing token layer, missing shared config)
3. Catalog existing components:
   - List all files in `components/` directories across the monorepo
   - Identify duplicates (same component, different names or locations)
   - Identify inline styles that should be tokens
4. Catalog existing design values:
   - Extract all hardcoded hex colors from TSX/JSX files
   - Extract all font-size, spacing, border-radius values
   - Group into a preliminary token palette

### Phase 2: Define tokens from existing values

From the audit, create the token layer:
- **Colors**: Extract unique hex/rgb values, group into semantic categories (primary, secondary, destructive, muted, etc.)
- **Typography**: Extract font families, sizes, weights, line heights
- **Spacing**: Extract padding/margin values, normalize into a scale (4px grid)
- **Radius**: Extract border-radius values
- **Shadow**: Extract box-shadow values
- **Motion**: Extract transition/animation values (if any)

Token format: use the project's existing convention. If Tailwind, use CSS custom properties with RGB/HSL space-separated format for alpha-value support.

### Phase 3: Classify components into three tiers

#### Atom Components
Smallest reusable UI units. These exist as individual components:
- Button, Input, Select, Checkbox, Radio, Badge, Avatar, Tooltip, etc.
- Criteria: used in 3+ places, single responsibility, no business logic

#### Fragment Components
Composed from multiple atoms for specific business patterns:
- Confirmation modal, Filter bar, Metric card, Page header, etc.
- Criteria: reusable business-level compositions, used in 2+ pages

#### UI Patterns
Structural patterns that describe HOW to compose, not WHAT:
- Form layout, Table patterns, Navigation, Empty states, Charts, etc.
- Criteria: recurring structural decisions, not individual components

### Phase 4: Build documentation

Documentation site uses Mintlify. Writing style references: Vercel, Supabase, Primer, Radix UI.

Each top-level section is one MDX file. Structure:

```
docs/
├── getting-started/
│   ├── introduction.mdx
│   ├── how-to-use.mdx
│   └── contribution.mdx
├── foundations/
│   ├── accessibility.mdx
│   ├── color-usage.mdx
│   ├── typography.mdx
│   ├── theming.mdx
│   ├── tailwind-classes.mdx
│   ├── icons.mdx
│   └── copywriting.mdx
├── patterns/
│   ├── introduction.mdx
│   ├── charts.mdx
│   ├── empty-states.mdx
│   ├── forms.mdx
│   ├── layout.mdx
│   ├── modality.mdx
│   ├── navigation.mdx
│   └── tables.mdx
├── fragments/
│   ├── introduction.mdx
│   └── {fragment-name}.mdx     ← one per fragment component
├── components/
│   ├── introduction.mdx
│   └── {component-name}.mdx    ← one per atom component
└── snippets/
    └── {demo-name}.mdx          ← reusable JSX demo fragments
```

### Page templates

**Foundations pages:**
```mdx
## Overview
## Design rationale (from existing UI)
## Usage guidelines
## Do / Don't
```

**Component pages (atom and fragment):**
```mdx
## Demo
## Usage
## Props
## Examples
## Accessibility
```

Demo MUST be extracted from real pages. Examples prioritize real business scenarios.

**UI Pattern pages:**
```mdx
## When to use
## Structure
## Composition
## Examples
## Related components
```

### Phase 5: Implement technical architecture

After extraction and documentation, choose the implementation:
- See `references/design-system-sources.md` for architecture patterns (tokens-first vs shared-config)
- Organize into monorepo packages: `packages/design-tokens/`, `packages/ui/`, `packages/tailwind-config/`
- Wire apps to use shared packages

## Constraints

- Do NOT introduce visual styles not present in the existing codebase
- Do NOT "design a better looking version" of existing components
- Do NOT use inline CSS in design system components
- Do NOT create components with overlapping responsibilities or ambiguous semantics
- Do NOT codify one-off, single-use implementations
