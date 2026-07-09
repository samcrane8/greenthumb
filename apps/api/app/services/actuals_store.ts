import { DateTime } from 'luxon'
import Actual from '#models/actual'

/**
 * Actuals persistence (PRD §9.2). Observed historical values live in SQLite —
 * not the model JSON — because they get large and are queried by range. This
 * service is the adapter boundary: the core engine stays pure and takes plain
 * arrays; here we translate to/from the `actuals` table.
 *
 * A row is one observed `(model, item, period)` value with its import source.
 * Writes upsert on the `(model_id, item_id, period)` unique key so re-ingesting a
 * period replaces rather than duplicates.
 */
export class ActualsStore {
  /** Upsert a single observed value. */
  async put(
    modelId: string,
    itemId: string,
    period: number,
    value: number,
    source: string | null = null
  ): Promise<void> {
    await Actual.updateOrCreate(
      { modelId, itemId, period },
      { modelId, itemId, period, value, source, createdAt: DateTime.now() }
    )
  }

  /**
   * Upsert a full or partial series for one item. `values[i]` maps to period `i`;
   * null/undefined entries are skipped (not stored as observations).
   */
  async putSeries(
    modelId: string,
    itemId: string,
    values: (number | null | undefined)[],
    source: string | null = null
  ): Promise<number> {
    let count = 0
    for (let period = 0; period < values.length; period++) {
      const v = values[period]
      if (v === null || v === undefined || !Number.isFinite(v)) continue
      await this.put(modelId, itemId, period, v, source)
      count += 1
    }
    return count
  }

  /** Read one item's actuals as a timeline-aligned `(number|null)[]` of length `periods`. */
  async series(modelId: string, itemId: string, periods: number): Promise<(number | null)[]> {
    const rows = await Actual.query().where('model_id', modelId).andWhere('item_id', itemId)
    const out: (number | null)[] = new Array(periods).fill(null)
    for (const r of rows) if (r.period >= 0 && r.period < periods) out[r.period] = r.value
    return out
  }

  /** Read a set of items' actuals as `{ itemId -> (number|null)[] }` for the engine. */
  async map(
    modelId: string,
    itemIds: string[],
    periods: number
  ): Promise<Record<string, (number | null)[]>> {
    const out: Record<string, (number | null)[]> = {}
    for (const itemId of itemIds) out[itemId] = await this.series(modelId, itemId, periods)
    return out
  }

  /** All item ids that have at least one stored actual for a model. */
  async itemsWithActuals(modelId: string): Promise<string[]> {
    const rows = await Actual.query().where('model_id', modelId).distinct('item_id')
    return rows.map((r) => r.itemId)
  }
}

let instance: ActualsStore | null = null
export function actualsStore(): ActualsStore {
  if (!instance) instance = new ActualsStore()
  return instance
}
