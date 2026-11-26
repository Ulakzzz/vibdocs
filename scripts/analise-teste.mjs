// Teste: condição "A analisar" (seletor novo), lista de anomalias com caixa, GUT definindo a condição,
// botão Finalizar / páginas preenchidas e o Histórico preditivo com dados FICTÍCIOS cifrados
// (gerados por scripts/criar-hp-teste.mjs, senha de teste). Uso: node scripts/analise-teste.mjs [pasta-quadros]
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'

// dados fictícios cifrados do Histórico preditivo (gerados uma vez)
if (!existsSync(new URL('./fixtures/hp-teste/dados/manifest.json', import.meta.url)))
  execFileSync(process.execPath, [new URL('./criar-hp-teste.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'inherit' })

const pasta = process.argv[2]
if (pasta) await mkdir(`${pasta}/quadros`, { recursive: true })
const nav = await chromium.launch({ channel: 'msedge' })
const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } })
pg.on('pageerror', (e) => console.error('erro na página:', e.message))
await pg.addInitScript(() => localStorage.setItem('vibdocs.tema', 'escuro'))
await pg.goto('http://localhost:5173/?demo&hp=/scripts/fixtures/hp-teste/dados/')
await pg.locator('.so-impressao .pagina').first().waitFor({ state: 'attached' })
const n = {}
const foto = async (id, k = 1) => {
  for (let i = 0; i < k; i++) {
    n[id] ??= 0
    if (pasta) await pg.screenshot({ path: `${pasta}/quadros/${id}-${String(n[id]++).padStart(3, '0')}.png` })
    await pg.waitForTimeout(70)
  }
}
const falha = (m) => {
  console.error('FALHOU:', m)
  process.exitCode = 1
}
const cartao = async () => (await pg.locator('.numero', { hasText: 'Páginas preenchidas' }).locator('.odometro').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))).join('/')

// 1) BOMBA-B → "A analisar" pelo seletor novo
await pg.getByRole('tab', { name: /^Equipamentos/ }).click()
const linha = pg.locator('tr[data-local-eq="VM52-DEMO-AAA-020"]')
await foto('condicao', 2)
await linha.locator('.seletor-condicao button').first().click()
await foto('condicao', 5)
await pg.locator('li[role=option]', { hasText: 'A analisar' }).click()
await foto('condicao', 6)
if (!(await linha.locator('.a-analisar').count())) falha('não ficou "a analisar"')
const antes = await cartao()

// 2) aparece nas anomalias com caixa marcada; desmarcar tira, marcar volta
await pg.getByRole('tab', { name: /^Anomalias/ }).click()
const item = pg.locator('.anom-linha', { hasText: 'VM52-DEMO-AAA-020' })
await item.waitFor()
const caixa = item.locator('input[type=checkbox]')
if (!(await caixa.isChecked())) falha('a analisar não veio marcado')
await caixa.uncheck()
if (!(await item.evaluate((e) => e.classList.contains('tirado')))) falha('desmarcar não tirou')
await caixa.check()
await item.locator('.anom-item').click()
await foto('gut', 3)

// 3) GUT: calcular → modo + notas → condição vira Alerta (3)
await pg.getByRole('button', { name: 'Calcular GUT' }).click()
await pg.locator('.gut .seletor-botao').first().click()
await pg.locator('li[role=option]', { hasText: 'Rolamento' }).click()
for (const [l, v] of [
  ['G', 4],
  ['U', 4],
  ['T', 3],
]) {
  await pg.locator(`.gut [role=radiogroup][aria-label="${l}"] button`).nth(v - 1).click()
  await foto('gut', 3)
}
await foto('gut', 4)
const chip = await pg.locator('.anom-linha', { hasText: 'VM52-DEMO-AAA-020' }).locator('.chip').innerText()
if (chip.trim() !== '3') falha(`GUT não definiu a condição (chip ${chip})`)

// 4) Finalizar → páginas preenchidas sobe
await pg.getByRole('button', { name: 'Finalizar' }).click()
await foto('gut', 5)
const depois = await cartao()
if (antes === depois) falha(`contador não mudou (${antes})`)
console.log('páginas preenchidas:', antes, '→', depois)

// 5) remover GUT
await pg.getByRole('button', { name: 'Remover GUT' }).click()
if (!(await pg.getByRole('button', { name: 'Calcular GUT' }).count())) falha('Remover GUT não funcionou')

// 6) Histórico preditivo: senha errada, depois a de teste; busca pelo equipamento
await pg.locator('.anom-linha', { hasText: 'VM52-DEMO-AAA-090' }).locator('.anom-item').click()
await pg.getByRole('button', { name: 'Relatórios antigos' }).click()
await pg.getByLabel('Senha do Histórico Preditivo').fill('errada')
await pg.locator('form button[type=submit]').click()
await pg.getByText('Senha incorreta.').waitFor({ timeout: 20000 })
await pg.getByLabel('Senha do Histórico Preditivo').fill('teste-vibdocs-hp')
await foto('historico', 2)
await pg.locator('form button[type=submit]').click()
await pg.locator('.hp-barra').waitFor({ timeout: 30000 })
await foto('historico', 3)
await pg.locator('.hp-sugestao', { hasText: 'VIB_DEMO_REDUTOR-1' }).click()
await foto('historico', 8)
const qtd = await pg.locator('.hp-item').count()
if (qtd !== 3) falha(`esperava 3 relatórios antigos do redutor, veio ${qtd}`)
await pg.getByRole('tab', { name: 'Termografia' }).click()
await pg.locator('.hp-barra input').fill('')
await foto('historico', 4)
if ((await pg.locator('.hp-item').count()) !== 1) falha('filtro termografia')

console.log(process.exitCode ? 'com falhas' : 'ok: a analisar, GUT, finalizar e histórico preditivo')
await nav.close()
