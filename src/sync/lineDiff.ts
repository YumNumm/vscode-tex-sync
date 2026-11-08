/**
 * Line-level diff that reports which lines of the *new* text were inserted or
 * changed. Deletions have no counterpart in the new file (and therefore
 * nothing to highlight in the PDF), so they are not reported.
 *
 * Common prefix/suffix are trimmed first; the remaining middle is aligned with
 * an LCS table when it is small enough, otherwise the whole middle counts as
 * changed.
 */

/** Above this many cells the LCS table is skipped and the middle is reported as one block. */
const MAX_LCS_CELLS = 4_000_000

export function changedLinesInNew(
  oldLines: readonly string[],
  newLines: readonly string[],
): number[] {
  let start = 0
  const maxStart = Math.min(oldLines.length, newLines.length)
  while (start < maxStart && oldLines[start] === newLines[start]) start++

  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--
    newEnd--
  }

  const n = oldEnd - start
  const m = newEnd - start
  if (m === 0) return []
  if (n === 0) return range(start, newEnd)
  if (n * m > MAX_LCS_CELLS) return range(start, newEnd)

  // LCS lengths for the middle section. table[(i)*(m+1) + j] = lcs(old[i..], new[j..])
  const width = m + 1
  const table = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    const oi = oldLines[start + i]
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        oi === newLines[start + j]
          ? (table[(i + 1) * width + j + 1] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number)
    }
  }

  const changed: number[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[start + i] === newLines[start + j]) {
      i++
      j++
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      i++ // deletion: nothing to report
    } else {
      changed.push(start + j)
      j++
    }
  }
  while (j < m) changed.push(start + j++)
  return changed
}

/** Collapse sorted line numbers into [first, last] inclusive runs. */
export function toRuns(lines: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  for (const l of lines) {
    const last = runs[runs.length - 1]
    if (last && l === last[1] + 1) last[1] = l
    else runs.push([l, l])
  }
  return runs
}

function range(from: number, toExclusive: number): number[] {
  const out: number[] = []
  for (let i = from; i < toExclusive; i++) out.push(i)
  return out
}
