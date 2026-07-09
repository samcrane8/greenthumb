/*
|--------------------------------------------------------------------------
| Routes — the HTTP surface over the core financial-model engine.
|--------------------------------------------------------------------------
|
| Everything under /api is gated by the single-tenant apiKey middleware (a
| no-op locally, a shared-secret gate in the cloud). The React UI and the
| Electron shell both talk to exactly these endpoints.
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const ModelsController = () => import('#controllers/models_controller')
const EditsController = () => import('#controllers/edits_controller')
const InfoController = () => import('#controllers/info_controller')
const AnalysisController = () => import('#controllers/analysis_controller')

router.get('/', async () => ({
  service: 'greenthumb',
  status: 'ok',
  docs: '/api',
}))

router.get('/health', async () => ({ status: 'ok' }))

// Deployment posture — ungated on purpose (reports whether a key is required,
// never the key itself). Lets the UI render Local vs Cloud without a token.
router.get('/api/info', [InfoController, 'show'])

router
  .group(() => {
    // Templates, commodities & model lifecycle
    router.get('/templates', [ModelsController, 'templates'])
    router.get('/commodities', [ModelsController, 'commodities'])
    router.get('/commodities/:commodityId/:modelId/preview', [ModelsController, 'commodityPreview'])
    router.get('/models', [ModelsController, 'index'])
    router.post('/models', [ModelsController, 'store'])
    router.get('/models/:id', [ModelsController, 'show'])
    router.put('/models/:id', [ModelsController, 'update'])
    router.delete('/models/:id', [ModelsController, 'destroy'])

    // Derived views
    router.get('/models/:id/validate', [ModelsController, 'validate'])
    router.get('/models/:id/compute', [ModelsController, 'compute'])
    router.get('/models/:id/statement', [ModelsController, 'statement'])
    router.get('/models/:id/charts/:chartId/data', [ModelsController, 'chartData'])
    router.get('/models/:id/compare', [ModelsController, 'compare'])
    router.post('/models/:id/snapshot', [ModelsController, 'snapshot'])

    // Analysis: backtesting & model-improvement loop (handbook §3–4). Read-only
    // analysis plus actuals ingestion; calibration returns a candidate only.
    router.get('/models/:id/score', [AnalysisController, 'score'])
    router.get('/models/:id/sweep', [AnalysisController, 'sweep'])
    router.get('/models/:id/tornado', [AnalysisController, 'tornado'])
    router.get('/models/:id/backtest', [AnalysisController, 'backtest'])
    router.get('/models/:id/walkforward', [AnalysisController, 'walkforward'])
    router.get('/models/:id/forecast-actual', [AnalysisController, 'forecastActual'])
    router.post('/models/:id/actuals', [AnalysisController, 'putActuals'])
    router.post('/models/:id/actuals/import', [AnalysisController, 'importCsv'])
    router.post('/models/:id/calibrate', [AnalysisController, 'calibrate'])

    // Semantic edit operations (each supports ?preview=true and ?override=true)
    router.post('/models/:id/items', [EditsController, 'addItem'])
    router.patch('/models/:id/items/:itemId', [EditsController, 'updateItem'])
    router.put('/models/:id/items/:itemId/formula', [EditsController, 'setFormula'])
    router.delete('/models/:id/items/:itemId', [EditsController, 'removeItem'])
    router.post('/models/:id/drivers', [EditsController, 'addDriver'])
    router.put('/models/:id/drivers/:driverId/assumption', [EditsController, 'setAssumption'])
    router.post('/models/:id/scenarios', [EditsController, 'createScenario'])
    router.put('/models/:id/scenarios/:scenarioId/value', [EditsController, 'setScenarioValue'])
    router.post('/models/:id/extend', [EditsController, 'extendPeriods'])

    // Timeline, rename, notes, deletion (each supports ?preview / ?override / ?summary)
    router.put('/models/:id/timeline', [EditsController, 'setTimeline'])
    router.put('/models/:id/drivers/:driverId/name', [EditsController, 'renameDriver'])
    router.put('/models/:id/items/:itemId/name', [EditsController, 'renameItem'])
    router.put('/models/:id/scenarios/:scenarioId/name', [EditsController, 'renameScenario'])
    router.put('/models/:id/drivers/:driverId/notes', [EditsController, 'setDriverNotes'])
    router.put('/models/:id/items/:itemId/notes', [EditsController, 'setItemNotes'])
    router.delete('/models/:id/drivers/:driverId', [EditsController, 'removeDriver'])
    router.delete('/models/:id/scenarios/:scenarioId', [EditsController, 'removeScenario'])

    // Commodity pricing (bind + generate; each supports ?preview / ?override / ?summary)
    router.put('/models/:id/drivers/:driverId/commodity', [EditsController, 'setCommodityPrice'])
    router.post('/models/:id/drivers/:driverId/regenerate', [EditsController, 'regenerateCommodityPrice'])
    router.put('/models/:id/scenarios/:scenarioId/drivers/:driverId/commodity', [
      EditsController,
      'setScenarioCommodityPrice',
    ])

    // Charts (each supports ?preview=true and ?override=true)
    router.post('/models/:id/charts', [EditsController, 'addChart'])
    router.patch('/models/:id/charts/:chartId', [EditsController, 'updateChart'])
    router.delete('/models/:id/charts/:chartId', [EditsController, 'removeChart'])

    // Dashboard layout (each supports ?preview=true and ?override=true)
    router.post('/models/:id/dashboard/widgets', [EditsController, 'addWidget'])
    router.patch('/models/:id/dashboard/widgets/:widgetId', [EditsController, 'updateWidget'])
    router.delete('/models/:id/dashboard/widgets/:widgetId', [EditsController, 'removeWidget'])
    router.put('/models/:id/dashboard/order', [EditsController, 'reorderDashboard'])
  })
  .prefix('/api')
  .use(middleware.apiKey())
