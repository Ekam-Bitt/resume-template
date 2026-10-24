// Editor state. In dev (`npm run dev`) resumes live in data/*.json through the
// Vite file API, shared with agents. In a static deploy they live in
// localStorage, seeded from the bundled John Doe sample (data/sample.json).
import { reactive, ref, watch } from 'vue'
import bundledSample from '../../data/sample.json'
import { validate, type Resume, type ValidationIssue } from '../../src/core/schema.ts'

export const hasFileApi = import.meta.env.DEV

type Status = 'loading' | 'saved' | 'saving' | 'unsaved' | 'invalid' | 'error'

export const state = reactive({
  names: [] as string[],
  current: 'base',
  status: 'loading' as Status,
  issues: [] as ValidationIssue[],
  error: '',
  /** Bumped when the resume is replaced from outside (disk, import), so forms can reset. */
  revision: 0,
})
export const resume = ref<Resume | null>(null)

/** Drops what the form leaves behind ("", [], {}, hidden: false), so the data stays tidy. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v)
      const empty = c === '' || c === undefined || (Array.isArray(c) && !c.length)
        || (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)
      if (empty || (k === 'hidden' && c === false)) continue
      out[k] = c
    }
    return out as T
  }
  return value
}

const storageKey = (name: string) => `resume:${name}`
const serialize = (r: unknown) => JSON.stringify(clean(r), null, 2) + '\n'
let lastSynced = ''

function setResume(data: Resume) {
  lastSynced = serialize(data)
  resume.value = structuredClone(data)
  state.revision++
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  const body = await res.json()
  if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { body })
  return body
}

export async function load(name = state.current) {
  state.status = 'loading'
  state.current = name
  try {
    if (hasFileApi) {
      state.names = await api<string[]>('resumes')
      setResume(await api<Resume>(`resume/${encodeURIComponent(name)}`))
    } else {
      state.names = ['base']
      let stored: Resume | null = null
      try {
        stored = JSON.parse(localStorage.getItem(storageKey(name)) ?? 'null')
      } catch {}
      setResume(stored ?? (bundledSample as Resume))
    }
    state.status = 'saved'
  } catch (e) {
    state.status = 'error'
    state.error = (e as Error).message
  }
}

async function save() {
  if (!resume.value) return
  const data = clean(resume.value)
  const v = validate(data)
  state.issues = v.ok ? [] : v.issues
  if (!v.ok) {
    state.status = 'invalid'
    return
  }
  const text = serialize(data)
  if (text === lastSynced) {
    state.status = 'saved'
    return
  }
  state.status = 'saving'
  try {
    if (hasFileApi) await api(`resume/${encodeURIComponent(state.current)}`, { method: 'PUT', body: text })
    else localStorage.setItem(storageKey(state.current), text)
    lastSynced = text
    state.status = 'saved'
  } catch (e) {
    state.status = 'error'
    state.error = (e as Error).message
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(resume, () => {
  if (state.status === 'loading') return
  state.status = 'unsaved'
  clearTimeout(timer)
  timer = setTimeout(save, 600)
}, { deep: true })

/** Applies JSON typed in the JSON tab, without remounting the editor that produced it. */
export function setFromJson(data: Resume) {
  resume.value = data
}

/** Replaces the current resume (import, reset) and saves it. */
export function replaceResume(data: Resume) {
  resume.value = structuredClone(data)
  state.revision++
}

export function resetToBundled() {
  try {
    localStorage.removeItem(storageKey(state.current))
  } catch {}
  replaceResume(bundledSample as Resume)
}

export async function createVariant(slug: string) {
  await api(`resume/${encodeURIComponent(slug)}`, { method: 'POST', body: JSON.stringify({ from: state.current }) })
  await load(slug)
}

// Changes written to disk by an agent or the CLI show up in the editor.
if (hasFileApi) {
  const events = new EventSource('/api/events')
  events.onmessage = async e => {
    const { name } = JSON.parse(e.data)
    if (!state.names.includes(name)) state.names = await api<string[]>('resumes')
    if (name !== state.current || state.status === 'unsaved' || state.status === 'saving') return
    const fresh = await api<Resume>(`resume/${encodeURIComponent(name)}`)
    if (serialize(fresh) !== lastSynced) setResume(fresh)
  }
}
