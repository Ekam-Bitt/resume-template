// The resume data model. This is the contract between the template, the web
// editor and agents; `npm run resume -- schema` regenerates the JSON Schema.
import { z } from 'zod'

const text = z.string().describe('Plain text. `**bold**` is the only markup.')
const hidden = z.boolean().optional().describe('Keep the item in the file but leave it out of the PDF.')

export const Bullet = z.strictObject({ text: text.min(1), hidden })

export const Link = z.strictObject({
  label: z.string().min(1).describe('Text shown in the contact line, e.g. "Github".'),
  url: z.url(),
  hidden,
})

export const Basics = z.strictObject({
  name: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().optional(),
  links: z.array(Link).optional(),
})

export const SkillGroup = z.strictObject({
  category: z.string().min(1).describe('Bold label before the colon, e.g. "AI / LLM".'),
  items: z.array(z.string().min(1)).min(1),
  hidden,
})

const dates = {
  start: z.string().optional().describe('As displayed, e.g. "June 2025".'),
  end: z.string().optional().describe('As displayed, e.g. "Present".'),
}

export const Experience = z.strictObject({
  company: z.string().min(1),
  role: z.string().optional(),
  location: z.string().optional(),
  ...dates,
  bullets: z.array(Bullet).optional(),
  hidden,
})

export const Education = z.strictObject({
  institution: z.string().min(1),
  degree: z.string().optional(),
  location: z.string().optional(),
  ...dates,
  details: z.array(Bullet).optional(),
  hidden,
})

export const Project = z.strictObject({
  name: z.string().min(1),
  url: z.url().optional(),
  urlLabel: z.string().optional().describe('Text shown instead of the raw URL.'),
  ...dates,
  description: text.optional(),
  bullets: z.array(Bullet).optional(),
  hidden,
})

export const CustomSection = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/).describe('Referenced from meta.sectionOrder.'),
  title: z.string().min(1),
  bullets: z.array(Bullet),
  hidden,
})

export const BUILTIN_SECTIONS = ['skills', 'experience', 'education', 'projects'] as const

export const SPACING_KEYS = [
  'leading', 'paragraph', 'bullet', 'name-contact', 'section-before', 'title-rule',
  'rule-content', 'entry-title-sub', 'entry-sub-bullets', 'entry-gap', 'project-desc',
] as const

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const Meta = z.strictObject({
  paper: z.enum(['a4', 'us-letter']).optional(),
  maxPages: z.number().int().min(1).optional().describe('Lint fails above this. Default 1.'),
  fontSize: z.number().min(7).max(14).optional().describe('Body size in pt. Default 10.'),
  fonts: z.array(z.string()).optional().describe('Font fallback list. Default ["Carlito", "Calibri"].'),
  colors: z.strictObject({
    name: hex, contact: hex, heading: hex, entry: hex, text: hex, rule: hex,
  }).partial().optional(),
  margin: z.strictObject({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() })
    .partial().optional().describe('In pt.'),
  spacing: z.partialRecord(z.enum(SPACING_KEYS), z.number()).optional()
    .describe('Vertical gaps in pt; see template/resume.typ for defaults.'),
  sectionOrder: z.array(z.string()).optional(),
  sectionTitles: z.partialRecord(z.enum(BUILTIN_SECTIONS), z.string()).optional(),
})

export const Resume = z.strictObject({
  $schema: z.string().optional(),
  meta: Meta.optional(),
  basics: Basics,
  skills: z.array(SkillGroup).optional(),
  experience: z.array(Experience).optional(),
  education: z.array(Education).optional(),
  projects: z.array(Project).optional(),
  custom: z.array(CustomSection).optional(),
}).superRefine((r, ctx) => {
  const known = new Set<string>([...BUILTIN_SECTIONS, ...(r.custom ?? []).map(s => s.key)])
  r.meta?.sectionOrder?.forEach((key, i) => {
    if (!known.has(key)) {
      ctx.addIssue({ code: 'custom', path: ['meta', 'sectionOrder', i], message: `Unknown section "${key}"` })
    }
  })
})

export type Resume = z.infer<typeof Resume>
export type Bullet = z.infer<typeof Bullet>

export type ValidationIssue = { path: string; message: string }

/** Formats a path as a JSON Pointer, the same form `patch_resume` takes. */
export const pointer = (path: PropertyKey[]) => '/' + path.map(String).join('/')

export function validate(data: unknown): { ok: true; resume: Resume } | { ok: false; issues: ValidationIssue[] } {
  const r = Resume.safeParse(data)
  if (r.success) return { ok: true, resume: r.data }
  return { ok: false, issues: r.error.issues.map(i => ({ path: pointer(i.path), message: i.message })) }
}

export function jsonSchema() {
  return z.toJSONSchema(Resume, { target: 'draft-2020-12', io: 'input' })
}
