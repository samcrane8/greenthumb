## 1. Core: require + store the ticker

- [ ] 1.1 Add `ticker?: string` to `ModelMeta` in `packages/core/src/types.ts` (presentation-only, documented).
- [ ] 1.2 Add `requiresTicker?: boolean` to `TemplateInfo` in `packages/core/src/templates.ts`; set it `true` on the `bitcoin_treasury` registry entry.
- [ ] 1.3 In `createModel`, after resolving the template, throw a clear `Error` naming the required `ticker` when `template.requiresTicker` and `options.ticker` is missing/blank (e.g. `The "Bitcoin Treasury" template requires a \`ticker\` (the company being modeled, e.g. "MSTR").`).
- [ ] 1.4 In `bitcoinTreasuryModel`, set `model.meta.ticker = tickerUpper` (keep the builder's `CO` fallback for direct/test use).

## 2. Core tests

- [ ] 2.1 Add a test: `createModel({ name, type: "bitcoin_treasury" })` (no ticker) throws an error mentioning `ticker`; with `ticker: "MSTR"` it succeeds and `meta.ticker === "MSTR"`.
- [ ] 2.2 Add a test: `createModel({ name, type: "blank" })` and `type: "saas"` succeed with no ticker (requiresTicker is false/undefined).
- [ ] 2.3 Rebuild core (`pnpm --filter @greenthumb/core build`) and run `pnpm --filter @greenthumb/core test`.

## 3. Adapters: API + MCP

- [ ] 3.1 API: wrap the `createModel(...)` call in `models_controller.store` in try/catch → `response.badRequest({ error })` with the thrown message.
- [ ] 3.2 API test: `POST /api/models` with `type: 'bitcoin_treasury'` and no ticker returns 400 with an error mentioning `ticker`; with a ticker returns 201.
- [ ] 3.3 MCP: update the `create_model` tool description in `packages/mcp/src/index.ts` to state `ticker` is REQUIRED for ticker-aware templates (e.g. bitcoin_treasury), with an example.

## 4. Web: prompt + display

- [ ] 4.1 Ensure the `TemplateInfo` type the web imports (via `@/lib/api` / core types) includes `requiresTicker`; surface it to the picker.
- [ ] 4.2 Sidebar: when a `requiresTicker` template button is clicked, open a small dialog prompting for a non-empty ticker, then call `createModel(type, label, ticker)`. Non-ticker templates keep one-click behavior.
- [ ] 4.3 Add a shared `displayItemLabel(model, itemName)` helper: uppercase the `meta.ticker` prefix (`mstr_price` → "MSTR price") else fall back to `name.replace(/_/g, " ")`.
- [ ] 4.4 Use the helper in the dashboard `StatWidget` (`DashboardView.tsx`) and the statement/KPI table row labels.

## 5. Verify

- [ ] 5.1 `pnpm typecheck` across workspaces.
- [ ] 5.2 Run core tests and `apps/api` functional tests.
- [ ] 5.3 Live: `POST /api/models` for `bitcoin_treasury` with no ticker → 400 (clear message); with `ticker: "MSTR"` → 201, `meta.ticker === "MSTR"`, items `mstr_price`/`mstr_mcap`.
- [ ] 5.4 Web smoke: creating a Bitcoin Treasury from the picker prompts for a ticker, and the resulting dashboard tile reads the uppercased ticker (e.g. "MSTR price").
