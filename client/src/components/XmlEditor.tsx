import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { xml } from '@codemirror/lang-xml'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
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
import type { Tag } from '../api/tags.ts'

interface XmlEditorProps {
  value: string
  onChange: (value: string) => void
  tags: Tag[]
}

function buildTagCompletion(tags: Tag[]) {
  return function tagCompletion(
    context: CompletionContext,
  ): CompletionResult | null {
    // Match after '<' for opening tags or '</' for closing tags
    const openTag = context.matchBefore(/<\/?[\w_-]*/)
    if (!openTag) return null

    const text = openTag.text
    const isClosing = text.startsWith('</')

    const options = tags.map((tag) => ({
      label: tag.name,
      type: 'keyword' as const,
      info: tag.purpose,
      apply: isClosing
        ? `${tag.name}>`
        : `${tag.name}>`,
    }))

    return {
      from: openTag.from + (isClosing ? 2 : 1),
      options,
      validFor: /^[\w_-]*$/,
    }
  }
}

export default function XmlEditor({ value, onChange, tags }: XmlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const tagsRef = useRef(tags)
  tagsRef.current = tags

  const tagCompletion = useCallback(
    (context: CompletionContext) => buildTagCompletion(tagsRef.current)(context),
    [],
  )

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
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
        }),
      ],
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

  return (
    <div
      ref={editorRef}
      data-testid="xml-editor"
      className="h-full border border-gray-300 rounded overflow-hidden"
    />
  )
}
