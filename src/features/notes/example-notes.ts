import type { Note } from './types'

export const exampleNotes: [Note, ...Note[]] = [
  {
    id: 'example-getting-started',
    title: 'Primeiros passos no DevNotes',
    content: `Reúna suas notas de desenvolvimento, comandos úteis e decisões técnicas em um só lugar.

Este é um documento de exemplo. Escolha **Nova página** para criar o seu ou abra **Editar** para adaptar este aqui.

## 1. Anote o que você aprendeu

Comece com um título que ajude a encontrar a nota depois. Dê um pouco de contexto e registre os detalhes de que vai precisar.

1. Descreva o problema que você estava tentando resolver.
2. Anote a solução que funcionou.
3. Inclua um exemplo curto que você possa reutilizar.
4. Adicione um link para a fonte, caso precise consultar mais detalhes.
5. Deixe anotado o próximo passo.

Use **Ler** para visualizar o documento, **Editar** para formatar o texto, **Markdown** para editar o código-fonte e **Dividir** para ver o código-fonte e a prévia juntos.

## 2. Encontre e organize suas notas

| Recurso | Como usar | Vale saber |
| --- | --- | --- |
| Encontrar uma nota | Busque pelo título ou conteúdo | A busca não diferencia maiúsculas de minúsculas |
| Editar um documento | Abra a aba Editar ou Dividir | As alterações nas páginas são salvas automaticamente |
| Aproveitar o espaço de leitura | Recolha a barra lateral | Use o botão na barra superior |
| Guardar uma cópia | Baixe o arquivo Markdown | Você pode abrir suas notas em outros editores |

## 3. Guarde os detalhes úteis

Comandos como \`npm run check\` podem aparecer junto da explicação. Para exemplos maiores, use um bloco de código:

\`\`\`ts
const note = {
  title: 'One thing I learned today',
  content: 'Write it down while it is still fresh.',
}
\`\`\`

> Uma nota útil não precisa ser longa. Ela precisa ajudar você a retomar de onde parou.

## 4. Suas notas ficam neste navegador

As notas são salvas localmente no navegador que você está usando. Na barra lateral, você pode criar documentos temporários, páginas e pastas. Abra uma pasta do computador para importar documentos Markdown sem alterar os originais. **Salvar espaço de trabalho** baixa um backup dos documentos e pastas. Não há sincronização com a nuvem: limpar os dados do navegador apaga o espaço de trabalho salvo.
`,
  },
  {
    id: 'example-markdown-reference',
    title: 'Guia de Markdown',
    content: `Use Markdown para organizar suas notas e facilitar a leitura.

## Títulos e destaque

Comece uma linha com \`##\` para criar um título de seção. Coloque o texto entre **dois asteriscos** para deixá-lo em negrito ou entre *um asterisco de cada lado* para usar itálico.

## Listas

- Agrupe ideias relacionadas.
- Escreva itens fáceis de consultar.
- Use listas numeradas quando a ordem importar.

## Tarefas

- [x] Criar um espaço de trabalho
- [ ] Escrever sua primeira nota
- [ ] Baixar um backup

As tarefas aparecem aqui para consulta. Para marcá-las como concluídas, altere o Markdown no editor.

## Links e código

Adicione um link com \`[texto](https://example.com)\`. Coloque comandos como \`git status\` entre crases.

## Tabelas

| Sintaxe | Resultado |
| --- | --- |
| \`**texto**\` | Texto em negrito |
| \`*texto*\` | Texto em itálico |
| \`> texto\` | Uma citação |

Abra **Markdown** para ver o código-fonte deste documento ou **Editar** para alterar o conteúdo no editor visual.
`,
  },
]
