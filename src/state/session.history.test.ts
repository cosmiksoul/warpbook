import { describe, it, expect, beforeEach } from 'vitest'
import { useSession } from './session'

beforeEach(() => {
  useSession.setState({ history: [], datasets: [], tabs: [], activeTabId: null })
})

describe('store history', () => {
  it('pushHistory добавляет и дедупит подряд', () => {
    useSession.getState().pushHistory('SELECT 1')
    useSession.getState().pushHistory('SELECT 1')
    useSession.getState().pushHistory('SELECT 2')
    expect(useSession.getState().history).toEqual(['SELECT 1', 'SELECT 2'])
  })
  it('пустой пуш — no-op (тот же референс)', () => {
    useSession.getState().pushHistory('SELECT 1')
    const before = useSession.getState().history
    useSession.getState().pushHistory('   ')
    expect(useSession.getState().history).toBe(before)
  })
  it('reset() НЕ трогает историю', () => {
    useSession.getState().pushHistory('SELECT 1')
    useSession.getState().reset()
    expect(useSession.getState().history).toEqual(['SELECT 1'])
  })
})
