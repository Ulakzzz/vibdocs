// Teste da paleta (Ctrl+K) e do desfazer/refazer na demonstração. Grava quadros se receber uma pasta.
// Uso: node scripts/paleta-teste.mjs [url] [pasta-quadros]
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173/?demo'
const pasta = process.argv[3]
if (pasta) await mkdir(`${pasta}/quadros`, { recursive: true })
const nav = await chromium.launch({ channel: 'msedge' })
const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } })
pg.on('pageerror', (e) => console.error('erro na página:', e.message))
await pg.addInitScript(() => localStorage.setItem('vibdocs.tema', 'escuro'))
await pg.goto(url)
await pg.locator('.so-impressao .pagina').first().waitFor({ state: 'attached' })
const n = { paleta: 0, desfazer: 0 }
const foto = async (id, k = 1) => {
  for (let i = 0; i < k; i++) {
    if (pasta) await pg.screenshot({ path: `${pasta}/quadros/${id}-${String(n[id]++).padStart(3, '0')}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
    await pg.waitForTimeout(60)
  }
}
const falha = (m) => {
  console.error('FALHOU:', m)
  process.exitCode = 1
}

// 1) Ctrl+K → "redutor" → Enter abre a anomalia do redutor
await foto('paleta', 3)
await pg.keyboard.press('Control+k')
await pg.locator('.paleta').waitFor()
await foto('paleta', 4)
for (const ch of 'redutor') {
  await pg.keyboard.type(ch)
  await foto('paleta')
}
await foto('paleta', 4)
await pg.keyboard.press('Enter')
await foto('paleta', 8)
if (!(await pg.getByText('VM52-DEMO-AAA-090').first().isVisible())) falha('anomalia do redutor não abriu')
if ((await pg.locator('.paleta').count()) !== 0) falha('paleta não fechou')

// 2) Ctrl+K → "bomba-b" → mostra a linha na aba Equipamentos
await pg.keyboard.press('Control+k')
await pg.keyboard.type('bomba b')
await foto('paleta', 4)
await pg.keyboard.press('Enter')
await foto('paleta', 10)
if (!(await pg.locator('tr.piscar[data-local-eq="VM52-DEMO-AAA-020"]').count())) falha('linha da BOMBA-B não foi destacada')

// 3) desfazer / refazer: muda a condição, Ctrl+Z volta, Ctrl+Y refaz
const linha = pg.locator('tr[data-local-eq="VM52-DEMO-AAA-020"]')
const cond = async () => (await linha.locator('.seletor-condicao button').first().getAttribute('aria-label')).replace('Condição: ', '')
const antes = await cond()
await foto('desfazer', 3)
await linha.locator('.seletor-condicao button').first().click()
await pg.locator('li[role=option]', { hasText: 'Alarme' }).click()
await foto('desfazer', 6)
if ((await cond()) !== 'Alarme') falha('condição não mudou')
await pg.locator('body').click({ position: { x: 700, y: 870 } })
await pg.keyboard.press('Control+z')
await foto('desfazer', 8)
if ((await cond()) !== antes) falha(`Ctrl+Z não voltou (${await cond()} ≠ ${antes})`)
await pg.keyboard.press('Control+y')
await foto('desfazer', 4)
if ((await cond()) !== 'Alarme') falha('Ctrl+Y não refez')
await pg.getByRole('button', { name: 'Desfazer', exact: true }).first().click()
await foto('desfazer', 8)
if ((await cond()) !== antes) falha('botão Desfazer não voltou')

console.log(process.exitCode ? 'com falhas' : 'ok: paleta e desfazer')
await nav.close()
