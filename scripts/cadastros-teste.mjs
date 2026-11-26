// Teste dos requisitos novos: Cadastros (importar a planilha do GUT e ver os critérios no GUT da anomalia),
// observações, conclusão desejada, Resumo, busca de relatórios e Excel de resumo.
// Uso: node scripts/cadastros-teste.mjs <planilha-gut.xlsx> [pasta-quadros]
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const [planilha, pasta] = process.argv.slice(2)
if (pasta) await mkdir(`${pasta}/quadros`, { recursive: true })
const nav = await chromium.launch({ channel: 'msedge' })
const ctx = await nav.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
const pg = await ctx.newPage()
pg.on('pageerror', (e) => console.error('erro na página:', e.message))
await pg.addInitScript(() => localStorage.setItem('vibdocs.tema', 'escuro'))
await pg.goto('http://localhost:5173/?demo')
await pg.locator('.so-impressao .pagina').first().waitFor({ state: 'attached' })
let n = 0
const foto = async (k = 1) => {
  for (let i = 0; i < k; i++) {
    if (pasta) await pg.screenshot({ path: `${pasta}/quadros/cad-${String(n++).padStart(3, '0')}.png` })
    await pg.waitForTimeout(90)
  }
}
const falha = (m) => {
  console.error('FALHOU:', m)
  process.exitCode = 1
}

// 1) Cadastros › Critérios do GUT: importar e salvar
await pg.getByRole('button', { name: 'Cadastros' }).click()
await pg.getByLabel('Planilha do GUT').setInputFiles(planilha)
await pg.getByRole('button', { name: /Desalinhamento de eixos/ }).waitFor()
await foto(4)
await pg.locator('fieldset button', { hasText: /^Salvar/ }).first().click()
await pg.getByText(/Em uso: .*modos/).waitFor()
await foto(2)

// 2) GUT da anomalia mostra o significado das notas
await pg.getByRole('button', { name: 'Início' }).click()
await pg.locator('.cartao-usina').first().click()
await pg.getByRole('tab', { name: /^Anomalias/ }).click()
await pg.getByRole('button', { name: 'Calcular GUT' }).click()
await pg.locator('.gut .seletor-botao').first().click()
await pg.locator('li[role=option]', { hasText: 'Desalinhamento de eixos' }).click()
await pg.locator('.gut [role=radiogroup][aria-label="G"] button').nth(3).click()
await pg.locator('.gut [role=radiogroup][aria-label="U"] button').nth(3).click()
await pg.locator('.gut [role=radiogroup][aria-label="T"] button').nth(2).click()
await pg.locator('.gut').scrollIntoViewIfNeeded()
await foto(4)
const desc = await pg.locator('.gut-desc').first().innerText()
if (!/Velocidade em RMS entre 6,1/.test(desc)) falha(`descrição da nota G=4 não apareceu (${desc})`)
await pg.locator('.gut-tabela summary').click()
await foto(3)

// 3) observações e conclusão desejada na prévia
await pg.getByLabel(/Observações adicionais/).fill('Inspeção sensitiva: ruído no mancal LA (teste).')
await pg.waitForTimeout(400)
const previa = await pg.locator('.so-impressao').innerText()
if (!previa.includes('Observações adicionais')) falha('quadro de observações não saiu na prévia')
if (!/Conclusão desejada:/.test(previa)) falha('conclusão desejada não saiu na prévia')

// 4) Resumo / Definição da atividade
await pg.getByRole('tab', { name: /^Relatório/ }).click()
await pg.getByText('Incluir as seções “Resumo” e “Definição da atividade”').click()
await pg.locator('label', { hasText: /^Resumo/ }).locator('textarea').fill('Resumo de teste da rota de {area}.')
await pg.waitForTimeout(400)
if (!(await pg.locator('.so-impressao').innerText()).includes('Resumo de teste da rota de AAA.')) falha('resumo não saiu na prévia')
await foto(3)

// 5) busca de relatórios e Excel
await pg.waitForTimeout(1800) // salvamento automático
await pg.getByRole('button', { name: 'Relatórios', exact: true }).click()
await pg.locator('.rel-cartao').first().waitFor()
await pg.getByLabel('Buscar relatórios').fill('REDUTOR')
await pg.getByText(/Histórico do equipamento/).waitFor()
await foto(4)
const [baixado] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: /Exportar resumo em Excel/ }).click()])
console.log('excel:', baixado.suggestedFilename())
console.log(process.exitCode ? 'com falhas' : 'ok: cadastros, GUT, observações, conclusão, resumo, busca e excel')
await nav.close()
