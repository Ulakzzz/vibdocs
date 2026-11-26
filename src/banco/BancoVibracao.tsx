// Página "Banco de vibração": abre os bancos Omnitrend da pasta do SharePoint, mostra a árvore de máquinas,
// tendência dos globais com alarmes, espectros, e liga cada máquina a uma TAG da planilha (vínculo permanente).
import { useEffect, useMemo, useState } from 'react'
import type { LinhaControle } from '../lib/controle'
import { BancoAberto, listarBancos, PASTA_BANCOS, type ArquivoBanco } from '../lib/omnitrend/cliente'
import type { Espectro, NoOT, TarefaOT } from '../lib/omnitrend/ler'
import { gravarVinculo, lerVinculos, sugerir, type Vinculos } from '../lib/omnitrend/vinculos'
import { avisar } from '../ui/Avisos'
import { Carregando } from '../ui/Contador'
import { Seletor } from '../ui/Seletor'
import { btnFantasma, btnMini } from '../editor/campos'
import { CORES, EspectroGrafico, Tendencia } from './Graficos'

// banco aberto fica na memória enquanto o site estiver aberto (trocar de tela não relê o arquivo)
let abertoGlobal: { chave: string; banco: BancoAberto } | undefined

const data = (t?: number) => (t ? new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–')
const tam = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)
const fmt = (v?: number) => (v === undefined ? '–' : v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 10 ? 1 : 2 }))
const corSit = { alarme: '#ff2a2a', alerta: '#ffc000', ok: '#00b050', sem: '#6b7280' }
const estado = (t: TarefaOT) => {
  const v = t.ultima?.v
  if (v === undefined || !t.limites) return 'sem'
  if (t.limites.alarme !== undefined && v >= t.limites.alarme) return 'alarme'
  if (t.limites.alerta !== undefined && v >= t.limites.alerta) return 'alerta'
  return 'ok'
}

export interface FocoBanco {
  tag: string
  descricao: string
  n: number
}

