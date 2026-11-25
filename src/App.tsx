import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { GerenciarUsuarios, MeuPerfil } from './auth/Contas'
import { TelaLogin } from './auth/TelaLogin'
import { btn, btnPri } from './editor/campos'
import {
  encerrarSessao,
  PAPEIS,
  repoNavegador,
  repoPasta,
  retomarSessao,
  type Usuario,
} from './lib/usuarios'
import { PainelAnomalias } from './editor/PainelAnomalias'
import { PainelEquipamentos } from './editor/PainelEquipamentos'
import { PainelRelatorio } from './editor/PainelRelatorio'
import {
  lerAbaVibracao,
  lerArquivoVibracao,
  localizarPlanilha,
  mesesDisponiveis,
  siglaArea,
  USINAS,
  type LinhaControle,
} from './lib/controle'
import { historicoDemo, linhasDemo } from './lib/demo'
import { carregarHistoricoPasta, mesDoNome, montarExecucao, montarHistorico, type Execucao, type FonteHistorico, type Historico } from './lib/historico'
import { escolherPasta, esquecerPasta, navegadorSuportado, pastaLembrada, reconectar } from './lib/pasta'
import { lerDaPasta, lerLocal, maisRecente, proximaSequencia, salvarEmitido, salvarLocal, salvarNaPasta } from './lib/rascunho'
import { aplicarHistorico, equipamentosAnomalia, hojeISO, mesmoHistorico, normalizar, novoRelatorio, type Relatorio } from './lib/relatorio'
import { Previa } from './report/Previa'

type Aba = 'relatorio' | 'equipamentos' | 'anomalias'
type Estado = 'salvo' | 'salvando' | 'pendente' | 'erro'

const mesAtual = () => hojeISO().slice(0, 7)

const FONTE_DEMO = 'demonstração (dados fictícios)'
const USUARIO_DEMO: Usuario = {
  id: 'demo',
  nome: 'Usuário de demonstração',
  email: '',
  cargo: '',
  papel: 'tecnico',
  ativo: true,
  salt: '',
  hash: '',
  iteracoes: 0,
  trocarSenha: false,
  criadoEm: '',
  atualizadoEm: '',
}

