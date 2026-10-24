// High-level operations shared by the CLI and the MCP server.
import fs from 'node:fs'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
import fjp, { type Operation } from 'fast-json-patch'
import { lint, type LintReport } from './lint.ts'
import { pdfPathFor, readJson, resolveResume, writeJson } from './paths.ts'
import { render } from './render.ts'
import { validate, type Bullet, type Resume, type ValidationIssue } from './schema.ts'

export * from './json.ts'
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

/** Validates or throws InvalidResume. */
export function parse(data: unknown): Resume {
  const v = validate(data)
  if (!v.ok) throw new InvalidResume(v.issues)
  return v.resume
}

export function load(ref?: string) {
  const r = resolveResume(ref)
  return { ...r, resume: parse(readJson(r.file)) }
}

/** Validates and writes a resume; returns it with the exact text now on disk. */
export function save(file: string, data: unknown) {
  const resume = parse(data)
  return { resume, text: writeJson(file, resume) }
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
  const target = resolveResume(slug)
  if (target.kind !== 'variant') throw new Error(`"${slug}" is reserved; pick another name`)
  const { resume } = load(from)
  if (fs.existsSync(target.file) && !overwrite) throw new Error(`Variant "${slug}" already exists`)
  writeJson(target.file, { ...resume, $schema: '../../schema/resume.schema.json' })
  return target
}

/** Applies an RFC 6902 patch; nothing is written unless the result is a valid resume. */
export function patch(ref: string, ops: Operation[]) {
  const { file, resume } = load(ref)
  // Operations apply one at a time, each against the result of the previous one.
  let doc: unknown = structuredClone(resume)
  ops.forEach((op, i) => {
    let fixed = op
    // RFC 6902 "replace" needs the key to exist; for optional fields such as
    // `hidden` that is a trap, so treat it as "add" when the parent object exists.
    if (op.op === 'replace') {
      const key = fjp.unescapePathComponent(op.path.split('/').pop()!)
      let parent: unknown
      try {
        parent = fjp.getValueByPointer(doc, op.path.replace(/\/[^/]*$/, ''))
      } catch {}
      if (parent && typeof parent === 'object' && !Array.isArray(parent) && !(key in parent)) fixed = { ...op, op: 'add' }
    }
    const error = fjp.validate([fixed], doc)
    if (error) throw new Error(`Bad patch at operation ${i} (${op.op} ${op.path}): ${error.message.split('\n')[0]}`)
    doc = fjp.applyOperation(doc, fixed, false, true, false).newDocument
  })
  return save(file, doc).resume
}

export function replace(ref: string, data: unknown) {
  return save(resolveResume(ref).file, data).resume
}

/** One line per piece of visible text, keyed by JSON Pointer, so diffs read like a review. */
export function flatten(r: Resume): string[] {
  const out: string[] = []
  const tag = (h?: boolean) => (h ? ' [hidden]' : '')
  const list = (prefix: string, xs?: Bullet[]) => xs?.forEach((x, j) => out.push(`${prefix}/${j}${tag(x.hidden)}  ${x.text}`))
  const b = r.basics
  out.push(`name: ${b.name}`, `contact: ${[b.email, b.phone, ...(b.links ?? []).map(l => `${l.label} <${l.url}>`)].filter(Boolean).join(' | ')}`)
  if (r.meta?.sectionOrder) out.push(`order: ${r.meta.sectionOrder.join(', ')}`)
  r.skills?.forEach((s, i) => out.push(`/skills/${i}${tag(s.hidden)}  ${s.category}: ${s.items.join(', ')}`))
  r.experience?.forEach((e, i) => {
    out.push(`/experience/${i}${tag(e.hidden)}  ${e.company} — ${e.role ?? ''} | ${e.location ?? ''} | ${e.start ?? ''} – ${e.end ?? ''}`)
    list(`/experience/${i}/bullets`, e.bullets)
  })
  r.education?.forEach((e, i) => {
    out.push(`/education/${i}${tag(e.hidden)}  ${e.institution} — ${e.degree ?? ''} | ${e.start ?? ''} – ${e.end ?? ''}`)
    list(`/education/${i}/details`, e.details)
  })
  r.projects?.forEach((p, i) => {
    out.push(`/projects/${i}${tag(p.hidden)}  ${p.name} ${p.url ?? ''}`)
    if (p.description) out.push(`/projects/${i}/description  ${p.description}`)
    list(`/projects/${i}/bullets`, p.bullets)
  })
  r.custom?.forEach((s, i) => {
    out.push(`/custom/${i}${tag(s.hidden)}  [${s.key}] ${s.title}`)
    list(`/custom/${i}/bullets`, s.bullets)
  })
  return out
}

export function diff(a: string, b: string) {
  const left = load(a)
  const right = load(b)
  const text = (r: Resume) => flatten(r).join('\n') + '\n'
  return createTwoFilesPatch(left.name, right.name, text(left.resume), text(right.resume), '', '', { context: 1 })
}
