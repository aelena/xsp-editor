import { useThemeStore } from '../store/theme.ts'

export default function ThemeToggle() {
  const { dark, toggle } = useThemeStore()

  return (
    <button
      onClick={toggle}
      className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  )
}
