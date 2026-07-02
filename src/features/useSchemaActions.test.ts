import { tableFromJSON } from 'apache-arrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSchemaActions } from './useSchemaActions'
import { useSession, type Dataset } from '../state/session'

// Оркестратор: materialize DDL -> loss query -> describe -> setApplied;
// ошибка -> setSchemaError (не throw). Стаб-клиент, реальный стор — по образцу
// useProfileActions.test.ts.

const ds = (): Dataset => ({
  table: 'events',
  fileName: 'events.csv',
  bytes: 10,
  kind: 'csv',
  columns: [{ name: 'id', type: 'VARCHAR' }],
  rawTable: '_qb_raw_events',
  suggested: [{ name: 'id', type: 'BIGINT' }],
  schemaConfig: [{ origName: 'id', name: 'id', type: 'BIGINT', include: true }],
  schemaError: null,
})

function okClient() {
  return {
    exec: vi.fn(async () => undefined),
    query: vi.fn(async () => tableFromJSON([{ l0: 2n }])), // loss query: 2 значения -> NULL
    describeTable: vi.fn(async () => [{ name: 'id', type: 'BIGINT' }]),
  } as unknown as Parameters<typeof useSchemaActions>[0]
}

beforeEach(() => {
  useSession.getState().reset()
})

describe('useSchemaActions.apply', () => {
  it('re-materializes from the raw table, counts losses, commits via setApplied', async () => {
    useSession.getState().addDataset(ds())
    const client = okClient()
    await useSchemaActions(client).apply('events')

    expect(client.exec).toHaveBeenCalledWith(
      'CREATE OR REPLACE TABLE "events" AS SELECT TRY_CAST("id" AS BIGINT) AS "id" FROM "_qb_raw_events"',
    )
    const d = useSession.getState().datasets[0]
    expect(d.columns).toEqual([{ name: 'id', type: 'BIGINT', nullLoss: 2 }])
    expect(d.schemaError).toBeNull()
    expect(d.profile).toBeUndefined() // setApplied сбрасывает кэш профиля
  })

  it('routes a DuckDB error to setSchemaError instead of throwing', async () => {
    useSession.getState().addDataset(ds())
    const client = okClient()
    ;(client.exec as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Binder Error'))
    await useSchemaActions(client).apply('events')
    expect(useSession.getState().datasets[0].schemaError).toContain('Binder Error')
  })

  it('is a no-op for parquet and unknown datasets', async () => {
    useSession.getState().addDataset({ ...ds(), kind: 'parquet', rawTable: undefined })
    const client = okClient()
    await useSchemaActions(client).apply('events')
    await useSchemaActions(client).apply('nope')
    expect(client.exec).not.toHaveBeenCalled()
  })

  it('applyInferred stages suggested types then applies them', async () => {
    useSession.getState().addDataset({
      ...ds(),
      schemaConfig: [{ origName: 'id', name: 'id', type: 'VARCHAR', include: true }],
    })
    const client = okClient()
    await useSchemaActions(client).applyInferred('events')
    expect(useSession.getState().datasets[0].schemaConfig?.[0].type).toBe('BIGINT')
    expect(client.exec).toHaveBeenCalled()
  })
})
