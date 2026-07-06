import { describe, expect, it } from 'vitest'
import { viewportContentFor, DEFAULT_VIEWPORT } from './mobileViewport'

describe('viewportContentFor', () => {
  it('альбом на телефоне → мини-десктоп width=1180', () => {
    expect(viewportContentFor('landscape', 915)).toBe('width=1180')
  })
  it('портрет на телефоне → дефолтная мета', () => {
    expect(viewportContentFor('portrait', 915)).toBe(DEFAULT_VIEWPORT)
  })
  it('широкий экран (планшет) не трогаем в обеих ориентациях', () => {
    expect(viewportContentFor('landscape', 1366)).toBe(DEFAULT_VIEWPORT)
    expect(viewportContentFor('portrait', 1366)).toBe(DEFAULT_VIEWPORT)
  })
})
