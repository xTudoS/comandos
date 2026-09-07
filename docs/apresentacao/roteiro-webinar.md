# Roteiro do Webinar — Comando

> Apresentação estilo webinar para **usuários finais**. Duração-alvo: **~26 min**.
> Formato: gravação de tela da conta de demonstração (modo apresentação) + 3 segmentos gerados por IA (abertura, ponte central, encerramento).
> Tom: acessível, sem jargão técnico. Foco em **benefícios** e **como usar**.

**Como ler este roteiro:** cada beat tem **Objetivo**, **Narração** (o que falar — pode ler quase literal), **Tela** (o que fazer/mostrar, com a tela do app) e **Transição** (como emendar no próximo beat). `[IA]` = segmento gerado por IA (ver `storyboard/`). `[TELA]` = gravação de tela ao vivo.

Antes de gravar: rode o setup de `producao.md` (conta demo semeada, modo apresentação ligado, navegador limpo).

---

## Beat 1 — Abertura / Hook `[IA]` · 0:00–1:30 (90s)

**Objetivo:** prender em 10 segundos e nomear a dor.

**Narração:**
> "Quantos aplicativos você abre num dia normal? Um pra tarefas. Outro pra agenda. Uma planilha pros pagamentos. Um caderno pras anotações. E, no meio disso tudo, a sua vida — saúde, família, descanso — fica sempre pra depois.
> O problema nunca foi falta de ferramenta. É excesso. Sua atenção vive picada em dez lugares.
> E se existisse **um único lugar** onde trabalho e vida ficam sob o mesmo comando — e que funciona até **sem internet**? Esse lugar tem nome: **Comando**."

**Tela:** segmento IA — montagem de apps fragmentados se dissolvendo e convergindo no logo do Comando. (Ver `storyboard/beat-board.md`, Beat 1–2.)

**Transição:** logo do Comando dá lugar à narração da seção "o que é".

---

## Beat 2 — O que é o Comando `[IA]` + `[TELA]` · 1:30–3:30 (120s)

**Objetivo:** dar o mapa mental antes de entrar em telas.

**Narração:**
> "O Comando é o seu **centro de comando pessoal**. Ele junta, num só lugar, tudo o que normalmente fica espalhado:
> suas **tarefas** organizadas por horizonte de tempo; a sua **agenda**; seus **pagamentos**; seus **projetos** e **metas**; suas **anotações** importantes; e — o que quase nenhum app faz — um módulo de **Vida**, pra você acompanhar como anda o seu equilíbrio.
> A ideia é simples: parar de trocar de aba o dia inteiro e ter clareza do que importa, agora."

**Tela:** começa com um diagrama-resumo das 8 áreas (segmento IA curto, Beat 3 do storyboard), e termina com um **giro rápido** pelas abas do app já logado (passar o mouse pela navegação, sem clicar a fundo). Não detalhar ainda.

**Transição:** "Deixa eu te mostrar por dentro. Começa pelo começo: entrar."

---

## Beat 3 — Login & primeiro acesso `[TELA]` · 3:30–5:00 (90s)

**Objetivo:** mostrar que entrar é simples e seguro.

**Narração:**
> "O acesso é sem senha. Você usa a sua **passkey** — a mesma biometria que destrava o seu celular — ou recebe um **código por email**. Sem senha pra decorar, sem senha pra vazar.
> Depois do primeiro acesso, o app fica disponível mesmo offline. Vou entrar aqui."

**Tela:** tela de login (`/login`). Mostrar o botão "Entrar com passkey" e o campo de email. **Para gravar**, clicar em **"▶ Entrar como demo"** (atalho do modo apresentação) — cai direto no `/trabalho`. Deixar a câmera respirar 1s na tela cheia de tarefas.

**Transição:** "E é isto que você vê ao entrar: o seu dia de trabalho, organizado por tempo."

---

## Beat 4 — Trabalho: horizontes de tempo `[TELA]` · 5:00–9:00 (240s)

**Objetivo:** o coração do app. Mostrar criação, organização por horizonte e conclusão instantânea.

**Narração:**
> "Esta é a tela **Trabalho**. Repare que as tarefas não estão numa lista infinita — elas estão organizadas por **horizonte de tempo**.
> **Core 30, 60 e 90** são o que importa nos próximos 30, 60 e 90 dias. **Micro** são tarefas de 5 minutos que você resolve em lote. **Backlog** é o 'depois'. E **Hibernando** é o que está pausado, sem culpa.
> A diferença é que você sempre sabe onde colocar cada coisa — e o que NÃO precisa olhar agora.
> Vou criar uma tarefa." *(criar)*
> "Pronto. E quando algo muda de prioridade, eu não preciso recriar nada — só arrasto." *(arrastar)*
> "E quando termina, um clique. Olha que rápido — marca na hora, sem esperar carregar." *(concluir)*

