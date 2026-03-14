import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PromptList from './pages/PromptList.tsx'
import PromptEditor from './pages/PromptEditor.tsx'
import TagRegistry from './pages/TagRegistry.tsx'
import ConstraintLibrary from './pages/ConstraintLibrary.tsx'
import Templates from './pages/Templates.tsx'
import Settings from './pages/Settings.tsx'
import PromptPlayground from './pages/PromptPlayground.tsx'
import Welcome from './pages/Welcome.tsx'
import Help from './pages/Help.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/prompts" element={<PromptList />} />
          <Route path="/prompts/new" element={<PromptEditor />} />
          <Route path="/prompts/:id/edit" element={<PromptEditor />} />
          <Route path="/tags" element={<TagRegistry />} />
          <Route path="/constraints" element={<ConstraintLibrary />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/playground" element={<PromptPlayground />} />
          <Route path="/help" element={<Help />} />
          <Route path="/editor" element={<Navigate to="/prompts/new" replace />} />
          <Route path="/" element={<Welcome />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
