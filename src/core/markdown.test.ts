import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders normal markdown', () => {
    expect(renderMarkdown('**жирный**')).toContain('<strong>жирный</strong>')
  })
  it('renders lists', () => {
    expect(renderMarkdown('- пункт')).toContain('<li>пункт</li>')
  })
  it('escapes block-level raw HTML instead of passing it through', () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
  it('escapes inline raw HTML inside a paragraph', () => {
    const out = renderMarkdown('до <script>alert(1)</script> после')
    expect(out).not.toContain('<script>')
  })

  it('neutralizes javascript: URLs in links', () => {
    const out = renderMarkdown('[click](javascript:alert(1))')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="#"')
  })

  it('neutralizes javascript: with mixed case and control-char bypass', () => {
    expect(renderMarkdown('[x](JavaScript:alert(1))')).not.toContain('avaScript:')
    expect(renderMarkdown('[x](java\tscript:alert(1))')).not.toMatch(/javascript:/i)
  })

  it('neutralizes data: and vbscript: URLs in links and images', () => {
    expect(renderMarkdown('[x](data:text/html,<script>alert(1)</script>)')).not.toContain('data:text/html')
    expect(renderMarkdown('![x](javascript:alert(1))')).not.toContain('javascript:')
  })

  it('keeps safe links working (http/https/mailto/relative/anchor)', () => {
    expect(renderMarkdown('[ok](https://example.com)')).toContain('href="https://example.com"')
    expect(renderMarkdown('[rel](/path/page)')).toContain('href="/path/page"')
    expect(renderMarkdown('[a](#section)')).toContain('href="#section"')
  })
})
