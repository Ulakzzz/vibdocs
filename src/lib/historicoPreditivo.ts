// Integração com o site Histórico Preditivo (mesmo endereço do GitHub Pages).
// As planilhas de lá são cifradas (AES-256-GCM); a senha abre a chave de dados no próprio navegador
// (PBKDF2-SHA256 → AES-GCM), igual ao site. Nada sai do navegador e a senha não é guardada.
import * as XLSX from 'xlsx'

const BASE_PADRAO = 'https://ulakzzz.github.io/historico-preditivo/dados/'
/** Testes locais podem apontar para uma pasta do próprio site (?hp=/caminho/). */
function base() {
  const q = new URLSearchParams(location.search).get('hp')
  return q && q.startsWith('/') ? q : BASE_PADRAO
}
export const SITE_HISTORICO = 'https://ulakzzz.github.io/historico-preditivo/'

export interface RegistroHP {
  localizacao: string
  equipamento: string
  notaPR: string
  data?: Date
  reincidente: string
  situacao: string
  recomendacao: string
  criticidade: string
  info: string
  origem: string // arquivo do relatório (ex.: "LAT-446T250702 (Q&T CASING).pdf")
}

let cache: { registros: RegistroHP[]; arquivos: number; atualizado?: string } | undefined
export const historicoAberto = () => !!cache
export const dadosHistorico = () => cache

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const sub = crypto.subtle

async function chaveDeDados(senha: string): Promise<CryptoKey> {
  const k = (await (await fetch(`${base()}chave.json`, { cache: 'no-store' })).json()) as { iter: number; salt: string; iv: string; wrapped: string }
  const material = await sub.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey'])
  const kek = await sub.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(k.salt), iterations: k.iter }, material, { name: 'AES-GCM', length: 256 }, false, [
    'decrypt',
  ])
  let raw: ArrayBuffer
  try {
    raw = await sub.decrypt({ name: 'AES-GCM', iv: b64(k.iv) }, kek, b64(k.wrapped))
  } catch {
    throw new Error('Senha incorreta.')
  }
  return sub.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
}

async function decifrar(buf: ArrayBuffer, chave: CryptoKey, privada: () => Promise<CryptoKey>): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf)
  // formato "HPR1": planilhas novas cifradas com a chave pública (rotinas automáticas)
  if (b[0] === 0x48 && b[1] === 0x50 && b[2] === 0x52 && b[3] === 0x31) {
    const n = (b[4] << 8) | b[5]
    const envolvida = b.slice(6, 6 + n)
    const iv = b.slice(6 + n, 18 + n)
    const corpo = b.slice(18 + n)
    const k = await sub.decrypt({ name: 'RSA-OAEP' }, await privada(), envolvida)
    const kf = await sub.importKey('raw', k, 'AES-GCM', false, ['decrypt'])
    return sub.decrypt({ name: 'AES-GCM', iv }, kf, corpo)
  }
  return sub.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, chave, b.slice(12))
}

const txt = (v: unknown) => (v === undefined || v === null ? '' : v instanceof Date ? v.toISOString() : String(v).trim())
const chaveCol = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function lerPlanilha(buf: ArrayBuffer): RegistroHP[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const out: RegistroHP[] = []
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: '' })
    const iCab = linhas.findIndex((l) => l.some((c) => chaveCol(txt(c)) === 'equipamento') && l.some((c) => chaveCol(txt(c)).startsWith('situa')))
    if (iCab < 0) continue
    const cab = linhas[iCab].map((c) => chaveCol(txt(c)))
    const col = (re: RegExp) => cab.findIndex((c) => re.test(c))
    const c = {
      loc: col(/^localiza/),
      eq: col(/^equipamento$/),
      pr: col(/nota/),
      data: col(/^data/),
      reinc: col(/reincid/),
      sit: col(/^situa/),
      rec: col(/^recomenda/),
      crit: col(/^critic|^condi/),
      info: col(/^informa/),
      origem: col(/origem|arquivo|relatorio/),
    }
    for (const l of linhas.slice(iCab + 1)) {
      const eq = txt(l[c.eq])
      if (!eq) continue
      const d = l[c.data]
      out.push({
        localizacao: txt(l[c.loc]),
        equipamento: eq,
        notaPR: txt(l[c.pr]),
        data: d instanceof Date ? d : undefined,
        reincidente: d instanceof Date ? txt(l[c.reinc]).slice(0, 10) : txt(l[c.reinc]),
        situacao: txt(l[c.sit]),
        recomendacao: txt(l[c.rec]),
        criticidade: txt(l[c.crit]),
        info: txt(l[c.info]),
        origem: txt(l[c.origem]),
      })
    }
  }
  return out
}

/** Abre os dados com a senha do Histórico Preditivo e guarda tudo em memória (até fechar a aba). */
export async function abrirHistorico(senha: string, progresso?: (feito: number, total: number) => void) {
  const chave = await chaveDeDados(senha)
  const manifest = (await (await fetch(`${base()}manifest.json`, { cache: 'no-store' })).json()) as {
    atualizado?: string
    arquivos: { arquivo: string; tipo: string }[]
  }
  let priv: Promise<CryptoKey> | undefined
  const privada = () =>
    (priv ??= (async () => {
      const der = await decifrar(await (await fetch(`${base()}privada.enc`)).arrayBuffer(), chave, () => Promise.reject(new Error('chave')))
      return sub.importKey('pkcs8', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
    })())
  const dados = manifest.arquivos.filter((a) => a.tipo !== 'config')
  const registros: RegistroHP[] = []
  let feito = 0
  for (const a of dados) {
    const buf = await (await fetch(`${base()}${a.arquivo}`)).arrayBuffer()
    registros.push(...lerPlanilha(await decifrar(buf, chave, privada)))
    progresso?.(++feito, dados.length)
  }
  // a mesma anomalia pode vir de mais de uma planilha (extrações repetidas)
  const vistos = new Set<string>()
  const unicos = registros.filter((r) => {
    const k = `${r.equipamento}|${r.localizacao}|${r.data?.toISOString().slice(0, 10)}|${r.origem}|${r.situacao.slice(0, 40)}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  unicos.sort((x, y) => (y.data?.getTime() ?? 0) - (x.data?.getTime() ?? 0))
  cache = { registros: unicos, arquivos: dados.length, atualizado: manifest.atualizado }
  return cache
}

export const fecharHistorico = () => {
  cache = undefined
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Tipo do relatório pelo nome do arquivo de origem (…-446T… = termografia). */
export const tipoRelatorio = (r: RegistroHP) => (/446T|termogr/i.test(r.origem) ? 'termografia' : 'vibracao')

/** Busca por palavras (todas precisam aparecer) em equipamento, localização, origem e informações. */
export function buscarHistorico(regs: RegistroHP[], busca: string) {
  const termos = normal(busca).split(/\s+/).filter(Boolean)
  if (!termos.length) return regs
  return regs.filter((r) => {
    const alvo = normal(`${r.equipamento} ${r.localizacao} ${r.origem} ${r.info} ${r.notaPR}`)
    return termos.every((t) => alvo.includes(t))
  })
}
