import { describe, expect, it } from 'vite-plus/test'
import { changedLinesInNew, toRuns } from './lineDiff'

const L = (s: string) => s.split('\n')

describe('changedLinesInNew', () => {
  it('returns nothing for identical texts', () => {
    expect(changedLinesInNew(L('a\nb\nc'), L('a\nb\nc'))).toEqual([])
  })
  it('reports a modified line', () => {
    expect(changedLinesInNew(L('a\nb\nc'), L('a\nB\nc'))).toEqual([1])
  })
  it('reports inserted lines', () => {
    expect(changedLinesInNew(L('a\nc'), L('a\nb1\nb2\nc'))).toEqual([1, 2])
  })
  it('reports nothing for pure deletions', () => {
    expect(changedLinesInNew(L('a\nb\nc'), L('a\nc'))).toEqual([])
  })
  it('separates two distant edits instead of one big block', () => {
    const oldText = L('1\n2\n3\n4\n5\n6\n7\n8\n9')
    const newText = L('1\nX\n3\n4\n5\n6\n7\nY\n9')
    expect(changedLinesInNew(oldText, newText)).toEqual([1, 7])
  })
  it('handles edits at the very start and end', () => {
    expect(changedLinesInNew(L('a\nb'), L('A\nb'))).toEqual([0])
    expect(changedLinesInNew(L('a\nb'), L('a\nB'))).toEqual([1])
    expect(changedLinesInNew(L(''), L('a\nb'))).toEqual([0, 1])
  })
  it('falls back to one block for huge middles', () => {
    const oldText = Array.from({ length: 3000 }, (_, i) => `o${i}`)
    const newText = Array.from({ length: 3000 }, (_, i) => `n${i}`)
    const changed = changedLinesInNew(oldText, newText)
    expect(changed.length).toBe(3000)
    expect(changed[0]).toBe(0)
  })
})

describe('toRuns', () => {
  it('groups consecutive lines', () => {
    expect(toRuns([1, 2, 3, 7, 9, 10])).toEqual([
      [1, 3],
      [7, 7],
      [9, 10],
    ])
  })
})
