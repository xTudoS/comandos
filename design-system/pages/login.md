# Override · Autenticação e agendamento público

**Arquivos:** `app/pages/login/index.vue`, `app/pages/login/waiting.vue`,
`app/layouts/auth.vue`, `app/layouts/booking.vue`

Sobrepõe [`../MASTER.md`](../MASTER.md). Tudo que não estiver aqui segue o MASTER.

---

## Por que desvia

São telas de **porta de entrada**, vistas antes de qualquer dado do app. Usam um
tratamento "vitrine" — fundo com gradiente, cartão em vidro fosco — que seria
errado no cockpit denso de dentro. O `booking` (agendamento público por link)
compartilha o mesmo shell porque também é visto por quem não tem conta.

## O que muda

**Shell com blobs.** `background: #edf0f7` com três `radial-gradient`
(`.blob-1/2/3`) desfocados por trás. Isso é cenografia, não superfície de dados —
os gradientes são valores literais de propósito.

**Cartão em vidro forte.** `.auth-card` usa
`backdrop-filter: blur(40px) saturate(180%)` sobre `rgba(255,255,255,0.72)`, com
sombra profunda. Dentro das telas de auth, é a **única** exceção autorizada ao
"frosted só em chrome" e ao "hairline acima de sombra" do MASTER §4 — nenhum
outro elemento daqui pode carregar sombra.

> A landing (`pages/landing.md`) também isenta a regra de sombra, por outro
> motivo. As duas isenções são locais: no app autenticado o MASTER §4 continua
> valendo integralmente.

**`auth.vue` e `booking.vue` são gêmeos.** Os dois shells são quase idênticos por
design. **Ao mexer num, mexa no outro** — já divergiram antes.

## O que NÃO muda

Escalas fechadas do MASTER §2 valem integralmente. `<BaseIcon>` para ícone.
`aria-label` em todo controle — são as telas mais críticas para acessibilidade,
já que é onde o usuário chega sem contexto.

## Dívida registrada

`login/index.vue` 38 · `login/waiting.vue` 34 · `auth.vue` 10 · `booking.vue` 10.
A maioria é `rgba(255,255,255,α)` do tratamento de vidro — difícil de tokenizar
sem perder legibilidade. Se for limpar, comece pelos `#hex` opacos, não pelos
`rgba` do vidro. Teto em `../token-baseline.json`.

## Histórico

Estes quatro arquivos concentravam **40 das 48** referências `.dark` do projeto
antes da remoção do dark mode (MASTER §6). Se aparecer um seletor `.dark` aqui de
novo, é regressão — o guard reprova.
