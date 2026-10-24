// `npm run resume -- <command>`. Every command accepts --json for machine-readable output.
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  build, check, createVariant, diff, InvalidResume, jsonSchema, listResumes, load, ROOT, SCHEMA_FILE, writeJson,
  type LintReport,
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

// Options may appear anywhere; unknown ones are an error rather than a positional.
const { values: opts, positionals: argv } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        force: { type: 'boolean' },
        out: { type: 'string', short: 'o' },
        from: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${HELP}`)
    process.exit(2)
  }
})()
const asJson = opts.json ?? false
const print = (human: string, data: unknown) => console.log(asJson ? JSON.stringify(data, null, 2) : human)
const rel = (f: string) => path.relative(process.cwd(), f) || f

function formatReport(r: LintReport) {
  const head = `${r.ok ? 'OK' : 'FAIL'}: ${r.pages}/${r.maxPages} page(s), room for ~${r.freeLines} more line(s)`
  return [head, ...r.issues.map(i => `  ${i.level === 'error' ? 'error' : 'warn '} ${i.path || '/'}  ${i.message}`)].join('\n')
}

function run(): number {
  const [cmd, ...args] = opts.help ? ['help'] : argv
  switch (cmd) {
    case 'list': {
      const all = listResumes().map(r => ({ name: r.name, file: rel(r.file) }))
      print(all.map(r => `${r.name.padEnd(24)} ${r.file}`).join('\n'), all)
      return 0
    }
    case 'validate': {
      const { file } = load(args[0])
      print(`OK: ${rel(file)}`, { ok: true })
      return 0
    }
    case 'lint': {
      const report = check(load(args[0]).resume)
      print(formatReport(report), report)
      return report.ok ? 0 : 1
    }
    case 'build': {
      const { pdfPath, report } = build(args[0], opts.out && path.resolve(opts.out))
      print(`Wrote ${rel(pdfPath)}\n${formatReport(report)}`, { pdf: pdfPath, ...report })
      return report.ok ? 0 : 1
    }
    case 'new-variant': {
      const from = opts.from ?? 'base'
      if (!args[0]) throw new Error('new-variant needs a slug, e.g. new-variant acme-backend')
      const { file } = createVariant(args[0], from, opts.force)
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
