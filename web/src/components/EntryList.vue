<template>
  <div class="entries">
    <VueDraggable v-model="model" handle=".entry-handle" :animation="150" class="entry-rows">
      <div v-for="(item, i) in model" :key="keyOf(item)" class="entry" :class="{ hidden: item.hidden }">
        <div class="entry-head">
          <span class="entry-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
          <button class="entry-toggle" :aria-expanded="isOpen(item, i)" @click="toggle(item, i)">
            <span class="entry-title">{{ title(item) || 'Untitled' }}</span>
            <span class="entry-sub">{{ subtitle?.(item) }}</span>
          </button>
          <button class="icon-btn" :title="item.hidden ? 'Show on resume' : 'Hide from resume (keeps it in the file)'"
            @click="item.hidden = !item.hidden">{{ item.hidden ? '◌' : '●' }}</button>
          <button class="icon-btn" title="Duplicate" @click="duplicate(i)">⧉</button>
          <button class="icon-btn" title="Remove" @click="remove(i)">✕</button>
        </div>
        <div v-if="isOpen(item, i)" class="entry-body">
          <slot :item="item" :index="i" />
        </div>
      </div>
    </VueDraggable>
    <button class="text-btn" @click="add">+ Add {{ noun }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { keyOf } from '../keys.ts'
import { state } from '../store.ts'

// Entries differ per section; the slot gets the entry as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = { hidden?: boolean; [key: string]: any }

const model = defineModel<T[]>({ required: true })
const props = defineProps<{
  /** JSON Pointer of the array, e.g. "/experience", for revealing an entry from lint. */
  path: string
  noun: string
  make: () => T
  title: (item: T) => string
  subtitle?: (item: T) => string
  /** How Duplicate copies an entry; defaults to a deep copy. */
  copy?: (item: T) => T
}>()

const open = reactive(new Set<number>())

// The entry a lint row points into (e.g. "/experience/1/…") is open too.
const focusedIndex = computed(() => {
  const m = state.focus.slice(props.path.length).match(/^\/(\d+)(\/|$)/)
  return state.focus.startsWith(props.path) && m ? Number(m[1]) : -1
})
const isOpen = (item: T, i: number) => open.has(keyOf(item)) || focusedIndex.value === i

function toggle(item: T, i: number) {
  const k = keyOf(item)
  if (isOpen(item, i)) {
    open.delete(k)
    if (focusedIndex.value === i) state.focus = ''
  } else open.add(k)
}

function add() {
  const item = props.make()
  model.value.push(item)
  open.add(keyOf(model.value[model.value.length - 1]))
}
function duplicate(i: number) {
  const item = JSON.parse(JSON.stringify(model.value[i]))
  model.value.splice(i + 1, 0, props.copy ? props.copy(item) : item)
}
function remove(i: number) {
  if (confirm(`Remove this ${props.noun}? Hiding keeps it in the file instead.`)) model.value.splice(i, 1)
}
</script>

<style scoped>
.entry-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.entry {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}
.entry.hidden {
  opacity: 0.55;
}
.entry-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
}
.entry-handle {
  cursor: grab;
  color: var(--muted);
  user-select: none;
}
.entry-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: none;
  border: 0;
  padding: 2px 4px;
  cursor: pointer;
  color: inherit;
  text-align: left;
}
.entry-title {
  font-weight: 600;
}
.entry-sub {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.entry-body {
  padding: 4px 12px 12px;
  border-top: 1px solid var(--border);
}
</style>
