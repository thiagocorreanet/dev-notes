import { test, expect } from './fixtures.ts'

test('renders a launched PDF with read-only controls', async ({
  page,
  localPdf,
}) => {
  await page.goto(localPdf.url)

  await expect(
    page.getByRole('region', { name: 'Leitor de PDF: PDF de referência' }),
  ).toBeVisible()
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible()
  await expect(page.getByText('PDF · Somente leitura')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Markdown' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Baixar PDF' })).toBeVisible()
  await expect(page.getByLabel('Texto da página 1')).toContainText(
    'DevNotes PDF browser test',
  )
})
