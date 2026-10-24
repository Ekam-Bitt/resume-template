// Runs the Typst compiler (WebAssembly) in the browser on the same template
// the CLI uses, so the preview, the downloaded PDF and agent builds match.
// Adapted from gianfrancodemarco/resume-builder (MIT), src/typst/TypstService.js.
import type { PageInfo, Probe } from '../../src/core/render.ts'
import type { Resume } from '../../src/core/schema.ts'
import templateSource from '../../template/resume.typ?raw'
import regular from '../../fonts/Carlito-Regular.ttf?url'
import bold from '../../fonts/Carlito-Bold.ttf?url'
import italic from '../../fonts/Carlito-Italic.ttf?url'
import boldItalic from '../../fonts/Carlito-BoldItalic.ttf?url'

const MAIN = '/template/resume.typ'
const DATA = '/resume.json'
const FORMAT_PDF = 1

export class TypstCompileError extends Error {}

type Engine = Awaited<ReturnType<typeof createEngine>>
let enginePromise: Promise<Engine> | null = null
// The compiler holds shared state (the mapped data file), so jobs run one at a time
let queue: Promise<unknown> = Promise.resolve()
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job)
  queue = run.catch(() => {})
  return run
}

async function createEngine() {
  const [typst, { default: compilerWasm }, { default: rendererWasm }] = await Promise.all([
    import('@myriaddreamin/typst.ts'),
    import('@myriaddreamin/typst-ts-web-compiler/wasm?url'),
    import('@myriaddreamin/typst-ts-renderer/wasm?url'),
  ])
  const fonts = await Promise.all(
    [regular, bold, italic, boldItalic].map(async url => new Uint8Array(await (await fetch(url)).arrayBuffer())),
  )
  const compiler = typst.createTypstCompiler()
  // assets: false keeps typst.ts from downloading its default fonts from a CDN
  await compiler.init({ beforeBuild: [typst.loadFonts(fonts, { assets: false })], getModule: () => compilerWasm })
  compiler.addSource(MAIN, templateSource)

  const renderer = typst.createTypstRenderer()
  await renderer.init({ getModule: () => rendererWasm })
  return { compiler, renderer }
}

const getEngine = () =>
  (enginePromise ??= createEngine().catch(e => {
    enginePromise = null
    throw e
  }))

const formatDiagnostics = (diagnostics: unknown[] = []) =>
  diagnostics.map(d => (typeof d === 'string' ? d : (d as { message: string }).message)).join('; ') || 'Typst compilation failed'

type Found = { value: any }[]
const inputs = { data: DATA }

async function compilePdf(resume: Resume) {
  const engine = await getEngine()
  return enqueue(async () => {
    engine.compiler.mapShadow(DATA, new TextEncoder().encode(JSON.stringify(resume)))
    const { result, diagnostics } = await engine.compiler.compile({ mainFilePath: MAIN, inputs, format: FORMAT_PDF, diagnostics: 'full' })
    if (!result) throw new TypstCompileError(formatDiagnostics(diagnostics))
    return result as Uint8Array
  })
}

// Querying needs a compiled snapshot, so the preview compiles inside one world
// and reads both the vector artifact and the layout metadata from it.
async function compileVector(resume: Resume) {
  const engine = await getEngine()
  return enqueue(async () => {
    engine.compiler.mapShadow(DATA, new TextEncoder().encode(JSON.stringify(resume)))
    return engine.compiler.runWithWorld({ mainFilePath: MAIN, inputs }, async world => {
      const compiled = (await world.compile({ diagnostics: 'full' })) as { diagnostics?: unknown[] } | undefined
      const { result, diagnostics } = (await world.vector({ diagnostics: 'full' })) as { result?: Uint8Array; diagnostics?: unknown[] }
      if (!result) throw new TypstCompileError(formatDiagnostics(diagnostics ?? compiled?.diagnostics))
      const pages = (await world.query({ selector: '<pages>' })) as Found
      const lint = (await world.query({ selector: '<lint>' })) as Found
      return { engine, result, pages, lint }
    })
  })
}

// The renderer rounds the SVG size up to whole points (an A4 page becomes 596pt
// wide instead of 595.28pt), which leaves a blank strip along the edges. Set the
// exact document size so the SVG maps 1:1 onto the pages.
function fitSvg(svg: string, { width, height }: { width: number; height: number }) {
  const end = svg.indexOf('>')
  const root = svg
    .slice(0, end)
    .replace(/\sviewBox="[^"]*"/, ` viewBox="0 0 ${width} ${height}"`)
    .replace(/\s(data-)?width="[^"]*"/g, (_, data) => ` ${data || ''}width="${width}"`)
    .replace(/\s(data-)?height="[^"]*"/g, (_, data) => ` ${data || ''}height="${height}"`)
  return root + svg.slice(end)
}

export type Preview = {
  svg: string
  size: { width: number; height: number }
  pageSizes: { width: number; height: number }[]
  page: PageInfo
  probes: Probe[]
}

export async function renderPreview(resume: Resume): Promise<Preview> {
  const { engine, result, pages, lint } = await compileVector(resume)
  const { renderer } = engine
  const meta = pages?.[0]?.value ?? {}
  return renderer.runWithSession(async session => {
    renderer.manipulateData({ renderSession: session, action: 'reset', data: result })
    const pageSizes = session.retrievePagesInfo().map(p => ({ width: p.width, height: p.height }))
    const svg = await renderer.renderSvg({
      renderSession: session,
      data_selection: { body: true, defs: true, css: true, js: false },
    })
    const size = {
      width: Math.max(...pageSizes.map(p => p.width)),
      height: pageSizes.reduce((sum, p) => sum + p.height, 0),
    }
    return {
      svg: fitSvg(svg, size),
      size,
      pageSizes,
      probes: (lint ?? []).map(m => m.value as Probe),
      page: {
        pages: meta.pages ?? pageSizes.length,
        endY: meta['end-y'],
        pageHeight: meta['page-height'],
        topMargin: meta['top-margin'],
        bottomMargin: meta['bottom-margin'],
        linePitch: meta['line-pitch'],
      },
    }
  })
}

export async function renderPdf(resume: Resume): Promise<Uint8Array> {
  return compilePdf(resume)
}
