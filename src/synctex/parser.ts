import { gunzipSync } from 'node:zlib'

/**
 * SyncTeX "sourcemap" parser.
 *
 * The SyncTeX file produced by (pdf|xe|lua)TeX with `-synctex=1` is a line
 * oriented text format (optionally gzip-compressed):
 *
 *   SyncTeX Version:1
 *   Input:<tag>:<path>              -- one per input file; may also appear inside Content
 *   Output:pdf
 *   Magnification:1000
 *   Unit:1
 *   X Offset:0
 *   Y Offset:0
 *   Content:
 *   !<bytes>                        -- byte-count anchor (ignored)
 *   {<page>  ...  }<page>           -- page sheet
 *   [<tag>,<line>:<x>,<y>:<w>,<h>,<d>  ... ]   -- vbox
 *   (<tag>,<line>:<x>,<y>:<w>,<h>,<d>  ... )   -- hbox
 *   v / h <tag>,<line>:<x>,<y>:<w>,<h>,<d>     -- void vbox / hbox
 *   x / g / $ / f <tag>,<line>:<x>,<y>         -- current / glue / math / form
 *   k <tag>,<line>:<x>,<y>:<w>                 -- kern
 *   r <tag>,<line>:<x>,<y>:<w>,<h>,<d>         -- rule
 *   Postamble:
 *   Count:<n>
 *   Post scriptum:
 *
 * Newer engines may emit `<tag>,<line>,<column>` instead of `<tag>,<line>`.
 * Coordinates are in scaled points (sp) times `Unit`, with the origin at the
 * top-left corner of the page and y growing downwards.
 */

export type RecordKind =
  | 'vbox'
  | 'hbox'
  | 'void-vbox'
  | 'void-hbox'
  | 'current'
  | 'kern'
  | 'glue'
  | 'math'
  | 'rule'
  | 'form'

export interface SyncTexRecord {
  kind: RecordKind
  /** Input file tag (see {@link SyncTexData.inputs}). */
  tag: number
  /** 1-based source line. */
  line: number
  /** 1-based source column when the engine emitted it. */
  column?: number
  /** 1-based PDF page. */
  page: number
  /** Horizontal position in PDF points (bp) from the left edge. */
  x: number
  /** Vertical position (baseline) in PDF points (bp) from the top edge. */
  y: number
  width?: number
  height?: number
  depth?: number
}

export interface SyncTexData {
  version: number
  /** tag -> raw input path as written by the engine. */
  inputs: Map<number, string>
  output?: string
  magnification: number
  unit: number
  xOffset: number
  yOffset: number
  pageCount: number
  records: SyncTexRecord[]
  /** tag -> (line -> records on that line), in document order. */
  byTagLine: Map<number, Map<number, SyncTexRecord[]>>
}

const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/** 1 bp = 72.27/72 pt = 65536 * 72.27/72 sp. */
const SP_PER_BP = 65781.76

/** Decode a raw `.synctex` or `.synctex.gz` buffer to text. */
export function decodeSyncTex(buffer: Uint8Array): string {
  const isGzip = buffer.length >= 2 && buffer[0] === GZIP_MAGIC_0 && buffer[1] === GZIP_MAGIC_1
  const bytes = isGzip ? gunzipSync(buffer) : buffer
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')
}

const RECORD_RE =
  /^([[\]()vhxkg$rf])(?:(-?\d+),(-?\d+)(?:,(-?\d+))?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+)(?:,(-?\d+))?)?)?)?/

const KIND_BY_CHAR: Record<string, RecordKind> = {
  '[': 'vbox',
  '(': 'hbox',
  v: 'void-vbox',
  h: 'void-hbox',
  x: 'current',
  k: 'kern',
  g: 'glue',
  $: 'math',
  r: 'rule',
  f: 'form',
}

export function parseSyncTex(text: string): SyncTexData {
  const data: SyncTexData = {
    version: 1,
    inputs: new Map(),
    magnification: 1000,
    unit: 1,
    xOffset: 0,
    yOffset: 0,
    pageCount: 0,
    records: [],
    byTagLine: new Map(),
  }

  let inContent = false
  let page = 0
  // The scale is only final after the preamble; it is fixed on `Content:`.
  let scale = 1 / SP_PER_BP

  const toBp = (v: number): number => v * scale

  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    if (raw.length === 0) continue
    const c = raw.charCodeAt(0)

    if (!inContent) {
      if (raw.startsWith('SyncTeX Version:')) {
        data.version = Number(raw.slice('SyncTeX Version:'.length)) || 1
      } else if (raw.startsWith('Input:')) {
        parseInput(raw, data)
      } else if (raw.startsWith('Output:')) {
        data.output = raw.slice('Output:'.length).trim()
      } else if (raw.startsWith('Magnification:')) {
        data.magnification = Number(raw.slice('Magnification:'.length)) || 1000
      } else if (raw.startsWith('Unit:')) {
        data.unit = Number(raw.slice('Unit:'.length)) || 1
      } else if (raw.startsWith('X Offset:')) {
        data.xOffset = Number(raw.slice('X Offset:'.length)) || 0
      } else if (raw.startsWith('Y Offset:')) {
        data.yOffset = Number(raw.slice('Y Offset:'.length)) || 0
      } else if (raw.startsWith('Content:')) {
        inContent = true
        scale = (data.unit * (data.magnification / 1000)) / SP_PER_BP
      }
      continue
    }

    // --- Content section ---
    if (c === 0x21 /* ! */) continue
    if (c === 0x7b /* { */) {
      page = Number(raw.slice(1)) || page + 1
      data.pageCount = Math.max(data.pageCount, page)
      continue
    }
    if (c === 0x7d /* } */) continue
    if (raw.startsWith('Input:')) {
      parseInput(raw, data)
      continue
    }
    if (raw.startsWith('Postamble:')) break

    const m = RECORD_RE.exec(raw)
    if (!m) continue
    const kind = KIND_BY_CHAR[m[1] as string]
    if (!kind || m[2] === undefined) continue // bare `]` / `)` closers

    const rec: SyncTexRecord = {
      kind,
      tag: Number(m[2]),
      line: Number(m[3]),
      page,
      x: toBp(Number(m[5]) + data.xOffset),
      y: toBp(Number(m[6]) + data.yOffset),
    }
    if (m[4] !== undefined) rec.column = Number(m[4])
    if (m[7] !== undefined) rec.width = toBp(Number(m[7]))
    if (m[8] !== undefined) rec.height = toBp(Number(m[8]))
    if (m[9] !== undefined) rec.depth = toBp(Number(m[9]))

    data.records.push(rec)
    let byLine = data.byTagLine.get(rec.tag)
    if (!byLine) {
      byLine = new Map()
      data.byTagLine.set(rec.tag, byLine)
    }
    const list = byLine.get(rec.line)
    if (list) list.push(rec)
    else byLine.set(rec.line, [rec])
  }

  return data
}

function parseInput(raw: string, data: SyncTexData): void {
  // Input:<tag>:<path>   (path may contain ':' on Windows, hence the limit)
  const rest = raw.slice('Input:'.length)
  const sep = rest.indexOf(':')
  if (sep < 0) return
  const tag = Number(rest.slice(0, sep))
  const path = rest.slice(sep + 1).trim()
  if (Number.isFinite(tag) && path.length > 0) {
    data.inputs.set(tag, path)
  }
}
