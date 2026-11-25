import { useEffect, useMemo, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { CONDICOES, eAnomalia } from './lib/condicao'
import { linhasDemo } from './lib/demo'
import {
  lerAbaVibracao,
  lerArquivoVibracao,
  localizarPlanilha,
  mesesDisponiveis,
  siglaArea,
  USINAS,
  type LinhaControle,
  type Usina,
} from './lib/controle'
import {
  escolherPasta,
  esquecerPasta,
  gravarTexto,
  navegadorSuportado,
  PASTA_VIBDOCS,
  pastaLembrada,
  reconectar,
  subpasta,
} from './lib/pasta'
import { cidadePadrao, gerarCodigo, hojeISO, type Relatorio } from './lib/relatorio'
import { Previa } from './report/Previa'

const btn = 'rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50'
const btnPri = 'rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50'

export default function App() {
  const [raiz, setRaiz] = useState<FileSystemDirectoryHandle>()
  // Plano B / demonstração: linhas vindas de um .xlsx escolhido à mão ou de dados fictícios.
  const [fonteManual, setFonteManual] = useState<string>()
  const [lembrada, setLembrada] = useState<FileSystemDirectoryHandle>()
  const [erro, setErro] = useState('')
  const [usina, setUsina] = useState<Usina>('Mineração')
  const [meses, setMeses] = useState<Record<string, string[]>>({})
  const [mes, setMes] = useState('') // "AAAA/MM-Mês"
  const [linhas, setLinhas] = useState<LinhaControle[]>([])
  const [sigla, setSigla] = useState('')
  const [normais, setNormais] = useState<Set<string>>(new Set())
  const [previaAberta, setPreviaAberta] = useState(true)
  const [salvoEm, setSalvoEm] = useState('')
  const [analista, setAnalista] = useState(() => localStorage.getItem('vibdocs.analista') ?? '')

  useEffect(() => {
    pastaLembrada().then(setLembrada)
  }, [])
  useEffect(() => localStorage.setItem('vibdocs.analista', analista), [analista])

  const executar = async (f: () => Promise<void>) => {
    setErro('')
    try {
      await f()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErro((e as Error).message)
    }
  }

  // Ao trocar de usina, lista os meses disponíveis.
  useEffect(() => {
    if (!raiz) return
    executar(async () => {
      const m = await mesesDisponiveis(raiz, usina)
      setMeses(m)
      const anos = Object.keys(m).sort()
      const ultimo = anos.length ? `${anos.at(-1)}/${m[anos.at(-1)!].at(-1)}` : ''
      setMes(ultimo)
    })
  }, [raiz, usina])

  // Ao trocar de mês, lê a aba de vibração.
  useEffect(() => {
    if (!raiz || !mes) return
    executar(async () => {
      const [ano, mesPasta] = mes.split('/')
      const info = await localizarPlanilha(raiz, usina, ano, mesPasta)
      const l = await lerAbaVibracao(info)
      setLinhas(l)
      setNormais(new Set())
      const siglas = [...new Set(l.map((x) => siglaArea(x.local)))].sort()
      setSigla((s) => (siglas.includes(s) ? s : siglas[0] ?? ''))
    })
  }, [raiz, usina, mes])

  const siglas = useMemo(() => {
    const cont: Record<string, number> = {}
    for (const l of linhas) cont[siglaArea(l.local)] = (cont[siglaArea(l.local)] ?? 0) + 1
    return Object.entries(cont).sort((a, b) => a[0].localeCompare(b[0]))
  }, [linhas])

  const daArea = useMemo(() => linhas.filter((l) => siglaArea(l.local) === sigla), [linhas, sigla])
  const candidatas = daArea.filter((l) => eAnomalia(l.condicao))

  const relatorio: Relatorio = useMemo(() => {
    const agora = hojeISO()
    const [ano, mesPasta] = raiz && mes ? mes.split('/') : [agora.slice(0, 4), agora.slice(5, 7)]
    const mesRef = `${ano}-${mesPasta.slice(0, 2)}`
    return {
      versao: 1,
      codigo: gerarCodigo(usina, sigla || 'XXX', mesRef, 1),
      usina,
      sigla,
      areaTitulo: usina === 'Mineração' ? sigla : sigla,
      mesReferencia: mesRef,
      dataExpedicao: hojeISO(),
      cidade: cidadePadrao(usina),
      equipe: { coleta: analista, analise: analista },
      equipamentos: daArea.map((l) => ({
        local: l.local,
        descricao: l.descricao,
        condicao: normais.has(l.local) ? '1' : l.condicao,
      })),
      anomalias: candidatas
        .filter((l) => !normais.has(l.local))
        .map((l) => ({
          local: l.local,
          equipamento: l.descricao,
          dataMedicao: '',
          reincidenteDesde: '',
          notasPR: '',
          condicao: l.condicao,
          situacao: '',
          recomendacao: '',
        })),
      atualizadoEm: new Date().toISOString(),
    }
  }, [usina, sigla, mes, daArea, candidatas, normais, analista])

  const carregarManual = (nome: string, l: LinhaControle[]) => {
    setLinhas(l)
    setNormais(new Set())
    setSigla([...new Set(l.map((x) => siglaArea(x.local)))].sort()[0] ?? '')
    setFonteManual(nome)
  }

  const importarXlsx = (arquivo?: File) =>
    executar(async () => {
      if (arquivo) carregarManual(arquivo.name, await lerArquivoVibracao(arquivo))
    })

  const salvarRascunho = () =>
    executar(async () => {
      if (!raiz) {
        // Sem pasta conectada: baixa o rascunho para o usuário guardar no SharePoint.
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([JSON.stringify(relatorio, null, 2)], { type: 'application/json' }))
        a.download = `${relatorio.codigo}.json`
        a.click()
        URL.revokeObjectURL(a.href)
        setSalvoEm(new Date().toLocaleTimeString('pt-BR'))
        return
      }
      const [aaaa, mm] = relatorio.mesReferencia.split('-')
      const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'rascunhos', usina, aaaa, mm, relatorio.codigo], true)
      await gravarTexto(dir, 'relatorio.json', JSON.stringify(relatorio, null, 2))
      setSalvoEm(new Date().toLocaleTimeString('pt-BR'))
    })

  // ---------------- Tela de conexão ----------------
  if (!raiz && !fonteManual) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">VibDocs</h1>
        <p className="mt-1 text-sm text-zinc-600">Relatórios de análise de vibração · teste técnico</p>
        {!navegadorSuportado() ? (
          <p className="mt-6 rounded bg-amber-100 p-3 text-sm">
            Este navegador não permite acessar pastas. Use o Microsoft Edge ou o Google Chrome no computador, ou
            importe a planilha manualmente abaixo.
          </p>
        ) : (
          <div className="mt-6 space-y-3 text-sm">
            <p>
              Escolha a pasta do SharePoint sincronizada pelo OneDrive:
              <br />
              <code className="text-xs">…\PRUFTECHNIK MGS\Integração de Dados Pruftechnik MGS VSB - Documentos</code>
            </p>
            <div className="flex gap-2">
              {lembrada && (
                <button
                  className={btnPri}
                  onClick={() => executar(async () => ((await reconectar(lembrada)) ? setRaiz(lembrada) : undefined))}
                >
                  Reabrir "{lembrada.name}"
                </button>
              )}
              <button className={lembrada ? btn : btnPri} onClick={() => executar(async () => setRaiz(await escolherPasta()))}>
                Escolher pasta…
              </button>
            </div>
          </div>
        )}
        <div className="mt-8 border-t pt-4 text-sm">
          <p className="mb-2 text-zinc-600">Sem a pasta sincronizada:</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded border px-2 py-1" value={usina} onChange={(e) => setUsina(e.target.value as Usina)}>
              {USINAS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <label className={btn + ' cursor-pointer'}>
              Importar planilha de controle (.xlsx)
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => importarXlsx(e.target.files?.[0])} />
            </label>
            <button className={btn} onClick={() => carregarManual('demonstração (dados fictícios)', linhasDemo())}>
              Ver demonstração
            </button>
          </div>
        </div>
        {erro && <p className="mt-4 rounded bg-red-100 p-3 text-sm text-red-800">{erro}</p>}
      </main>
    )
  }

  // ---------------- Editor + prévia ----------------
  return (
    <div className="print-root flex h-full flex-col">
      <header className="no-print flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2 text-sm">
        <b className="mr-2">VibDocs</b>
        <select className="rounded border px-2 py-1" value={usina} onChange={(e) => setUsina(e.target.value as Usina)}>
          {USINAS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        {raiz ? (
          <select className="rounded border px-2 py-1" value={mes} onChange={(e) => setMes(e.target.value)}>
            {Object.entries(meses).flatMap(([ano, ms]) =>
              ms.map((m) => (
                <option key={`${ano}/${m}`} value={`${ano}/${m}`}>
                  {m} {ano}
                </option>
              )),
            )}
          </select>
        ) : (
          <span className="text-xs text-zinc-500">fonte: {fonteManual}</span>
        )}
        <select className="rounded border px-2 py-1" value={sigla} onChange={(e) => setSigla(e.target.value)}>
          {siglas.map(([s, n]) => (
            <option key={s} value={s}>
              {s} ({n})
            </option>
          ))}
        </select>
        <input
          className="rounded border px-2 py-1"
          placeholder="Seu nome (analista)"
          value={analista}
          onChange={(e) => setAnalista(e.target.value)}
        />
        <div className="ml-auto flex items-center gap-2">
          {salvoEm && <span className="text-xs text-zinc-500">salvo às {salvoEm}</span>}
          <button className={btn} onClick={salvarRascunho}>
            Salvar rascunho
          </button>
          <button className={btn} onClick={() => setPreviaAberta((v) => !v)}>
            {previaAberta ? 'Fechar prévia' : 'Abrir prévia'}
          </button>
          <button className={btnPri} onClick={() => window.print()}>
            Exportar PDF
          </button>
          <button
            className={btn}
            title="Trocar de pasta"
            onClick={() =>
              executar(async () => {
                if (raiz) {
                  await esquecerPasta()
                  setLembrada(undefined)
                }
                setRaiz(undefined)
                setFonteManual(undefined)
                setLinhas([])
              })
            }
          >
            ⏏
          </button>
        </div>
      </header>
      {erro && <p className="no-print bg-red-100 px-3 py-2 text-sm text-red-800">{erro}</p>}

      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize="45" minSize="25" className="no-print">
          <div className="h-full overflow-auto p-3">
            <h2 className="mb-1 font-semibold">
              {usina} · {sigla} · {daArea.length} equipamentos · {relatorio.anomalias.length} anomalias
            </h2>
            <p className="mb-3 text-xs text-zinc-500">Código sugerido: {relatorio.codigo}</p>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-100 text-left">
                  <th className="p-1">Local de instalação</th>
                  <th className="p-1">Descrição</th>
                  <th className="p-1">Cond.</th>
                  <th className="p-1" />
                </tr>
              </thead>
              <tbody>
                {daArea.map((l) => {
                  const c = normais.has(l.local) ? '1' : l.condicao
                  const k = CONDICOES[c]
                  return (
                    <tr key={l.local} className="border-b">
                      <td className="p-1 font-mono">{l.local}</td>
                      <td className="p-1">{l.descricao}</td>
                      <td className="p-1">
                        <span className="rounded px-1.5" style={{ background: k?.cor, color: k?.texto }} title={k?.nome}>
                          {c || '–'}
                        </span>
                      </td>
                      <td className="p-1 text-right">
                        {eAnomalia(l.condicao) && (
                          <button
                            className="text-xs text-blue-700 underline"
                            onClick={() =>
                              setNormais((s) => {
                                const n = new Set(s)
                                if (n.has(l.local)) n.delete(l.local)
                                else n.add(l.local)
                                return n
                              })
                            }
                          >
                            {normais.has(l.local) ? 'desfazer' : 'marcar Normal'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        {previaAberta && (
          <>
            <Separator className="no-print w-1.5 bg-zinc-300 hover:bg-zinc-400" />
            <Panel defaultSize="55" minSize="20">
              <div className="h-full overflow-auto bg-zinc-200">
                <Previa r={relatorio} />
              </div>
            </Panel>
          </>
        )}
      </Group>
    </div>
  )
}
