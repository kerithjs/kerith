import { registerBindingProvider } from '@kerith/core'

registerBindingProvider({
  name: 'failing-binding',
  filePath: import.meta.url,
  kind: 'custom',
  bind: async () => {
    // Intentionally throw a raw error
    throw new Error('This is a raw engine error')
  }
})
