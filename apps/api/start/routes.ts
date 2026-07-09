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
    // Templates & model lifecycle
    router.get('/templates', [ModelsController, 'templates'])
    router.get('/models', [ModelsController, 'index'])
    router.post('/models', [ModelsController, 'store'])
    router.get('/models/:id', [ModelsController, 'show'])
    router.put('/models/:id', [ModelsController, 'update'])
    router.delete('/models/:id', [ModelsController, 'destroy'])

    // Derived views
    router.get('/models/:id/validate', [ModelsController, 'validate'])
    router.get('/models/:id/compute', [ModelsController, 'compute'])
    router.get('/models/:id/statement', [ModelsController, 'statement'])
    router.get('/models/:id/compare', [ModelsController, 'compare'])
    router.post('/models/:id/snapshot', [ModelsController, 'snapshot'])

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
  })
  .prefix('/api')
  .use(middleware.apiKey())
