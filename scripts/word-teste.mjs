// Gera um .docx da demonstração (com texto e uma imagem fictícia) pelo Edge, clicando em "Exportar Word".
// Uso: node scripts/word-teste.mjs [url] [saida.docx] [modelo.docx]
// Com modelo, o .docx é carregado na aba Relatório e o Word sai preenchido dentro dele.
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173/?demo'
const saida = process.argv[3] ?? 'teste-vibdocs.docx'
const modelo = process.argv[4]

const navegador = await chromium.launch({ channel: 'msedge' })
const pagina = await (await navegador.newContext({ acceptDownloads: true })).newPage()
pagina.on('pageerror', (e) => console.error('erro na página:', e.message))
await pagina.goto(url)
if (modelo) {
  await pagina.getByRole('tab', { name: /^Relatório/ }).click()
  await pagina.getByLabel('Arquivo do modelo do Word').setInputFiles(modelo)
  await pagina.locator('[data-modelo]').waitFor()
}
await pagina.getByRole('tab', { name: /^Anomalias/ }).click()

// Eixo 01: texto padrão + observação do técnico
await pagina.locator('select').filter({ hasText: 'falha / texto padrão' }).first().selectOption('folga-rotativa')
await pagina.getByPlaceholder('Texto livre').first().fill('Lado direito sentido fluxo (texto de teste).')
await pagina.getByRole('button', { name: 'Adicionar parte' }).click()
await pagina.locator('select').filter({ hasText: 'falha / texto padrão' }).nth(1).selectOption('normal')

// Duas imagens fictícias: tendência (larga) e foto (alta, para testar o ajuste)
await pagina.evaluate(async () => {
  const gerar = async (l, a, rotulo, cor) => {
    const c = Object.assign(document.createElement('canvas'), { width: l, height: a })
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, l, a)
    g.strokeStyle = cor
    g.lineWidth = 4
    g.beginPath()
    for (let x = 0; x < l; x += 8) g.lineTo(x, a - 30 - ((x / l) ** 3) * (a - 60) - Math.random() * 20)
    g.stroke()
    g.fillStyle = '#000'
    g.font = '28px Arial'
    g.fillText(rotulo, 20, 40)
    return new File([await new Promise((r) => c.toBlob(r, 'image/png'))], `${rotulo}.png`, { type: 'image/png' })
  }
  const zona = [...document.querySelectorAll('[tabindex="0"]')].find((d) => /Arraste imagens/.test(d.innerText))
  for (const f of [await gerar(1400, 450, 'TENDENCIA FICTICIA', '#c0f'), await gerar(500, 800, 'FOTO FICTICIA', '#0a0')]) {
    const dt = new DataTransfer()
    dt.items.add(f)
    zona.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise((r) => setTimeout(r, 700))
  }
})
// a 2ª imagem vai para o próximo espaço livre (espectro); move para "foto"
await pagina.locator('li select').nth(2).selectOption('foto')

const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Exportar Word' }).click()])
await download.saveAs(saida)
console.log(`ok: ${download.suggestedFilename()} → ${saida}`)
await navegador.close()
