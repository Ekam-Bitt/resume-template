// Layout and content checks that tell an agent what to fix: page overflow,
// orphaned last lines, over-long bullets, broken bold markers.
import type { PageInfo, Probe } from './render.ts'
import type { Resume } from './schema.ts'

export type LintIssue = { level: 'error' | 'warn'; path: string; message: string }
export type LintReport = {
  ok: boolean
  pages: number
  maxPages: number
  /** Whole body lines that still fit on the last page. */
  freeLines: number
  issues: LintIssue[]
}

const MAX_BULLET_LINES = 3

function textAt(resume: Resume, pointer: string): string {
  let node: unknown = resume
  for (const key of pointer.split('/').slice(1)) node = (node as Record<string, unknown>)?.[key]
  if (Array.isArray(node)) return node.join(', ')
  return typeof node === 'string' ? node : ''
}

function* strings(node: unknown, path = ''): Generator<[string, string]> {
  if (typeof node === 'string') yield [path, node]
  else if (Array.isArray(node)) {
    for (const [i, x] of node.entries()) yield* strings(x, `${path}/${i}`)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (k !== 'meta' && k !== '$schema') yield* strings(v, `${path}/${k}`)
  }
}

export function lint(resume: Resume, page: PageInfo, probes: Probe[]): LintReport {
  const issues: LintIssue[] = []
  const maxPages = resume.meta?.maxPages ?? 1
  const free = page.pageHeight - page.bottomMargin - page.endY
  const freeLines = page.pages > maxPages ? 0 : Math.max(0, Math.floor(free / page.linePitch))

  if (page.pages > maxPages) {
    const usable = page.pageHeight - page.topMargin - page.bottomMargin
    const over = (page.pages - maxPages - 1) * usable + (page.endY - page.topMargin)
    issues.push({
      level: 'error',
      path: '',
      message: `Overflows to ${page.pages} pages (max ${maxPages}), ~${Math.ceil(over / page.linePitch)} line(s) too long. Shorten, merge or hide bullets until it fits.`,
    })
  }

  for (const p of probes) {
    if (p.widow) {
      const words = textAt(resume, p.id).trim().split(/\s+/).slice(-2).join(' ')
      issues.push({
        level: 'warn',
        path: p.id,
        message: `Last line has only 1-2 words ("…${words}"). Trim a few words to save a line, or add detail to fill it.`,
      })
    }
    if (p.lines > MAX_BULLET_LINES) {
      issues.push({ level: 'warn', path: p.id, message: `Wraps to ${p.lines} lines; keep bullets to ${MAX_BULLET_LINES} or fewer.` })
    }
  }

  for (const [path, s] of strings(resume)) {
    if ((s.match(/\*\*/g)?.length ?? 0) % 2) {
      issues.push({ level: 'error', path, message: 'Unbalanced "**" bold marker.' })
    }
  }

  resume.experience?.forEach((e, i) => {
    if (!e.hidden && !(e.bullets ?? []).some(b => !b.hidden)) {
      issues.push({ level: 'warn', path: `/experience/${i}`, message: `"${e.company}" has no visible bullets.` })
    }
  })

  return { ok: !issues.some(i => i.level === 'error'), pages: page.pages, maxPages, freeLines, issues }
}
