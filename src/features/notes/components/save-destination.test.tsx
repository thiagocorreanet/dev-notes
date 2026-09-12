import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SaveDestination } from './save-destination'

describe('Save destination', () => {
  it('does not treat an imported source path as authority to save an original', () => {
    render(
      <SaveDestination
        note={{
          id: 'copy',
          title: 'Copy',
          content: '',
          sourcePath: '/original.md',
        }}
        original={false}
        temporary={false}
        onOpenFolder={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('region', { name: 'Local de salvamento' }),
    ).toHaveTextContent('Cópia importada')
    expect(screen.getByRole('region')).toHaveTextContent(
      'Salvar guarda neste navegador',
    )
  })
  it('distinguishes original writes from connected-folder browser saves', () => {
    const props = {
      note: {
        id: 'local',
        title: 'Local',
        content: '',
        sourcePath: '/original.md',
      },
      temporary: false,
      onOpenFolder: vi.fn(),
    }
    const { rerender } = render(<SaveDestination {...props} original />)
    expect(screen.getByRole('region')).toHaveTextContent(
      'Salvar grava no computador: /original.md',
    )
    rerender(
      <SaveDestination
        {...props}
        original={false}
        connectedPath="notes/local.md"
      />,
    )
    expect(screen.getByRole('region')).toHaveTextContent(
      'Ctrl/Cmd+S guardam neste navegador',
    )
    expect(
      screen.getByRole('button', { name: 'Salvar na pasta…' }),
    ).toBeVisible()
  })
})
