// Teste do Banco de vibração: abre um .mdb do Omnitrend, mostra uma máquina (tendência e espectro),
// vincula a uma TAG da demonstração e volta pelo botão "Banco" do equipamento.
// Uso: node scripts/banco-teste.mjs <arquivo.mdb> [nome-da-maquina] [pasta-quadros]
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const [arquivo, nomeMaq = 'BOMBA-PRESSAO-1', pasta] = process.argv.slice(2)
if (pasta) await mkdir(`${pasta}/quadros`, { recursive: true })
const nav = await chromium.launch({ channel: 'msedge' })
const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } })
pg.on('pageerror', (e) => console.error('erro na página:', e.message))
await pg.addInitScript(() => localStorage.setItem('vibdocs.tema', 'escuro'))
await pg.goto('http://localhost:5173/?demo')
await pg.locator('.so-impressao .pagina').first().waitFor({ state: 'attached' })
let n = 0
const foto = async (k = 1) => {
  for (let i = 0; i < k; i++) {
    if (pasta) await pg.screenshot({ path: `${pasta}/quadros/banco-${String(n++).padStart(3, '0')}.png` })
    await pg.waitForTimeout(80)
  }
}
const falha = (m) => {
  console.error('FALHOU:', m)
  process.exitCode = 1
}

await pg.getByRole('button', { name: 'Banco de vibração' }).click()
await pg.getByLabel('Arquivo do banco Omnitrend').setInputFiles(arquivo)
const t0 = Date.now()
await pg.locator('.banco-arvore').waitFor({ timeout: 120000 })
console.log(`banco aberto no navegador em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await foto(4)
await pg.locator('.banco-arvore input').fill(nomeMaq)
await foto(3)
await pg.locator('.banco-maq', { hasText: nomeMaq }).first().click()
await pg.locator('.grafico-banco svg').first().waitFor()
await pg.waitForTimeout(600)
await foto(4)
const linhasTend = await pg.locator('.grafico-banco').first().locator('polyline').count()
if (!linhasTend) falha('tendência sem linhas')
await pg.locator('.grafico-banco').first().hover({ position: { x: 500, y: 120 } })
await foto(3)
await pg.locator('.grafico-banco').nth(1).scrollIntoViewIfNeeded()
await pg.locator('.grafico-banco').nth(1).hover({ position: { x: 200, y: 150 } })
await foto(4)
if (!(await pg.locator('.grafico-banco').nth(1).locator('polyline').count())) falha('espectro sem curva')

// vincular a uma TAG da demonstração
await pg.locator('.cartao-inicio').first().scrollIntoViewIfNeeded()
await pg.getByRole('button', { name: /Vincular a uma TAG/ }).click()
await foto(3)
await pg.locator('.banco-escolha .linha-recente', { hasText: 'VM52-DEMO-AAA-010' }).click()
await pg.locator('.banco-tag', { hasText: 'VM52-DEMO-AAA-010' }).waitFor()
await foto(5)

// o gráfico de tendência vai para a página da TAG no relatório aberto
await pg.getByRole('button', { name: 'Enviar ao relatório' }).first().click()
await pg.getByText(/Gráfico colocado na página de VM52-DEMO-AAA-010/).waitFor({ timeout: 15000 })
await foto(3)

// volta pelo equipamento: Início → relatório → Equipamentos → botão Banco
await pg.getByRole('button', { name: 'Início' }).click()
await pg.locator('.cartao-usina').first().click()
await pg.getByRole('tab', { name: /^Equipamentos/ }).click()
await pg.getByRole('tab', { name: /^Todos/ }).click()
const linha = pg.locator('tr[data-local-eq="VM52-DEMO-AAA-010"]')
await linha.hover()
await linha.getByRole('button', { name: 'Banco' }).click()
try {
  await pg.locator('.banco-maq.on', { hasText: nomeMaq }).waitFor({ timeout: 20000 })
} catch (e) {
  await pg.screenshot({ path: `${pasta ?? '.'}/banco-falha.png` })
  console.error('FALHA ao voltar pelo botão Banco. Tela:', (await pg.locator('main').innerText()).slice(0, 300).split(String.fromCharCode(10)).join(' | '))
  throw e
}
await foto(5)
console.log(process.exitCode ? 'com falhas' : 'ok: banco, gráficos e vínculo')
await nav.close()
