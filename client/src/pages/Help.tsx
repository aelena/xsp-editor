import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client.ts'

export default function Help() {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ content: string }>('/manual')
      .then((data) => setContent(data.content))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load manual'))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/prompts"
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            &larr; Back to Prompts
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!content && !error && (
          <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading manual...
          </div>
        )}

        {content && (
          <div className="prose prose-gray dark:prose-invert max-w-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-sm">
            <MarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  const html = markdownToHtml(content)
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const output: string[] = []
  let inCodeBlock = false
  let codeLanguage = ''
  let codeLines: string[] = []
  let inTable = false
  let tableRows: string[][] = []
  let inList = false
  let listItems: string[] = []

  function flushList() {
    if (inList && listItems.length > 0) {
      output.push('<ul>')
      for (const item of listItems) {
        output.push(`<li>${inlineFormat(item)}</li>`)
      }
      output.push('</ul>')
      listItems = []
      inList = false
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      output.push('<table>')
      output.push('<thead><tr>')
      for (const cell of tableRows[0]) {
        output.push(`<th>${inlineFormat(cell.trim())}</th>`)
      }
      output.push('</tr></thead>')
      if (tableRows.length > 2) {
        output.push('<tbody>')
        for (let i = 2; i < tableRows.length; i++) {
          output.push('<tr>')
          for (const cell of tableRows[i]) {
            output.push(`<td>${inlineFormat(cell.trim())}</td>`)
          }
          output.push('</tr>')
        }
        output.push('</tbody>')
      }
      output.push('</table>')
      tableRows = []
      inTable = false
    }
  }

  for (const line of lines) {
    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        output.push(`<pre><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        inCodeBlock = false
      } else {
        flushList()
        flushTable()
        codeLanguage = line.slice(3).trim()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Table rows
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList()
      const cells = line.trim().slice(1, -1).split('|')
      if (!inTable) {
        inTable = true
        tableRows = []
      }
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    // List items
    if (line.match(/^- /)) {
      flushTable()
      inList = true
      listItems.push(line.slice(2))
      continue
    } else if (inList) {
      flushList()
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      flushList()
      flushTable()
      const level = headingMatch[1].length
      const text = headingMatch[2]
      output.push(`<h${level}>${inlineFormat(text)}</h${level}>`)
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      flushList()
      flushTable()
      output.push('<hr />')
      continue
    }

    // Empty line
    if (line.trim() === '') {
      flushList()
      flushTable()
      continue
    }

    // Paragraph
    output.push(`<p>${inlineFormat(line)}</p>`)
  }

  flushList()
  flushTable()

  return output.join('\n')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(text: string): string {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}