export default function App() {
  // ---------- fonte dos dados ----------
  const [raiz, setRaiz] = useState<FileSystemDirectoryHandle>()
  const [lembrada, setLembrada] = useState<FileSystemDirectoryHandle>()
  const [fonteManual, setFonteManual] = useState<string>() // .xlsx importado, demonstração ou avulso
  const [erro, setErro] = useState('')

  // ---------- seleção ----------
  const [usina, setUsina] = useState<string>('Mineração')
  const [meses, setMeses] = useState<Record<string, string[]>>({})
  const [mes, setMes] = useState('') // "AAAA/MM-Mês" (pasta do SharePoint)
  const [linhas, setLinhas] = useState<LinhaControle[]>([])
  const [mesManual, setMesManual] = useState<string>() // AAAA-MM do modo manual/demonstração
  // ---------- histórico ----------
  const [hist, setHist] = useState<{ historico: Historico; execucao: Execucao; fonte: string }>()
  const [carregandoHist, setCarregandoHist] = useState('')
  const [sigla, setSigla] = useState('')

  // ---------- conta ----------
  const repo = useMemo(() => (raiz ? repoPasta(raiz) : fonteManual ? repoNavegador() : undefined), [raiz, fonteManual])
  const [usuario, setUsuario] = useState<Usuario>()
  const [sessaoVerificada, setSessaoVerificada] = useState(false)
  const [janela, setJanela] = useState<'perfil' | 'usuarios'>()
  const analista = usuario?.nome ?? ''
  const usuarioRef = useRef(analista)
  usuarioRef.current = analista

  // ---------- relatório em edição ----------
  const [rel, setRel] = useState<Relatorio>()
  const [aba, setAba] = useState<Aba>('equipamentos')
  const [anomaliaSel, setAnomaliaSel] = useState<string>()
  const [previaAberta, setPreviaAberta] = useState(true)
  const [estado, setEstado] = useState<Estado>('salvo')
  const [salvoEm, setSalvoEm] = useState('')
  const sujo = useRef(false)

  useEffect(() => {
    pastaLembrada().then(setLembrada)
    if (new URLSearchParams(location.search).has('demo')) abrirDemo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Retoma a sessão salva quando a fonte de dados (e, portanto, o cadastro de contas) fica disponível.
  useEffect(() => {
    setUsuario(undefined)
    setSessaoVerificada(false)
    if (!repo) return
    if (fonteManual === FONTE_DEMO) {
      // Demonstração: só dados fictícios, sem conta real.
      setUsuario(USUARIO_DEMO)
      setSessaoVerificada(true)
      return
    }
    retomarSessao(repo)
      .then(setUsuario)
      .catch(() => undefined)
      .finally(() => setSessaoVerificada(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  const executar = useCallback(async (f: () => Promise<void>) => {
    setErro('')
    try {
      await f()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErro((e as Error).message)
    }
  }, [])

  const mesRef = raiz && mes ? `${mes.split('/')[0]}-${mes.split('/')[1].slice(0, 2)}` : (mesManual ?? mesAtual())

  // Pasta conectada: histórico de todas as planilhas de controle da usina (com cache no navegador).
  useEffect(() => {
    if (!raiz || !usuario) return
    let cancelado = false
    setHist(undefined)
    setCarregandoHist('lendo histórico…')
    carregarHistoricoPasta(raiz, usina as (typeof USINAS)[number], (f, t) => !cancelado && setCarregandoHist(`histórico ${f}/${t}`))
      .then(({ historico, execucao, meses: ms, falhas }) => {
        if (cancelado) return
        setHist({ historico, execucao, fonte: `${ms.length} planilhas de controle de ${usina}` })
        setCarregandoHist(falhas.length ? `histórico: ${falhas.length} planilha(s) não lida(s)` : '')
        if (falhas.length) console.warn('Planilhas não lidas no histórico:', falhas)
      })
      .catch((e) => !cancelado && setCarregandoHist(`histórico indisponível: ${(e as Error).message}`))
    return () => {
      cancelado = true
    }
  }, [raiz, usina, usuario])

  // Pasta conectada: meses disponíveis da usina.
  useEffect(() => {
    if (!raiz) return
    executar(async () => {
      const m = await mesesDisponiveis(raiz, usina as (typeof USINAS)[number])
      setMeses(m)
      const anos = Object.keys(m).sort()
      setMes(anos.length ? `${anos.at(-1)}/${m[anos.at(-1)!].at(-1)}` : '')
    })
  }, [raiz, usina, executar])

  // Pasta conectada: lê a planilha do mês.
  useEffect(() => {
    if (!raiz || !mes) return
    executar(async () => {
      const [ano, mesPasta] = mes.split('/')
      const l = await lerAbaVibracao(await localizarPlanilha(raiz, usina as (typeof USINAS)[number], ano, mesPasta))
      setLinhas(l)
      const s = [...new Set(l.map((x) => siglaArea(x.local)))].sort()
      setSigla((atual) => (s.includes(atual) ? atual : s[0] ?? ''))
    })
  }, [raiz, usina, mes, executar])

  const siglas = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of linhas) c[siglaArea(l.local)] = (c[siglaArea(l.local)] ?? 0) + 1
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]))
  }, [linhas])

  // ---------- salvamento ----------
  const salvar = useCallback(
    async (r: Relatorio) => {
      setEstado('salvando')
      try {
        await salvarLocal(r)
        if (raiz) await salvarNaPasta(raiz, r)
        sujo.current = false
        setEstado('salvo')
        setSalvoEm(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      } catch (e) {
        setEstado('erro')
        setErro(`Não foi possível salvar: ${(e as Error).message}`)
      }
    },
    [raiz],
  )

  // Autosave 1,5 s depois da última alteração.
  useEffect(() => {
    if (!rel || !sujo.current) return
    setEstado('pendente')
    const t = setTimeout(() => salvar(rel), 1500)
    return () => clearTimeout(t)
  }, [rel, salvar])

  // Salva antes de sair da página.
  useEffect(() => {
    const aviso = (ev: BeforeUnloadEvent) => {
      if (sujo.current) ev.preventDefault()
    }
    addEventListener('beforeunload', aviso)
    return () => removeEventListener('beforeunload', aviso)
  }, [])

  const atualizar = useCallback((f: (r: Relatorio) => Relatorio) => {
    sujo.current = true
    setRel((r) =>
      r ? normalizar({ ...f(r), atualizadoEm: new Date().toISOString(), atualizadoPor: usuarioRef.current || r.atualizadoPor }) : r,
    )
  }, [])

  // Mantém a cópia do histórico do relatório em dia (só grava se mudou).
  useEffect(() => {
    if (!rel || !hist) return
    const novo = aplicarHistorico(rel, hist.historico, hist.execucao, hist.fonte)
    if (mesmoHistorico(novo.historico, rel.historico)) return
    sujo.current = true
    setRel(novo)
  }, [rel, hist])

  // Abre (ou cria) o relatório da área selecionada.
  const relAvulso = !!rel?.avulso
  useEffect(() => {
    if (!usuario || relAvulso || !sigla || !linhas.length) return
    let cancelado = false
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      const local = await lerLocal(usina, mesRef, sigla)
      const pasta = raiz ? await lerDaPasta(raiz, usina, mesRef, sigla) : undefined
      let r = maisRecente(local, pasta)
      if (!r) {
        const seq = raiz ? await proximaSequencia(raiz, usina, mesRef) : 1
        r = novoRelatorio({ usina, sigla, mesReferencia: mesRef, sequencia: seq, analista, linhas })
      } else {
        // Rascunho salvo antes de existir o campo "executado": completa pela planilha do mês.
        const porLocal = new Map(linhas.map((l) => [l.local, l]))
        r = { ...r, equipamentos: r.equipamentos.map((e) => (e.executado === undefined && porLocal.has(e.local) ? { ...e, executado: porLocal.get(e.local)!.executado } : e)) }
      }
      if (cancelado) return
      sujo.current = false
      setRel(r)
      setEstado('salvo')
      setSalvoEm('')
      setAnomaliaSel(undefined)
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usina, mesRef, sigla, linhas, raiz, relAvulso, usuario?.id])

  const fecharAvulso = () =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      sujo.current = false
      setRel(undefined) // dispara o carregamento do relatório da área selecionada
      setAba('equipamentos')
    })

  // ---------- ações ----------
  function carregarManual(nome: string, l: LinhaControle[], mes?: string, historico?: FonteHistorico[]) {
    setLinhas(l)
    setSigla([...new Set(l.map((x) => siglaArea(x.local)))].sort()[0] ?? '')
    setFonteManual(nome)
    setMesManual(mes)
    setHist(historico?.length ? { historico: montarHistorico(historico), execucao: montarExecucao(historico), fonte: nome } : undefined)
  }

  /** Modo manual: uma ou várias planilhas. A mais recente vira o mês do relatório; as outras, histórico. */
  const importarXlsx = (arquivos: File[]) =>
    executar(async () => {
      if (!arquivos.length) return
      const fontes: FonteHistorico[] = []
      for (const a of arquivos) {
        const linhas = await lerArquivoVibracao(a)
        fontes.push({ mesRef: mesDoNome(a.name) ?? mesAtual(), nome: a.name, linhas })
      }
      fontes.sort((x, y) => x.mesRef.localeCompare(y.mesRef))
      const atual = fontes.at(-1)!
      const linhasAtuais = (await lerArquivoVibracao(arquivos.find((a) => a.name === atual.nome)!)) as LinhaControle[]
      const nome = arquivos.length === 1 ? atual.nome : `${arquivos.length} planilhas importadas`
      carregarManual(nome, linhasAtuais, atual.mesRef, fontes.slice(0, -1))
    })

  const abrirDemo = () => {
    const mes = mesAtual()
    carregarManual(FONTE_DEMO, linhasDemo(), mes, historicoDemo(mes))
  }

  const novoAvulso = () =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      const r = novoRelatorio({
        usina,
        sigla: 'NOVA',
        mesReferencia: mesAtual(),
        sequencia: raiz ? await proximaSequencia(raiz, usina, mesAtual()) : 1,
        analista,
        linhas: [],
        avulso: true,
      })
      setFonteManual((f) => f ?? 'relatório avulso')
      sujo.current = true
      setRel(r)
      setAba('relatorio')
    })

  const sair = () =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      if (raiz) {
        await esquecerPasta()
        setLembrada(undefined)
      }
      setRaiz(undefined)
      setFonteManual(undefined)
      setLinhas([])
      setRel(undefined)
    })

  const sairDaConta = () =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      sujo.current = false
      encerrarSessao()
      setUsuario(undefined)
      setRel(undefined)
      setJanela(undefined)
    })

  const baixar = (blob: Blob, nome: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const baixarRascunho = () => {
    if (rel) baixar(new Blob([JSON.stringify(rel, null, 2)], { type: 'application/json' }), `${rel.codigo}.json`)
  }

  const [gerandoWord, setGerandoWord] = useState(false)
  const [aviso, setAviso] = useState('')
  const exportarWord = () =>
    executar(async () => {
      if (!rel) return
      setGerandoWord(true)
      setAviso('')
      try {
        const { gerarWord, nomeArquivo } = await import('./lib/word') // carregado só quando usado
        const blob = await gerarWord(rel)
        const nome = nomeArquivo(rel, 'docx')
        baixar(blob, nome)
        if (raiz) setAviso(`Word salvo também no SharePoint: ${await salvarEmitido(raiz, rel, nome, blob)}`)
      } finally {
        setGerandoWord(false)
      }
    })

  // ---------- tela de entrada ----------
  if (!raiz && !fonteManual) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">VibDocs</h1>
        <p className="mt-1 text-sm text-zinc-600">Relatórios de análise de vibração</p>
        {!navegadorSuportado() ? (
          <p className="mt-6 rounded bg-amber-100 p-3 text-sm">
            Este navegador não permite acessar pastas. Use o Microsoft Edge ou o Google Chrome no computador, ou importe a
            planilha manualmente abaixo.
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
            <select className="rounded border px-2 py-1" value={usina} onChange={(e) => setUsina(e.target.value)}>
              {USINAS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <label className={btn + ' cursor-pointer'}>
              Importar planilha de controle (.xlsx)
              <input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => importarXlsx([...(e.target.files ?? [])])} />
            </label>
            <button className={btn} onClick={abrirDemo}>
              Ver demonstração
            </button>
          </div>
        </div>
        {erro && <p className="mt-4 rounded bg-red-100 p-3 text-sm text-red-800">{erro}</p>}
      </main>
    )
  }

  // ---------- login ----------
  if (repo && !usuario) {
    if (!sessaoVerificada) return <p className="p-8 text-sm text-zinc-500">Verificando sessão…</p>
    return (
      <TelaLogin
        repo={repo}
        onEntrar={(u) => setUsuario(u)}
        onVoltar={() => {
          setRaiz(undefined)
          setFonteManual(undefined)
          setLinhas([])
        }}
      />
    )
  }

  const nAnom = rel ? equipamentosAnomalia(rel).length : 0
  const textoEstado =
    estado === 'salvando' ? 'salvando…' : estado === 'pendente' ? 'alterações não salvas' : estado === 'erro' ? 'erro ao salvar' : salvoEm ? `salvo às ${salvoEm}${raiz ? ' · SharePoint' : ' · neste navegador'}` : ''

  // ---------- editor + prévia ----------
  return (
    <>
      <div className="tela flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2 text-sm">
          <b className="mr-2">VibDocs</b>
          {!rel?.avulso && (
            <>
              <select className="rounded border px-2 py-1" value={usina} onChange={(e) => setUsina(e.target.value)} disabled={!raiz}>
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
            </>
          )}
          {rel?.avulso && (
            <>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">relatório avulso · {rel.usina}</span>
              {linhas.length > 0 && (
                <button className={btn} onClick={fecharAvulso}>
                  Voltar à área
                </button>
              )}
            </>
          )}
          <button className={btn} onClick={novoAvulso} title="Relatório para qualquer usina/área, fora da planilha de controle">
            + Avulso
          </button>
          <div className="ml-auto flex items-center gap-2">
            {carregandoHist && <span className="text-xs text-amber-700">{carregandoHist}</span>}
            <span className={`text-xs ${estado === 'erro' ? 'text-red-700' : 'text-zinc-500'}`}>{textoEstado}</span>
            {rel && !raiz && (
              <button className={btn} onClick={baixarRascunho} title="Sem pasta conectada: baixe o rascunho para guardar no SharePoint">
                Baixar rascunho
              </button>
            )}
            <button className={btn} onClick={() => setPreviaAberta((v) => !v)}>
              {previaAberta ? 'Fechar prévia' : 'Abrir prévia'}
            </button>
            <button className={btn} onClick={exportarWord} disabled={!rel || gerandoWord}>
              {gerandoWord ? 'Gerando Word…' : 'Exportar Word'}
            </button>
            <button className={btnPri} onClick={() => window.print()} disabled={!rel}>
              Exportar PDF
            </button>
            {usuario && (
              <details className="relative">
                <summary className={btn + ' cursor-pointer list-none'} title="Minha conta">
                  👤 {usuario.nome}
                </summary>
                <div className="absolute right-0 z-40 mt-1 w-56 rounded border bg-white p-1 text-sm shadow-lg">
                  <div className="border-b px-2 py-1 text-xs text-zinc-500">
                    {PAPEIS[usuario.papel]}
                    {usuario.cargo ? ` · ${usuario.cargo}` : ''}
                  </div>
                  {usuario.id !== USUARIO_DEMO.id && (
                    <>
                      <button className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100" onClick={() => setJanela('perfil')}>
                        Meu perfil
                      </button>
                      {usuario.papel === 'admin' && (
                        <button className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100" onClick={() => setJanela('usuarios')}>
                          Usuários
                        </button>
                      )}
                      <button className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-100" onClick={sairDaConta}>
                        Sair da conta
                      </button>
                    </>
                  )}
                  <button className="block w-full rounded px-2 py-1 text-left text-zinc-500 hover:bg-zinc-100" onClick={sair}>
                    Trocar fonte de dados
                  </button>
                </div>
              </details>
            )}
          </div>
        </header>
        {janela === 'perfil' && usuario && repo && (
          <MeuPerfil repo={repo} usuario={usuario} mudou={setUsuario} fechar={() => setJanela(undefined)} />
        )}
        {janela === 'usuarios' && usuario && repo && (
          <GerenciarUsuarios repo={repo} usuario={usuario} fechar={() => setJanela(undefined)} />
        )}
        {erro && <p className="bg-red-100 px-3 py-2 text-sm text-red-800">{erro}</p>}
        {aviso && (
          <p className="flex items-center bg-green-100 px-3 py-2 text-sm text-green-900">
            {aviso}
            <button className="ml-auto text-xs underline" onClick={() => setAviso('')}>
              ok
            </button>
          </p>
        )}

        {!rel ? (
          <p className="p-6 text-sm text-zinc-500">Carregando…</p>
        ) : (
          <Group orientation="horizontal" className="min-h-0 flex-1">
            <Panel defaultSize="50" minSize="30">
              <div className="flex h-full flex-col">
                <nav className="flex shrink-0 gap-1 border-b bg-white px-2 pt-2 text-sm">
                  {(
                    [
                      ['relatorio', 'Relatório'],
                      ['equipamentos', `Equipamentos (${rel.equipamentos.length})`],
                      ['anomalias', `Anomalias (${nAnom})`],
                    ] as [Aba, string][]
                  ).map(([id, nome]) => (
                    <button
                      key={id}
                      onClick={() => setAba(id)}
                      className={`rounded-t border border-b-0 px-3 py-1 ${aba === id ? 'bg-zinc-50 font-semibold' : 'border-transparent text-zinc-600'}`}
                    >
                      {nome}
                    </button>
                  ))}
                  <span className="ml-auto self-center pb-1 font-mono text-xs text-zinc-500">{rel.codigo}</span>
                </nav>
                <div className="min-h-0 flex-1 overflow-auto bg-zinc-50">
                  {aba === 'relatorio' && <PainelRelatorio r={rel} atualizar={atualizar} />}
                  {aba === 'equipamentos' && <PainelEquipamentos r={rel} atualizar={atualizar} />}
                  {aba === 'anomalias' && (
                    <PainelAnomalias r={rel} atualizar={atualizar} selecionado={anomaliaSel} selecionar={setAnomaliaSel} />
                  )}
                </div>
              </div>
            </Panel>
            {previaAberta && (
              <>
                <Separator className="w-1.5 bg-zinc-300 hover:bg-zinc-400" />
                <Panel defaultSize="50" minSize="20">
                  <div className="h-full overflow-auto bg-zinc-200">
                    <Previa r={rel} />
                  </div>
                </Panel>
              </>
            )}
          </Group>
        )}
      </div>

      {/* Impressão/PDF: a prévia fora do layout de painéis, em largura A4 real. */}
      {rel && (
        <div className="so-impressao">
          <Previa r={rel} />
        </div>
      )}
    </>
  )
}
