// High-level operations shared by the CLI and the MCP server.
import fs from 'node:fs'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
import fjp, { type Operation } from 'fast-json-patch'
import { lint, type LintReport } from './lint.ts'
import { assertSlug, pdfPathFor, readJson, resolveResume, writeJson } from './paths.ts'
import { render } from './render.ts'
import { validate, type Resume, type ValidationIssue } from './schema.ts'

export * from './paths.ts'
export * from './schema.ts'
export { lint, render }
export type { LintReport }

export class InvalidResume extends Error {
  issues: ValidationIssue[]
  constructor(issues: ValidationIssue[]) {
    super('Invalid resume:\n' + issues.map(i => `  ${i.path || '/'}: ${i.message}`).join('\n'))
    this.issues = issues
  }
}

export function load(ref?: string): { name: string; file: string; resume: Resume } {
  const { name, file } = resolveResume(ref)
  const v = validate(readJson(file))
  if (!v.ok) throw new InvalidResume(v.issues)
  return { name, file, resume: v.resume }
}

export function check(resume: Resume): LintReport {
  const { page, probes } = render(resume)
  return lint(resume, page, probes)
}

/** Renders to out/<name>.pdf (or `out`) and returns the lint report alongside. */
export function build(ref?: string, out?: string) {
  const { name, resume } = load(ref)
  const { pdf, page, probes } = render(resume)
  const pdfPath = out ?? pdfPathFor(name)
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true })
  fs.writeFileSync(pdfPath, pdf)
  return { name, pdfPath, report: lint(resume, page, probes) }
}

export function createVariant(slug: string, from = 'base', overwrite = false) {
  assertSlug(slug)
  if (slug === 'base' || slug === 'sample') throw new Error(`"${slug}" is reserved; pick another name`)
  const { resume } = load(from)
  const target = resolveResume(slug)
  if (fs.existsSync(target.file) && !overwrite) throw new Error(`Variant "${slug}" already exists`)
  writeJson(target.file, { ...resume, $schema: '../../schema/resume.schema.json' })
  return target
}

/** Applies an RFC 6902 patch; nothing is written unless the result is a valid resume. */
export function patch(ref: string, ops: Operation[]) {
  const { file, resume } = load(ref)
  // RFC 6902 "replace" needs the key to exist; for optional fields such as
  // `hidden` that is a trap, so treat it as "add" when the parent exists.
  const fixed = ops.map(op => {
    if (op.op !== 'replace') return op
    const parent = fjp.getValueByPointer(resume, op.path.replace(/\/[^/]*$/, '') || '')
    const key = op.path.split('/').pop()!
    const isMissing = parent && typeof parent === 'object' && !Array.isArray(parent) && !(key in parent)
    return isMissing ? { ...op, op: 'add' as const } : op
  })
  const errors = fjp.validate(fixed, resume)
  if (errors) {
    const op = errors.operation as Operation
    throw new Error(`Bad patch at operation ${errors.index} (${op.op} ${op.path}): ${errors.message.split('\n')[0]}`)
  }
  const next = fjp.applyPatch(structuredClone(resume), fixed, false, false).newDocument
  const v = validate(next)
  if (!v.ok) throw new InvalidResume(v.issues)
  writeJson(file, v.resume)
  return v.resume
}

export function replace(ref: string, data: unknown) {
  const { file } = resolveResume(ref)
  const v = validate(data)
  if (!v.ok) throw new InvalidResume(v.issues)
  writeJson(file, v.resume)
  return v.resume
}

/** One line per piece of visible text, keyed by JSON Pointer, so diffs read like a review. */
export function flatten(r: Resume): string[] {
  const out: string[] = []
  const tag = (h?: boolean) => (h ? ' [hidden]' : '')
  const b = r.basics
  out.push(`name: ${b.name}`, `contact: ${[b.email, b.phone, ...(b.links ?? []).map(l => `${l.label} <${l.url}>`)].filter(Boolean).join(' | ')}`)
  if (r.meta?.sectionOrder) out.push(`order: ${r.meta.sectionOrder.join(', ')}`)
  r.skills?.forEach((s, i) => out.push(`/skills/${i}${tag(s.hidden)}  ${s.category}: ${s.items.join(', ')}`))
  r.experience?.forEach((e, i) => {
    out.push(`/experience/${i}${tag(e.hidden)}  ${e.company} — ${e.role ?? ''} | ${e.location ?? ''} | ${e.start ?? ''} – ${e.end ?? ''}`)
    e.bullets?.forEach((x, j) => out.push(`/experience/${i}/bullets/${j}${tag(x.hidden)}  ${x.text}`))
  })
  r.education?.forEach((e, i) => {
    out.push(`/education/${i}${tag(e.hidden)}  ${e.institution} — ${e.degree ?? ''} | ${e.start ?? ''} – ${e.end ?? ''}`)
    e.details?.forEach((x, j) => out.push(`/education/${i}/details/${j}${tag(x.hidden)}  ${x.text}`))
  })
  r.projects?.forEach((p, i) => {
    out.push(`/projects/${i}${tag(p.hidden)}  ${p.name} ${p.url ?? ''}`)
    if (p.description) out.push(`/projects/${i}/description  ${p.description}`)
    p.bullets?.forEach((x, j) => out.push(`/projects/${i}/bullets/${j}${tag(x.hidden)}  ${x.text}`))
  })
  r.custom?.forEach((s, i) => {
    out.push(`/custom/${i}${tag(s.hidden)}  [${s.key}] ${s.title}`)
    s.bullets.forEach((x, j) => out.push(`/custom/${i}/bullets/${j}${tag(x.hidden)}  ${x.text}`))
  })
  return out
}

export function diff(a: string, b: string) {
  const left = load(a)
  const right = load(b)
  const text = (r: Resume) => flatten(r).join('\n') + '\n'
  return createTwoFilesPatch(left.name, right.name, text(left.resume), text(right.resume), '', '', { context: 1 })
}