**Tela:**
1. Panorâmica da `/trabalho` (`app/pages/trabalho.vue`) mostrando os 6 horizontes.
2. Criar tarefa rápida: digitar título e Enter (cai em Core 30).
3. Abrir uma tarefa pra mostrar tipos (CEO / Delego / Pessoal) e empresa — sem se alongar.
4. **Arrastar** uma tarefa entre horizontes (Core 30 → Core 60).
5. **Concluir** uma tarefa clicando no círculo — destacar que muda instantaneamente (UI otimista).

**Transição:** "Mas uma tarefa raramente é uma coisa só. Quase sempre tem etapas. Deixa eu abrir uma."

---

## Beat 5 — Detalhe da tarefa: checklist + anotações `[TELA]` · 9:00–11:30 (150s)

**Objetivo:** mostrar profundidade sem complexidade.

**Narração:**
> "Dentro de cada tarefa você tem um **checklist**. Veja: conforme eu marco os itens, a barra de progresso anda sozinha — você enxerga o quanto já avançou.
> E tem as **anotações**: cada uma fica com data e hora. É o histórico vivo da tarefa — o que foi decidido, o que ficou pendente. Quando você voltar daqui a duas semanas, o contexto está todo aqui."

**Tela:** abrir a tarefa "Revisar fluxo de onboarding do App v2" (vem semeada com checklist e anotações). Marcar 1 item do checklist → barra de progresso anima (`Checklist.vue`). Ir na aba de anotações e adicionar uma nota nova → aparece com timestamp.

**Transição:** "Algumas tarefas têm hora marcada. Pra essas, existe a Agenda."

---

## Beat 6 — Agenda `[TELA]` · 11:30–13:30 (120s)

**Objetivo:** mostrar a visão de tempo concreto e os follow-ups.

**Narração:**
> "A **Agenda** é uma janela de três dias — hoje e o que vem logo aí. Sem o mês inteiro te distraindo.
> Tarefas com data e hora aparecem aqui automaticamente, no horário certo.
> E tem os **follow-ups**: quando você delega algo ou está esperando uma resposta, marca um follow-up e o app te lembra de cobrar. Nada cai no esquecimento."

**Tela:** ir pra `/agenda`. Mostrar a grade de 3 dias com as tarefas agendadas (vêm semeadas com data/hora). Apontar uma tarefa com follow-up. Usar o mini-calendário pra navegar um dia.

**Transição:** "Tarefa e agenda são o dia a dia. Mas pra onde tudo isso aponta? Metas e projetos."

---

## Beat 7 — Metas & Projetos `[TELA]` · 13:30–16:00 (150s)

**Objetivo:** conectar o operacional ao estratégico.

**Narração:**
> "Toda tarefa deveria empurrar alguma coisa maior. É pra isso que servem as **Metas**.
> Aqui eu defino uma meta com prazo e categoria — pode ser de empresa, de produto, geral ou pessoal.
> E o melhor: quando eu ligo minhas tarefas a uma meta, o progresso sobe sozinho. Você vê, em tempo real, o quanto está perto de chegar lá.
> Os **Projetos** agrupam o trabalho por cliente ou iniciativa — então nada fica solto."

**Tela:**
1. `/metas`: criar uma meta nova (título, categoria, prazo) no `ModalMeta`.
2. Mostrar uma meta já semeada com barra de progresso (ex.: "Lançar o App v2").
3. Passar rápido por `/projetos` mostrando os projetos agrupados por categoria e a barra de progresso de cada um.

**Transição:** "Tem ainda duas áreas que tiram peso da cabeça: anotações e dinheiro."

---

## Beat 8 — Notas & Pagamentos `[TELA]` · 16:00–18:30 (150s)

**Objetivo:** mostrar a base de conhecimento e o controle financeiro.

**Narração:**
> "As **Notas** são a sua base de conhecimento: playbooks, contatos, decisões, referências — e até credenciais, num lugar separado e marcado como sensível. Tudo organizado por tipo, fácil de achar depois.
> E os **Pagamentos**: o que está pendente, o que já foi pago, e o que está atrasado fica em destaque, piscando, pra não passar batido. Receitas e despesas no mesmo lugar — você bate o olho e sabe como está o caixa."

**Tela:**
1. `/notas`: mostrar o grid com os 5 tipos e os filtros; abrir uma nota (ex.: "Playbook de lançamento") no leitor.
2. `/pagamentos`: mostrar os cards de resumo, um pagamento **atrasado** (destaque pulsante), e marcar um como pago pra mostrar a mudança de status.

**Transição:** "Até aqui falamos de trabalho. Mas o Comando tem uma área que quase nenhum app de produtividade tem — e é a minha favorita."

---

## Beat 9 — Módulo Vida `[TELA]` · 18:30–21:00 (150s)

