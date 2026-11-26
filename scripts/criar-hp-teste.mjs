// Cria dados FICTÍCIOS no mesmo formato cifrado do site Histórico Preditivo, para testar a integração.
// Senha de teste gerada aqui (não é a do site real). Uso: node scripts/criar-hp-teste.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { webcrypto as wc } from 'node:crypto'
import * as XLSX from 'xlsx'

const SENHA = 'teste-vibdocs-hp'
const destino = new URL('./fixtures/hp-teste/dados/', import.meta.url)
await mkdir(destino, { recursive: true })
const s = wc.subtle
const b64 = (b) => Buffer.from(b).toString('base64')
const rnd = (n) => wc.getRandomValues(new Uint8Array(n))

// chave de dados protegida pela senha
const raw = rnd(32)
const salt = rnd(16)
const iv = rnd(12)
const mat = await s.importKey('raw', new TextEncoder().encode(SENHA), 'PBKDF2', false, ['deriveKey'])
const kek = await s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
const wrapped = await s.encrypt({ name: 'AES-GCM', iv }, kek, raw)
await writeFile(new URL('chave.json', destino), JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: 310000, salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped) }))
const chave = await s.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])

const planilha = (linhas) => {
  const wb = XLSX.utils.book_new()
  const cab = ['Localização', 'Equipamento', 'Nota PR', 'Data da coleta', 'Reincidente desde', 'Situação', 'Recomendação', 'Criticidade', 'Informações complementares', 'Arquivo de origem']
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas], { cellDates: true }), 'Relatórios')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
const cifrar = async (buf) => {
  const v = rnd(12)
  return Buffer.concat([Buffer.from(v), Buffer.from(await s.encrypt({ name: 'AES-GCM', iv: v }, chave, buf))])
}

// planilha 1 (formato antigo: iv + AES-GCM)
const p1 = planilha([
  ['AAA', 'VIB_DEMO_REDUTOR-1', '900001', new Date(2026, 8, 12), 'jul/26', 'Motor: indícios de folga mecânica (fictício).', 'Programar inspeção do mancal (fictício).', 'Alerta', 'Anomalia pendente', 'VMN-446M260901 - AAA.pdf'],
  ['AAA', 'VIB_DEMO_REDUTOR-1', '900001', new Date(2026, 6, 10), 'Não informada', 'Redutor: engrenamento com bandas laterais (fictício).', 'Manter acompanhamento preditivo.', 'Pré-Alerta', '', 'VMN-446M260702 - AAA.pdf'],
  ['AAA', 'VIB_DEMO_PENEIRA-2', 'Sem nota', new Date(2026, 9, 3), 'mai/26', 'Desbalanceamento no rotor (fictício).', 'Balancear o rotor.', 'Alerta', '', 'VMN-446M261001 - AAA.pdf'],
  ['Sala elétrica 01', 'PN+DEMO01', '900777', new Date(2026, 9, 20), '', 'Desvio térmico na conexão (fictício).', 'Reapertar conexões.', 'Alarme', '', 'LAT-446T261003 (DEMO).pdf'],
])
await writeFile(new URL('Relatorios_teste_1.xlsx.enc', destino), await cifrar(p1))

// planilha 2 no formato novo "HPR1" (chave pública RSA)
const par = await s.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])
const der = await s.exportKey('pkcs8', par.privateKey)
await writeFile(new URL('privada.enc', destino), await cifrar(Buffer.from(der)))
const p2 = planilha([['AAA', 'VIB_DEMO_REDUTOR-1', '900001', new Date(2026, 10, 9), 'jul/26', 'Motor: evolução da vibração em velocidade (fictício).', 'Substituir rolamento (fictício).', 'Alarme', '', 'VMN-446M261101 - AAA.pdf']])
const kf = rnd(32)
const kfChave = await s.importKey('raw', kf, 'AES-GCM', false, ['encrypt'])
const v2 = rnd(12)
const env = Buffer.from(await s.encrypt({ name: 'RSA-OAEP' }, par.publicKey, kf))
const corpo = Buffer.from(await s.encrypt({ name: 'AES-GCM', iv: v2 }, kfChave, p2))
const tam = Buffer.from([env.length >> 8, env.length & 255])
await writeFile(new URL('Relatorios_teste_2.xlsx.enc', destino), Buffer.concat([Buffer.from('HPR1'), tam, env, Buffer.from(v2), corpo]))

await writeFile(
  new URL('manifest.json', destino),
  JSON.stringify({
    atualizado: new Date().toISOString(),
    arquivos: [
      { nome: 'Relatorios_teste_1.xlsx', arquivo: 'Relatorios_teste_1.xlsx.enc', tipo: 'dados' },
      { nome: 'Relatorios_teste_2.xlsx', arquivo: 'Relatorios_teste_2.xlsx.enc', tipo: 'dados' },
    ],
  }),
)
console.log('ok: dados de teste em scripts/fixtures/hp-teste/dados (senha de teste:', SENHA + ')')
