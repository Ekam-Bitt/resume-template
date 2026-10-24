<template>
  <div class="json-editor">
    <p class="hint">
      The same document agents edit. Must match <code>schema/resume.schema.json</code>; invalid JSON is not applied.
    </p>
    <textarea v-model="text" class="input code" spellcheck="false" @input="apply" />
    <p v-if="parseError" class="error">{{ parseError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Resume } from '../../../src/core/schema.ts'
import { clean, setFromJson } from '../store.ts'

const props = defineProps<{ resume: Resume }>()
const text = ref(JSON.stringify(clean(props.resume), null, 2))
const parseError = ref('')

function apply() {
  try {
    const data = JSON.parse(text.value)
    parseError.value = ''
    setFromJson(data)
  } catch (e) {
    parseError.value = (e as Error).message
  }
}
</script>

<style scoped>
.json-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 8px;
}
.code {
  flex: 1;
  min-height: 400px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  resize: none;
}
.hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.error {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
