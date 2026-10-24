// Runs the Typst compiler (WebAssembly) in the browser on the same template
// the CLI uses, so the preview, the downloaded PDF and agent builds match.
// Adapted from gianfrancodemarco/resume-builder (MIT), src/typst/TypstService.js.
import { readLayout, type PageInfo, type Probe } from '../../src/core/lint.ts'
import defaultsSource from '../../template/defaults.json?raw'
import templateSource from '../../template/resume.typ?raw'
import regular from '../../fonts/Carlito-Regular.ttf?url'
import bold from '../../fonts/Carlito-Bold.ttf?url'
import italic from '../../fonts/Carlito-Italic.ttf?url'
import boldItalic from '../../fonts/Carlito-BoldItalic.ttf?url'

const MAIN = '/template/resume.typ'
const DATA = '/resume.json'
const inputs = { data: DATA }
const FORMAT_PDF = 1

type Engine = Awaited<ReturnType<typeof createEngine>>
let enginePromise: Promise<Engine> | null = null
// The compiler holds shared state (the mapped data file), so jobs run one at a time
let queue: Promise<unknown> = Promise.resolve()
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job)
  queue = run.catch(() => {})
  return run
}

const fetchBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer())

async function createEngine() {
  const [typst, { default: compilerWasm }, { default: rendererWasm }, fonts] = await Promise.all([
    import('@myriaddreamin/typst.ts'),
    import('@myriaddreamin/typst-ts-web-compiler/wasm?url'),
    import('@myriaddreamin/typst-ts-renderer/wasm?url'),
    Promise.all([regular, bold, italic, boldItalic].map(fetchBytes)),
  ])
  const compiler = typst.createTypstCompiler()
  const renderer = typst.createTypstRenderer()
  await Promise.all([
    // assets: false keeps typst.ts from downloading its default fonts from a CDN
    compiler.init({ beforeBuild: [typst.loadFonts(fonts, { assets: false })], getModule: () => compilerWasm }),
    renderer.init({ getModule: () => rendererWasm }),
  ])
  compiler.addSource(MAIN, templateSource)
  compiler.mapShadow('/template/defaults.json', new TextEncoder().encode(defaultsSource))
  return { compiler, renderer }
}

/** Starts downloading and initialising the compiler; call early so it overlaps with loading data. */
export const warmUp = () =>
  (enginePromise ??= createEngine().catch(e => {
    enginePromise = null
    throw e
  }))

const formatDiagnostics = (diagnostics: unknown[] = []) =>
  diagnostics.map(d => (typeof d === 'string' ? d : (d as { message: string }).message)).join('; ') || 'Typst compilation failed'

/** Maps `json` (the resume, already serialized) into the compiler and runs `job` exclusively. */
async function withData<T>(json: string, job: (engine: Engine) => Promise<T>) {
  const engine = await warmUp()
  return enqueue(() => {
    engine.compiler.mapShadow(DATA, new TextEncoder().encode(json))
    return job(engine)
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
  pageSizes: { width: number; height: number }[]
  page: PageInfo
  probes: Probe[]
}

type Found = { value: unknown }[]

/** Compiles to vector form and renders SVG. Querying needs a compiled snapshot, so it all happens in one world. */
export function renderPreview(json: string): Promise<Preview> {
  return withData(json, ({ compiler, renderer }) =>
    compiler.runWithWorld({ mainFilePath: MAIN, inputs }, async world => {
      const compiled = (await world.compile({ diagnostics: 'full' })) as { diagnostics?: unknown[] } | undefined
      const { result, diagnostics } = (await world.vector({ diagnostics: 'full' })) as { result?: Uint8Array; diagnostics?: unknown[] }
      if (!result) throw new Error(formatDiagnostics(diagnostics ?? compiled?.diagnostics))
      const pages = (await world.query({ selector: '<pages>' })) as Found
      const lint = (await world.query({ selector: '<lint>' })) as Found
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
        return { svg: fitSvg(svg, size), pageSizes, ...readLayout(pages, lint, pageSizes.length) }
      })
    }),
  )
}

export function renderPdf(json: string): Promise<Uint8Array> {
  return withData(json, async ({ compiler }) => {
    const { result, diagnostics } = await compiler.compile({ mainFilePath: MAIN, inputs, format: FORMAT_PDF, diagnostics: 'full' })
    if (!result) throw new Error(formatDiagnostics(diagnostics))
    return result as Uint8Array
  })
}
