// Gera o PDF da demonstração com o Edge instalado, do mesmo jeito que o botão "Exportar PDF".
// Uso: node scripts/pdf-teste.mjs [url] [saida.pdf]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173/?demo'
const saida = process.argv[3] ?? 'teste-vibdocs.pdf'

const navegador = await chromium.launch({ channel: 'msedge' })
const pagina = await navegador.newPage()
pagina.on('pageerror', (e) => console.error('erro na página:', e.message))
await pagina.goto(url)
await pagina.waitForSelector('.so-impressao .pagina', { state: 'attached', timeout: 15000 })
await pagina.emulateMedia({ media: 'print' })
await pagina.pdf({ path: saida, preferCSSPageSize: true, printBackground: true })
const n = await pagina.locator('.so-impressao .pagina').count()
console.log(`ok: ${n} páginas de relatório → ${saida}`)
await navegador.close()
