import type { TypeEditorApi } from './index'

declare global {
  interface Window {
    api: TypeEditorApi
  }
}

export {}
