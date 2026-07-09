import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'

import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { validateModel, isValid, type Model, type ValidationIssue } from '@greenthumb/core'

/**
 * Model persistence (PRD §9.2).
 *
 * Models are stored as plain, diffable JSON files on disk — one file per model,
 * git-versionable, local-first, never egressed. This is the same store whether
 * the server runs inside Electron on a laptop or as a single-tenant cloud
 * instance. SQLite (via Lucid) sits alongside for bulky actuals and snapshots.
 *
 * Every write is validated through the core engine: a model with error-level
 * issues is rejected unless the caller passes an explicit override.
 */
export class ModelStore {
  #dir: string
  #snapshotsDir: string

  constructor() {
    this.#dir = env.get('MODELS_DIR', app.makePath('storage/models'))
    this.#snapshotsDir = join(this.#dir, '.snapshots')
  }

  async #ensureDirs(): Promise<void> {
    await mkdir(this.#dir, { recursive: true })
    await mkdir(this.#snapshotsDir, { recursive: true })
  }

  #path(id: string): string {
    return join(this.#dir, `${id}.json`)
  }

  /** List all models' metadata without loading every full graph. */
  async list(): Promise<Array<Model['meta'] & { id: string }>> {
    await this.#ensureDirs()
    const files = (await readdir(this.#dir)).filter((f) => f.endsWith('.json'))
    const metas = await Promise.all(
      files.map(async (f) => {
        const model = JSON.parse(await readFile(join(this.#dir, f), 'utf8')) as Model
        return { id: model.id, ...model.meta }
      })
    )
    return metas.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  async get(id: string): Promise<Model | null> {
    try {
      return JSON.parse(await readFile(this.#path(id), 'utf8')) as Model
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      await stat(this.#path(id))
      return true
    } catch {
      return false
    }
  }

  /**
   * Persist a model after validating it. Returns the validation issues so the
   * caller can surface them. Rejects an invalid model unless `override` is set.
   */
  async save(
    model: Model,
    options: { override?: boolean } = {}
  ): Promise<{ issues: ValidationIssue[]; saved: boolean }> {
    await this.#ensureDirs()
    const issues = validateModel(model)
    const ok = isValid(issues) || options.override === true
    if (!ok) return { issues, saved: false }
    await writeFile(this.#path(model.id), JSON.stringify(model, null, 2) + '\n', 'utf8')
    return { issues, saved: true }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.#path(id))
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    }
  }

  /** Write a named point-in-time snapshot (PRD §7.5 versioning). */
  async snapshot(id: string, label: string): Promise<boolean> {
    const model = await this.get(id)
    if (!model) return false
    await this.#ensureDirs()
    const safeLabel = label.replace(/[^a-z0-9-_]+/gi, '_')
    const file = join(this.#snapshotsDir, `${id}__${model.meta.version}__${safeLabel}.json`)
    await writeFile(file, JSON.stringify(model, null, 2) + '\n', 'utf8')
    return true
  }
}

/** Singleton store shared across the request lifecycle. */
let instance: ModelStore | null = null
export function modelStore(): ModelStore {
  if (!instance) instance = new ModelStore()
  return instance
}
