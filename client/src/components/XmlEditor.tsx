import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, placeholder, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { xml } from '@codemirror/lang-xml'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
} from '@codemirror/autocomplete'
import {
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
} from '@codemirror/language'
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { highlightActiveLine } from '@codemirror/view'
import { linter, type Diagnostic } from '@codemirror/lint'
import type { Tag } from '../api/tags.ts'
import type { VerificationResult } from '../api/verify.ts'
import { buildTagCompletion, findCheckPosition } from './xml-editor-utils.ts'

interface XmlEditorProps {
  value: string
  onChange: (value: string) => void
  tags: Tag[]
  verification?: VerificationResult | null
}

// Decoration for $variable highlighting in the editor
const variableMark = Decoration.mark({ class: 'cm-xsp-variable' })

const variableHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView) {
      const decorations: { from: number; to: number }[] = []
      const doc = view.state.doc.toString()
      const regex = /\$[a-zA-Z_]\w*/g
      let match
      while ((match = regex.exec(doc)) !== null) {
        decorations.push({ from: match.index, to: match.index + match[0].length })
      }
      return Decoration.set(
        decorations.map((d) => variableMark.range(d.from, d.to)),
      )
    }
  },
  { decorations: (v) => v.decorations },
)

// Build lint diagnostics from verification results
function buildLintSource(verificationRef: React.RefObject<VerificationResult | null | undefined>) {
  return linter((view) => {
    const result = verificationRef.current
    if (!result) return []

    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc.toString()

    for (const check of result.checks) {
      if (check.status === 'passed') continue

      const severity = check.status === 'failed' ? 'error' : 'warning'
      const position = findCheckPosition(doc, check.rule, check.message)

      diagnostics.push({
        from: position.from,
        to: position.to,
        severity,
        message: `${check.rule}: ${check.message}`,
      })
    }

    return diagnostics
  }, { delay: 0 })
}

export default function XmlEditor({ value, onChange, tags, verification }: XmlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const tagsRef = useRef(tags)
  tagsRef.current = tags

  const verificationRef = useRef<VerificationResult | null | undefined>(verification)
  verificationRef.current = verification

  const tagCompletion = useCallback(
    (context: CompletionContext) => buildTagCompletion(tagsRef.current)(context),
    [],
  )

  useEffect(() => {
    if (!editorRef.current) return

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      foldGutter(),
      bracketMatching(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      xml(),
      autocompletion({
        override: [tagCompletion],
      }),
      variableHighlighter,
      buildLintSource(verificationRef),
      placeholder('Enter your XSP prompt XML here...'),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        ...foldKeymap,
        {
          key: 'Ctrl-Shift-c',
          run: (view) => {
            const { from, to } = view.state.selection.main
            const selected = view.state.sliceDoc(from, to)
            if (selected) {
              view.dispatch({
                changes: {
                  from,
                  to,
                  insert: `<constraint>${selected}</constraint>`,
                },
              })
              return true
            }
            return false
          },
        },
        {
          key: 'Ctrl-Shift-d',
          run: (view) => {
            const { from, to } = view.state.selection.main
            const selected = view.state.sliceDoc(from, to)
            view.dispatch({
              changes: {
                from,
                to,
                insert: `<![CDATA[${selected}]]>`,
              },
            })
            return true
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: 'monospace', fontSize: '14px' },
        '.cm-xsp-variable': {
          backgroundColor: '#dbeafe',
          color: '#1e40af',
          borderRadius: '2px',
          padding: '0 1px',
        },
      }),
      EditorView.theme({
        '&': { backgroundColor: '#111827', color: '#e5e7eb' },
        '.cm-gutters': { backgroundColor: '#1f2937', color: '#9ca3af', borderRight: '1px solid #374151' },
        '.cm-activeLineGutter': { backgroundColor: '#374151' },
        '.cm-activeLine': { backgroundColor: '#1f293766' },
        '.cm-selectionBackground': { backgroundColor: '#2563eb44 !important' },
        '.cm-cursor': { borderLeftColor: '#60a5fa' },
        '.cm-xsp-variable': {
          backgroundColor: '#1e3a5f',
          color: '#93c5fd',
        },
      }, { dark: true }),
    ]

    const state = EditorState.create({
      doc: value,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only create editor once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g., loading from API)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      })
    }
  }, [value])

  // Force lint refresh when verification results change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({})
  }, [verification])

  return (
    <div
      ref={editorRef}
      data-testid="xml-editor"
      className="h-full border border-gray-300 dark:border-gray-600 rounded overflow-hidden"
    />
  )
}
