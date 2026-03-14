import { create } from 'zustand'

interface ProjectState {
  currentProjectId: string | null
  currentProjectPath: string | null
  currentFilePath: string | null

  setCurrentProject: (id: string | null, path: string | null) => void
  setCurrentFile: (filePath: string | null) => void
  reset: () => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProjectId: null,
  currentProjectPath: null,
  currentFilePath: null,

  setCurrentProject: (id, path) =>
    set({ currentProjectId: id, currentProjectPath: path, currentFilePath: null }),
  setCurrentFile: (filePath) => set({ currentFilePath: filePath }),
  reset: () =>
    set({
      currentProjectId: null,
      currentProjectPath: null,
      currentFilePath: null,
    }),
}))
