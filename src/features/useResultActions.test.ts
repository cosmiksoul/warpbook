import { tableFromJSON } from 'apache-arrow'
import type { Table } from 'apache-arrow'
import { beforeEach, describe, expect, it } from 'vitest'
import { useResultActions } from './useResultActions'
import { useSession } from '../state/session'
import type { DuckDBClient } from '../db/duckdbClient'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** exec всегда падает (raw-фоллбэк); query отдаёт управляемые promises в порядке вызова. */
function rawClientWithQueue() {
  const queue: Array<ReturnType<typeof deferred<Table>>> = []
  const client = {
    exec: async () => { throw new Error('not materializable') },
    query: () => { const d = deferred<Table>(); queue.push(d); return d.promise },
  } as unknown as DuckDBClient
  return { client, queue }
}

beforeEach(() => { useSession.getState().reset() })

function openTab(): string {
  useSession.getState().openBlankTab()
  return useSession.getState().activeTabId!
}
const tab = () => useSession.getState().tabs[0]

describe('runQuery latest-wins (raw fallback path)', () => {
  it('discards a stale slow run that finishes after a newer one', async () => {
    const { client, queue } = rawClientWithQueue()
    const { runQuery } = useResultActions(client)
    const id = openTab()

    const runA = runQuery(id, 'PRAGMA a')
    const runB = runQuery(id, 'PRAGMA b')
    // exec-фоллбэк добирается до client.query только после microtask-а:
    await new Promise((r) => setTimeout(r, 0))
    expect(queue).toHaveLength(2)

    queue[1].resolve(tableFromJSON([{ n: 2 }])) // B (новый) финиширует первым
    await runB
    queue[0].resolve(tableFromJSON([{ n: 1 }])) // A (устаревший) доезжает после
    await runA

    expect(tab().window?.rows).toEqual([{ n: 2 }])
  })

  it('discards a stale error arriving after a newer successful run', async () => {
    const { client, queue } = rawClientWithQueue()
    const { runQuery } = useResultActions(client)
    const id = openTab()

    const runA = runQuery(id, 'PRAGMA a')
    const runB = runQuery(id, 'PRAGMA b')
    await new Promise((r) => setTimeout(r, 0))
    expect(queue).toHaveLength(2)

    queue[1].resolve(tableFromJSON([{ n: 2 }]))
    await runB
    queue[0].reject(new Error('stale boom'))
    await runA

    expect(tab().error).toBeNull()
    expect(tab().window?.rows).toEqual([{ n: 2 }])
  })
})

describe('runQuery paged path', () => {
  it('materializes, counts and loads page 1', async () => {
    const client = {
      exec: async () => undefined,
      describeTable: async () => [{ name: 'n', type: 'BIGINT' }],
      query: async (sql: string) =>
        sql.startsWith('SELECT count(*)')
          ? tableFromJSON([{ n: 3n }])
          : tableFromJSON([{ n: 1n }, { n: 2n }, { n: 3n }]),
    } as unknown as DuckDBClient
    const { runQuery } = useResultActions(client)
    const id = openTab()
    await runQuery(id, 'SELECT * FROM t')
    expect(tab().mode).toBe('paged')
    expect(tab().rowCount).toBe(3)
    expect(tab().window?.numRows).toBe(3)
    expect(tab().error).toBeNull()
  })
})
