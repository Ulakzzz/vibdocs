// Teste rápido: lê uma planilha de controle real com o mesmo código do site.
// Uso: npx tsx scripts/testar-leitura.ts "<caminho do .xlsx>"
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { lerAbaVibracao, siglaArea } from '../src/lib/controle'
import { eAnomalia } from '../src/lib/condicao'

const caminho = process.argv[2]
if (!caminho) throw new Error('informe o caminho do .xlsx')
const bytes = await readFile(caminho)
const arquivo = {
  name: basename(caminho),
  getFile: async () => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }),
} as unknown as FileSystemFileHandle

const linhas = await lerAbaVibracao({ usina: 'Mineração', ano: '2026', mesPasta: '', arquivo })
const porSigla: Record<string, { total: number; anomalias: number }> = {}
for (const l of linhas) {
  const s = (porSigla[siglaArea(l.local)] ??= { total: 0, anomalias: 0 })
  s.total++
  if (eAnomalia(l.condicao)) s.anomalias++
}
console.log(`${linhas.length} linhas`)
console.table(porSigla)
console.log(linhas.filter((l) => eAnomalia(l.condicao)).slice(0, 5))
