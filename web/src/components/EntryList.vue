<template>
  <div class="entries">
    <VueDraggable v-model="model" handle=".entry-handle" :animation="150" class="entry-rows">
      <div v-for="(item, i) in model" :key="keyOf(item)" class="entry" :class="{ hidden: item.hidden }">
        <div class="entry-head">
          <span class="entry-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
          <button class="entry-toggle" :aria-expanded="open.has(keyOf(item))" @click="toggle(item)">
            <span class="entry-title">{{ title(item) || 'Untitled' }}</span>
            <span class="entry-sub">{{ subtitle?.(item) }}</span>
          </button>
          <button class="icon-btn" :title="item.hidden ? 'Show on resume' : 'Hide from resume (keeps it in the file)'"
            @click="item.hidden = !item.hidden">{{ item.hidden ? '◌' : '●' }}</button>
          <button class="icon-btn" title="Duplicate" @click="duplicate(i)">⧉</button>
          <button class="icon-btn" title="Remove" @click="remove(i)">✕</button>
        </div>
        <div v-if="open.has(keyOf(item))" class="entry-body">
          <slot :item="item" :index="i" />
        </div>
      </div>
    </VueDraggable>
    <button class="text-btn" @click="add">+ Add {{ noun }}</button>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { keyOf } from '../keys.ts'

// Entries differ per section; the slot gets the entry as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = { hidden?: boolean; [key: string]: any }

const model = defineModel<T[]>({ required: true })
const props = defineProps<{
  noun: string
  make: () => T
  title: (item: T) => string
  subtitle?: (item: T) => string
}>()

const open = reactive(new Set<number>())
const toggle = (item: T) => {
  const k = keyOf(item)
  if (open.has(k)) open.delete(k)
  else open.add(k)
}

function add() {
  const item = props.make()
  model.value.push(item)
  open.add(keyOf(model.value[model.value.length - 1]))
}
function duplicate(i: number) {
  model.value.splice(i + 1, 0, JSON.parse(JSON.stringify(model.value[i])))
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
