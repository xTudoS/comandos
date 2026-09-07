import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run } from '../../scripts/check-tokens'

/**
 * Guard do design system. Espelha `eslintNoRawDbUpdate.test.ts`: além de rodar
 * a regra contra o repositório real, prova com fixtures que ela realmente
 * reprova o que deveria — senão um guard quebrado passaria despercebido.
 */

function fixture(vue: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'check-tokens-'))
  mkdirSync(join(dir, 'sub'), { recursive: true })
  writeFileSync(join(dir, 'sub', 'Fixture.vue'), vue)
  return dir
}

const rules = (dir: string) => run(dir, dir).violations.map((v) => v.rule)

describe('check-tokens — escalas fechadas', () => {
  it('reprova font-size fora da escala', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{font-size:23px;}</style>')
    expect(rules(dir)).toContain('font-size-escala')
  })

  it('aceita font-size dentro da escala', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{font-size:13px;}</style>')
    expect(rules(dir)).not.toContain('font-size-escala')
  })

  it('reprova border-radius fora da escala', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{border-radius:9px;}</style>')
    expect(rules(dir)).toContain('radius-escala')
  })

  it('não reclama de border-radius: 50% nem de valores compostos', () => {
    const dir = fixture(
      '<template><i/></template><style scoped>.a{border-radius:50%;}.b{border-radius:var(--radius) var(--radius) 0 0;}</style>',
    )
    expect(rules(dir)).not.toContain('radius-escala')
  })

  it('reprova espaçamento ímpar', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{padding:7px 10px;}</style>')
    expect(rules(dir)).toContain('espacamento-ritmo')
  })

  it('permite 1px (hairline) e ignora var()/calc()', () => {
    const dir = fixture(
      '<template><i/></template><style scoped>.a{padding:1px;}.b{gap:var(--sp-3);}.c{margin:calc(50% - 3px);}</style>',
    )
    expect(rules(dir)).not.toContain('espacamento-ritmo')
  })

  it('reprova seletor de tema .dark', () => {
    const dir = fixture('<template><i/></template><style scoped>.dark .a{color:red;}</style>')
    expect(rules(dir)).toContain('dark-mode-removido')
  })

  it('permite .x.dark — variante de componente, não tema (ver AppSyncStatus)', () => {
    const dir = fixture('<template><i/></template><style scoped>.spinner.dark{color:red;}</style>')
    expect(rules(dir)).not.toContain('dark-mode-removido')
  })

  // Os três buracos abaixo passaram despercebidos até a revisão do PR #1: as
  // regex exigiam a forma mais simples de cada declaração, então qualquer
  // variação escapava. Eram 70 font-sizes decimais no projeto sem ninguém ver.
  it('pega font-size decimal (não só inteiro)', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{font-size:12.5px;}</style>')
    expect(rules(dir)).toContain('font-size-escala')
  })

  it('pega valor fora da escala dentro de border-radius composto', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{border-radius:6px 6px 3px 3px;}</style>')
    expect(rules(dir)).toContain('radius-escala')
  })

  it('aceita 0 dentro de border-radius composto', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{border-radius:18px 18px 0 0;}</style>')
    expect(rules(dir)).not.toContain('radius-escala')
  })

  it.each(['.dark{', '.dark, .b {', '.dark:hover {', '.dark .a {'])(
    'pega o seletor de tema %s',
    (sel) => {
      const dir = fixture(`<template><i/></template><style scoped>${sel}color:red;}</style>`)
      expect(rules(dir)).toContain('dark-mode-removido')
    },
  )

  it('pega espaçamento decimal', () => {
    const dir = fixture('<template><i/></template><style scoped>.a{padding:2.5px;}</style>')
    expect(rules(dir)).toContain('espacamento-ritmo')
  })

  it('ignora o que está dentro de comentário CSS', () => {
    const dir = fixture(
      '<template><i/></template><style scoped>/* .dark .a{font-size:23px;padding:7px} */</style>',
    )
    expect(rules(dir)).toHaveLength(0)
  })
})

describe('check-tokens — contagem com baseline', () => {
  it('conta hex e rgba crus no <style>', () => {
    const dir = fixture(
      '<template><i/></template><style scoped>.a{color:#ff0000;background:rgba(0,0,0,.5);}</style>',
    )
    expect(run(dir, dir).counts.color!['sub/Fixture.vue']).toBe(2)
  })

  it('não conta cor em comentário', () => {
    const dir = fixture('<template><i/></template><style scoped>/* #ff0000 */</style>')
    expect(run(dir, dir).counts.color!['sub/Fixture.vue']).toBeUndefined()
  })

  it('conta emoji em nó de texto do template', () => {
    const dir = fixture('<template><span>⬆</span></template><style scoped></style>')
    expect(run(dir, dir).counts.emoji!['sub/Fixture.vue']).toBe(1)
  })

  it('não conta emoji em comentário nem em valor de atributo', () => {
    const dir = fixture(
      '<template><!-- seta → aqui --><b title="a → b" aria-label="x → y">ok</b></template><style scoped></style>',
    )
    expect(run(dir, dir).counts.emoji!['sub/Fixture.vue']).toBeUndefined()
  })
})

describe('check-tokens — repositório', () => {
  it('as escalas fechadas estão em zero e a dívida está dentro do baseline', () => {
    const { violations, overBaseline } = run()
    expect({
      violations: violations.map((v) => `${v.file}:${v.line} ${v.rule} — ${v.detail}`),
      overBaseline,
    }).toEqual({ violations: [], overBaseline: [] })
  })

  it('varre packages/ui, não só app/', () => {
    // O design system virou um Nuxt Layer. Se alguém restringir o scan de volta
    // a `app/`, os ~37 componentes do package saem da fiscalização sem barulho
    // — e é justamente neles que as regras mais importam.
    //
    // Afirma sobre `files` (tudo que foi varrido), NÃO sobre `counts`, que só
    // guarda contagem não-zero: quando a dívida de cor do package zerar, ele
    // sumiria de `counts` e este teste quebraria sem nada estar errado.
    const { files } = run()
    expect(files.some((f) => f.startsWith('packages/ui/'))).toBe(true)
    expect(files.some((f) => f.startsWith('app/'))).toBe(true)
  })
})
