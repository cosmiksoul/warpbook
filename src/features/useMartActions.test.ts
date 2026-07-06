import { beforeEach, describe, expect, it } from 'vitest'
import { useMartActions } from './useMartActions'
import { useSession } from '../state/session'
import type { DuckDBClient } from '../db/duckdbClient'

const failing = {
  exec: async () => { throw new Error('boom: dependency') },
} as unknown as DuckDBClient

beforeEach(() => {
  useSession.getState().reset()
})

describe('dropMart', () => {
  it('реальная ошибка DROP тостится, витрина всё равно уходит из стора', async () => {
    useSession.getState().addDataset({
      table: 'm1', fileName: 'm1', bytes: 0, kind: 'view', columns: [], martSql: 'SELECT 1',
    })
    await useMartActions(failing).dropMart('m1')
    expect(useSession.getState().toast).toContain('boom')
    expect(useSession.getState().datasets).toHaveLength(0)
  })
})
