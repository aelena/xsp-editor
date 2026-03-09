import { create } from 'zustand'
import type { VerificationResult } from '../api/verify.ts'

interface EditorState {
  content: string
  name: string
  description: string
  isDirty: boolean
  isSaving: boolean
  verification: VerificationResult | null
  isVerifying: boolean

  setContent: (content: string) => void
  setName: (name: string) => void
  setDescription: (description: string) => void
  setVerification: (result: VerificationResult | null) => void
  setIsVerifying: (isVerifying: boolean) => void
  setIsSaving: (isSaving: boolean) => void
  resetDirty: () => void
  reset: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  content: '',
  name: '',
  description: '',
  isDirty: false,
  isSaving: false,
  verification: null,
  isVerifying: false,

  setContent: (content) => set({ content, isDirty: true }),
  setName: (name) => set({ name, isDirty: true }),
  setDescription: (description) => set({ description, isDirty: true }),
  setVerification: (verification) => set({ verification }),
  setIsVerifying: (isVerifying) => set({ isVerifying }),
  setIsSaving: (isSaving) => set({ isSaving }),
  resetDirty: () => set({ isDirty: false }),
  reset: () =>
    set({
      content: '',
      name: '',
      description: '',
      isDirty: false,
      isSaving: false,
      verification: null,
      isVerifying: false,
    }),
}))
