// Teste do perfil com selo: modo manual (planilha fictícia), cria conta com telefone, ART e selo,
// confere que vão para o relatório e exporta PDF e Word.
// Uso: node scripts/perfil-teste.mjs [url-base] [pasta-saida]
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://localhost:5173/'
const saida = process.argv[3] ?? '.'
const planilha = await readFile(new URL('./fixtures/controle-ficticio.xlsx', import.meta.url))

const navegador = await chromium.launch({ channel: 'msedge' })
const pagina = await (await navegador.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } })).newPage()
pagina.on('pageerror', (e) => console.error('erro na página:', e.message))
await pagina.goto(base)

// selo fictício gerado no navegador
const selo = await pagina.evaluate(async () => {
  const c = Object.assign(document.createElement('canvas'), { width: 520, height: 200 })
  const g = c.getContext('2d')
  g.fillStyle = '#1f3864'
  g.fillRect(0, 0, 520, 200)
  g.fillStyle = '#ffc20e'
  g.fillRect(0, 0, 520, 40)
  g.fillStyle = '#fff'
  g.font = 'bold 34px Arial'
  g.fillText('SELO DE TESTE', 30, 120)
  g.font = '20px Arial'
  g.fillText('Vibration Analyst (fictício)', 30, 160)
  return c.toDataURL('image/png').split(',')[1]
})

await pagina.locator('input[type=file][accept=".xlsx"]').setInputFiles({ name: 'Planilha de Controle Mineração - Novembro 2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: planilha })
await pagina.getByRole('heading', { name: 'Primeira conta' }).waitFor()
const campo = (rotulo) => pagina.locator('label', { hasText: rotulo }).locator('input').first()
await campo('Nome de exibição').fill('Teste Perfil')
await campo('E-mail').fill('teste@exemplo.com')
await campo('Nome completo').fill('Teste Perfil da Silva')
await campo('Telefone').fill('+55 31 0000-0000')
await campo('ART').fill('ART-TESTE-123')
await pagina.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'selo.png', mimeType: 'image/png', buffer: Buffer.from(selo, 'base64') })
await pagina.locator('img[alt="Selo de certificação"]').waitFor()
const senhas = pagina.locator('input[type=password]')
await senhas.nth(0).fill('vd-teste-77')
await senhas.nth(1).fill('vd-teste-77')
await pagina.getByRole('button', { name: 'Criar e entrar' }).click()
await pagina.locator('.so-impressao .pagina').first().waitFor({ state: 'attached' })

const texto = await pagina.locator('.so-impressao').innerText()
const verificar = {
  equipe: texto.includes('Teste Perfil da Silva'),
  telefone: texto.includes('+55 31 0000-0000'),
  email: texto.includes('teste@exemplo.com'),
  art: texto.includes('ART: ART-TESTE-123'),
  selo: (await pagina.locator('.so-impressao img[alt="Selo de certificação"]').count()) > 0,
}
console.log('no relatório:', verificar)

const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Exportar Word' }).click()])
await download.saveAs(`${saida}/perfil.docx`)
await pagina.emulateMedia({ media: 'print' })
await pagina.pdf({ path: `${saida}/perfil.pdf`, preferCSSPageSize: true, printBackground: true })
console.log('ok: perfil.pdf e perfil.docx')
await navegador.close()
