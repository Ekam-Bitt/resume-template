// Stable v-for keys for arrays of plain objects, so reordering doesn't remount rows.
let next = 0
const ids = new WeakMap<object, number>()

export function keyOf(item: object) {
  if (!ids.has(item)) ids.set(item, next++)
  return ids.get(item)!
}
