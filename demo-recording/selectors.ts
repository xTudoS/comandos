/**
 * Mapa central de seletores do harness de gravação.
 *
 * Verificados ao vivo (localhost:3000) via accessibility tree. Se algum beat
 * falhar, ajuste AQUI — é o único lugar a mexer.
 */
export const S = {
  // Login (modo apresentação)
  demoLoginButton: /Entrar como demo/i,
  // Elemento que confirma que o /trabalho carregou de fato.
  readyMarker: /Nova tarefa/i,

  // Trabalho — quick-add INLINE (evita o modal global)
  quickAddInput: 'O que precisa fazer? (Enter)',
  novaTarefaButton: /^Nova tarefa$/,
  concluirButton: /^Concluir$/, // botão do card (substring casa "Concluir tarefa" tb)

  // Modal de tarefa (AppModal) — fechar de forma garantida
  modalBackdrop: '.m-backdrop',
  modalCloseButton: /^(Fechar|Cancelar)$/,
  editarButton: /^Editar$/,
  salvarButton: /^Salvar$/,
  checklistTab: /^Checklist$/,
  anotacoesTab: /^Anotações$/,
  historicoTab: /^Histórico$/,
  // dentro do modal
  checklistItemInput: 'Novo item…',
  anotacaoInput: 'Nova anotação…',

  // Vida
  vidaEditarCheckin: /^Editar$/,
  salvarCheckin: /(Salvar|Atualizar) check-in/i,

  // Sincronização (offline)
  syncChip: /pendente|Sincronizando/i,
} as const

/** Rotas (navegação por URL — mais robusto que clicar no menu). */
export const ROUTES = {
  login: '/login',
  trabalho: '/trabalho',
  agenda: '/agenda',
  metas: '/metas',
  projetos: '/projetos',
  notas: '/notas',
  pagamentos: '/pagamentos',
  vida: '/vida',
} as const
