/**
 * check-tokens — guard do design system.
 *
 * Roda com `pnpm lint:tokens`. Também é exercitado por
 * `tests/unit/checkTokens.test.ts`, no mesmo espírito de
 * `tests/unit/eslintNoRawDbUpdate.test.ts`.
 *
 * Por que um script e não uma regra ESLint: `eslint.config.mjs` ignora
 * `**\/*.vue` por completo. Ligar `eslint-plugin-vue` só para isso traria
 * centenas de erros preexistentes sem relação com tokens.
 *
 * Duas categorias de regra:
 *
 *  - ESCALA FECHADA (falha sempre, tolerância zero): font-size, border-radius,
 *    espaçamento ímpar e seletor de tema `.dark`. Já estão em zero no
 *    repositório; qualquer reincidência é regressão.
 *
 *  - DÍVIDA COM BASELINE (só pode encolher): literais de cor crus e emoji
 *    estrutural. O baseline em `design-system/token-baseline.json` registra a
 *    contagem por arquivo. Passar do teto reprova; ficar abaixo emite um aviso
 *    pedindo para baixar o número. Assim o guard vale desde já, sem exigir
 *    limpeza de 100% antes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Os tokens vivem em packages/ui/app/assets/css — ver design-system/MASTER.md.
const ROOT = new URL('..', import.meta.url).pathname
const BASELINE_PATH = join(ROOT, 'design-system/token-baseline.json')

// ── Escalas canônicas (espelham packages/ui/app/assets/css/main.css) ────────────────────
const FONT_SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 26, 32, 48, 64]
const RADII = [4, 6, 10, 12, 14, 18, 22, 999]

type Finding = { file: string; line: number; rule: string; detail: string }

// ── Coleta de arquivos ──────────────────────────────────────────────────────
function vueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) vueFiles(full, out)
    else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

/** Devolve os blocos <style> com o offset de linha em que cada um começa. */
function styleBlocks(src: string): { text: string; startLine: number }[] {
  const out: { text: string; startLine: number }[] = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    out.push({ text: m[1]!, startLine: src.slice(0, m.index).split('\n').length })
  }
  return out
}

function templateBlock(src: string): { text: string; startLine: number } | null {
  const m = /<template>([\s\S]*)<\/template>/.exec(src)
  if (!m) return null
  return { text: m[1]!, startLine: src.slice(0, m.index).split('\n').length }
}

/** Remove comentários CSS para não gerar falso positivo em código comentado. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))

// ── Regras de escala fechada ────────────────────────────────────────────────
function checkScales(file: string, src: string, found: Finding[]) {
  for (const { text, startLine } of styleBlocks(src)) {
    const css = stripComments(text)
    const lines = css.split('\n')

    lines.forEach((line, i) => {
      const ln = startLine + i

      // font-size fora da escala.
      // O `(?:\.\d+)?` importa: sem ele `font-size: 12.5px` não casava com
      // NADA (o `\d+px` exigia dígito colado no "px") e passava batido — eram
      // 70 casos no projeto. Decimal nunca está na escala, então é reprovado.
      for (const m of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        const v = Number(m[1])
        if (!FONT_SIZES.includes(v)) {
          found.push({ file, line: ln, rule: 'font-size-escala', detail: `${v}px fora da escala (${FONT_SIZES.join(' ')})` })
        }
      }

      // border-radius fora da escala. Valida CADA componente do valor: a forma
      // antiga só olhava `border-radius: Npx;` de valor único, então o
      // shorthand `6px 6px 3px 3px` escapava inteiro. `0` e `50%` são livres.
      for (const m of line.matchAll(/border-radius:\s*([^;{}]+);/g)) {
        for (const num of m[1]!.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)px/g)) {
          const v = Number(num[1])
          if (v !== 0 && !RADII.includes(v)) {
            found.push({ file, line: ln, rule: 'radius-escala', detail: `${v}px fora da escala (${RADII.join(' ')})` })
          }
        }
      }

      // espaçamento fora do ritmo par (1px é hairline legítimo).
      // Decimal também reprova — meio pixel não é ritmo nenhum.
      const sp = /\b(padding|margin|gap|row-gap|column-gap|(?:padding|margin)-(?:top|right|bottom|left|inline|block))\s*:\s*([^;{}]+);/g
      for (const m of line.matchAll(sp)) {
        const value = m[2]!
        if (value.includes('var(') || value.includes('calc(')) continue
        for (const num of value.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)px/g)) {
          const v = Number(num[1])
          if (!Number.isInteger(v)) {
            found.push({ file, line: ln, rule: 'espacamento-ritmo', detail: `${m[1]}: ${v}px não é inteiro` })
          } else if (v % 2 === 1 && v > 1) {
            found.push({ file, line: ln, rule: 'espacamento-ritmo', detail: `${m[1]}: ${v}px quebra o ritmo par` })
          }
        }
      }

      // seletor de tema escuro (`.dark .x`, `html.dark …`).
      // A lookahead precisa aceitar `,` `:` `{` e fim de linha, senão `.dark{`,
      // `.dark, .b {` e `.dark:hover` escapavam — só `.dark .x` era pego.
      // O `(^|[\s,>+~])` na frente continua excluindo `.x.dark`, que é variante
      // de componente e é permitida (ver AppSyncStatus).
      for (const m of line.matchAll(/(^|[\s,>+~])(html)?\.dark(?=[\s,>+~:{]|$)/g)) {
        found.push({ file, line: ln, rule: 'dark-mode-removido', detail: `seletor de tema "${m[0].trim()}" — dark mode foi removido` })
      }
    })
  }
}

// ── Regras com baseline ─────────────────────────────────────────────────────
function countColorLiterals(src: string): number {
  let n = 0
  for (const { text } of styleBlocks(src)) {
    const css = stripComments(text)
    n += (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length
    n += (css.match(/rgba?\(\s*\d/g) ?? []).length
  }
  return n
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu

/**
 * Conta emoji em NÓS DE TEXTO do template.
 *
 * Comentários `<!-- … -->` e valores de atributo (`title="a → b"`) são prosa,
 * não ícone estrutural — precisam sair antes, senão viram falso positivo (foi
 * o que aconteceu com as setas em BoardColumn/trabalho/AgendaMonth).
 */
