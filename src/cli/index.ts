// `npm run resume -- <command>`. Every command accepts --json for machine-readable output.
import fs from 'node:fs'
import path from 'node:path'
import {
  build, check, createVariant, diff, InvalidResume, jsonSchema, listResumes, load, readJson,
  resolveResume, ROOT, SCHEMA_FILE, validate, writeJson, type LintReport,
} from '../core/index.ts'

const HELP = `Usage: npm run resume -- <command> [args] [--json]

  list                         Resumes in data/ (base + variants)
  validate [ref]               Check a resume against the schema
  lint [ref]                   Render and report overflow / orphan lines / long bullets
  build [ref] [-o out.pdf]     Write out/<ref>.pdf and print the lint report
  new-variant <slug> [--from ref] [--force]
                               Copy a resume to data/variants/<slug>.json
  diff <a> <b>                 Text diff of two resumes, keyed by JSON Pointer
  schema                       Regenerate schema/resume.schema.json

ref: "base" (default), a variant slug, or a path to a .json file.`

const argv = process.argv.slice(2)
const flag = (name: string) => {
  const i = argv.indexOf(name)
  if (i < 0) return false
  argv.splice(i, 1)
  return true
}
const option = (name: string) => {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const [, value] = argv.splice(i, 2)
  return value
}

const asJson = flag('--json')
const print = (human: string, data: unknown) => console.log(asJson ? JSON.stringify(data, null, 2) : human)
const rel = (f: string) => path.relative(process.cwd(), f) || f

function formatReport(r: LintReport) {
  const head = `${r.ok ? 'OK' : 'FAIL'}: ${r.pages}/${r.maxPages} page(s), room for ~${r.freeLines} more line(s)`
  return [head, ...r.issues.map(i => `  ${i.level === 'error' ? 'error' : 'warn '} ${i.path || '/'}  ${i.message}`)].join('\n')
}

function run(): number {
  const [cmd, ...args] = argv
  switch (cmd) {
    case 'list': {
      const all = listResumes().map(r => ({ name: r.name, file: rel(r.file) }))
      print(all.map(r => `${r.name.padEnd(24)} ${r.file}`).join('\n'), all)
      return 0
    }
    case 'validate': {
      const { file } = resolveResume(args[0])
      const v = validate(readJson(file))
      if (v.ok) print(`OK: ${rel(file)}`, { ok: true })
      else print(new InvalidResume(v.issues).message, { ok: false, issues: v.issues })
      return v.ok ? 0 : 1
    }
    case 'lint': {
      const report = check(load(args[0]).resume)
      print(formatReport(report), report)
      return report.ok ? 0 : 1
    }
    case 'build': {
      const out = option('-o')
      const { pdfPath, report } = build(args[0], out && path.resolve(out))
      print(`Wrote ${rel(pdfPath)}\n${formatReport(report)}`, { pdf: pdfPath, ...report })
      return report.ok ? 0 : 1
    }
    case 'new-variant': {
      const from = option('--from') ?? 'base'
      const force = flag('--force')
      if (!args[0]) throw new Error('new-variant needs a slug, e.g. new-variant acme-backend')
      const { file } = createVariant(args[0], from, force)
      print(`Created ${rel(file)} from ${from}`, { file })
      return 0
    }
    case 'diff': {
      if (args.length < 2) throw new Error('diff needs two refs, e.g. diff base acme-backend')
      const d = diff(args[0], args[1])
      print(d, { diff: d })
      return 0
    }
    case 'schema': {
      writeJson(SCHEMA_FILE, jsonSchema())
      print(`Wrote ${rel(SCHEMA_FILE)}`, { file: SCHEMA_FILE })
      return 0
    }
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP)
      return 0
    default:
      console.error(`Unknown command "${cmd}"\n\n${HELP}`)
      return 2
  }
}

try {
  process.chdir(process.env.INIT_CWD ?? process.cwd())
  if (!fs.existsSync(path.join(ROOT, 'template'))) throw new Error('template/ not found')
  process.exitCode = run()
} catch (e) {
  const err = e as Error
  if (asJson) console.log(JSON.stringify({ ok: false, error: err.message, issues: (e as InvalidResume).issues }))
  else console.error(err.message)
  process.exitCode = 1
}
