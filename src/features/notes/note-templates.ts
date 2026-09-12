export const noteTemplates = [
  { id: 'blank', label: 'Em branco', title: '', content: '' },
  {
    id: 'decision',
    label: 'Decisão de arquitetura',
    title: 'Decisão de arquitetura',
    content:
      '## Contexto\n\nQual problema precisamos resolver?\n\n## Opções consideradas\n\n- Opção 1:\n- Opção 2:\n\n## Decisão\n\nQual opção escolhemos e por quê?\n\n## Consequências\n\nO que melhora e quais limitações aceitamos?\n\n## Referências\n\n',
  },
  {
    id: 'investigation',
    label: 'Investigação de bug',
    title: 'Investigação de bug',
    content:
      '## Problema\n\nDescreva o comportamento observado.\n\n## Como reproduzir\n\n1. \n\n## Resultado esperado\n\n\n## Evidências\n\nCole mensagens de erro, logs ou imagens.\n\n## Causa\n\n\n## Correção\n\n- [ ] Implementar a correção\n- [ ] Testar o cenário\n- [ ] Verificar possíveis regressões\n',
  },
  {
    id: 'meeting',
    label: 'Anotação de reunião',
    title: 'Anotação de reunião',
    content:
      '## Participantes\n\n\n## Pauta\n\n- \n\n## Decisões\n\n- \n\n## Próximos passos\n\n- [ ] Ação, responsável e prazo\n',
  },
]
