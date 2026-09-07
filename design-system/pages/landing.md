# Override · Landing pública (`/`)

**Arquivo:** `app/pages/index.vue` · **Layout:** `public`

Sobrepõe [`../MASTER.md`](../MASTER.md). Tudo que não estiver aqui segue o MASTER.

---

## Por que desvia

A landing é **material de marketing**, não o app. Ela vende o Comando para quem
ainda não entrou. Por isso tem identidade própria — mais quente e mais colorida
que o cockpit Apple-HIG de dentro. Isso é intencional: não "corrija" a landing
para os tokens do app.

## O que muda

**Tipografia.** `Plus Jakarta Sans` em vez da stack SF Pro do app.

**Paleta local.** Declarada no topo do `<style>` de `index.vue`, com escopo na
própria página:

```css
--pink: #e11d5e;   --pink-hover: #c7154f;  --pink-soft: #fce7ef;
--violet: #6c5ce7; --violet-soft: #ece9fe;
--green: #16a34a;  --green-soft: #e6f6ec;
--lav: #f6f4fe;
--ink: #1a1626;    --ink-2: #514c60;       --ink-3: #8b8698;
--card-border: #ece9f3;
--card-shadow: 0 1px 2px rgba(26, 22, 38, 0.04), 0 12px 32px -14px rgba(76, 29, 149, 0.22);
```

`--ink*` é a rampa de texto da landing (equivale a `--text*` no app). Use estes
nomes dentro da página; **não** puxe `--accent`/`--text` do app para cá.

**Sombras.** A landing usa sombra difusa como recurso visual. O "hairline acima
de sombra" do MASTER §4 **não vale** aqui.

## O que NÃO muda

As escalas fechadas do MASTER §2 valem integralmente: tipografia, radius e
espaçamento par são verificados por `pnpm lint:tokens` nesta página como em
qualquer outra. Identidade de marca ≠ licença para valor arbitrário.

Ícone continua sendo `<BaseIcon>` (MASTER §4).

## Dívida registrada

57 literais de cor crus — o maior do repositório. **A maior parte é legítima**
(são as definições da paleta local acima). O que vale limpar é o resto: valor
solto no meio de uma regra que deveria referenciar `var(--pink)` e companhia.
Teto em `../token-baseline.json`.
