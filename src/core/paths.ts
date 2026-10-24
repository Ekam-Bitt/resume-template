import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

export function assertSlug(slug: string) {
  if (!SLUG.test(slug)) throw new Error(`Invalid name "${slug}": use lowercase letters, digits and dashes`)
}

/**
 * data/base.json is the owner's real resume and is git-ignored. A fresh clone
 * starts from the John Doe sample, copied into place on first use.
 */
export function ensureBase() {
  if (!fs.existsSync(BASE_FILE) && fs.existsSync(SAMPLE_FILE)) fs.copyFileSync(SAMPLE_FILE, BASE_FILE)
}

/**
 * "base" → data/base.json, "sample" → data/sample.json, "<slug>" → data/variants/<slug>.json,
 * anything with a slash or .json → that file.
 */
export function resolveResume(ref = 'base'): { name: string; file: string } {
  if (ref.includes('/') || ref.endsWith('.json')) {
    const file = path.resolve(ref)
    return { name: path.basename(file, '.json'), file }
  }
  if (ref === 'base') {
    ensureBase()
    return { name: 'base', file: BASE_FILE }
  }
  if (ref === 'sample') return { name: 'sample', file: SAMPLE_FILE }
  assertSlug(ref)
  return { name: ref, file: path.join(VARIANTS_DIR, `${ref}.json`) }
}

export function listResumes(): { name: string; file: string }[] {
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

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}
