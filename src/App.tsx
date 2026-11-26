import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { GerenciarUsuarios, MeuPerfil } from './auth/Contas'
import { TelaLogin } from './auth/TelaLogin'
import { Abas, btn, btnFantasma, btnPri } from './editor/campos'
import { calcularIndicadores } from './lib/indicadores'
import { Contador } from './ui/Contador'
import { IcAnomalia, IcEquipamentos, IcMais, IcPrevia, IcRelatorio } from './ui/Icones'
import { Marca, Moldura } from './ui/Moldura'
import { BotaoTema } from './ui/Tema'
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
import { anomaliaDe, aplicarHistorico, equipamentosAnomalia, hojeISO, mesmoHistorico, normalizar, novoRelatorio, type Relatorio } from './lib/relatorio'
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
      <Moldura>
        <h2 className="titulo text-2xl">Abrir os dados</h2>
        <p className="mt-2 text-sm leading-relaxed text-grafite">
          Escolha a pasta do SharePoint que o OneDrive sincroniza neste computador. O VibDocs lê as planilhas de controle e guarda os
          rascunhos nela.
        </p>
        {!navegadorSuportado() ? (
          <p className="mt-6 rounded-[10px] bg-sinal-claro p-3 text-sm">
            Este navegador não abre pastas. Use o Microsoft Edge ou o Google Chrome no computador, ou importe as planilhas abaixo.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {lembrada && (
              <button
                className={`${btnPri} h-12 w-full justify-between px-4`}
                onClick={() => executar(async () => ((await reconectar(lembrada)) ? setRaiz(lembrada) : undefined))}
              >
                <span className="truncate">Reabrir {lembrada.name}</span>
                <span aria-hidden>↵</span>
              </button>
            )}
            <button
              className={`${lembrada ? btn : btnPri} h-12 w-full justify-between px-4`}
              onClick={() => executar(async () => setRaiz(await escolherPasta()))}
            >
              <span>{lembrada ? 'Escolher outra pasta' : 'Escolher pasta'}</span>
              <span aria-hidden>⌕</span>
            </button>
            <p className="text-xs text-cinza">PRUFTECHNIK MGS › Integração de Dados Pruftechnik MGS VSB - Documentos</p>
          </div>
        )}

        <div className="mt-10 border-t border-linha pt-6">
          <h3 className="text-sm font-semibold">Sem a pasta sincronizada</h3>
          <p className="mt-1 text-xs text-cinza">Importe uma ou várias planilhas: a mais recente vira o mês do relatório e as outras, histórico.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="campo w-auto" value={usina} onChange={(e) => setUsina(e.target.value)} aria-label="Usina">
              {USINAS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <label className={btn}>
              Importar planilhas
              <input type="file" accept=".xlsx" multiple className="sr-only" onChange={(e) => importarXlsx([...(e.target.files ?? [])])} />
            </label>
            <button className={btnFantasma} onClick={abrirDemo}>
              Ver demonstração
            </button>
          </div>
        </div>
        {erro && <p className="mt-6 rounded-[10px] bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      </Moldura>
    )
  }

  // ---------- login ----------
  if (repo && !usuario) {
    if (!sessaoVerificada) return <p className="p-8 text-sm text-cinza">Verificando sessão…</p>
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
    estado === 'salvando'
      ? 'Salvando…'
      : estado === 'pendente'
        ? 'Alterações não salvas'
        : estado === 'erro'
          ? 'Erro ao salvar'
          : salvoEm
            ? `Salvo às ${salvoEm}${raiz ? ' no SharePoint' : ' neste navegador'}`
            : ''
  const ind = rel ? calcularIndicadores(rel) : undefined
  const atualInd = ind && { exec: ind.execucao.at(-1)?.indice ?? null, reinc: ind.reincidencia.at(-1)?.indice ?? null }
  const abasTrilho: [Aba, string, () => ReactNode][] = [
    ['relatorio', 'Relatório', IcRelatorio],
    ['equipamentos', 'Equipamentos', IcEquipamentos],
    ['anomalias', 'Anomalias', IcAnomalia],
  ]

  // ---------- editor + prévia ----------
  return (
    <>
      <div className="tela flex h-full">
        {/* Trilho lateral */}
        <aside className="flex w-[4.25rem] shrink-0 flex-col items-center gap-2 bg-preto py-4">
          <div className="mb-4" title="VibDocs">
            <Marca tamanho={32} />
          </div>
          {abasTrilho.map(([id, nome, Icone]) => (
            <button key={id} className="trilho-item" aria-current={aba === id ? 'page' : undefined} title={nome} onClick={() => setAba(id)}>
              <Icone />
              {id === 'anomalias' && nAnom > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-sinal px-1 text-[10px] font-bold text-preto">
                  {nAnom}
                </span>
              )}
            </button>
          ))}
          <div className="my-2 h-px w-8 bg-white/10" />
          <button className="trilho-item" title="Novo relatório avulso (qualquer usina ou área, fora da planilha)" onClick={novoAvulso}>
            <IcMais />
          </button>
          <div className="flex-1" />
          <BotaoTema className="trilho-item" />
          {usuario && (
            <details className="relative">
              <summary className="trilho-item cursor-pointer list-none" title={usuario.nome}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-sinal text-sm font-bold text-preto">
                  {usuario.nome.trim().charAt(0).toUpperCase()}
                </span>
              </summary>
              <div className="surgir absolute bottom-0 left-full z-40 ml-3 w-60 rounded-[14px] border border-linha bg-elevada p-1.5 text-sm shadow-[var(--t-sombra)]">
                <div className="px-2.5 py-2">
                  <div className="font-semibold">{usuario.nome}</div>
                  <div className="text-xs text-cinza">
                    {PAPEIS[usuario.papel]}
                    {usuario.cargo ? `, ${usuario.cargo}` : ''}
                  </div>
                </div>
                <div className="my-1 h-px bg-linha" />
                {usuario.id !== USUARIO_DEMO.id && (
                  <>
                    <button className="menu-item" onClick={() => setJanela('perfil')}>
                      Meu perfil
                    </button>
                    {usuario.papel === 'admin' && (
                      <button className="menu-item" onClick={() => setJanela('usuarios')}>
                        Usuários
                      </button>
                    )}
                    <button className="menu-item" onClick={sairDaConta}>
                      Sair da conta
                    </button>
                  </>
                )}
                <button className="menu-item text-cinza" onClick={sair}>
                  Trocar fonte de dados
                </button>
              </div>
            </details>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra superior: caminho Usina / Mês / Área e ações */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linha bg-superficie px-5 py-3">
            {!rel?.avulso ? (
              <nav className="caminho flex items-center gap-1 text-sm" aria-label="Relatório aberto">
                <select value={usina} onChange={(e) => setUsina(e.target.value)} disabled={!raiz} aria-label="Usina">
                  {USINAS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <span className="text-[#c9c9c4]">/</span>
                {raiz ? (
                  <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                    {Object.entries(meses).flatMap(([ano, ms]) =>
                      ms.map((m) => (
                        <option key={`${ano}/${m}`} value={`${ano}/${m}`}>
                          {m.slice(3)} {ano}
                        </option>
                      )),
                    )}
                  </select>
                ) : (
                  <span className="px-2 text-cinza">{fonteManual}</span>
                )}
                <span className="text-[#c9c9c4]">/</span>
                <select value={sigla} onChange={(e) => setSigla(e.target.value)} aria-label="Área" className="titulo">
                  {siglas.map(([s, n]) => (
                    <option key={s} value={s}>
                      {s} ({n})
                    </option>
                  ))}
                </select>
              </nav>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-sinal-claro px-3 py-1 text-sm font-medium">Relatório avulso, {rel.usina}</span>
                {linhas.length > 0 && (
                  <button className={btnFantasma} onClick={fecharAvulso}>
                    Voltar à área
                  </button>
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {carregandoHist && <span className="text-xs text-amber-700">{carregandoHist}</span>}
              <span className={`mr-1 flex items-center gap-1.5 text-xs ${estado === 'erro' ? 'text-red-700' : 'text-cinza'}`}>
                {textoEstado && (
                  <span className={`h-1.5 w-1.5 rounded-full ${estado === 'salvo' ? 'bg-green-600' : estado === 'erro' ? 'bg-red-600' : 'bg-sinal'}`} />
                )}
                {textoEstado}
              </span>
              {rel && !raiz && (
                <button className={btnFantasma} onClick={baixarRascunho} title="Sem pasta conectada: baixe o rascunho para guardar no SharePoint">
                  Baixar rascunho
                </button>
              )}
              <button
                className={btnFantasma}
                onClick={() => setPreviaAberta((v) => !v)}
                aria-pressed={previaAberta}
                title={previaAberta ? 'Fechar prévia' : 'Abrir prévia'}
              >
                <IcPrevia />
                {previaAberta ? 'Fechar prévia' : 'Abrir prévia'}
              </button>
              <button className={btn} onClick={exportarWord} disabled={!rel || gerandoWord}>
                {gerandoWord ? 'Gerando Word…' : 'Exportar Word'}
              </button>
              <button className={btnPri} onClick={() => window.print()} disabled={!rel}>
                Exportar PDF
              </button>
            </div>
          </header>

          {janela === 'perfil' && usuario && repo && (
            <MeuPerfil repo={repo} usuario={usuario} mudou={setUsuario} fechar={() => setJanela(undefined)} />
          )}
          {janela === 'usuarios' && usuario && repo && (
            <GerenciarUsuarios repo={repo} usuario={usuario} fechar={() => setJanela(undefined)} />
          )}
          {erro && <p className="surgir border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-800">{erro}</p>}
          {aviso && (
            <p className="surgir flex items-center border-b border-green-200 bg-green-50 px-5 py-2 text-sm text-green-900">
              {aviso}
              <button className={`${btnFantasma} ml-auto`} onClick={() => setAviso('')}>
                Fechar
              </button>
            </p>
          )}

          {!rel ? (
            <p className="p-8 text-sm text-cinza">Carregando o relatório…</p>
          ) : (
            <>
              {/* Faixa de números do relatório */}
              <section className="grid grid-cols-2 gap-3 px-5 pt-4 lg:grid-cols-4" aria-label="Resumo">
                {(
                  [
                    ['Equipamentos', <Contador valor={rel.equipamentos.length} />, 'na área'],
                    ['Anomalias', <Contador valor={nAnom} />, 'com página no relatório'],
                    ['Execução', <Contador valor={atualInd?.exec == null ? null : atualInd.exec * 100} casas={1} sufixo="%" />, 'das ordens do mês'],
                    [
                      'Reincidência',
                      <Contador valor={atualInd?.reinc == null ? null : atualInd.reinc * 100} casas={1} sufixo="%" />,
                      'das anomalias do mês',
                    ],
                  ] as [string, ReactNode, string][]
                ).map(([rotulo, valor, dica]) => (
                  <div key={rotulo} className="numero painel px-4 py-3">
                    <div className="text-[13px] text-cinza">{rotulo}</div>
                    <div className="titulo-grande mt-1 text-[28px]">{valor}</div>
                    <div className="mt-1 text-xs text-cinza">{dica}</div>
                  </div>
                ))}
              </section>

              <Group orientation="horizontal" className="min-h-0 flex-1 p-5 pt-4">
                <Panel defaultSize="52" minSize="30">
                  <div className="painel flex h-full flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center gap-3 border-b border-linha px-4 py-3">
                      <Abas
                        ativa={aba}
                        mudar={setAba}
                        itens={[
                          ['relatorio', 'Relatório'],
                          ['equipamentos', `Equipamentos ${rel.equipamentos.length}`],
                          ['anomalias', `Anomalias ${nAnom}`],
                        ]}
                      />
                      <span className="tag ml-auto truncate text-sm text-cinza" title="Código do relatório">
                        {rel.codigo}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
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
                    <Separator className="divisor mx-1.5 w-2" />
                    <Panel defaultSize="48" minSize="20">
                      <div className="painel h-full overflow-auto bg-[var(--t-tela-previa)]">
                        <Previa
                          r={rel}
                          editarImagens={(local, imagens) =>
                            atualizar((x) => {
                              const eq = x.equipamentos.find((q) => q.local === local)
                              return eq ? { ...x, anomalias: { ...x.anomalias, [local]: { ...anomaliaDe(x, eq), imagens } } } : x
                            })
                          }
                        />
                      </div>
                    </Panel>
                  </>
                )}
              </Group>
            </>
          )}
        </div>
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
