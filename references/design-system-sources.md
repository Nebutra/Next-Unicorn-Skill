# Design System Reference Sources

When the structure analyzer detects a missing design system layer, scaffold from production-grade repos.

## Discovery

For broader discovery beyond this list, browse [awesome-design-systems](https://github.com/alexpate/awesome-design-systems) (18.8k stars, 160+ entries). Filter for entries with source code. Any open-source design system with a compatible license can be used as a scaffold source.

## A. Tokens-First (independent token package)

Best for: large teams, multi-brand, cross-platform token sharing.

| Source | Repo | Package | Stack | License |
|--------|------|---------|-------|---------|
| GitHub Primer | `primer/primitives` | `@primer/primitives` | JSON/TS tokens, multi-platform | MIT |
| Shopify Polaris | `Shopify/polaris` → `polaris-tokens/` | `@shopify/polaris-tokens` | Sass + React | see repo |
| Adobe Spectrum | `adobe/spectrum-tokens` | `@adobe/spectrum-tokens` | JSON tokens → CSS/iOS/Android | Apache-2.0 |
| Atlassian | Atlaskit → `design-system/tokens/` | `@atlaskit/tokens` | TS tokens + CSS custom properties | Apache-2.0 |
| MetaMask | `MetaMask/design-tokens` | `@metamask/design-tokens` | TS constants → CSS variables | MIT |
| IBM Carbon | `carbon-design-system/carbon` | `@carbon/colors`, `@carbon/themes` | Sass tokens + React | Apache-2.0 |
| Salesforce Lightning | `salesforce-ux/design-system` | `@salesforce-ux/design-system` | YAML tokens → CSS | BSD-3-Clause |

## B. Shared-Config (tokens implicit in tailwind/CSS variables)

Best for: small-to-medium teams, rapid iteration, Tailwind-centric stacks.

| Source | Repo | Key packages | Stack | License |
|--------|------|-------------|-------|---------|
| Dub | `dubinc/dub` | `packages/tailwind-config/`, `packages/ui/`, `packages/utils/` | Tailwind + Radix + CVA | AGPL-3.0 |
| Supabase | `supabase/supabase` | `packages/ui/`, `packages/ui-patterns/`, `packages/config/`, `apps/design-system/` | Tailwind + Radix + hsl tokens | Apache-2.0 |
| Documenso | `documenso/documenso` | monorepo with shared UI | Tailwind + shadcn | AGPL-3.0 |
| shadcn/ui | `shadcn-ui/ui` | registry-based (copy, not install) | Tailwind + Radix + CVA | MIT |

## C. Full-Stack Component Libraries (ready to install)

When the project needs a complete component library rather than building custom.

| Source | Repo | Package | Stack | License |
|--------|------|---------|-------|---------|
| Radix UI | `radix-ui/primitives` | `@radix-ui/react-*` | Unstyled React primitives | MIT |
| Mantine | `mantinedev/mantine` | `@mantine/core` | React + CSS modules | MIT |
| Chakra UI | `chakra-ui/chakra-ui` | `@chakra-ui/react` | React + runtime CSS-in-JS | MIT |
| Ant Design | `ant-design/ant-design` | `antd` | React + CSS-in-JS (cssinjs) | MIT |
| Elastic EUI | `elastic/eui` | `@elastic/eui` | React + Sass + Emotion | Apache-2.0 |
| Fluent UI | `microsoft/fluentui` | `@fluentui/react-components` | React + Griffel | MIT |
| Blueprint | `palantir/blueprint` | `@blueprintjs/core` | React + Sass | Apache-2.0 |
| PatternFly | `patternfly/patternfly` | `@patternfly/react-core` | React + CSS custom properties | MIT |
| Twilio Paste | `twilio-labs/paste` | `@twilio-paste/core` | React + Emotion + tokens | MIT |
| HashiCorp Helios | `hashicorp/design-system` | `@hashicorp/design-system-*` | Ember/React + tokens | MPL-2.0 |
| Porsche | `porsche-design-system/porsche-design-system` | `@porsche-design-system/components-react` | Web Components + React wrappers | MIT |
| Vercel Geist | `vercel/geist-ui` (community) | `geist-ui` | React + styled-jsx | MIT |

## Scaffold Workflow

**IMPORTANT**: Do NOT assume repo structure from training data. Always explore first.

1. **Sparse clone** (metadata only, no files):
   ```bash
   git clone --filter=blob:none --sparse <repo-url> /tmp/ds-ref
   ```

2. **Explore the actual structure** before pulling anything:
   ```bash
   cd /tmp/ds-ref
   git ls-tree -r --name-only HEAD | grep -E '^(packages/|apps/)' | cut -d/ -f1-2 | sort -u
   ```
   This reveals the real package layout. Repos change — never assume paths from memory.

3. **Identify all design-system-related directories**. Look for:
   - `packages/design-tokens/` or `packages/tokens/` — token layer
   - `packages/tailwind-config/` or `packages/config/` — shared Tailwind preset
   - `packages/ui/` — component library
   - `packages/ui-patterns/` — higher-level composed patterns
   - `packages/design-system/` — design system docs/registry
   - `packages/utils/` — shared utilities (cn, clsx, etc.)
   - `apps/design-system/` or `apps/docs/` — documentation site
   - Any MDX/content, `__registry__/`, `styles/`, `themes/` directories inside the above

4. **Sparse checkout all relevant paths**:
   ```bash
   git sparse-checkout set packages/ui packages/ui-patterns packages/config packages/utils apps/design-system
   ```

5. **Check license** in each package's `package.json` or root `LICENSE`. Do not use code with incompatible licenses (e.g., AGPL requires your project to also be AGPL).

6. **Copy** the relevant packages into the user's monorepo under `packages/`.

7. **Adapt**:
   - Rename packages (scope to user's org, e.g., `@supabase/ui` → `@myorg/ui`)
   - Update internal cross-references and imports
   - Adjust token values (colors, fonts, spacing) to match the project's brand
   - Update `package.json` workspace references
   - Remove source-repo-specific code (analytics, feature flags, etc.)

8. **Wire into monorepo**:
   - Add packages to workspace config (`pnpm-workspace.yaml` or `package.json` workspaces)
   - Update app `tailwind.config.ts` to use `presets: [sharedConfig]`
   - Update app `globals.css` to import the token CSS variables

9. **Verify**: Run the structure analyzer — it should report no `missing-layer` findings after scaffolding.
