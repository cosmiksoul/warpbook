import { tableFromJSON } from 'apache-arrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfileActions } from './useProfileActions'
import { useSession, type Dataset } from '../state/session'

// vi.mock of this module can't intercept profileRelation's in-module call, so we
// exercise the orchestrator guards (cache no-op, profiling flag, error routing)
// against a stub DuckDBClient whose query() returns minimal real Arrow tables
// keyed by SQL prefix — no real DuckDB needed.

const csvDs = (table: string): Dataset => ({
  table,
  fileName: `${table}.csv`,
  bytes: 10,
  kind: 'csv',
  columns: [{ name: 'id', type: 'BIGINT' }],
})

// One numeric column 'id' (BIGINT, min 1, max 3) -> SUMMARIZE + null-count +
// histogram. tableFromJSON gives arrowToRows-readable Arrow tables.
function stubQuery(sql: string) {
  if (sql.startsWith('SUMMARIZE')) {
    return tableFromJSON([
      { column_name: 'id', column_type: 'BIGINT', min: '1', max: '3', approx_unique: 4n, q50: '2' },
    ])
  }
  if (sql.startsWith('SELECT count(*) AS total')) {
    return tableFromJSON([{ total: 42n, n0: 0n }])
  }
  // histogram (least(...) AS bucket, count(*) AS n)
  return tableFromJSON([{ bucket: 0, n: 42n }])
}

const okClient = {
  query: vi.fn(async (sql: string) => stubQuery(sql)),
} as unknown as Parameters<typeof useProfileActions>[0]

const boomClient = {
  query: vi.fn(async () => {
    throw new Error('boom')
  }),
} as unknown as Parameters<typeof useProfileActions>[0]

beforeEach(() => {
  useSession.getState().reset()
  ;(okClient.query as ReturnType<typeof vi.fn>).mockClear()
  ;(boomClient.query as ReturnType<typeof vi.fn>).mockClear()
})

describe('useProfileActions.profile (source orchestrator)', () => {
  it('profiles an un-cached table and stores profiles + rowCount', async () => {
    useSession.getState().addDataset(csvDs('events'))
    await useProfileActions(okClient).profile('events')
    const d = useSession.getState().datasets[0]
    expect(d.profile?.[0].name).toBe('id')
    expect(d.profile?.[0].kind).toBe('numeric')
    expect(d.rowCount).toBe(42)
    expect(d.profiling).toBe(false)
    expect(d.profileError).toBeNull()
  })

  it('is a no-op when the dataset already has a cached profile', async () => {
    useSession.getState().addDataset(csvDs('events'))
    useSession.getState().setProfile(
      'events',
      [{ name: 'id', type: 'BIGINT', distinct: 4, nullCount: 0, kind: 'numeric' }],
      7,
    )
    await useProfileActions(okClient).profile('events')
    expect(okClient.query).not.toHaveBeenCalled()
  })

  it('is a no-op for an unknown table', async () => {
    await useProfileActions(okClient).profile('nope')
    expect(okClient.query).not.toHaveBeenCalled()
  })

  it('routes a thrown error to setProfileError and does not throw', async () => {
    useSession.getState().addDataset(csvDs('events'))
    await expect(useProfileActions(boomClient).profile('events')).resolves.toBeUndefined()
    const d = useSession.getState().datasets[0]
    expect(d.profileError).toContain('boom')
    expect(d.profiling).toBe(false)
  })
})
