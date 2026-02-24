import { DateTime } from 'luxon'
import { writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import env from '#start/env'

export default class EventArchiveService {
  constructor(
    private readonly archiveBasePath: string = env.get('ARCHIVE_PATH') ?? 'archive'
  ) {}

  async append(eventType: string, data: Record<string, unknown>): Promise<void> {
    const date = DateTime.now().toISODate()!
    const dir = path.join(this.archiveBasePath, eventType)
    await mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${date}.jsonl`)
    const line = JSON.stringify({ ...data, _archived_at: DateTime.now().toISO() }) + '\n'
    await writeFile(filePath, line, { flag: 'a' })
  }

  async lastWriteTime(): Promise<DateTime | null> {
    if (!existsSync(this.archiveBasePath)) return null

    let latest: DateTime | null = null

    const eventTypes = await readdir(this.archiveBasePath)
    for (const eventType of eventTypes) {
      const eventDir = path.join(this.archiveBasePath, eventType)
      let files: string[]
      try {
        files = await readdir(eventDir)
      } catch {
        continue
      }
      for (const file of files) {
        const { mtime } = await stat(path.join(eventDir, file))
        const fileTime = DateTime.fromJSDate(mtime)
        if (!latest || fileTime > latest) latest = fileTime
      }
    }

    return latest
  }
}
