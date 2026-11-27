// Lembretes fora do site:
//  1) um JSON por relatório em VibDocs/lembretes/ (o Power Automate lê a pasta todo dia e avisa no Teams/celular);
//  2) um arquivo .ics para colocar os lembretes no calendário do Outlook.
import { lerConfig } from './config'
import { lembretes } from './gut'
import type { CriteriosGut } from './gutCriterios'
import { gravarTexto, listar, PASTA_VIBDOCS, subpasta } from './pasta'
import { equipamentosAnomalia, type Relatorio } from './relatorio'

export interface LembreteArquivo {
  codigo: string
  usina: string
  area: string
  tag: string
  equipamento: string
  tipo: 'enviar' | 'reanalisar'
  quando: string // AAAA-MM-DD
  texto: string
  responsavel: string
  email: string // quem recebe o aviso no Teams (no modo de teste, o e-mail de teste)
  emailReal?: string // no modo de teste: quem receberia de verdade
}

/** Avisos (Cadastros › Avisos): em modo de teste todos os avisos vão só para o e-mail de teste. */
export interface ConfigAvisos {
  modoTeste: boolean
  emailTeste: string
}
export const configAvisos = (): ConfigAvisos => ({ modoTeste: true, emailTeste: '', ...lerConfig<Partial<ConfigAvisos>>('avisos') })

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function lembretesDoRelatorio(r: Relatorio): LembreteArquivo[] {
  const criterios = lerConfig<CriteriosGut>('gut-criterios')
  const av = configAvisos()
  const real = r.contato?.email ?? ''
  const destino = av.modoTeste ? av.emailTeste : real
  return equipamentosAnomalia(r).flatMap((e) => {
    const a = r.anomalias[e.local]
    if (!a) return []
    return lembretes(r, a, e.condicao, criterios).map((l) => ({
      codigo: r.codigo,
      usina: r.usina,
      area: r.areaTitulo || r.sigla,
      tag: e.local,
      equipamento: a.equipamento || e.descricao,
      tipo: l.tipo,
      quando: iso(l.quando),
      texto: l.texto,
      responsavel: r.equipe.analise,
      email: destino,
      ...(av.modoTeste ? { emailReal: real } : {}),
    }))
  })
}

/** Grava (ou atualiza) o arquivo de lembretes do relatório na pasta do SharePoint. */
export async function gravarLembretes(raiz: FileSystemDirectoryHandle, r: Relatorio) {
  const lista = lembretesDoRelatorio(r)
  const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'lembretes'], true)
  const nome = `${r.usina}-${r.mesReferencia}-${r.sigla || 'AVULSO'}.json`.replace(/[\\/:*?"<>|\s]/g, '_')
  // sem lembretes e sem arquivo antigo: não cria nada
  if (!lista.length && !(await listar(dir)).arquivos.some((a) => a.name === nome)) return
  const av = configAvisos()
  await gravarTexto(
    dir,
    nome,
    JSON.stringify({ atualizado: new Date().toISOString(), relatorio: r.codigo, modoTeste: av.modoTeste, lembretes: av.modoTeste && !av.emailTeste ? [] : lista }, null, 1),
  )
}

/** Arquivo de calendário (.ics) com os lembretes: um evento de dia inteiro, com aviso na véspera. */
export function arquivoIcs(lista: LembreteArquivo[]): Blob {
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
  const dia = (s: string) => s.replace(/-/g, '')
  const seguinte = (s: string) => {
    const d = new Date(`${s}T12:00:00`)
    d.setDate(d.getDate() + 1)
    return dia(iso(d))
  }
  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const eventos = lista.map((l, i) =>
    [
      'BEGIN:VEVENT',
      `UID:vibdocs-${l.codigo}-${l.tag}-${l.tipo}-${i}@vibdocs`,
      `DTSTAMP:${agora}`,
      `DTSTART;VALUE=DATE:${dia(l.quando)}`,
      `DTEND;VALUE=DATE:${seguinte(l.quando)}`,
      `SUMMARY:${esc(`${l.tipo === 'enviar' ? 'Enviar relatório' : 'Nova análise'}: ${l.tag}`)}`,
      `DESCRIPTION:${esc(`${l.texto}\n${l.equipamento}\nRelatório ${l.codigo} (${l.usina} · ${l.area})`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P1D',
      `DESCRIPTION:${esc(l.texto)}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'),
  )
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VibDocs//Lembretes//PT', 'CALSCALE:GREGORIAN', ...eventos, 'END:VCALENDAR'].join('\r\n')
  return new Blob([txt], { type: 'text/calendar' })
}
