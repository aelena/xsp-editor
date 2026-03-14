interface PromptPreviewProps {
  content: string
}

export default function PromptPreview({ content }: PromptPreviewProps) {
  if (!content.trim()) {
    return (
      <div
        data-testid="prompt-preview"
        className="p-4 text-gray-400 dark:text-gray-500 text-sm"
      >
        Start typing to see a preview of your prompt.
      </div>
    )
  }

  // Highlight $variables in the content
  const parts = content.split(/(\$\w+)/g)

  return (
    <pre
      data-testid="prompt-preview"
      className="p-4 text-sm font-mono whitespace-pre-wrap break-words overflow-auto text-gray-900 dark:text-gray-100"
    >
      {parts.map((part, i) =>
        part.startsWith('$') ? (
          <span key={i} className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-0.5 rounded">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </pre>
  )
}
