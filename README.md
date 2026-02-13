# Next Unicorn

![GitHub Release](https://img.shields.io/github/v/release/Nebutra/Next-Unicorn-Skill)
![npm Version](https://img.shields.io/npm/v/@nebutra/next-unicorn-skill)
![License](https://img.shields.io/github/license/Nebutra/Next-Unicorn-Skill)

AI-powered codebase auditor that detects reinvented wheels and suggests unicorn-grade library replacements. Stop Vibe Coding debt with smart migration plans.

## Features

- **Hand-rolled Detection**: Identify reinvented wheels (HTTP clients, date parsing, etc.)
- **Library Recommendations**: Suggest battle-tested alternatives with Context7 verification
- **Vulnerability Scanning**: Detect known CVEs in dependencies
- **Migration Planning**: Generate structured migration plans with code examples
- **Code Organization Audit**: Detect god-directories, circular deps, naming issues

## Installation

### Vercel Skills (Recommended)

```bash
npx skills add Nebutra/Next-Unicorn-Skill
```

### npm

```bash
npm install @nebutra/next-unicorn-skill
# or
pnpm add @nebutra/next-unicorn-skill
```

## Usage

```bash
# CLI
npx @nebutra/next-unicorn-skill analyze ./src

# Or use the CLI after npm install
npx next-unicorn analyze ./your-project
```

## Supported Agents

- OpenCode
- Claude Code
- Codex
- Cursor
- And 35+ more via Vercel Skills

## Architecture

```
Scanner (deterministic)          →  AI Agent (generative)           →  Pipeline (deterministic)
1. Regex: detect hand-rolled code   1. Recommend library replacements    Score, plan, audit,
2. FS: detect code org issues       2. Identify capability gaps          filter, serialize
   (god-dirs, circular deps,        3. Recommend org patterns + tooling
    naming, barrel bloat)            using knowledge + Context7
```

## License

MIT
