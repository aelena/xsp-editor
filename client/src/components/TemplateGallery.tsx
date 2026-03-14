import { useTemplates } from '../api/files.ts'

interface TemplateGalleryProps {
  onSelectTemplate: (name: string, content: string) => void
}

export default function TemplateGallery({
  onSelectTemplate,
}: TemplateGalleryProps) {
  const { data, isLoading } = useTemplates()
  const templates = data?.templates ?? []

  if (isLoading) {
    return (
      <div className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500">
        Loading templates...
      </div>
    )
  }

  return (
    <div className="px-2" data-testid="template-gallery">
      <h4 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-1.5">
        Templates
      </h4>
      <div className="space-y-1">
        {templates.map((t) => (
          <button
            key={t.name}
            onClick={() => onSelectTemplate(t.name, t.content)}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs group"
          >
            <div className="flex items-center gap-1">
              <span className="font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-700 dark:group-hover:text-blue-300 capitalize">
                {t.name.replace(/-/g, ' ')}
              </span>
              {t.is_builtin && (
                <span className="text-[9px] text-gray-400 dark:text-gray-500">
                  built-in
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">
              {t.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
