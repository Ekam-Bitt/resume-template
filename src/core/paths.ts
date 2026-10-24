import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatJson } from './json.ts'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DATA_DIR = path.join(ROOT, 'data')
export const VARIANTS_DIR = path.join(DATA_DIR, 'variants')
export const OUT_DIR = path.join(ROOT, 'out')
export const TEMPLATE = path.join(ROOT, 'template/resume.typ')
export const FONTS_DIR = path.join(ROOT, 'fonts')
export const SCHEMA_FILE = path.join(ROOT, 'schema/resume.schema.json')
export const BASE_FILE = path.join(DATA_DIR, 'base.json')
export const SAMPLE_FILE = path.join(DATA_DIR, 'sample.json')

const SLUG = /^[a-z0-9][a-z0-9-]*$/

/** A plain resume name: "base", "sample" or a variant slug (never a path). */
export const isName = (name: string) => SLUG.test(name)

export function assertSlug(slug: string) {
  if (!isName(slug)) throw new Error(`Invalid name "${slug}": use lowercase letters, digits and dashes`)
}

/**
 * data/base.json is the owner's real resume and is git-ignored. A fresh clone
 * starts from the John Doe sample, copied into place on first use.
 */
export function ensureBase() {
  if (!fs.existsSync(BASE_FILE) && fs.existsSync(SAMPLE_FILE)) fs.copyFileSync(SAMPLE_FILE, BASE_FILE)
}

/** base: the master resume; sample: the public demo; variant: a tailored copy; file: any other path. */
export type ResumeKind = 'base' | 'sample' | 'variant' | 'file'
export type ResumeRef = { name: string; file: string; kind: ResumeKind }

const RESERVED: Record<string, { file: string; kind: ResumeKind }> = {
  base: { file: BASE_FILE, kind: 'base' },
  sample: { file: SAMPLE_FILE, kind: 'sample' },
}

/**
 * "base" → data/base.json, "sample" → data/sample.json, "<slug>" → data/variants/<slug>.json,
 * anything with a slash or .json → that file.
 */
export function resolveResume(ref = 'base'): ResumeRef {
  if (ref.includes('/') || ref.endsWith('.json')) {
    const file = path.resolve(ref)
    const reserved = Object.entries(RESERVED).find(([, r]) => r.file === file)
    if (reserved?.[1].kind === 'base') ensureBase()
    return reserved ? { name: reserved[0], ...reserved[1] } : { name: path.basename(file, '.json'), file, kind: 'file' }
  }
  assertSlug(ref)
  if (ref === 'base') ensureBase()
  const reserved = RESERVED[ref]
  return reserved ? { name: ref, ...reserved } : { name: ref, file: path.join(VARIANTS_DIR, `${ref}.json`), kind: 'variant' }
}

export function listResumes(): ResumeRef[] {
  const variants = fs.existsSync(VARIANTS_DIR)
    ? fs.readdirSync(VARIANTS_DIR).filter(f => f.endsWith('.json')).sort()
    : []
  const sample = fs.existsSync(SAMPLE_FILE) ? [resolveResume('sample')] : []
  return [resolveResume('base'), ...sample, ...variants.map(f => resolveResume(path.basename(f, '.json')))]
}

export const pdfPathFor = (name: string) => path.join(OUT_DIR, `${name}.pdf`)

export function readJson(file: string): unknown {
  if (!fs.existsSync(file)) throw new Error(`No resume at ${path.relative(ROOT, file) || file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * Writes `data` in the shared format and returns the text on disk. Unchanged
 * files are left alone; changed ones go through a temp file and rename, so
 * watchers never see a half-written file.
 */
export function writeJson(file: string, data: unknown): string {
  const text = formatJson(data)
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return text
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
  return text
}