**Objetivo:** o diferencial emocional. Equilíbrio, não só produtividade.

**Narração:**
> "Este é o módulo **Vida**. Porque produtividade sem equilíbrio é só esgotamento mais rápido.
> Todo dia você faz um **check-in** rápido: como dormiu, como treinou, alimentação, humor, energia. Leva dez segundos.
> A partir disso, o Comando calcula um **score** das suas áreas de vida — corpo, mente, relacionamentos, recursos e experiências.
> E aqui está o pulo do gato: ele te avisa qual área está **mais fraca**. No meu caso, 'Experiências' está baixa — sinal de que ando só trabalhando. O app não só mede: ele cutuca, no bom sentido."

**Tela:** `/vida`. Fazer o check-in diário (`DailyCheckinCard`). Mostrar o **anel de score** animando. Apontar o **alerta da área mais fraca** e os cards por área (vêm semeados). Se possível, mostrar uma tarefa ligada a uma área de vida (ex.: "Treino longo de domingo").

**Transição:** "E nada disso é só pra você sozinho. O Comando foi feito pra quem trabalha com outras pessoas."

---

## Beat 10 — Delegação & tempo real `[TELA]` (com ponte `[IA]` no meio) · 21:00–24:00 (180s)

**Objetivo:** mostrar delegação, atualização em tempo real e rastreabilidade.

**Narração:**
> "Você pode **delegar** uma tarefa pra alguém do seu time. Vou delegar esta aqui pra Maria." *(delegar)*
> "Repare no selo: agora a tarefa mostra 'pra Maria'. E do lado dela, no dispositivo dela, isso aparece **na hora** — sem recarregar a página. É sincronização em tempo real."
> *(ponte IA curta ilustrando a tarefa 'viajando' de uma tela pra outra)*
> "E se você precisar saber quem mexeu em quê, quando: cada tarefa tem um **histórico** completo. 'Delegou pra Maria, às 14h32.' Transparência total, sem planilha de controle."

**Tela:**
1. Abrir uma tarefa, mudar o tipo pra **Delego** e escolher **Maria** (delegada semeada). Selo "→ Maria" aparece.
2. **Ponte IA** (5–8s): ilustração estilizada da tarefa passando de uma tela a outra em tempo real (Beat de ponte no storyboard). *(Evita ter que filmar dois dispositivos reais.)*
3. Abrir o **histórico/auditoria** da tarefa mostrando o registro da delegação.

**Transição:** "Tem uma última coisa — talvez a mais importante de todas. Tira a internet do meio."

---

## Beat 11 — Offline + Encerramento `[TELA]` → `[IA]` · 24:00–26:00 (120s)

**Objetivo:** provar o diferencial offline e fechar com CTA.

**Narração (TELA):**
> "Vou desligar a conexão. Agora estou **offline** — repare no aviso. E mesmo assim: eu crio uma tarefa, marco, edito… tudo funciona, na mesma velocidade.
> E quando a internet volta… olha: ele **sincroniza sozinho**, em silêncio. Nada se perde. Você nunca mais para de trabalhar porque o sinal caiu."

**Tela:** abrir as ferramentas do navegador, ativar **Offline**. Criar/concluir uma tarefa (aparece o selo de pendente). Reativar a rede e mostrar a sincronização acontecendo (`AppSyncStatus`).

**Narração (IA — fecho):**
> "Trabalho e vida, no mesmo comando. Rápido, em tempo real, e mesmo offline.
> O seu dia merece um só centro de comando. **Comece agora.**"

**Tela:** segmento IA de encerramento com logo + CTA (Beat de encerramento no storyboard).

---

## Resumo de tempo

| Beat | Seção | Tipo | Duração | Acumulado |
|---|---|---|---|---|
| 1 | Abertura / Hook | IA | 1:30 | 1:30 |
| 2 | O que é o Comando | IA+Tela | 2:00 | 3:30 |
| 3 | Login & primeiro acesso | Tela | 1:30 | 5:00 |
| 4 | Trabalho: horizontes | Tela | 4:00 | 9:00 |
| 5 | Checklist + anotações | Tela | 2:30 | 11:30 |
| 6 | Agenda | Tela | 2:00 | 13:30 |
| 7 | Metas & Projetos | Tela | 2:30 | 16:00 |
| 8 | Notas & Pagamentos | Tela | 2:30 | 18:30 |
| 9 | Módulo Vida | Tela | 2:30 | 21:00 |
| 10 | Delegação & tempo real | Tela+IA | 3:00 | 24:00 |
| 11 | Offline + Encerramento | Tela+IA | 2:00 | 26:00 |

**Total: ~26 min** (dentro da faixa 20–30 min). Para uma versão de ~15 min, corte os beats 7 e 8 pela metade e encurte o 4.
