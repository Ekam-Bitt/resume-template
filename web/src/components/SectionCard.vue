<template>
  <section class="card">
    <button class="card-head" :aria-expanded="isOpen" @click="toggle">
      <span class="card-title">{{ title }}</span>
      <span v-if="count !== undefined" class="card-count">{{ count }}</span>
      <span class="spacer" />
      <span class="caret">{{ isOpen ? '▴' : '▾' }}</span>
    </button>
    <div v-if="isOpen" class="card-body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { state } from '../store.ts'

const props = defineProps<{ title: string; count?: number; startOpen?: boolean; section?: string }>()
const open = ref(props.startOpen ?? false)

// Also open while a lint row points inside this section (e.g. "/experience/0/bullets/2/text").
const focused = computed(() => !!props.section && (state.focus + '/').startsWith(props.section + '/'))
const isOpen = computed(() => open.value || focused.value)

function toggle() {
  if (isOpen.value && focused.value) state.focus = ''
  open.value = !isOpen.value
}
</script>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.card-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.card-title {
  font-weight: 600;
}
.card-count {
  font-size: 12px;
  color: var(--muted);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 0 8px;
}
.spacer {
  flex: 1;
}
.caret {
  color: var(--muted);
}
.card-body {
  padding: 0 14px 14px;
}
</style>
