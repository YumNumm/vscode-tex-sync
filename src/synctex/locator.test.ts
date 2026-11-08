import { describe, expect, it } from 'vite-plus/test'
import { isSamePosition, locateLine, nearestLineWithRecords } from './locator'
import { parseSyncTex, type SyncTexData } from './parser'

function synthetic(): SyncTexData {
  return parseSyncTex(
    [
      'SyncTeX Version:1',
      'Input:1:./a.tex',
      'Content:',
      '{1',
      'g1,10:5,5', // glue only on line 10
      '(1,10:100,200:1,1,1', // hbox on line 10 -> preferred representative
      '(1,20:100,400:1,1,1',
      ')',
      ')',
      '}1',
      '{2',
      '(1,30:100,100:1,1,1',
      ')',
      '}2',
      'Postamble:',
    ].join('\n'),
  )
}

describe('nearestLineWithRecords', () => {
  const data = synthetic()
  it('returns the line itself when it has records', () => {
    expect(nearestLineWithRecords(data, 1, 20)).toBe(20)
  })
  it('prefers the following line on ties', () => {
    expect(nearestLineWithRecords(data, 1, 15)).toBe(20)
  })
  it('otherwise picks the closest line', () => {
    expect(nearestLineWithRecords(data, 1, 13)).toBe(10)
    expect(nearestLineWithRecords(data, 1, 27)).toBe(30)
  })
  it('clamps to the first and last mapped lines', () => {
    expect(nearestLineWithRecords(data, 1, 1)).toBe(10)
    expect(nearestLineWithRecords(data, 1, 999)).toBe(30)
  })
  it('returns undefined for unknown tags', () => {
    expect(nearestLineWithRecords(data, 42, 10)).toBeUndefined()
  })
})

describe('locateLine', () => {
  const data = synthetic()
  it('uses a box record rather than glue when both exist', () => {
    const pos = locateLine(data, 1, 10)!
    expect(pos.page).toBe(1)
    expect(pos.approximate).toBe(false)
    expect(pos.y).toBeCloseTo(200 / 65781.76, 9)
  })
  it('flags approximate matches', () => {
    const pos = locateLine(data, 1, 25)!
    expect(pos.line).toBe(30)
    expect(pos.page).toBe(2)
    expect(pos.approximate).toBe(true)
  })
})

describe('isSamePosition', () => {
  const a = { page: 1, x: 0, y: 10, line: 1, approximate: false }
  it('compares page and vertical distance only', () => {
    expect(isSamePosition(a, { ...a, x: 500 }, 0)).toBe(true)
    expect(isSamePosition(a, { ...a, y: 11.5 }, 2)).toBe(true)
    expect(isSamePosition(a, { ...a, y: 13 }, 2)).toBe(false)
    expect(isSamePosition(a, { ...a, page: 2 }, 100)).toBe(false)
  })
})
