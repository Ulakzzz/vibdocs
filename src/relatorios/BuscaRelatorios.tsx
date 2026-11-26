// Tela "Relatórios": busca rápida por cliente/usina, área, data ou equipamento, histórico de um equipamento
// em todos os relatórios e a tabela em Excel com o resumo das análises (data, status, situação, recomendação, autor).
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { CONDICOES } from '../lib/condicao'
import { calcularGut } from '../lib/gut'
import { useConfig } from '../lib/config'
import type { CriteriosGut } from '../lib/gutCriterios'
import { mesCurto } from '../lib/historico'
import { rascunhosDaPasta, rascunhosRecentes } from '../lib/rascunho'
import { equipamentosAnomalia, juntar, STATUS_RELATORIO, USINAS_RELATORIO, type Relatorio } from '../lib/relatorio'
import { btn, btnPri } from '../editor/campos'
import { Carregando } from '../ui/Contador'
import { Seletor } from '../ui/Seletor'

interface Analise {
  r: Relatorio
  data: string // AAAA-MM-DD
  tag: string
  equipamento: string
  status: string
  condicao: string
  situacao: string
  recomendacao: string
  autor: string
  gut?: number
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const dataBr = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')

/** Uma linha por equipamento com página de anomalia em cada relatório. */
function analisesDe(r: Relatorio, criterios?: CriteriosGut): Analise[] {
  return equipamentosAnomalia(r).map((e) => {
    const a = r.anomalias[e.local]
    const nomeParte = (n: string) => (n.trim() ? `${n.trim()}: ` : '')
    const m = a?.dataMedicao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    const data = m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : r.dataExpedicao
    return {
      r,
      data,
      tag: e.local,
      equipamento: a?.equipamento || e.descricao,
      status: CONDICOES[e.condicao]?.nome ?? 'A analisar',
      condicao: e.condicao,
      situacao: (a?.eixos ?? []).map((x) => juntar(x.situacaoPadrao, x.situacaoTecnico) && nomeParte(x.nome) + juntar(x.situacaoPadrao, x.situacaoTecnico)).filter(Boolean).join(' | '),
      recomendacao: (a?.eixos ?? []).map((x) => juntar(x.recomendacaoPadrao, x.recomendacaoTecnico) && nomeParte(x.nome) + juntar(x.recomendacaoPadrao, x.recomendacaoTecnico)).filter(Boolean).join(' | '),
      autor: r.equipe.analise || r.atualizadoPor || '',
      gut: a?.gut?.modo ? calcularGut(a.gut, criterios).valor : undefined,
    }
  })
}

export function BuscaRelatorios({ raiz, abrir }: { raiz?: FileSystemDirectoryHandle; abrir: (r: Relatorio) => void }) {
  const criterios = useConfig<CriteriosGut>('gut-criterios')
  const [todos, setTodos] = useState<Relatorio[]>()
  const [lendo, setLendo] = useState('')
  const [q, setQ] = useState('')
  const [usina, setUsina] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setLendo('Lendo os relatórios deste navegador…')
      const locais = await rascunhosRecentes(10000)
      let pasta: Relatorio[] = []
      if (raiz) {
        setLendo('Lendo os relatórios da pasta do SharePoint…')
        pasta = await rascunhosDaPasta(raiz, (n) => vivo && setLendo(`Lendo os relatórios da pasta do SharePoint… ${n}`))
      }
      // o mesmo relatório pode estar nos dois lugares: fica o mais recente
      const mapa = new Map<string, Relatorio>()
      for (const r of [...pasta, ...locais]) {
        const k = `${r.usina}|${r.mesReferencia}|${r.sigla}|${r.codigo}`
        const ja = mapa.get(k)
        if (!ja || (r.atualizadoEm ?? '') > (ja.atualizadoEm ?? '')) mapa.set(k, r)
      }
      if (vivo) {
        setTodos([...mapa.values()].sort((a, b) => (b.dataExpedicao ?? '').localeCompare(a.dataExpedicao ?? '')))
        setLendo('')
      }
    })()
    return () => {
      vivo = false
    }
  }, [raiz])

  const filtrados = useMemo(() => {
    const termos = normal(q).split(/\s+/).filter(Boolean)
    return (todos ?? []).filter((r) => {
      if (usina && r.usina !== usina) return false
      if (de && r.dataExpedicao < de) return false
      if (ate && r.dataExpedicao > ate) return false
      if (!termos.length) return true
      const alvo = normal(
        `${r.usina} vallourec ${r.areaTitulo} ${r.sigla} ${r.codigo} ${r.dataExpedicao} ${dataBr(r.dataExpedicao)} ${mesCurto(r.mesReferencia)} ${r.equipe.analise} ${r.equipamentos.map((e) => `${e.local} ${e.descricao}`).join(' ')}`,
      )
      return termos.every((t) => alvo.includes(t))
    })
  }, [todos, q, usina, de, ate])

  // busca que parece um equipamento: histórico dele em todos os relatórios
  const historico = useMemo(() => {
    const termos = normal(q).split(/\s+/).filter(Boolean)
    if (!termos.length) return []
    return filtrados
      .flatMap((r) => analisesDe(r, criterios))
      .filter((x) => termos.every((t) => normal(`${x.tag} ${x.equipamento}`).includes(t)))
      .sort((a, b) => b.data.localeCompare(a.data))
  }, [filtrados, q, criterios])

  const exportar = () => {
    const linhas = filtrados.flatMap((r) => analisesDe(r, criterios))
    const ws = XLSX.utils.aoa_to_sheet([
      ['Data', 'Usina', 'Área', 'Relatório', 'Local de instalação', 'Equipamento', 'Status', 'Situação', 'Recomendação', 'GUT', 'Responsável'],
      ...linhas
        .sort((a, b) => a.tag.localeCompare(b.tag) || a.data.localeCompare(b.data))
        .map((x) => [dataBr(x.data), x.r.usina, x.r.areaTitulo || x.r.sigla, x.r.codigo, x.tag, x.equipamento, x.status, x.situacao, x.recomendacao, x.gut ?? '', x.autor]),
    ])
    ws['!cols'] = [10, 11, 10, 18, 26, 34, 12, 60, 60, 6, 22].map((wch) => ({ wch }))
    ws['!autofilter'] = { ref: `A1:K${linhas.length + 1}` }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Análises')
    XLSX.writeFile(wb, `Resumo das análises ${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-16 lg:px-10">
      <header className="surgir-lista flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-cinza">Relatórios</p>
          <h1 className="titulo-grande mt-1 text-4xl">Buscar relatórios</h1>
          <p className="mt-2 max-w-2xl text-grafite">Por cliente/usina, área, data, código ou equipamento. Digitando a TAG ou o nome de um equipamento, aparece o histórico dele.</p>
        </div>
        <button className={btnPri} onClick={exportar} disabled={!filtrados.length}>
          Exportar resumo em Excel
        </button>
      </header>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <input className="campo min-w-72 flex-1" placeholder="Ex.: Jeceaba AJU, VS01-DWS-AJU-180, BOMBA, nov/26…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar relatórios" />
        <Seletor classe="seletor-campo" rotulo="Usina" valor={usina} mudar={setUsina} opcoes={[{ valor: '', rotulo: 'Todas as usinas' }, ...USINAS_RELATORIO.map((u) => ({ valor: u, rotulo: u }))]} />
        <label className="text-xs text-cinza">
          de
          <input type="date" className="campo w-auto" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="text-xs text-cinza">
          até
          <input type="date" className="campo w-auto" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
      </div>
      {lendo && <Carregando texto={lendo} />}
      {todos && !lendo && (
        <>
          {historico.length > 0 && (
            <section className="cartao-inicio mt-6 overflow-auto">
              <h2 className="titulo mb-2 text-lg">Histórico do equipamento ({historico.length} análises)</h2>
              <table className="banco-tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Equipamento</th>
                    <th>Status</th>
                    <th>Situação</th>
                    <th>Recomendação</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((x, i) => (
                    <tr key={i}>
                      <td>
                        <b>{dataBr(x.data)}</b>
                        <small className="block text-cinza">{x.r.codigo}</small>
                      </td>
                      <td>
                        <span className="tag">{x.tag}</span>
                        <small className="block text-cinza">{x.equipamento}</small>
                      </td>
                      <td>
                        <span className="chip" style={{ background: CONDICOES[x.condicao]?.cor, color: CONDICOES[x.condicao]?.texto }}>
                          {x.status}
                        </span>
                      </td>
                      <td className="max-w-80 text-xs">{x.situacao}</td>
                      <td className="max-w-80 text-xs">{x.recomendacao}</td>
                      <td className="text-xs">{x.autor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <p className="mt-6 text-sm text-cinza">
            {filtrados.length} de {todos.length} relatório(s){raiz ? ' (navegador + SharePoint)' : ' (deste navegador)'}
          </p>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {filtrados.slice(0, 60).map((r) => {
              const n = equipamentosAnomalia(r).length
              return (
                <li key={`${r.usina}|${r.mesReferencia}|${r.sigla}|${r.codigo}`}>
                  <button className="rel-cartao" onClick={() => abrir(r)}>
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="tag">
                        {r.codigo}
                        <span className="status-pilula" style={{ ['--c' as string]: STATUS_RELATORIO[r.status ?? 'rascunho'].cor }}>
                          {STATUS_RELATORIO[r.status ?? 'rascunho'].nome}
                        </span>
                      </b>
                      <small className="text-cinza">{dataBr(r.dataExpedicao)}</small>
                    </span>
                    <span className="mt-1 block">
                      Vallourec {r.usina} · {r.areaTitulo || r.sigla} · {mesCurto(r.mesReferencia)}
                      {r.avulso ? ' · avulso' : ''}
                    </span>
                    <small className="text-cinza">
                      {r.equipamentos.length} equipamentos · {n} anomalia(s) · {r.equipe.analise}
                    </small>
                  </button>
                </li>
              )
            })}
          </ul>
          {!todos.length && <p className="cartao-inicio mt-4 text-sm text-cinza">Nenhum relatório salvo ainda.</p>}
        </>
      )}
      <div className="mt-4">
        <button className={btn} onClick={() => setQ('')} disabled={!q}>
          Limpar busca
        </button>
      </div>
    </div>
  )
}
