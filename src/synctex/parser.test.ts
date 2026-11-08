import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { decodeSyncTex, parseSyncTex } from './parser'

const FIXTURE_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'sample')
const SP_PER_BP = 65781.76

describe('decodeSyncTex', () => {
  it('decodes gzip and plain files to the same text', () => {
    const gz = decodeSyncTex(readFileSync(join(FIXTURE_DIR, 'main.synctex.gz')))
    const plain = decodeSyncTex(readFileSync(join(FIXTURE_DIR, 'main.synctex')))
    expect(gz).toBe(plain)
    expect(gz.startsWith('SyncTeX Version:1')).toBe(true)
  })
})

describe('parseSyncTex (fixture built with pdfTeX)', () => {
  const data = parseSyncTex(decodeSyncTex(readFileSync(join(FIXTURE_DIR, 'main.synctex.gz'))))

  it('reads the preamble', () => {
    expect(data.version).toBe(1)
    expect(data.output).toBe('pdf')
    expect(data.magnification).toBe(1000)
    expect(data.unit).toBe(1)
    expect(data.inputs.get(1)).toBe('./main.tex')
    expect(data.inputs.get(7)).toBe('./chapter.tex')
    expect(data.inputs.size).toBe(8)
  })

  it('counts pages and records', () => {
    expect(data.pageCount).toBe(4)
    expect(data.records.length).toBe(3828)
    for (const r of data.records) {
      expect(r.page).toBeGreaterThanOrEqual(1)
      expect(r.page).toBeLessThanOrEqual(4)
    }
  })

  it('indexes records by input tag and line', () => {
    expect([...data.byTagLine.get(1)!.keys()].sort((a, b) => a - b)).toEqual([
      7, 9, 10, 11, 12, 14, 15, 16, 17,
    ])
    expect([...data.byTagLine.get(7)!.keys()].sort((a, b) => a - b)).toEqual([1, 3, 4, 12, 14])
    // class/package files never produce records
    expect(data.byTagLine.has(2)).toBe(false)
  })

  it('places lines on the expected pages', () => {
    expect(data.byTagLine.get(1)!.get(7)![0]!.page).toBe(1) // \maketitle
    expect(data.byTagLine.get(7)!.get(3)![0]!.page).toBe(1) // first chapter paragraph
    expect(data.byTagLine.get(7)!.get(14)![0]!.page).toBe(4) // last chapter paragraph
  })

  it('converts scaled points to PDF points', () => {
    // (1,7:8799518,11617246:22609920,779870,220219
    const hbox = data.byTagLine
      .get(1)!
      .get(7)!
      .find((r) => r.kind === 'hbox')!
    expect(hbox.x).toBeCloseTo(8799518 / SP_PER_BP, 6)
    expect(hbox.y).toBeCloseTo(11617246 / SP_PER_BP, 6)
    expect(hbox.width).toBeCloseTo(22609920 / SP_PER_BP, 6)
    expect(hbox.height).toBeCloseTo(779870 / SP_PER_BP, 6)
    expect(hbox.depth).toBeCloseTo(220219 / SP_PER_BP, 6)
    // A4-ish text block: x ≈ 133 bp from the left edge, well inside the page.
    expect(hbox.x).toBeGreaterThan(100)
    expect(hbox.x).toBeLessThan(200)
  })
})

describe('parseSyncTex (synthetic input)', () => {
  const text = [
    'SyncTeX Version:1',
    'Input:1:./main.tex',
    'Output:pdf',
    'Magnification:2000',
    'Unit:1',
    'X Offset:65781',
    'Y Offset:0',
    'Content:',
    '!42',
    '{1',
    '[1,3:0,100:200,300,400',
    '(1,3,7:10,20:30,40,50',
    'k1,3:1,2:3',
    'g1,3:4,5',
    'x1,4:6,7',
    '$1,4:8,9',
    'r1,4:1,2:3,4,5',
    'v1,5:1,2:3,4,5',
    'h1,5:1,2:3,4,5',
    'f1,5:1,2',
    ')',
    ']',
    '}1',
    'Input:2:./late.tex',
    '{2',
    '(2,1:1,1:1,1,1',
    ')',
    '}2',
    'Postamble:',
    'Count:12',
    '(9,9:9,9:9,9,9', // must be ignored after the postamble
    'Post scriptum:',
    '',
  ].join('\n')
  const data = parseSyncTex(text)

  it('recognises every record kind', () => {
    expect(data.records.map((r) => r.kind)).toEqual([
      'vbox',
      'hbox',
      'kern',
      'glue',
      'current',
      'math',
      'rule',
      'void-vbox',
      'void-hbox',
      'form',
      'hbox',
    ])
  })

  it('handles the optional column field', () => {
    const [vbox, hbox] = data.records
    expect(vbox!.column).toBeUndefined()
    expect(hbox!.column).toBe(7)
    expect(hbox!.line).toBe(3)
  })

  it('applies magnification and offsets when scaling', () => {
    const scale = 2000 / 1000 / SP_PER_BP
    const vbox = data.records[0]!
    expect(vbox.x).toBeCloseTo((0 + 65781) * scale, 9)
    expect(vbox.y).toBeCloseTo(100 * scale, 9)
    expect(vbox.width).toBeCloseTo(200 * scale, 9)
  })

  it('accepts Input lines inside the content section', () => {
    expect(data.inputs.get(2)).toBe('./late.tex')
    expect(data.byTagLine.get(2)!.get(1)![0]!.page).toBe(2)
  })

  it('stops at the postamble', () => {
    expect(data.pageCount).toBe(2)
    expect(data.byTagLine.has(9)).toBe(false)
  })
})
