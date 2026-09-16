import { readFile, writeFile } from 'node:fs/promises'
import { test, expect } from './fixtures.ts'

test.beforeEach(async ({ page, localFile }) => {
  page.on('dialog', (dialog) => {
    void dialog.accept()
  })
  await page.goto(localFile.url)
  await expect(
    page.getByRole('heading', { name: 'Browser guide', exact: true }),
  ).toBeVisible()
})

test('recovers an unsaved draft and writes the original only after saving', async ({
  page,
  localFile,
}) => {
  expect(new URL(page.url()).searchParams.get('file')).toBe(localFile.path)
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Markdown', exact: true })
    .fill('Recovered browser draft')
  expect(await readFile(localFile.path, 'utf8')).toBe(localFile.original)
  await page.reload()
  await page
    .getByRole('button', { name: 'Recuperar rascunho', exact: true })
    .click()
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Markdown', exact: true }),
  ).toHaveValue('Recovered browser draft')
  await page
    .getByRole('button', { name: 'Salvar arquivo original', exact: true })
    .click()
  await expect
    .poll(() => readFile(localFile.path, 'utf8'))
    .toBe('# Browser guide\n\nRecovered browser draft')
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('devnotes:local-draft:v1:'),
      ),
    ),
  ).toEqual([])
})

test('refuses to overwrite external changes and keeps the draft', async ({
  page,
  localFile,
}) => {
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown', exact: true })
  await editor.fill('My unsaved version')
  await writeFile(localFile.path, '# Browser guide\n\nExternal edit')
  await page
    .getByRole('button', { name: 'Salvar arquivo original', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('mudou no computador')
  await expect(editor).toHaveValue('My unsaved version')
  expect(await readFile(localFile.path, 'utf8')).toBe(
    '# Browser guide\n\nExternal edit',
  )
})

test('remembers reading position and navigates to a minimap heading', async ({
  page,
}) => {
  const pane = page.locator(
    '#main [data-slot="tabs-content"][data-state="active"]',
  )
  await pane.evaluate((element) => {
    element.dispatchEvent(new Event('wheel'))
    element.scrollTop = 1500
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          key.startsWith('devnotes:reading:v1:'),
        ),
      ),
    )
    .toBe(true)
  await page.reload()
  await expect
    .poll(() => pane.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1400)
  await page.keyboard.press('Control+k')
  await page
    .getByRole('combobox', { name: 'Buscar documentos e comandos' })
    .fill('minimapa')
  await page.getByRole('option', { name: /Abrir minimapa/ }).click()
  await page
    .getByRole('button', { name: 'Ir para Section 20', exact: true })
    .click()
  const heading = page.getByRole('heading', { name: 'Section 20', exact: true })
  await expect(heading).toHaveAttribute('data-navigation-target', '')
  await expect(heading).toBeFocused()
})

test('preserves editing state in focus mode and persists appearance', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown', exact: true })
  await editor.fill('Focus draft')
  await editor.evaluate((element) =>
    element.setAttribute('data-mount-check', 'original'),
  )
  await page
    .getByRole('button', { name: 'Ativar modo foco', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Painel de tarefas', exact: true }),
  ).toBeHidden()
  await expect(editor).toHaveAttribute('data-mount-check', 'original')
  await page.keyboard.press('Control+k')
  await page
    .getByRole('combobox', { name: 'Buscar documentos e comandos' })
    .fill('preferencias')
  await page.getByRole('option', { name: /Preferências de aparência/ }).click()
  await page.getByRole('combobox', { name: 'Tema', exact: true }).click()
  await page.getByRole('option', { name: 'Escuro', exact: true }).click()
  await page.getByRole('switch', { name: 'Animações', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Sair do modo foco', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveValue('Focus draft')
  await expect(editor).toHaveAttribute('data-mount-check', 'original')
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
})

test('opens dropped files as copies and fits a narrow viewport', async ({
  page,
  localFile,
}) => {
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File(['# First copy\n\nOne'], 'first.md', { type: 'text/markdown' }),
    )
    transfer.items.add(
      new File(['# Second copy\n\nTwo'], 'second.markdown', {
        type: 'text/markdown',
      }),
    )
    return transfer
  })
  await page.dispatchEvent('body', 'dragenter', { dataTransfer })
  await expect(
    page.getByText('Solte os documentos aqui', { exact: true }),
  ).toBeVisible()
  await page.dispatchEvent('body', 'drop', { dataTransfer })
  await expect(
    page.getByRole('heading', { name: 'First copy', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('tab', { name: 'Abrir aba Second copy', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Second copy', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Salvar arquivo original', exact: true }),
  ).toHaveCount(0)
  expect(await readFile(localFile.path, 'utf8')).toBe(localFile.original)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('navigates nested folders and finds documents through the command palette', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'dev-notes:workspace:v1',
      JSON.stringify({
        format: 'dev-notes-workspace',
        version: 1,
        name: 'Browser test workspace',
        folders: [
          { id: 'project', name: 'Project' },
          { id: 'design', name: 'Design', parentId: 'project' },
        ],
        notes: [
          {
            id: 'decision',
            folderId: 'design',
            title: 'Storage decision',
            content: 'Unique searchable decision content.',
          },
        ],
      }),
    ),
  )
  await page.reload()
  await page
    .getByRole('button', { name: 'Pasta: Project', exact: true })
    .click()
  await page.getByRole('button', { name: 'Pasta: Design', exact: true }).click()
  await page
    .getByRole('button', { name: 'Storage decision', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Storage decision', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Control+k')
  await page
    .getByRole('combobox', { name: 'Buscar documentos e comandos' })
    .fill('Unique searchable')
  await page.getByRole('option', { name: /Storage decision/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Storage decision', exact: true }),
  ).toBeVisible()
})
