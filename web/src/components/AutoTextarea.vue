<template>
  <textarea ref="el" v-model="model" rows="1" class="input auto" @input="resize" />
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const model = defineModel<string>({ default: '' })
const el = ref<HTMLTextAreaElement | null>(null)

function resize() {
  const t = el.value
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${t.scrollHeight + 2}px`
}
onMounted(resize)
watch(model, () => nextTick(resize))
</script>

<style scoped>
.auto {
  resize: none;
  overflow: hidden;
  line-height: 1.4;
  flex: 1;
}
</style>
