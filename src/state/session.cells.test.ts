import { describe, it, expect, beforeEach } from 'vitest'
import { useSession } from './session'
import { serializeReport, deserializeReport } from '../core/report'

beforeEach(() => {
  useSession.setState({
    report: { version: 1, blocks: [] },
    activeBlockId: null,
    runAllSeq: 0,
    seq: 0,
  })
})

describe('addQueryBlock', () => {
  it('аппендит пустую widget-ячейку и делает её активной', () => {
    useSession.getState().addQueryBlock()
    const s = useSession.getState()
    expect(s.report.blocks).toHaveLength(1)
    const b = s.report.blocks[0]
    expect(b).toMatchObject({ type: 'widget', title: 'запрос', sql: '', datasetNames: [], vizType: 'table', caption: '' })
    expect(s.activeBlockId).toBe(b.id)
    expect(s.seq).toBe(1)
  })
  it('пустая ячейка переживает serialize/deserialize без изменений формата', () => {
    useSession.getState().addQueryBlock()
    const doc = useSession.getState().report
    expect(deserializeReport(serializeReport(doc))).toEqual(doc)
  })
})

describe('updateWidgetSql', () => {
  it('пишет sql и datasetNames только widget-блоку', () => {
    useSession.getState().addQueryBlock()
    const id = useSession.getState().report.blocks[0].id
    useSession.getState().updateWidgetSql(id, 'SELECT * FROM demo_users', ['demo_users'])
    const b = useSession.getState().report.blocks[0]
    expect(b.type === 'widget' && b.sql).toBe('SELECT * FROM demo_users')
    expect(b.type === 'widget' && b.datasetNames).toEqual(['demo_users'])
  })
  it('текстовый блок не трогает', () => {
    useSession.getState().addTextBlock('hi')
    const id = useSession.getState().report.blocks[0].id
    useSession.getState().updateWidgetSql(id, 'SELECT 1', [])
    const b = useSession.getState().report.blocks[0]
    expect(b.type === 'text' && b.markdown).toBe('hi')
  })
})

describe('runAll', () => {
  it('инкрементит runAllSeq', () => {
    useSession.getState().runAll()
    useSession.getState().runAll()
    expect(useSession.getState().runAllSeq).toBe(2)
  })
})
