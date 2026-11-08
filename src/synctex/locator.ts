import type { SyncTexData, SyncTexRecord } from './parser'

export interface PdfPosition {
  /** 1-based page. */
  page: number
  /** PDF points from the left edge. */
  x: number
  /** PDF points from the top edge (baseline of the located box). */
  y: number
  /** The source line the position was actually taken from (may differ from the request). */
  line: number
  /** True when no record existed on the requested line and a neighbour was used. */
  approximate: boolean
}

const sortedLinesCache = new WeakMap<SyncTexData, Map<number, number[]>>()

function sortedLinesFor(data: SyncTexData, tag: number): number[] {
  let perTag = sortedLinesCache.get(data)
  if (!perTag) {
    perTag = new Map()
    sortedLinesCache.set(data, perTag)
  }
  let lines = perTag.get(tag)
  if (!lines) {
    lines = [...(data.byTagLine.get(tag)?.keys() ?? [])].sort((a, b) => a - b)
    perTag.set(tag, lines)
  }
  return lines
}

/**
 * Find the source line that has SyncTeX records and is closest to `line`.
 * Ties go to the following line, which matches what users expect when the
 * cursor sits on a blank line between paragraphs.
 */
export function nearestLineWithRecords(
  data: SyncTexData,
  tag: number,
  line: number,
): number | undefined {
  const lines = sortedLinesFor(data, tag)
  if (lines.length === 0) return undefined

  // binary search for first line >= target
  let lo = 0
  let hi = lines.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((lines[mid] as number) < line) lo = mid + 1
    else hi = mid
  }
  const after = lines[lo]
  const before = lo > 0 ? lines[lo - 1] : undefined
  if (after === line) return after
  if (after === undefined) return before
  if (before === undefined) return after
  return after - line <= line - before ? after : before
}

/**
 * Pick the representative record for a set of records on one line: the first
 * one in document order, preferring boxes with geometry over glue/kern.
 */
function pickRecord(records: readonly SyncTexRecord[]): SyncTexRecord | undefined {
  let fallback: SyncTexRecord | undefined
  for (const r of records) {
    if (
      r.kind === 'hbox' ||
      r.kind === 'vbox' ||
      r.kind === 'void-hbox' ||
      r.kind === 'void-vbox'
    ) {
      return r
    }
    fallback ??= r
  }
  return fallback
}

/** Resolve a (tag, 1-based line) pair to a PDF position. */
export function locateLine(data: SyncTexData, tag: number, line: number): PdfPosition | undefined {
  const target = nearestLineWithRecords(data, tag, line)
  if (target === undefined) return undefined
  const records = data.byTagLine.get(tag)?.get(target)
  if (!records || records.length === 0) return undefined
  const rec = pickRecord(records)
  if (!rec) return undefined
  return { page: rec.page, x: rec.x, y: rec.y, line: target, approximate: target !== line }
}

/** Whether two positions are close enough to be treated as the same viewer target. */
export function isSamePosition(a: PdfPosition, b: PdfPosition, tolerance: number): boolean {
  return a.page === b.page && Math.abs(a.y - b.y) <= tolerance
}
