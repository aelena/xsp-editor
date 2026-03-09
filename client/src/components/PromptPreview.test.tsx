import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import PromptPreview from './PromptPreview.tsx'

describe('PromptPreview', () => {
  it('shows empty state for empty content', () => {
    render(<PromptPreview content="" />)
    expect(screen.getByText(/Start typing/)).toBeInTheDocument()
  })

  it('shows empty state for whitespace-only content', () => {
    render(<PromptPreview content="   " />)
    expect(screen.getByText(/Start typing/)).toBeInTheDocument()
  })

  it('renders plain XML content', () => {
    render(<PromptPreview content="<task>Classify this message</task>" />)
    expect(screen.getByTestId('prompt-preview')).toHaveTextContent(
      '<task>Classify this message</task>',
    )
  })

  it('highlights $variables', () => {
    render(<PromptPreview content="Classify $customer_message" />)
    const variable = screen.getByText('$customer_message')
    expect(variable).toBeInTheDocument()
    expect(variable.className).toContain('bg-blue-100')
  })

  it('highlights multiple variables', () => {
    render(
      <PromptPreview content="Classify $message into $categories" />,
    )
    expect(screen.getByText('$message')).toBeInTheDocument()
    expect(screen.getByText('$categories')).toBeInTheDocument()
  })
})