export function BancoVibracao({
  raiz,
  linhas,
  usuario,
  foco,
}: {
  raiz?: FileSystemDirectoryHandle
  linhas: LinhaControle[]
  usuario: string
  foco?: FocoBanco
}) {
  const [arquivos, setArquivos] = useState<ArquivoBanco[]>()
  const [banco, setBanco] = useState<BancoAberto | undefined>(abertoGlobal?.banco)
  const [chave, setChave] = useState(abertoGlobal?.chave ?? '')
  const [abrindo, setAbrindo] = useState('')
  const [erro, setErro] = useState('')
  const [vinculos, setVinculos] = useState<Vinculos>({})
  const [vinculosLidos, setVinculosLidos] = useState(false)
  const [maquina, setMaquina] = useState<number>()
  const [busca, setBusca] = useState('')
  const [vincularTag, setVincularTag] = useState<{ tag: string; descricao: string }>()

  useEffect(() => {
    lerVinculos(raiz).then((v) => {
      setVinculos(v)
      setVinculosLidos(true)
    })
    if (raiz) listarBancos(raiz).then(setArquivos).catch(() => setArquivos([]))
    else setArquivos([])
  }, [raiz])

  const abrir = async (arquivo: File | Blob, nome: string, modificado: number, caminho: string) => {
    setErro('')
    setAbrindo(`Lendo ${nome} (${tam(arquivo.size)})…`)
    try {
      abertoGlobal?.banco.fechar()
      const b = await BancoAberto.abrir(arquivo, nome, modificado)
      abertoGlobal = { chave: caminho, banco: b }
      setBanco(b)
      setChave(caminho)
      setMaquina(undefined)
      return b
    } catch (e) {
      setErro(`Não consegui ler o banco: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAbrindo('')
    }
  }
  const abrirDaPasta = async (a: ArquivoBanco) => {
    setAbrindo(`Baixando ${a.nome} do OneDrive (${tam(a.tamanho)})…`)
    return abrir(await a.obter(), a.nome, a.modificado, a.caminho)
  }

  // foco vindo de um equipamento do relatório: abre o banco do vínculo, ou o assistente de vínculo
  useEffect(() => {
    if (!foco || !arquivos || !vinculosLidos) return
    const v = vinculos[foco.tag]
    if (!v) {
      setVincularTag({ tag: foco.tag, descricao: foco.descricao })
      setMaquina(undefined)
      return
    }
    ;(async () => {
      let b = banco
      if (!b || chave !== v.banco) {
        const a = arquivos.find((x) => x.caminho === v.banco)
        if (!a) return avisar(`O banco "${v.banco}" do vínculo não está na pasta.`, 'erro')
        b = await abrirDaPasta(a)
      }
      if (!b) return
      // acha a máquina pelo ID; se o banco foi refeito, pelo caminho de nomes
      const id = b.porId.has(v.no) ? v.no : b.maquinas().find((m) => b!.caminho(m.id).join('>') === v.caminho.join('>'))?.id
      if (id) setMaquina(id)
      else avisar('A máquina do vínculo não foi encontrada neste banco. Refaça o vínculo.', 'erro')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.n, arquivos, vinculosLidos])

  // banco desatualizado (Power Automate trouxe uma versão nova)
  const atual = arquivos?.find((a) => a.caminho === chave)
  const desatualizado = !!(banco && atual && atual.modificado > banco.modificado)

  const vincular = async (tag: string, descricao: string, no: number) => {
    if (!banco) return
    const novos = await gravarVinculo(raiz, tag, { banco: chave, no, caminho: banco.caminho(no), descricao, por: usuario, em: new Date().toISOString() })
    setVinculos(novos)
    setVincularTag(undefined)
    setMaquina(no)
    avisar(`${tag} vinculado a ${banco.porId.get(no)?.nome}.${raiz ? ' Salvo no SharePoint.' : ''}`, 'ok')
  }
  const desvincular = async (tag: string) => {
    setVinculos(await gravarVinculo(raiz, tag, null))
    avisar(`Vínculo de ${tag} removido.`, 'info')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 pt-8 pb-16 lg:px-10">
      <header className="surgir-lista flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-cinza">Integração · Omnitrend</p>
          <h1 className="titulo-grande mt-1 text-4xl">Banco de vibração</h1>
          <p className="mt-2 max-w-2xl text-grafite">
            Tendência dos globais com os limites de alarme, espectros e o vínculo de cada máquina com a TAG da planilha de controle.
            Os bancos vêm da pasta “{PASTA_BANCOS}” (atualizada pelo Power Automate a cada 3 h, das 7h às 16h).
          </p>
        </div>
        <label className={`${btnFantasma} cursor-pointer`} title="Abrir um .mdb que não está na pasta">
          Abrir arquivo .mdb
          <input
            type="file"
            accept=".mdb,.accdb"
            className="sr-only"
            aria-label="Arquivo do banco Omnitrend"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void abrir(f, f.name, f.lastModified, `arquivo:${f.name}`)
              e.target.value = ''
            }}
          />
        </label>
      </header>

      {/* bancos da pasta */}
      <section className="mt-6 flex flex-wrap gap-2">
        {arquivos === undefined ? (
          <span className="text-sm text-cinza">Procurando bancos…</span>
        ) : arquivos.length === 0 ? (
          <span className="text-sm text-cinza">
            {raiz
              ? `Nenhum .mdb em “${PASTA_BANCOS}” neste computador. Confira se o OneDrive já sincronizou a pasta.`
              : 'Sem a pasta do SharePoint conectada: use “Abrir arquivo .mdb”.'}
          </span>
        ) : (
          arquivos.map((a) => (
            <button key={a.caminho} className={`banco-arq ${chave === a.caminho ? 'on' : ''}`} onClick={() => void abrirDaPasta(a)} disabled={!!abrindo}>
              <b>{a.caminho.replace(/\.(mdb|accdb)$/i, '')}</b>
              <small>
                {tam(a.tamanho)} · atualizado {new Date(a.modificado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </small>
            </button>
          ))
        )}
      </section>

      {abrindo && <Carregando texto={abrindo} />}
      {erro && <p className="mt-4 rounded-[10px] bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {desatualizado && atual && (
        <p className="mt-4 flex items-center gap-3 rounded-[12px] border border-dashed border-sinal px-4 py-2 text-sm">
          Há uma versão mais nova deste banco na pasta.
          <button className={btnMini} onClick={() => void abrirDaPasta(atual)}>
            Recarregar
          </button>
        </p>
      )}

      {banco && !abrindo && (
        <div className="banco-grade mt-6">
          <Arvore banco={banco} busca={busca} setBusca={setBusca} maquina={maquina} escolher={setMaquina} vinculos={vinculos} chave={chave} />
          <div className="min-w-0">
            {vincularTag && maquina && (
              <div className="banco-pendente mb-4">
                Vincular <b className="tag">{vincularTag.tag}</b> a <b>{banco.porId.get(maquina)?.nome}</b>?
                <button className="bt bt-pri" onClick={() => void vincular(vincularTag.tag, vincularTag.descricao, maquina)}>
                  Vincular
                </button>
                <button className={btnFantasma} onClick={() => setVincularTag(undefined)}>
                  Cancelar
                </button>
              </div>
            )}
            {vincularTag && !maquina ? (
              <AssistenteVinculo
                banco={banco}
                tag={vincularTag.tag}
                descricao={vincularTag.descricao}
                vincular={vincular}
                fechar={() => setVincularTag(undefined)}
              />
            ) : maquina ? (
              <Maquina
                key={maquina}
                banco={banco}
                id={maquina}
                linhas={linhas}
                vinculos={vinculos}
                chave={chave}
                vincular={vincular}
                desvincular={desvincular}
              />
            ) : (
              <ResumoBanco banco={banco} abrir={setMaquina} />
            )}
          </div>
        </div>
      )}

      <ListaVinculos vinculos={vinculos} desvincular={desvincular} />
    </div>
  )
}

function Arvore(p: {
  banco: BancoAberto
  busca: string
  setBusca: (s: string) => void
  maquina?: number
  escolher: (id: number) => void
  vinculos: Vinculos
  chave: string
}) {
  const vinculadas = new Set(Object.values(p.vinculos).filter((v) => v.banco === p.chave).map((v) => v.no))
  const grupos = useMemo(() => {
    const g = new Map<string, NoOT[]>()
    for (const m of p.banco.maquinas()) {
      const cam = p.banco.caminho(m.id)
      const area = cam.slice(0, -1).join(' › ')
      g.set(area, [...(g.get(area) ?? []), m])
    }
    return [...g.entries()]
  }, [p.banco])
  const q = p.busca.toLowerCase()
  return (
    <aside className="banco-arvore">
      <input className="campo" placeholder="Buscar máquina…" value={p.busca} onChange={(e) => p.setBusca(e.target.value)} aria-label="Buscar máquina" />
      <div className="mt-2 overflow-auto">
        {grupos.map(([area, ms]) => {
          const visiveis = ms.filter((m) => !q || `${area} ${m.nome}`.toLowerCase().includes(q))
          if (!visiveis.length) return null
          return (
            <details key={area} open={!!q || grupos.length < 6}>
              <summary>{area || 'raiz'}</summary>
              {visiveis.map((m) => {
                const s = p.banco.situacao(m.id)
                return (
                  <button key={m.id} className={`banco-maq ${p.maquina === m.id ? 'on' : ''}`} onClick={() => p.escolher(m.id)}>
                    <span className="banco-ponto" style={{ background: corSit[s] }} title={s} />
                    <span className="truncate">{m.nome}</span>
                    {vinculadas.has(m.id) && (
                      <span className="banco-link" title="Vinculada a uma TAG">
                        ⛓
                      </span>
                    )}
                  </button>
                )
              })}
            </details>
          )
        })}
      </div>
    </aside>
  )
}

function ResumoBanco({ banco, abrir }: { banco: BancoAberto; abrir: (id: number) => void }) {
  const maqs = banco.maquinas()
  const sits = maqs.map((m) => ({ m, s: banco.situacao(m.id) }))
  const conta = (s: string) => sits.filter((x) => x.s === s).length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Máquinas', maqs.length],
          ['Em alarme', conta('alarme')],
          ['Em alerta', conta('alerta')],
          ['Medições', banco.resumo.medicoes],
        ].map(([r, v]) => (
          <div key={r} className="numero painel px-4 py-3">
            <div className="text-[13px] text-cinza">{r}</div>
            <div className="titulo-grande mt-1 text-[28px]">{Number(v).toLocaleString('pt-BR')}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-cinza">
        Medições de {data(banco.resumo.periodo.de)} a {data(banco.resumo.periodo.ate)}. Escolha uma máquina à esquerda.
      </p>
      <div className="cartao-inicio">
        <h3 className="titulo mb-2">Em alarme ou alerta pela última medição</h3>
        <ul className="divide-y divide-linha">
          {sits
            .filter((x) => x.s === 'alarme' || x.s === 'alerta')
            .map(({ m, s }) => (
              <li key={m.id}>
                <button className="linha-recente" onClick={() => abrir(m.id)}>
                  <span className="banco-ponto" style={{ background: corSit[s] }} />
                  <span className="min-w-0 flex-1 truncate">{banco.caminho(m.id).join(' › ')}</span>
                  <span className="text-xs text-cinza">{s}</span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}

function Maquina(p: {
  banco: BancoAberto
  id: number
  linhas: LinhaControle[]
  vinculos: Vinculos
  chave: string
  vincular: (tag: string, descricao: string, no: number) => void
  desvincular: (tag: string) => void
}) {
  const { banco, id } = p
  const estrutura = banco.estrutura(id)
  const tarefas = estrutura.flatMap((c) => c.pontos.flatMap((pt) => pt.tarefas.map((t) => ({ ...t, comp: c.componente.nome, pto: pt.ponto.nome }))))
  const nomesGlobais = [...new Set(tarefas.filter((t) => t.tipo === 'global' || t.tipo === 'escalar').map((t) => t.nome))]
  const [medida, setMedida] = useState(nomesGlobais.find((n) => /veloc/i.test(n)) ?? nomesGlobais[0] ?? '')
  const [series, setSeries] = useState<Record<number, { t: number; v: number }[]>>({})
  const daMedida = tarefas.filter((t) => t.nome === medida)
  useEffect(() => {
    if (daMedida.length) banco.series(daMedida.map((t) => t.id)).then(setSeries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medida, id])

  const espectrais = tarefas.filter((t) => t.tipo === 'espectro' || t.tipo === 'tempo')
  const [tarefaEsp, setTarefaEsp] = useState<number | undefined>(espectrais[0]?.id)
  const [curvas, setCurvas] = useState<Espectro[]>([])
  const [escolhidas, setEscolhidas] = useState<number[]>([0])
  useEffect(() => {
    if (tarefaEsp) banco.espectros(tarefaEsp).then((c) => (setCurvas(c), setEscolhidas([0])))
  }, [tarefaEsp, banco])
  const esp = espectrais.find((t) => t.id === tarefaEsp)
  const compDoEsp = estrutura.find((c) => c.pontos.some((pt) => pt.tarefas.some((t) => t.id === tarefaEsp)))

  const tags = Object.entries(p.vinculos).filter(([, v]) => v.banco === p.chave && v.no === id)
  const [vinculando, setVinculando] = useState(false)

  return (
    <div className="space-y-5">
      <div className="cartao-inicio">
        <p className="text-xs text-cinza">{banco.caminho(id).slice(0, -1).join(' › ')}</p>
        <h2 className="titulo-grande mt-1 text-3xl">{banco.porId.get(id)?.nome}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tags.map(([tag, v]) => (
            <span key={tag} className="banco-tag" title={`Vinculado por ${v.por ?? '?'} em ${new Date(v.em).toLocaleDateString('pt-BR')}`}>
              ⛓ <b>{tag}</b> {v.descricao && <small>{v.descricao}</small>}
              <button aria-label={`Remover vínculo de ${tag}`} onClick={() => p.desvincular(tag)}>
                ×
              </button>
            </span>
          ))}
          <button className={btnMini} onClick={() => setVinculando((v) => !v)}>
            {tags.length ? 'Vincular outra TAG' : 'Vincular a uma TAG da planilha'}
          </button>
        </div>
        {vinculando && (
          <EscolherTag
            linhas={p.linhas}
            maquina={banco.porId.get(id)!}
            caminho={banco.caminho(id)}
            jaUsadas={p.vinculos}
            escolher={(l) => {
              p.vincular(l.local, l.descricao, id)
              setVinculando(false)
            }}
          />
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {estrutura.map((c) => (
            <span key={c.componente.id} className="banco-comp">
              <b>{c.componente.nome}</b>
              {c.dados?.rpm ? ` · ${c.dados.rpm} rpm` : ''}
              {c.dados?.kw ? ` · ${c.dados.kw} kW` : ''} · {c.pontos.length} pontos
            </span>
          ))}
        </div>
      </div>

      {/* últimos valores por ponto */}
      <div className="cartao-inicio overflow-auto">
        <h3 className="titulo mb-2">Última medição por ponto</h3>
        <table className="banco-tabela">
          <thead>
            <tr>
              <th>Componente</th>
              <th>Ponto</th>
              {nomesGlobais.map((n) => (
                <th key={n}>{n.replace(/^\d+\s*(MGS\s*-\s*)?/, '')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estrutura.flatMap((c) =>
              c.pontos.map((pt) => (
                <tr key={pt.ponto.id}>
                  <td>{c.componente.nome}</td>
                  <td>
                    <b>{pt.ponto.nome}</b>
                  </td>
                  {nomesGlobais.map((n) => {
                    const t = pt.tarefas.find((x) => x.nome === n)
                    if (!t) return <td key={n} />
                    const e = estado(t)
                    return (
                      <td key={n} title={t.limites ? `alerta ${fmt(t.limites.alerta)} · alarme ${fmt(t.limites.alarme)}` : 'sem limites'}>
                        <span className="banco-valor" style={{ ['--c' as string]: corSit[e] }}>
                          {fmt(t.ultima?.v)} <small>{t.unidade}</small>
                        </span>
                        <small className="block text-cinza">{data(t.ultima?.t)}</small>
                      </td>
                    )
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      {/* tendência */}
      <div className="cartao-inicio">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="titulo">Tendência</h3>
          {nomesGlobais.length > 0 && (
            <Seletor classe="seletor-campo" rotulo="Medida" valor={medida} mudar={setMedida} opcoes={nomesGlobais.map((n) => ({ valor: n, rotulo: n }))} />
          )}
        </div>
        {daMedida.length ? (
          <Tendencia
            unidade={daMedida[0].unidade}
            limites={daMedida.find((t) => t.limites)?.limites}
            series={daMedida.map((t) => ({ nome: `${t.comp} ${t.pto}`, pontos: series[t.id] ?? [] })).filter((s) => s.pontos.length)}
          />
        ) : (
          <p className="text-sm text-cinza">Esta máquina não tem medições de valor global.</p>
        )}
      </div>

      {/* espectros */}
      <div className="cartao-inicio">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="titulo">Espectro e sinal</h3>
          {espectrais.length > 0 && (
            <Seletor
              classe="seletor-campo"
              rotulo="Medição"
              valor={String(tarefaEsp ?? '')}
              mudar={(v) => setTarefaEsp(Number(v))}
              opcoes={espectrais.map((t) => ({ valor: String(t.id), rotulo: `${t.comp} ${t.pto} · ${t.nome}` }))}
            />
          )}
        </div>
        {curvas.length > 0 && esp ? (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
              {curvas.map((c, i) => (
                <button
                  key={c.dataId}
                  className={`banco-data ${escolhidas.includes(i) ? 'on' : ''}`}
                  style={escolhidas.includes(i) ? { borderColor: CORES[escolhidas.indexOf(i) % CORES.length] } : undefined}
                  onClick={() => setEscolhidas((e) => (e.includes(i) ? (e.length > 1 ? e.filter((x) => x !== i) : e) : [...e, i].slice(-3)))}
                >
                  {data(c.t)}
                </button>
              ))}
              <span className="self-center text-cinza">clique nas datas para comparar (até 3)</span>
            </div>
            <EspectroGrafico
              sinal={esp.tipo === 'tempo'}
              unidade={esp.unidade}
              rpm={compDoEsp?.dados?.rpm}
              curvas={escolhidas.map((i) => ({ nome: data(curvas[i].t), passo: curvas[i].passo, valores: curvas[i].valores }))}
            />
          </>
        ) : (
          <p className="text-sm text-cinza">Sem espectros guardados para esta máquina.</p>
        )}
      </div>
    </div>
  )
}

/** Escolha da TAG para uma máquina: as linhas da planilha mais parecidas primeiro, e busca livre. */
function EscolherTag(p: { linhas: LinhaControle[]; maquina: NoOT; caminho: string[]; jaUsadas: Vinculos; escolher: (l: LinhaControle) => void }) {
  const [q, setQ] = useState('')
  const ranqueadas = useMemo(
    () =>
      p.linhas
        .map((l) => ({ l, nota: sugerir(l.local, l.descricao, [p.maquina], () => p.caminho, 1)[0]?.nota ?? 0 }))
        .sort((a, b) => b.nota - a.nota),
    [p.linhas, p.maquina, p.caminho],
  )
  const mostrar = (q ? ranqueadas.filter(({ l }) => `${l.local} ${l.descricao}`.toLowerCase().includes(q.toLowerCase())) : ranqueadas).slice(0, 8)
  if (!p.linhas.length)
    return <p className="mt-3 text-sm text-cinza">Abra uma usina (planilha de controle carregada) para escolher a TAG.</p>
  return (
    <div className="banco-escolha mt-3">
      <input className="campo" placeholder="Buscar TAG ou descrição na planilha…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar TAG" />
      <ul className="mt-2">
        {mostrar.map(({ l, nota }) => (
          <li key={l.local}>
            <button className="linha-recente" onClick={() => p.escolher(l)}>
              <span className="banco-nota" style={{ ['--n' as string]: nota }}>
                {Math.round(nota * 100)}%
              </span>
              <span className="tag">{l.local}</span>
              <span className="min-w-0 flex-1 truncate text-cinza">{l.descricao}</span>
              {p.jaUsadas[l.local] && <small className="text-amber-600">já vinculada</small>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Vincular uma TAG (vinda do relatório) a uma máquina: sugestões pelo nome + escolha livre na árvore. */
function AssistenteVinculo(p: { banco: BancoAberto; tag: string; descricao: string; vincular: (tag: string, descricao: string, no: number) => void; fechar: () => void }) {
  const sugestoes = sugerir(p.tag, p.descricao, p.banco.maquinas(), (id) => p.banco.caminho(id), 6)
  return (
    <div className="cartao-inicio">
      <p className="text-xs text-cinza">Vincular ao banco</p>
      <h2 className="titulo mt-1 text-2xl">
        <span className="tag">{p.tag}</span>
      </h2>
      <p className="text-sm text-cinza">{p.descricao}</p>
      <p className="mt-3 text-sm">Máquinas parecidas neste banco (ou escolha qualquer uma na árvore e use “Vincular”):</p>
      <ul className="mt-2 divide-y divide-linha">
        {sugestoes.map((s) => (
          <li key={s.maquina.id}>
            <button className="linha-recente" onClick={() => p.vincular(p.tag, p.descricao, s.maquina.id)}>
              <span className="banco-nota" style={{ ['--n' as string]: s.nota }}>
                {Math.round(s.nota * 100)}%
              </span>
              <span className="min-w-0 flex-1 truncate">{s.caminho.join(' › ')}</span>
              <span className="text-xs font-semibold">Vincular →</span>
            </button>
          </li>
        ))}
        {!sugestoes.length && <li className="py-3 text-sm text-cinza">Nenhuma máquina parecida. Confira se é o banco certo.</li>}
      </ul>
      <button className={`${btnFantasma} mt-3`} onClick={p.fechar}>
        Agora não
      </button>
    </div>
  )
}

function ListaVinculos({ vinculos, desvincular }: { vinculos: Vinculos; desvincular: (tag: string) => void }) {
  const lista = Object.entries(vinculos).sort(([a], [b]) => a.localeCompare(b))
  if (!lista.length) return null
  return (
    <section className="cartao-inicio mt-8">
      <h3 className="titulo mb-1">Vínculos TAG ↔ banco ({lista.length})</h3>
      <p className="mb-3 text-xs text-cinza">Ficam guardados no SharePoint (VibDocs/config/vinculos-omnitrend.json) e valem para toda a equipe.</p>
      <div className="overflow-auto">
        <table className="banco-tabela">
          <thead>
            <tr>
              <th>TAG</th>
              <th>Descrição</th>
              <th>Máquina no banco</th>
              <th>Por</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map(([tag, v]) => (
              <tr key={tag}>
                <td className="tag">{tag}</td>
                <td className="text-cinza">{v.descricao}</td>
                <td>
                  {v.caminho.join(' › ')}
                  <small className="block text-cinza">{v.banco}</small>
                </td>
                <td className="text-xs text-cinza">
                  {v.por}
                  <br />
                  {new Date(v.em).toLocaleDateString('pt-BR')}
                </td>
                <td>
                  <button className={btnMini} onClick={() => desvincular(tag)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

