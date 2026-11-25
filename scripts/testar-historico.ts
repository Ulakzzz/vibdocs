// Testes das regras do histórico: npx tsx scripts/testar-historico.ts [planilha1.xlsx planilha2.xlsx ...]
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { lerXlsxVibracao } from '../src/lib/controle'
import { mesCurto, mesDoNome, mesesDoQuadro, montarHistorico, reincidenteDesde } from '../src/lib/historico'

const A = ['2', '3', '4']

// --- reincidência ---
// sequência ininterrupta: nov/25(3) dez(sem medição) jan/26(3) mar(3) mai(3) → desde nov/25
assert.equal(reincidenteDesde({ '2025-11': '3', '2026-01': '3', '2026-03': '3' }, '2026-05', '3', A), '2025-11')
// Normal no meio quebra a sequência: set/25(3) nov(1) jan/26(2) → desde jan/26
assert.equal(reincidenteDesde({ '2025-09': '3', '2025-11': '1', '2026-01': '2' }, '2026-03', '3', A), '2026-01')
// condições neutras (manutenção 5, reserva 8) não quebram nem iniciam
assert.equal(reincidenteDesde({ '2025-10': '4', '2025-12': '5', '2026-02': '8' }, '2026-04', '2', A), '2025-10')
// primeira vez em anomalia → o próprio mês
assert.equal(reincidenteDesde({ '2026-01': '1' }, '2026-03', '3', A), '2026-03')
// equipamento normal no mês atual → sem reincidência
assert.equal(reincidenteDesde({ '2026-01': '3' }, '2026-03', '1', A), undefined)
// meses depois do mês do relatório são ignorados
assert.equal(reincidenteDesde({ '2026-01': '1', '2026-06': '3' }, '2026-03', '3', A), '2026-03')

// --- meses do quadro ---
const h = montarHistorico([
  { mesRef: '2026-01', nome: 'a', linhas: [{ local: 'T1', condicao: '1' }, { local: 'T2', condicao: 'X' }] },
  { mesRef: '2026-03', nome: 'b', linhas: [{ local: 'T1', condicao: '3' }] },
  { mesRef: '2025-11', nome: 'c', linhas: [{ local: 'T2', condicao: '2' }, { local: 'OUTRA', condicao: '1' }] },
])
assert.deepEqual(h.T2, { '2025-11': '2' }, 'X não entra como medição')
assert.deepEqual(mesesDoQuadro(h, ['T1', 'T2'], '2026-05', 3), ['2026-01', '2026-03', '2026-05'])
assert.deepEqual(mesesDoQuadro(h, ['T1', 'T2'], '2026-05', 4), ['2025-11', '2026-01', '2026-03', '2026-05'])
assert.deepEqual(mesesDoQuadro(h, ['T1'], '2026-05', 1), ['2026-05'])

// --- nomes ---
assert.equal(mesDoNome('Planilha de Controle Barreiro - Setembro 2026 (1).xlsx'), '2026-09')
assert.equal(mesDoNome('Planilha de Controle Mineração - Março 2026.xlsx'), '2026-03')
assert.equal(mesDoNome('Planilha de Controle Jeceaba - junho 2026.xlsx'), '2026-06')
assert.equal(mesDoNome('qualquer.xlsx'), undefined)
assert.equal(mesCurto('2025-11'), 'nov/25')
console.log('OK: regras do histórico')

// --- planilhas reais (opcional) ---
const arquivos = process.argv.slice(2)
if (arquivos.length) {
  const fontes = []
  for (const a of arquivos) {
    const b = await readFile(a)
    const linhas = lerXlsxVibracao(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), basename(a))
    fontes.push({ mesRef: mesDoNome(basename(a)) ?? '????-??', nome: basename(a), linhas })
  }
  const hist = montarHistorico(fontes)
  const tags = Object.keys(hist)
  const comVarios = tags.filter((t) => Object.keys(hist[t]).length > 1)
  console.log(`${fontes.length} planilhas, ${tags.length} equipamentos, ${comVarios.length} com mais de um mês`)
}
