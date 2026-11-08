import * as path from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { normalizeFsPath, pdfPathForSyncTex, resolveInputPath, resolveInputs } from './inputs'

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures', 'sample')

describe('pdfPathForSyncTex', () => {
  it('maps both compressed and plain SyncTeX files', () => {
    expect(pdfPathForSyncTex('/x/out/main.synctex.gz')).toBe('/x/out/main.pdf')
    expect(pdfPathForSyncTex('/x/out/main.synctex')).toBe('/x/out/main.pdf')
    expect(pdfPathForSyncTex('/x/out/main.SYNCTEX.GZ')).toBe('/x/out/main.pdf')
  })
})

describe('resolveInputs (real fixture)', () => {
  const inputs = new Map<number, string>([
    [1, './main.tex'],
    [2, '/nonexistent/texmf-dist/tex/latex/base/article.cls'],
    [6, './main.aux'],
    [7, './chapter.tex'],
    [8, './main.aux'],
  ])
  const tags = resolveInputs(inputs, path.join(FIXTURE_DIR, 'main.synctex.gz'))

  it('resolves relative inputs against the SyncTeX directory', () => {
    expect(tags.get(normalizeFsPath(path.join(FIXTURE_DIR, 'main.tex')))).toBe(1)
    expect(tags.get(normalizeFsPath(path.join(FIXTURE_DIR, 'chapter.tex')))).toBe(7)
  })
  it('keeps the first tag for duplicated inputs and drops missing files', () => {
    // main.aux is cleaned from the fixture directory; article.cls points nowhere
    expect([...tags.values()].sort()).toEqual([1, 7])
  })
})

describe('resolveInputPath (virtual file system)', () => {
  const files = new Set([
    '/proj/main.tex',
    '/proj/chapters/intro.tex',
    '/proj/out/main.synctex.gz',
    '/proj/figs/plot.tex',
  ])
  const exists = (p: string) => files.has(p)
  const bases = ['/proj/out', '/proj', '/']

  it('walks up from the output directory for -outdir builds', () => {
    expect(resolveInputPath('./main.tex', bases, exists)).toBe('/proj/main.tex')
    expect(resolveInputPath('chapters/intro.tex', bases, exists)).toBe('/proj/chapters/intro.tex')
  })
  it('adds .tex when the extension was omitted', () => {
    expect(resolveInputPath('./chapters/intro', bases, exists)).toBe('/proj/chapters/intro.tex')
  })
  it('uses an existing absolute path as-is', () => {
    expect(resolveInputPath('/proj/figs/./plot.tex', bases, exists)).toBe('/proj/figs/plot.tex')
  })
  it('falls back to path tails for absolute paths from another machine', () => {
    expect(
      resolveInputPath('/Users/someone/elsewhere/proj/./chapters/intro.tex', bases, exists),
    ).toBe('/proj/chapters/intro.tex')
  })
  it('returns undefined when nothing matches', () => {
    expect(resolveInputPath('./missing.tex', bases, exists)).toBeUndefined()
    expect(resolveInputPath('/nope/missing.tex', bases, exists)).toBeUndefined()
  })
})