function countEmoji(src: string): number {
  const tpl = templateBlock(src)
  if (!tpl) return 0
  const text = tpl.text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/=\s*"[^"]*"/g, '=""')
    .replace(/=\s*'[^']*'/g, "=''")
  return (text.match(EMOJI) ?? []).length
}

// ── Main ────────────────────────────────────────────────────────────────────
export type Report = {
  violations: Finding[]
  overBaseline: { file: string; kind: string; count: number; allowed: number }[]
  improved: { file: string; kind: string; count: number; allowed: number }[]
  counts: Record<string, Record<string, number>>
  /**
   * Todo arquivo varrido, tenha ele achado algo ou não.
   *
   * `counts` só registra contagem não-zero, então não serve para afirmar
   * "packages/ui está no escopo": no dia em que a dívida de cor do package
   * zerar, o package sumiria de `counts` e o teste de escopo quebraria sem
   * nada estar errado.
   */
  files: string[]
}

/**
 * Diretórios varridos por padrão: o app E o design system em packages/ui.
 * Se esquecer o segundo, os ~37 componentes que moraram no package saem
 * silenciosamente da fiscalização — que é exatamente onde as regras mais
 * importam.
 */
const DEFAULT_DIRS = [join(ROOT, 'app'), join(ROOT, 'packages/ui/app')]

/**
 * @param dirs    raízes a varrer (default: app/ + packages/ui/app/)
 * @param baseDir raiz para os caminhos relatados — precisa bater com as chaves
 *                do baseline. Nos testes com fixture, passe o próprio tmpdir.
 */
export function run(dirs: string | string[] = DEFAULT_DIRS, baseDir = ROOT): Report {
  const roots = (Array.isArray(dirs) ? dirs : [dirs]).filter((d) => existsSync(d))
  const baseline: Record<string, Record<string, number>> = JSON.parse(
    readFileSync(BASELINE_PATH, 'utf8'),
  )
  const violations: Finding[] = []
  const counts: Record<string, Record<string, number>> = { color: {}, emoji: {} }

  const all = roots.flatMap((r) => vueFiles(r)).sort()
  const files: string[] = []
  for (const full of all) {
    const file = relative(baseDir, full)
    files.push(file)
    const src = readFileSync(full, 'utf8')
    checkScales(file, src, violations)
    const c = countColorLiterals(src)
    const e = countEmoji(src)
    if (c) counts.color![file] = c
    if (e) counts.emoji![file] = e
  }

  const overBaseline: Report['overBaseline'] = []
  const improved: Report['improved'] = []
  for (const kind of ['color', 'emoji'] as const) {
    const base = baseline[kind] ?? {}
    for (const [file, count] of Object.entries(counts[kind]!)) {
      const allowed = base[file] ?? 0
      if (count > allowed) overBaseline.push({ file, kind, count, allowed })
    }
    for (const [file, allowed] of Object.entries(base)) {
      const count = counts[kind]![file] ?? 0
      if (count < allowed) improved.push({ file, kind, count, allowed })
    }
  }

  return { violations, overBaseline, improved, counts, files }
}

/** `--update-baseline` regrava o teto com a contagem atual. */
function writeBaseline(counts: Report['counts']) {
  const sorted: Record<string, Record<string, number>> = {}
  for (const kind of Object.keys(counts)) {
    sorted[kind] = Object.fromEntries(Object.entries(counts[kind]!).sort())
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`)
}

const isMain = process.argv[1]?.endsWith('check-tokens.ts')
if (isMain) {
  if (process.argv.includes('--update-baseline')) {
    const { counts } = run()
    writeBaseline(counts)
    console.log(`baseline regravado em ${relative(ROOT, BASELINE_PATH)}`)
    process.exit(0)
  }

  const { violations, overBaseline, improved } = run()

  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`)
  }
  for (const o of overBaseline) {
    console.error(
      `  ${o.file}  [${o.kind}] ${o.count} ocorrência(s), teto do baseline é ${o.allowed}`,
    )
  }
  for (const i of improved) {
    console.warn(
      `  aviso: ${i.file} caiu para ${i.count} [${i.kind}] (teto ${i.allowed}) — rode ` +
        `\`pnpm lint:tokens --update-baseline\` para travar o ganho`,
    )
  }

  const failures = violations.length + overBaseline.length
  if (failures > 0) {
    console.error(`\n✖ check-tokens: ${failures} problema(s). Ver design-system/MASTER.md.`)
    process.exit(1)
  }
  console.log('✔ check-tokens: escalas fechadas OK, dívida dentro do baseline.')
}
