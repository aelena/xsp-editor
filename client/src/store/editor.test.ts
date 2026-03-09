import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './editor.ts'

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  it('has correct initial state', () => {
    const state = useEditorStore.getState()
    expect(state.content).toBe('')
    expect(state.name).toBe('')
    expect(state.description).toBe('')
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.verification).toBeNull()
    expect(state.isVerifying).toBe(false)
  })

  it('sets content and marks dirty', () => {
    useEditorStore.getState().setContent('<task>Test</task>')
    const state = useEditorStore.getState()
    expect(state.content).toBe('<task>Test</task>')
    expect(state.isDirty).toBe(true)
  })

  it('sets name and marks dirty', () => {
    useEditorStore.getState().setName('my-prompt')
    const state = useEditorStore.getState()
    expect(state.name).toBe('my-prompt')
    expect(state.isDirty).toBe(true)
  })

  it('sets description and marks dirty', () => {
    useEditorStore.getState().setDescription('A test prompt')
    const state = useEditorStore.getState()
    expect(state.description).toBe('A test prompt')
    expect(state.isDirty).toBe(true)
  })

  it('resets dirty flag', () => {
    useEditorStore.getState().setContent('something')
    expect(useEditorStore.getState().isDirty).toBe(true)
    useEditorStore.getState().resetDirty()
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('sets verification result', () => {
    const result = {
      status: 'passed' as const,
      score: 100,
      checks: [],
      anti_pattern_scan: [],
    }
    useEditorStore.getState().setVerification(result)
    expect(useEditorStore.getState().verification).toEqual(result)
  })

  it('resets all state', () => {
    useEditorStore.getState().setContent('content')
    useEditorStore.getState().setName('name')
    useEditorStore.getState().setDescription('desc')
    useEditorStore.getState().setIsSaving(true)
    useEditorStore.getState().reset()

    const state = useEditorStore.getState()
    expect(state.content).toBe('')
    expect(state.name).toBe('')
    expect(state.description).toBe('')
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
  })
})
