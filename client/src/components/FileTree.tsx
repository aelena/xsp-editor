import { useMemo } from 'react'
import type { FileEntry } from '../api/files.ts'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  extension?: string
  children: TreeNode[]
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirs = new Map<string, TreeNode>()

  // First pass: create directory nodes
  for (const f of files) {
    if (f.type === 'directory') {
      const node: TreeNode = {
        name: f.name,
        path: f.path,
        type: 'directory',
        children: [],
      }
      dirs.set(f.path, node)
    }
  }

  // Second pass: organize into tree
  for (const f of files) {
    const parts = f.path.split('/')
    const parentPath = parts.slice(0, -1).join('/')

    if (f.type === 'directory') {
      const node = dirs.get(f.path)!
      if (parentPath && dirs.has(parentPath)) {
        dirs.get(parentPath)!.children.push(node)
      } else {
        root.push(node)
      }
    } else {
      const node: TreeNode = {
        name: f.name,
        path: f.path,
        type: 'file',
        extension: f.extension,
        children: [],
      }
      if (parentPath && dirs.has(parentPath)) {
        dirs.get(parentPath)!.children.push(node)
      } else {
        root.push(node)
      }
    }
  }

  // Sort: directories first, then alphabetical
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) {
      if (n.children.length > 0) sortNodes(n.children)
    }
  }
  sortNodes(root)

  return root
}

function FileIcon({ extension }: { extension?: string }) {
  if (extension === '.xml') {
    return <span className="text-orange-500 mr-1.5 text-xs font-mono">&lt;/&gt;</span>
  }
  return <span className="text-gray-400 dark:text-gray-500 mr-1.5 text-xs">&#128196;</span>
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedDirs,
  onToggleDir,
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
}) {
  const isSelected = node.path === selectedPath
  const isExpanded = expandedDirs.has(node.path)

  if (node.type === 'directory') {
    return (
      <>
        <button
          onClick={() => onToggleDir(node.path)}
          className={`w-full text-left px-2 py-0.5 text-xs flex items-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="mr-1 text-gray-400 dark:text-gray-500 text-[10px]">
            {isExpanded ? '&#9660;' : '&#9654;'}
          </span>
          <span className="mr-1.5 text-yellow-500 text-xs">&#128193;</span>
          {node.name}
        </button>
        {isExpanded &&
          node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
      </>
    )
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full text-left px-2 py-0.5 text-xs flex items-center hover:bg-gray-200 dark:hover:bg-gray-700 rounded ${
        isSelected ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-medium' : 'text-gray-600 dark:text-gray-400'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FileIcon extension={node.extension} />
      {node.name}
    </button>
  )
}

interface FileTreeProps {
  files: FileEntry[]
  selectedPath: string | null
  onSelectFile: (path: string) => void
  gitStatus?: Array<{ status: string; path: string }>
}

export default function FileTree({
  files,
  selectedPath,
  onSelectFile,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files])
  const expandedDirs = useMemo(() => {
    // Auto-expand all directories by default
    const dirs = new Set<string>()
    for (const f of files) {
      if (f.type === 'directory') dirs.add(f.path)
    }
    return dirs
  }, [files])

  if (files.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-gray-400 dark:text-gray-500 text-center">
        No files in project.
        <br />
        Create a new file or use a template.
      </div>
    )
  }

  return (
    <div className="py-1" data-testid="file-tree">
      {tree.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={() => {}}
        />
      ))}
    </div>
  )
}
