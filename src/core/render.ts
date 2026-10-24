// Compiles a resume with the bundled Typst template. The browser editor runs
// the same template through the WASM build of the same compiler version.
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler'
import path from 'node:path'
import { FONTS_DIR, ROOT, TEMPLATE } from './paths.ts'
import type { Resume } from './schema.ts'

export type Probe = { id: string; lines: number; widow: boolean }
export type PageInfo = {
  pages: number
  endY: number
  pageHeight: number
  topMargin: number
  bottomMargin: number
  linePitch: number
}
export type RenderResult = { pdf: Buffer; page: PageInfo; probes: Probe[] }

// The data is handed over as an in-memory file, so unsaved edits can be
// rendered and checked before anything is written to disk.
const DATA_PATH = path.join(ROOT, '__resume__.json')

let compiler: NodeCompiler | null = null
const getCompiler = () =>
  (compiler ??= NodeCompiler.create({ workspace: ROOT, fontArgs: [{ fontPaths: [FONTS_DIR] }] }))

export class TypstError extends Error {
  diagnostics: { message: string; path?: string }[]
  constructor(diagnostics: { message: string; path?: string }[]) {
    super('Typst: ' + diagnostics.map(d => d.message).join('; '))
    this.diagnostics = diagnostics
  }
}

export function render(resume: Resume): RenderResult {
  const c = getCompiler()
  c.mapShadow(DATA_PATH, Buffer.from(JSON.stringify(resume)))
  try {
    const res = c.compile({ mainFilePath: TEMPLATE, inputs: { data: '/__resume__.json' } })
    const err = res.takeError()
    if (err || !res.result) throw new TypstError(err ? c.fetchDiagnostics(err) : [])
    const doc = res.result
    const meta = c.query(doc, { selector: '<pages>' })[0]?.value ?? {}
    const probes: Probe[] = c.query(doc, { selector: '<lint>' }).map((m: { value: Probe }) => m.value)
    return {
      pdf: c.pdf(doc),
      probes,
      page: {
        pages: meta.pages ?? doc.numOfPages,
        endY: meta['end-y'],
        pageHeight: meta['page-height'],
        topMargin: meta['top-margin'],
        bottomMargin: meta['bottom-margin'],
        linePitch: meta['line-pitch'],
      },
    }
  } finally {
    c.unmapShadow(DATA_PATH)
    c.evictCache(10)
  }
}
