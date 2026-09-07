# QA do Storyboard (4C + continuidade)

Revisão aplicando a metodologia do `storyboard-review-skill` antes de gerar imagens/vídeos.

## Framework 4C
- **Clear (clareza):** cada beat/panel descreve um único momento sem ambiguidade. ✅
- **Concise (concisão):** Visual Description em 80–120 palavras; Lighting & Mood em 30–50; motion prompts 40–80. ✅
- **Consistent (consistência):** a "style anchor" (Apple-like, vidro fosco, off-white #f5f5f7, azul #0071e3, SF-Pro-like, luz suave) está repetida em todos os beats e herdada nos sequence panels e motion prompts. ✅
- **Progressive (progressivo):** beat board (visão geral) → sequence board (4 panels) → motion prompts (movimento). ✅

## Continuidade
- Paleta e materiais idênticos entre abertura, ponte e encerramento. ✅
- Eixo estável e ação contínua dentro de cada sequência (sem saltos). ✅
- Regra dos 180° respeitada na ponte de tempo real (esquerda = "eu", direita = "Maria"). ✅
- Coerência com a gravação de tela: a IA usa a mesma paleta do app real, então o corte IA↔tela não destoa. ✅

## Cobertura
- Abertura (dor → solução → mapa): Beats 1, 2, 3. ✅
- Diferencial tempo real: Beat 4. ✅
- Diferencial offline: Beat 5 (opcional, reforça o beat 11 do roteiro). ✅
- Fecho/CTA: Beat 6. ✅

## Pontos de atenção ao gerar
- Garantir que o logo do Comando usado seja o oficial (`public/comando-logo.png`); se o gerador não reproduzir bem, compor o logo real por cima na edição.
- Texto em PT-BR ("Trabalho e vida, no mesmo comando.", "Comece agora") tende a sair errado em geradores de imagem — preferir adicionar o texto na **montagem**, não no prompt.
- Manter o azul exatamente no tom de acento do app para o corte IA↔tela não "pular".
