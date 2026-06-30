import { beforeEach, describe, expect, it } from 'vitest'
import { useSession } from './session'

describe('seedTabs', () => {
  beforeEach(() => useSession.getState().reset())

  it('appends tabs with deterministic ids and activates the first', () => {
    useSession.getState().seedTabs([
      { title: 'A', sql: 'SELECT 1' },
      { title: 'B', sql: 'SELECT 2' },
    ])
    const { tabs, activeTabId, seq } = useSession.getState()
    expect(tabs.map((t) => t.id)).toEqual(['tab-1', 'tab-2'])
    expect(tabs.map((t) => t.title)).toEqual(['A', 'B'])
    expect(tabs[0].sql).toBe('SELECT 1')
    expect(tabs[0].datasetTable).toBeNull()
    expect(activeTabId).toBe('tab-1')
    expect(seq).toBe(2)
  })
})
