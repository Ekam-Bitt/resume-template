// The one on-disk format for resume files, shared by Node writes, the dev file
// API's ETags and the browser's change detection, so they always agree byte for byte.
export const formatJson = (data: unknown) => JSON.stringify(data, null, 2) + '\n'
