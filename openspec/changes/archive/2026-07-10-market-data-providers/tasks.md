## 1. Provider layer (API)

- [x] 1.1 Add `apps/api/app/services/market_data/provider.ts`: `DataProvider` interface (`id`, `label`, `requiresKey`, `quote(symbol)`, `history(symbol, range)`) and result types (`Quote { price, source, asOf }`, `PricePoint { date, close }`)
- [x] 1.2 Implement a keyless EOD provider (e.g. Stooq public CSV) as the default
- [x] 1.3 Implement one BYO-key provider (e.g. Alpha Vantage / FMP), reading the key from API config; register both in a `PROVIDERS` registry with `listProviders()`
- [x] 1.4 Add a `market_cache` (provider, symbol, range) → response+TTL cache in SQLite so repeats don't re-hit the network; unit-test the registry + cache with a stub provider (no live network in CI)

## 2. Fetch + materialize operations (API)

- [x] 2.1 `MarketController`: `GET /api/market/providers`, `GET /api/market/:symbol/quote?provider=`, `GET /api/market/:symbol/history?provider=&from=&to=&granularity=` — clear error on unknown provider/symbol
- [x] 2.2 `POST /models/:id/actuals/import-market` — fetch history, align each period to a provider close via core's `periodDate(timeline, i)` (nearest-on-or-before), write through the existing actuals store for the chosen item, advance `actualsThrough`, stamp source + asOf
- [x] 2.3 `PUT /models/:id/drivers/:driverId/seed-from-quote` — fetch the quote, set the driver value via the existing edit path, record source + asOf; returns `{ model, issues, ok }`
- [x] 2.4 Refuse importing provider *fundamentals* into historical actuals (label as-of-latest); price-only import for v1
- [x] 2.5 Register routes in `start/routes.ts`
- [x] 2.6 API tests (stub provider): providers list; quote/history reads; import-market populates actuals + advances actualsThrough + stamps provenance; seed-from-quote sets the driver; unknown provider → error; a keyed provider's key never appears in the serialized model or responses

## 3. Secrets & config

- [x] 3.1 Read provider keys from API env / desktop local config only (same place as `API_KEY`); never persist to model JSON or git
- [x] 3.2 Extend the posture read (`/api/info` or `/market/providers`) to report *whether* a provider is configured, never the key
- [x] 3.3 Test asserting keys never appear in serialized models or API responses

## 4. MCP adapter

- [x] 4.1 Add tools: `list_data_providers`, `get_quote`, `get_price_history`, `import_market_actuals`, `seed_driver_from_quote` (call the API, change summary in text where applicable)
- [x] 4.2 Rebuild `packages/mcp`; live smoke test against a running API using a **stubbed/keyless** provider (list providers → fetch a small history → import into a model's actuals → confirm actualsThrough advanced) on an isolated port + store

## 5. Web — Data Sources settings

- [x] 5.1 Add a Data Sources settings page: choose provider, enter/store key in local config, "Test connection"; never display persisted keys
- [x] 5.2 Add an "Import actuals from ticker" affordance on a model (symbol + item + provider → import-market), and optionally "seed from quote" on the commodity/driver panel
- [x] 5.3 `api.ts` methods for providers/quote/history/import/seed; typecheck + web tests green

## 6. Verification & docs

- [x] 6.1 `pnpm typecheck` and all workspace tests green; production `vite build` succeeds
- [x] 6.2 End-to-end (stub/keyless provider, isolated store): import a symbol's history into a model → backtest/score against it → confirm the accuracy result reflects the imported actuals
- [x] 6.3 Update `docs/Roadmap.md` to note market-data providers and the backtest-safe (price-only, no point-in-time fundamentals) scope
