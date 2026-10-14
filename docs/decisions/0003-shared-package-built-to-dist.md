# 0003 — `@lumen/shared` is compiled to `dist/`

**Context.** Both apps import types (and a few constants) from `packages/shared`. The API runs under Node, the web app under Next's bundler.

**Options.**

- Export TypeScript source directly and make every consumer transpile it (`transpilePackages` for Next, a loader for Node in production).
- Compile with `tsc` to `dist/` and export JavaScript plus `.d.ts`.

**Decision.** Compile to `dist/`. Each consumer sees an ordinary ESM package.

**Consequence.** `shared` must be built before the apps type-check or run. The root `dev` and `typecheck` scripts build it first; `pnpm -r build` orders it correctly. In dev, `shared` also runs `tsc --watch`.
