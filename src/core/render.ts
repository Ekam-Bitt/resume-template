// Compiles a resume with the bundled Typst template. The browser editor runs
// the same template through the WASM build of the same compiler version.
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler'
import path from 'node:path'
import { readLayout, type PageInfo, type Probe } from './lint.ts'
import { FONTS_DIR, ROOT, TEMPLATE } from './paths.ts'
import type { Resume } from './schema.ts'

export type RenderResult = { pdf: Buffer; page: PageInfo; probes: Probe[] }

// The data is handed over as an in-memory file, so unsaved edits can be
// rendered and checked before anything is written to disk.
const DATA_PATH = path.join(ROOT, '__resume__.json')

let compiler: NodeCompiler | null = null
const getCompiler = () =>
  (compiler ??= NodeCompiler.create({ workspace: ROOT, fontArgs: [{ fontPaths: [FONTS_DIR] }] }))

export function render(resume: Resume): RenderResult {
  const c = getCompiler()
  c.mapShadow(DATA_PATH, Buffer.from(JSON.stringify(resume)))
  try {
    const res = c.compile({ mainFilePath: TEMPLATE, inputs: { data: '/__resume__.json' } })
    const err = res.takeError()
    if (err || !res.result) {
      const diagnostics: { message: string }[] = err ? c.fetchDiagnostics(err) : []
      throw new Error('Typst: ' + diagnostics.map(d => d.message).join('; '))
    }
    const doc = res.result
    const layout = readLayout(c.query(doc, { selector: '<pages>' }), c.query(doc, { selector: '<lint>' }), doc.numOfPages)
    return { pdf: c.pdf(doc), ...layout }
  } finally {
    c.unmapShadow(DATA_PATH)
    c.evictCache(10)
  }
}
