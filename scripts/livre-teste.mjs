// Teste do layout livre de imagens: arrasta e redimensiona na prévia, depois exporta PDF e Word.
// Uso: node scripts/livre-teste.mjs [url] [pasta-saida]
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173/?demo'
const saida = process.argv[3] ?? '.'

const navegador = await chromium.launch({ channel: 'msedge' })
const pagina = await (await navegador.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } })).newPage()
pagina.on('pageerror', (e) => console.error('erro na página:', e.message))
await pagina.goto(url)
await pagina.getByRole('tab', { name: /^Anomalias/ }).click()

// duas imagens fictícias
await pagina.evaluate(async () => {
  const gerar = async (l, a, rotulo, cor) => {
    const c = Object.assign(document.createElement('canvas'), { width: l, height: a })
    const g = c.getContext('2d')
    g.fillStyle = cor
    g.fillRect(0, 0, l, a)
    g.fillStyle = '#000'
    g.font = 'bold 40px Arial'
    g.fillText(rotulo, 30, 70)
    return new File([await new Promise((r) => c.toBlob(r, 'image/png'))], `${rotulo}.png`, { type: 'image/png' })
  }
  const zona = document.querySelector('.zona-solta')
  for (const f of [await gerar(1400, 450, 'IMAGEM A', '#ffe9a6'), await gerar(600, 600, 'IMAGEM B', '#bfe6c8')]) {
    const dt = new DataTransfer()
    dt.items.add(f)
    zona.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise((r) => setTimeout(r, 600))
  }
})

await pagina.getByRole('tab', { name: 'Posição livre' }).click()
const area = pagina.locator('.tela .area-livre').first()
await area.scrollIntoViewIfNeeded()
const pecas = area.locator('.peca')
const caixa = await area.boundingBox()

// A: arrasta para baixo e para a direita
const a = await pecas.nth(0).boundingBox()
await pagina.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
await pagina.mouse.down()
await pagina.mouse.move(a.x + a.width / 2 + caixa.width * 0.2, a.y + a.height / 2 + caixa.height * 0.45, { steps: 8 })
await pagina.mouse.up()

// B: redimensiona pelo canto (aumenta)
const b = await pecas.nth(1).boundingBox()
await pagina.mouse.move(b.x + b.width / 2, b.y + b.height / 2) // mostra a alça
const alca = await pecas.nth(1).locator('.alca').boundingBox()
await pagina.mouse.move(alca.x + alca.width / 2, alca.y + alca.height / 2)
await pagina.mouse.down()
await pagina.mouse.move(alca.x + caixa.width * 0.1, alca.y - caixa.height * 0.1, { steps: 8 })
await pagina.mouse.up()

const estilos = await pecas.evaluateAll((els) => els.map((e) => e.getAttribute('style')))
console.log('posições depois do arraste:', estilos)
await pagina.screenshot({ path: `${saida}/livre-tela.png` })

const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Exportar Word' }).click()])
await download.saveAs(`${saida}/livre.docx`)
await pagina.emulateMedia({ media: 'print' })
await pagina.pdf({ path: `${saida}/livre.pdf`, preferCSSPageSize: true, printBackground: true })
console.log('ok: livre.docx e livre.pdf')
await navegador.close()
