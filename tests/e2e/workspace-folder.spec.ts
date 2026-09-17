import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from './fixtures.ts'

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

test('keeps the sidebar and the folder on disk in the same hierarchy', async ({
  page,
  localWorkspace,
}) => {
  const { root } = localWorkspace
  await page.goto(localWorkspace.url)

  await expect(
    page.getByRole('button', { name: 'Selecionar raiz do espaço de trabalho' }),
  ).toHaveText('Notas')
  await page.getByRole('button', { name: 'Pasta: Clientes' }).click()

  await page.getByRole('button', { name: 'Nova pasta', exact: true }).click()
  await page.getByLabel('Nome da pasta').fill('Propostas')
  await page.getByRole('button', { name: 'Criar pasta' }).click()
  await expect
    .poll(() => exists(join(root, 'Clientes', 'Propostas')))
    .toBe(true)

  await page.getByRole('button', { name: 'Nova página', exact: true }).click()
  await page.getByLabel('Título').fill('Proposta 2027')
  await page.getByLabel('Conteúdo', { exact: true }).fill('Escopo inicial')
  await page.getByRole('button', { name: /Criar nota/ }).click()
  const proposal = join(root, 'Clientes', 'Propostas', 'Proposta 2027.md')
  await expect
    .poll(() => readFile(proposal, 'utf8').catch(() => ''))
    .toBe('# Proposta 2027\n\nEscopo inicial')

  await page.getByRole('tab', { name: 'Markdown' }).click()
  await page.getByRole('textbox', { name: 'Markdown' }).fill('Escopo revisado')
  await expect
    .poll(() => readFile(proposal, 'utf8').catch(() => ''))
    .toBe('# Proposta 2027\n\nEscopo revisado')

  await page.getByRole('button', { name: 'Ações de Propostas' }).click()
  await page.getByRole('menuitem', { name: 'Renomear' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Propostas 2027')
  await page.getByRole('button', { name: 'Salvar nome' }).click()
  await expect
    .poll(() => readdir(join(root, 'Clientes')))
    .toEqual(['Acme', 'Propostas 2027', 'logo.png'])
  await expect(
    page.getByRole('button', { name: 'Pasta: Propostas 2027' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Ações de Leia-me' }).click()
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await expect.poll(() => exists(join(root, 'Leia-me.md'))).toBe(false)
  await expect
    .poll(async () => (await readdir(join(root, '.devnotes', 'trash'))).length)
    .toBe(1)

  await writeFile(
    join(root, 'Clientes', 'Acme', 'Contrato.md'),
    '# Contrato Acme\n\nRenovado pelo terminal.\n',
  )
  await page.getByRole('button', { name: 'Pasta: Acme' }).click()
  await page.getByRole('button', { name: 'Recarregar pasta' }).click()
  await page.getByRole('button', { name: 'Contrato Acme', exact: true }).click()
  await expect(page.getByText('Renovado pelo terminal.')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('workspace.png') })
})
