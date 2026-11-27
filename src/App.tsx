import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { GerenciarUsuarios, MeuPerfil } from './auth/Contas'
import { TelaLogin } from './auth/TelaLogin'
import { Abas, btn, btnFantasma, btnPri } from './editor/campos'
import { calcularIndicadores } from './lib/indicadores'
import { Carregando, Contador, Copiar } from './ui/Contador'
import { comTransicao } from './ui/transicao'
import { Seletor } from './ui/Seletor'
import { Avisos, avisar } from './ui/Avisos'
import { Paleta, type ItemPaleta } from './ui/Paleta'
import { CONDICOES } from './lib/condicao'
import { gravarCondicoes } from './lib/planilhaEscrita'
import { IcAnomalia, IcEquipamentos, IcInicio, IcMais, IcPrevia, IcRelatorio } from './ui/Icones'
import { Marca, Moldura } from './ui/Moldura'
import { BotaoTema } from './ui/Tema'
import {
  encerrarSessao,
  PAPEIS,
  repoNavegador,
  repoPasta,
  nomeNoRelatorio,
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
import { guardarModelo, obterModelo, visualDoModelo, type VisualModelo } from './lib/modelo'
import { rascunhosRecentes } from './lib/rascunho'
import { lerDaPasta, lerLocal, maisRecente, proximaSequencia, salvarEmitido, salvarLocal, salvarNaPasta } from './lib/rascunho'
import { anomaliaDe, aplicarHistorico, artDaUsina, paginaPreenchida, type PerfilTecnico, equipamentosAnomalia, hojeISO, mesmoHistorico, normalizar, novoRelatorio, regrasContrato, setorDaTag, STATUS_RELATORIO, type StatusRelatorio, type EquipRel, type ImagemRef, type Relatorio, type Slot } from './lib/relatorio'
import { guardarImagem } from './lib/imagens'
import { gravarLembretes } from './lib/lembretesArquivo'
import { AjustarLargura, Previa } from './report/Previa'
import { Inicio } from './inicio/Inicio'
import { HistoricoPreditivo } from './historico/HistoricoPreditivo'
import { BancoVibracao, type FocoBanco } from './banco/BancoVibracao'
import { Cadastros } from './cadastros/Cadastros'
import { BuscaRelatorios } from './relatorios/BuscaRelatorios'
import { carregarTodas } from './lib/config'

type Aba = 'relatorio' | 'equipamentos' | 'anomalias'
type Estado = 'salvo' | 'salvando' | 'pendente' | 'erro'

const mesAtual = () => hojeISO().slice(0, 7)

const FONTE_DEMO = 'demonstração (dados fictícios)'
const USUARIO_DEMO: Usuario = {
  id: 'demo',
  nome: 'Usuário de demonstração',
  email: '',
  cargo: '',
  papel: 'admin', // demonstração: dados só no navegador, mostra todas as telas
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
  // contas ativas, para escolher os técnicos do relatório (traz nome completo e selo)
  const [tecnicos, setTecnicos] = useState<PerfilTecnico[]>([])
  useEffect(() => {
    if (!repo || !usuario || janela) return
    repo
      .ler()
      .then((l) =>
        setTecnicos(
          l.filter((u) => u.ativo).map((u) => ({ nome: nomeNoRelatorio(u), email: u.email, telefone: u.telefone, selo: u.selo })),
        ),
      )
      .catch(() => setTecnicos([]))
  }, [repo, usuario, janela])
  const analista = usuario ? nomeNoRelatorio(usuario) : ''
  const perfilTecnico: PerfilTecnico | undefined = usuario && {
    nome: analista,
    email: usuario.email,
    telefone: usuario.telefone,
    selo: usuario.selo,
  }
  const usuarioRef = useRef(analista)
  usuarioRef.current = analista

  // ---------- relatório em edição ----------
  const [rel, setRel] = useState<Relatorio>()
  const [aba, setAba] = useState<Aba>('equipamentos')
  // depois do login: página inicial (escolha da usina) e só então o editor
  const [tela, setTela] = useState<'inicio' | 'relatorio' | 'historico' | 'banco' | 'cadastros' | 'relatorios'>('inicio')
  // banco de vibração (Omnitrend): equipamento pedido por um botão "Banco"
  const [focoBanco, setFocoBanco] = useState<FocoBanco>()
  useEffect(() => {
    const pedido = (ev: Event) => {
      const d = (ev as CustomEvent<{ tag?: string; descricao?: string }>).detail ?? {}
      if (d.tag) setFocoBanco((x) => ({ tag: d.tag!, descricao: d.descricao ?? '', n: (x?.n ?? 0) + 1 }))
      comTransicao(() => setTela('banco'))
    }
    addEventListener('vibdocs:banco', pedido)
    return () => removeEventListener('vibdocs:banco', pedido)
  }, [])
  // página do Histórico preditivo: busca pedida (ex.: pelo botão da anomalia)
  const [buscaHP, setBuscaHP] = useState<{ busca: string; sugestoes: string[]; n: number }>({ busca: '', sugestoes: [], n: 0 })
  useEffect(() => {
    const pedido = (ev: Event) => {
      const d = (ev as CustomEvent<{ busca: string; sugestoes?: string[] }>).detail
      setBuscaHP((x) => ({ busca: d.busca, sugestoes: d.sugestoes ?? [], n: x.n + 1 }))
      comTransicao(() => setTela('historico'))
    }
    addEventListener('vibdocs:historico', pedido)
    return () => removeEventListener('vibdocs:historico', pedido)
  }, [])
  // "continuar de onde parou": mês e área a abrir quando a usina terminar de carregar
  const pendente = useRef<{ mesRef: string; sigla: string }>(undefined)
  const [anomaliaSel, setAnomaliaSel] = useState<string>()
  const [previaAberta, setPreviaAberta] = useState(true)
  // paleta de comandos (Ctrl+K)
  const [paleta, setPaleta] = useState(false)
  const [recentesPaleta, setRecentesPaleta] = useState<Relatorio[]>([])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta((v) => !v)
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [])
  useEffect(() => {
    if (paleta) rascunhosRecentes(8).then(setRecentesPaleta).catch(() => setRecentesPaleta([]))
  }, [paleta])
  const [estado, setEstado] = useState<Estado>('salvo')
  const [salvoEm, setSalvoEm] = useState('')
  const sujo = useRef(false)

  useEffect(() => {
    pastaLembrada().then(setLembrada)
    const q = new URLSearchParams(location.search)
    if (q.has('demo')) {
      abrirDemo()
      if (q.has('inicio')) setTela('inicio')
    }
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

  // configurações da equipe (textos padrão, GUT, farol, cadastro) — da pasta do SharePoint ou do navegador
  useEffect(() => {
    if (usuario) void carregarTodas(raiz)
  }, [raiz, usuario])

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
    if (!raiz || !usuario || tela !== 'relatorio') return
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
  }, [raiz, usina, usuario, tela])

  // Pasta conectada: meses disponíveis da usina.
  useEffect(() => {
    if (!raiz || tela !== 'relatorio') return
    executar(async () => {
      const m = await mesesDisponiveis(raiz, usina as (typeof USINAS)[number])
      setMeses(m)
      const anos = Object.keys(m).sort()
      const [pa, pm] = pendente.current?.mesRef.split('-') ?? []
      const pedido = pa && m[pa]?.find((x) => x.startsWith(pm))
      setMes(pedido ? `${pa}/${pedido}` : anos.length ? `${anos.at(-1)}/${m[anos.at(-1)!].at(-1)}` : '')
    })
  }, [raiz, usina, executar, tela])

  // Pasta conectada: lê a planilha do mês.
  useEffect(() => {
    if (!raiz || !mes) return
    executar(async () => {
      const [ano, mesPasta] = mes.split('/')
      const l = await lerAbaVibracao(await localizarPlanilha(raiz, usina as (typeof USINAS)[number], ano, mesPasta))
      setLinhas(l)
      const s = [...new Set(l.map((x) => siglaArea(x.local)))].sort()
      const pedida = pendente.current?.sigla
      pendente.current = undefined
      setSigla((atual) => (pedida && s.includes(pedida) ? pedida : s.includes(atual) ? atual : (s[0] ?? '')))
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
        if (raiz) {
          await salvarNaPasta(raiz, r)
          // lembretes do relatório para o Power Automate (VibDocs/lembretes); falha aqui não impede o salvamento
          await gravarLembretes(raiz, r).catch((e) => console.warn('lembretes', e))
        }
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

  // ---------- desfazer / refazer (Ctrl+Z, Ctrl+Y) ----------
  // Cada alteração guarda o estado anterior; digitação seguida (menos de 0,8 s entre teclas) vira um passo só.
  const relAtual = useRef(rel)
  relAtual.current = rel
  const passado = useRef<Relatorio[]>([])
  const futuro = useRef<Relatorio[]>([])
  const ultimoPasso = useRef(0)
  const [passos, setPassos] = useState({ voltar: 0, avancar: 0 })
  const contarPassos = () => setPassos({ voltar: passado.current.length, avancar: futuro.current.length })

  const papelRef = useRef<string | undefined>(undefined)
  papelRef.current = usuario?.papel
  const avisouLeitor = useRef(0)
  const atualizar = useCallback((f: (r: Relatorio) => Relatorio) => {
    if (papelRef.current === 'leitor') {
      // perfil Leitor: consulta e exporta, mas não altera relatórios
      if (Date.now() - avisouLeitor.current > 4000) avisar('Seu perfil é Leitor: dá para consultar e exportar, mas não alterar.', 'info')
      avisouLeitor.current = Date.now()
      return
    }
    const antes = relAtual.current
    const agora = Date.now()
    if (antes && agora - ultimoPasso.current > 800) {
      passado.current.push(antes)
      if (passado.current.length > 300) passado.current.shift()
    }
    ultimoPasso.current = agora
    futuro.current = []
    setPassos({ voltar: passado.current.length, avancar: 0 })
    sujo.current = true
    setRel((r) =>
      r ? normalizar({ ...f(r), atualizadoEm: new Date().toISOString(), atualizadoPor: usuarioRef.current || r.atualizadoPor }) : r,
    )
  }, [])

  // Cada relatório guarda o seu histórico de desfazer enquanto o site está aberto (trocar de área e voltar não perde)
  const idRel = rel ? `${rel.usina}|${rel.mesReferencia}|${rel.sigla}|${rel.criadoEm}` : ''
  const historicos = useRef(new Map<string, { passado: Relatorio[]; futuro: Relatorio[] }>())
  const idAnterior = useRef('')
  useEffect(() => {
    if (idAnterior.current) historicos.current.set(idAnterior.current, { passado: passado.current, futuro: futuro.current })
    const guardado = historicos.current.get(idRel)
    passado.current = guardado?.passado ?? []
    futuro.current = guardado?.futuro ?? []
    idAnterior.current = idRel
    setPassos({ voltar: passado.current.length, avancar: futuro.current.length })
  }, [idRel])

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
        const setor = usina === 'Jeceaba' ? (linhas.map((l) => setorDaTag(l.local)).find((s, _, a) => s && a.length) ?? '') : ''
        const setorDaSigla = linhas.filter((l) => siglaArea(l.local) === sigla).map((l) => setorDaTag(l.local)).find(Boolean) ?? setor
        const seq = raiz ? await proximaSequencia(raiz, usina, mesRef, regrasContrato().sequenciaPorSetor?.includes(usina) ? setorDaSigla : undefined) : 1
        r = novoRelatorio({ usina, sigla, mesReferencia: mesRef, sequencia: seq, analista, perfil: perfilTecnico, linhas, art: artDaUsina(usina) })
      } else {
        // Rascunho salvo antes de existirem os campos "executado" e "plano": completa pela planilha do mês.
        const porLocal = new Map(linhas.map((l) => [l.local, l]))
        r = {
          ...r,
          equipamentos: r.equipamentos.map((e) => {
            const l = porLocal.get(e.local)
            if (!l) return e
            return { ...e, executado: e.executado ?? l.executado, plano: e.plano ?? l.plano, celula: e.celula ?? l.celula }
          }),
        }
        // rascunho anterior ao código por setor (Jeceaba): calcula o setor pelas TAGs
        if (r.setor === undefined) {
          const setores = r.equipamentos.map((e) => setorDaTag(e.local)).filter(Boolean)
          r = { ...r, setor: setores[0] ?? '' }
        }
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
    setTela('relatorio')
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

  const novoAvulso = (alvo: string = usina) =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      const usina = alvo
      const r = novoRelatorio({
        usina,
        sigla: 'NOVA',
        mesReferencia: mesAtual(),
        sequencia: raiz ? await proximaSequencia(raiz, usina, mesAtual()) : 1,
        analista,
        perfil: perfilTecnico,
        linhas: [],
        avulso: true,
        art: artDaUsina(usina),
      })
      setFonteManual((f) => f ?? 'relatório avulso')
      sujo.current = true
      setRel(r)
      setAba('relatorio')
      setTela('relatorio')
    })

  const abrirUsina = (u: string) =>
    comTransicao(() => {
      if (rel?.avulso) setRel(undefined)
      setUsina(u)
      setTela('relatorio')
    })

  const continuar = (r: Relatorio) =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      sujo.current = false
      if (r.avulso) {
        setRel(r)
        setAba('relatorio')
      } else {
        setRel(undefined)
        pendente.current = { mesRef: r.mesReferencia, sigla: r.sigla }
        if (!raiz && linhas.some((l) => siglaArea(l.local) === r.sigla)) setSigla(r.sigla)
        setUsina(r.usina)
      }
      setTela('relatorio')
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
      setTela('inicio')
      setLinhas([])
      setRel(undefined)
    })

  const sairDaConta = () =>
    executar(async () => {
      if (rel && sujo.current) await salvar(rel)
      sujo.current = false
      encerrarSessao()
      setUsuario(undefined)
      setTela('inicio')
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

  // imagens e nomes do modelo .docx, para a prévia/PDF ficarem iguais ao Word
  // condição definida depois da análise → grava na planilha de controle do mês (uma célula, em fila)
  const filaPlanilha = useRef(Promise.resolve())
  const gravarNaPlanilha = useCallback(
    (e: EquipRel, c: string) => {
      if (!raiz || !rel || rel.avulso || e.manual || !e.celula || !mes) return
      const [ano, mesPasta] = mes.split('/')
      if (`${ano}-${mesPasta.slice(0, 2)}` !== rel.mesReferencia) return
      const aba = linhas.find((l) => l.local === e.local)?.aba ?? 'Análise de Vibração'
      const u = usina as (typeof USINAS)[number]
      filaPlanilha.current = filaPlanilha.current.then(async () => {
        try {
          const info = await localizarPlanilha(raiz, u, ano, mesPasta)
          await gravarCondicoes(info.arquivo, aba, [{ celula: e.celula!, valor: c }])
          atualizar((x) => ({ ...x, equipamentos: x.equipamentos.map((q) => (q.local === e.local ? { ...q, condicaoPlanilha: c } : q)) }))
          avisar(`Planilha de controle atualizada: ${e.local} → ${c || 'em branco'} (célula ${e.celula}).`, 'ok', {
            rotulo: 'Desfazer',
            fazer: () => andarRef.current('voltar'),
          })
        } catch (err) {
          avisar(`Não gravei na planilha: ${(err as Error).message} Se ela estiver aberta no Excel, feche e escolha a condição de novo.`, 'erro')
        }
      })
    },
    [raiz, rel, mes, linhas, usina, atualizar],
  )

  // volta/avança um passo; condições que mudaram também voltam na planilha de controle
  const andarHistorico = useCallback(
    (direcao: 'voltar' | 'avancar') => {
      const de = direcao === 'voltar' ? passado.current : futuro.current
      const para = direcao === 'voltar' ? futuro.current : passado.current
      const atual = relAtual.current
      const alvo = de.pop()
      if (!alvo || !atual) return
      para.push(atual)
      ultimoPasso.current = 0
      contarPassos()
      sujo.current = true
      setRel({ ...alvo, atualizadoEm: new Date().toISOString() })
      const antes = new Map(atual.equipamentos.map((e) => [e.local, e.condicao]))
      for (const e of alvo.equipamentos) if (antes.has(e.local) && antes.get(e.local) !== e.condicao) gravarNaPlanilha(e, e.condicao)
      avisar(direcao === 'voltar' ? 'Alteração desfeita.' : 'Alteração refeita.', 'info', {
        rotulo: direcao === 'voltar' ? 'Refazer' : 'Desfazer',
        fazer: () => andarRef.current(direcao === 'voltar' ? 'avancar' : 'voltar'),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gravarNaPlanilha],
  )
  const andarRef = useRef(andarHistorico)
  andarRef.current = andarHistorico

  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z): fora de campos de texto, para não brigar com o desfazer da digitação
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const alvo = e.target as HTMLElement
      if (alvo.closest('input, textarea, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) andarRef.current('voltar')
      else if (k === 'y' || (k === 'z' && e.shiftKey)) andarRef.current('avancar')
      else return
      e.preventDefault()
    }
    const pedido = () => andarRef.current('voltar')
    addEventListener('keydown', tecla)
    addEventListener('vibdocs:desfazer', pedido)
    return () => {
      removeEventListener('keydown', tecla)
      removeEventListener('vibdocs:desfazer', pedido)
    }
  }, [])

  // gráfico enviado pela página do banco: entra no quadro certo da página de anomalia da TAG
  useEffect(() => {
    const chegou = (ev: Event) => {
      const { tag, blob, slot, nome } = (ev as CustomEvent<{ tag: string; blob: Blob; slot: Slot; nome: string }>).detail
      const r = relAtual.current
      const eq = r?.equipamentos.find((e) => e.local === tag)
      if (!r || !eq) return avisar(`Abra o relatório da área de ${tag} para receber o gráfico.`, 'erro')
      void guardarImagem(blob).then((id) => {
        atualizar((x) => {
          const a = anomaliaDe(x, eq)
          return { ...x, anomalias: { ...x.anomalias, [tag]: { ...a, imagens: [...a.imagens, { id, slot, nome, ajuste: 'conter' }] } } }
        })
        avisar(`Gráfico colocado na página de ${tag} (quadro ${slot === 'tendencia' ? 'Tendência' : 'Espectro'}).`, 'ok', {
          rotulo: 'Ver',
          fazer: () => {
            setTela('relatorio')
            setAba('anomalias')
            setAnomaliaSel(tag)
          },
        })
      })
    }
    addEventListener('vibdocs:imagem-banco', chegou)
    return () => removeEventListener('vibdocs:imagem-banco', chegou)
  }, [atualizar])

  const editarImagens = useCallback(
    (local: string, imagens: ImagemRef[]) =>
      atualizar((x) => {
        const eq = x.equipamentos.find((q) => q.local === local)
        return eq ? { ...x, anomalias: { ...x.anomalias, [local]: { ...anomaliaDe(x, eq), imagens } } } : x
      }),
    [atualizar],
  )
  const [visual, setVisual] = useState<VisualModelo>()
  const [versaoModelo, setVersaoModelo] = useState(0)
  useEffect(() => {
    const trocou = () => setVersaoModelo((v) => v + 1)
    window.addEventListener('vibdocs:modelo', trocou)
    return () => window.removeEventListener('vibdocs:modelo', trocou)
  }, [])
  const usinaRel = rel?.usina
  useEffect(() => {
    if (!usinaRel) return
    let vivo = true
    obterModelo(raiz, usinaRel, rel?.contrato || 'Vallourec')
      .then((m) => (m ? visualDoModelo(m) : undefined))
      .then((v) => vivo && setVisual(v))
      .catch(() => vivo && setVisual(undefined))
    return () => {
      vivo = false
    }
  }, [raiz, usinaRel, versaoModelo])
  // Exportar PDF com o botão de progresso: a borda se completa, abre a impressão e mostra "pronto"
  const [pdf, setPdf] = useState<'' | 'preparando' | 'pronto'>('')
  // exportar marca o relatório como emitido (o técnico pode voltar o andamento no seletor)
  const marcarEmitido = () =>
    relAtual.current?.status !== 'emitido' && papelRef.current !== 'leitor' && atualizar((x) => ({ ...x, status: 'emitido', emitidoEm: new Date().toISOString() }))
  const exportarPdf = () => {
    marcarEmitido()
    setPdf('preparando')
    setTimeout(() => {
      window.print()
      setPdf('pronto')
      setTimeout(() => setPdf(''), 1800)
    }, 700)
  }

  // sem modelo do Word: pergunta antes (carregar o .docx agora ou sair no layout padrão)
  const [pedirModelo, setPedirModelo] = useState(false)
  const exportarWord = (semModelo = false) =>
    executar(async () => {
      if (!rel) return
      if (!semModelo && !(await obterModelo(raiz, rel.usina, rel.contrato || 'Vallourec'))) {
        setPedirModelo(true)
        return
      }
      setPedirModelo(false)
      setGerandoWord(true)
      setAviso('')
      try {
        const { gerarWord, nomeArquivo } = await import('./lib/word') // carregado só quando usado
        const modelo = await obterModelo(raiz, rel.usina, rel.contrato || 'Vallourec')
        const blob = modelo ? await (await import('./lib/modeloWord')).gerarWordDoModelo(rel, modelo.dados) : await gerarWord(rel)
        const nome = nomeArquivo(rel, 'docx')
        baixar(blob, nome)
        marcarEmitido()
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
                <span className="truncate">Abrir Integração de Dados</span>
              </button>
            )}
            <button
              className={`${lembrada ? btn : btnPri} h-12 w-full justify-between px-4`}
              onClick={() => executar(async () => setRaiz(await escolherPasta()))}
            >
              <span>{lembrada ? 'Escolher outra pasta' : 'Escolher pasta'}</span>
            </button>
            <p className="text-xs text-cinza">PRUFTECHNIK MGS › Integração de Dados Pruftechnik MGS VSB - Documentos</p>
          </div>
        )}

        <div className="mt-10 border-t border-linha pt-6">
          <h3 className="text-sm font-semibold">Sem a pasta sincronizada</h3>
          <p className="mt-1 text-xs text-cinza">Importe uma ou várias planilhas: a mais recente vira o mês do relatório e as outras, histórico.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Seletor classe="seletor-campo" rotulo="Usina" valor={usina} mudar={setUsina} opcoes={USINAS.map((u) => ({ valor: u, rotulo: u }))} />
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
    if (!sessaoVerificada) return <Carregando texto="Verificando sessão…" />
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
  const nPreenchidas = rel ? equipamentosAnomalia(rel).filter((e) => paginaPreenchida(rel, e)).length : 0
  const textoEstado =
    estado === 'salvando'
      ? 'Salvando…'
      : estado === 'pendente'
        ? 'Alterações não salvas'
        : estado === 'erro'
          ? 'Erro ao salvar'
          : salvoEm
            ? `Salvo às ${salvoEm}${raiz ? ' no SharePoint' : ' neste navegador'}`
            : rel
              ? `Último salvamento: ${new Date(rel.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
              : ''
  const ind = rel ? calcularIndicadores(rel) : undefined
  const atualInd = ind && { exec: ind.execucao.at(-1)?.indice ?? null, reinc: ind.reincidencia.at(-1)?.indice ?? null }
  const irParaEquipamento = (local: string) => {
    if (!rel) return
    if (equipamentosAnomalia(rel).some((e) => e.local === local))
      comTransicao(() => {
        setTela('relatorio')
        setAba('anomalias')
        setAnomaliaSel(local)
      })
    else {
      comTransicao(() => {
        setTela('relatorio')
        setAba('equipamentos')
      })
      setTimeout(() => window.dispatchEvent(new CustomEvent('vibdocs:mostrar-equipamento', { detail: local })), 120)
    }
  }
  const itensPaleta: ItemPaleta[] = [
    { id: 'a-inicio', grupo: 'Ações', rotulo: 'Ir para o início', fazer: () => comTransicao(() => setTela('inicio')) },
    { id: 'a-cad', grupo: 'Ações', rotulo: 'Cadastros (critérios do GUT, textos padrão, farol, equipamentos)', fazer: () => comTransicao(() => setTela('cadastros')) },
    { id: 'a-rels', grupo: 'Ações', rotulo: 'Buscar relatórios / exportar resumo em Excel', fazer: () => comTransicao(() => setTela('relatorios')) },
    {
      id: 'a-banco',
      grupo: 'Ações',
      rotulo: 'Banco de vibração (tendências e espectros)',
      fazer: () => window.dispatchEvent(new CustomEvent('vibdocs:banco', { detail: {} })),
    },
    {
      id: 'a-hist',
      grupo: 'Ações',
      rotulo: 'Histórico preditivo (relatórios antigos)',
      fazer: () => window.dispatchEvent(new CustomEvent('vibdocs:historico', { detail: { busca: '' } })),
    },
    ...(rel
      ? ([
          { id: 'a-rel', grupo: 'Ações', rotulo: 'Aba Relatório', fazer: () => comTransicao(() => (setTela('relatorio'), setAba('relatorio'))) },
          { id: 'a-eq', grupo: 'Ações', rotulo: 'Aba Equipamentos', fazer: () => comTransicao(() => (setTela('relatorio'), setAba('equipamentos'))) },
          { id: 'a-an', grupo: 'Ações', rotulo: 'Aba Anomalias', fazer: () => comTransicao(() => (setTela('relatorio'), setAba('anomalias'))) },
          { id: 'a-pdf', grupo: 'Ações', rotulo: 'Exportar PDF', fazer: exportarPdf },
          { id: 'a-word', grupo: 'Ações', rotulo: 'Exportar Word', fazer: () => exportarWord() },
          { id: 'a-previa', grupo: 'Ações', rotulo: previaAberta ? 'Fechar a prévia' : 'Abrir a prévia', fazer: () => setPreviaAberta((v) => !v) },
          { id: 'a-desf', grupo: 'Ações', rotulo: 'Desfazer', atalho: 'Ctrl Z', fazer: () => andarHistorico('voltar') },
          { id: 'a-ref', grupo: 'Ações', rotulo: 'Refazer', atalho: 'Ctrl Y', fazer: () => andarHistorico('avancar') },
        ] as ItemPaleta[])
      : []),
    { id: 'a-avulso', grupo: 'Ações', rotulo: 'Novo relatório avulso', detalhe: usina, fazer: () => novoAvulso() },
    ...USINAS.map((u) => ({ id: `u-${u}`, grupo: 'Usinas', rotulo: u, detalhe: 'abrir usina', fazer: () => abrirUsina(u) })),
    ...(tela === 'relatorio'
      ? siglas.map(([sg, n]) => ({
          id: `s-${sg}`,
          grupo: 'Áreas',
          rotulo: sg,
          detalhe: `${n} equipamentos · ${usina}`,
          fazer: () => comTransicao(() => setSigla(sg)),
        }))
      : []),
    ...(rel?.equipamentos ?? []).map((e) => ({
      id: `e-${e.local}`,
      grupo: 'Equipamentos',
      rotulo: e.local,
      detalhe: e.descricao,
      cor: CONDICOES[e.condicao]?.cor,
      fazer: () => irParaEquipamento(e.local),
    })),
    ...recentesPaleta.map((r) => ({
      id: `r-${r.usina}-${r.mesReferencia}-${r.sigla}-${r.codigo}`,
      grupo: 'Rascunhos recentes',
      rotulo: r.codigo,
      detalhe: `${r.usina} · ${r.areaTitulo || r.sigla}`,
      fazer: () => continuar(r),
    })),
  ]

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
          <button className="trilho-item" aria-current={tela === 'inicio' ? 'page' : undefined} title="Início" onClick={() => comTransicao(() => setTela('inicio'))}>
            <IcInicio />
          </button>
          {tela === 'relatorio' && abasTrilho.map(([id, nome, Icone]) => (
            <button key={id} className="trilho-item" aria-current={aba === id ? 'page' : undefined} title={nome} onClick={() => comTransicao(() => setAba(id))}>
              <Icone />
              {id === 'anomalias' && nAnom > 0 && (
                <span className="pulso-badge absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-sinal px-1 text-[10px] font-bold text-preto">
                  {nAnom}
                </span>
              )}
            </button>
          ))}
          <button
            className="trilho-item"
            aria-current={tela === 'relatorios' ? 'page' : undefined}
            title="Relatórios: buscar e exportar resumo em Excel"
            aria-label="Relatórios"
            onClick={() => comTransicao(() => setTela('relatorios'))}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 4h10l4 4v12H4z" />
              <path d="M8 12h6M8 16h4" />
              <circle cx="17.5" cy="17.5" r="3" />
              <path d="M20 20l2 2" />
            </svg>
          </button>
          <button
            className="trilho-item"
            aria-current={tela === 'cadastros' ? 'page' : undefined}
            title="Cadastros (GUT, textos padrão, farol, equipamentos)"
            aria-label="Cadastros"
            onClick={() => comTransicao(() => setTela('cadastros'))}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          </button>
          <button
            className="trilho-item"
            aria-current={tela === 'banco' ? 'page' : undefined}
            title="Banco de vibração (Omnitrend)"
            aria-label="Banco de vibração"
            onClick={() => window.dispatchEvent(new CustomEvent('vibdocs:banco', { detail: {} }))}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
              <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" />
              <path d="M7 14l2-3 2 4 2-6 2 5 2-2" />
            </svg>
          </button>
          <button
            className="trilho-item"
            aria-current={tela === 'historico' ? 'page' : undefined}
            title="Histórico preditivo (relatórios antigos)"
            aria-label="Histórico preditivo"
            onClick={() => comTransicao(() => setTela('historico'))}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5M12 7v5l3 2" />
            </svg>
          </button>
          <button className="trilho-item" title="Buscar (Ctrl+K)" aria-label="Buscar" onClick={() => setPaleta(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          <div className="my-2 h-px w-8 bg-white/10" />
          <button className="trilho-item" title="Novo relatório avulso (qualquer usina ou área, fora da planilha)" onClick={() => novoAvulso()}>
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

        {tela === 'cadastros' ? (
          <main className="min-w-0 flex-1 overflow-auto">
            <Cadastros papel={usuario?.papel ?? 'leitor'} raiz={raiz} linhas={linhas} emailUsuario={usuario?.email ?? ''} />
          </main>
        ) : tela === 'relatorios' ? (
          <main className="min-w-0 flex-1 overflow-auto">
            <BuscaRelatorios raiz={raiz} abrir={continuar} />
          </main>
        ) : tela === 'banco' ? (
          <main className="min-w-0 flex-1 overflow-auto">
            <BancoVibracao raiz={raiz} linhas={linhas} usuario={usuario?.nome ?? ''} foco={focoBanco} usina={usina} />
          </main>
        ) : tela === 'historico' ? (
          <main className="min-w-0 flex-1 overflow-auto">
            <HistoricoPreditivo key={buscaHP.n} buscaInicial={buscaHP.busca} sugestoes={buscaHP.sugestoes} />
          </main>
        ) : tela === 'inicio' ? (
          <main className="min-w-0 flex-1 overflow-auto">
            <Inicio
              nome={usuario?.nome ?? ''}
              raiz={raiz}
              fonte={fonteManual ?? ''}
              abrirUsina={abrirUsina}
              continuar={continuar}
              avulso={(u) => novoAvulso(u)}
            />
          </main>
        ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra superior: caminho Usina / Mês / Área e ações */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linha bg-superficie px-5 py-3">
            {!rel?.avulso ? (
              <nav className="caminho flex items-center gap-1 text-sm" aria-label="Relatório aberto">
                <Seletor rotulo="Usina" valor={usina} mudar={setUsina} desabilitado={!raiz} opcoes={USINAS.map((u) => ({ valor: u, rotulo: u }))} />
                <span className="text-[#c9c9c4]">/</span>
                {raiz ? (
                  <Seletor
                    rotulo="Mês"
                    valor={mes}
                    mudar={setMes}
                    opcoes={Object.entries(meses).flatMap(([ano, ms]) => ms.map((m) => ({ valor: `${ano}/${m}`, rotulo: `${m.slice(3)} ${ano}` })))}
                  />
                ) : (
                  <span className="px-2 text-cinza">{fonteManual}</span>
                )}
                <span className="text-[#c9c9c4]">/</span>
                <Seletor
                  classe="titulo"
                  rotulo="Área"
                  valor={sigla}
                  mudar={setSigla}
                  opcoes={siglas.map(([s, n]) => ({ valor: s, rotulo: s, extra: `(${n})` }))}
                />
              </nav>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-sinal px-3 py-1 text-sm font-medium text-preto">Relatório avulso, {rel.usina}</span>
                {linhas.length > 0 && (
                  <button className={btnFantasma} onClick={fecharAvulso}>
                    Voltar à área
                  </button>
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {carregandoHist && <span className="text-xs text-amber-700">{carregandoHist}</span>}
              <span className="flex items-center" role="group" aria-label="Desfazer e refazer">
                <button className="bt-icone" onClick={() => andarHistorico('voltar')} disabled={!passos.voltar} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                  </svg>
                </button>
                <button className="bt-icone" onClick={() => andarHistorico('avancar')} disabled={!passos.avancar} title="Refazer (Ctrl+Y)" aria-label="Refazer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M15 14l5-5-5-5" />
                    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                  </svg>
                </button>
              </span>
              <span
                className={`estado-salvo mr-1 flex items-center gap-1.5 text-xs ${estado === 'erro' ? 'text-red-700' : 'text-cinza'}`}
                title={`Salvamento automático 1,5 s depois de cada alteração, neste navegador${raiz ? ' e na pasta do SharePoint' : ''}. Continua salvo ao fechar o site ou desligar o computador.`}
              >
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
              <button className={btn} onClick={() => exportarWord()} disabled={!rel || gerandoWord}>
                {gerandoWord ? 'Gerando Word…' : 'Exportar Word'}
              </button>
              <button className={`${btnPri} bt-progresso ${pdf}`} onClick={exportarPdf} disabled={!rel || pdf === 'preparando'}>
                <svg className="moldura-progresso" aria-hidden preserveAspectRatio="none">
                  <rect x="1" y="1" rx="18" ry="18" pathLength="100" />
                </svg>
                {pdf === 'preparando' ? 'Preparando…' : pdf === 'pronto' ? 'PDF pronto' : 'Exportar PDF'}
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
            <Carregando texto="Carregando o relatório…" />
          ) : (
            <>
              {/* Faixa de números do relatório */}
              <section className="grid grid-cols-2 gap-3 px-5 pt-4 lg:grid-cols-4" aria-label="Resumo">
                {(
                  [
                    ['Equipamentos', <Contador valor={rel.equipamentos.length} />, 'na área'],
                    [
                      'Páginas preenchidas',
                      <>
                        <Contador valor={nPreenchidas} />
                        <span className="text-cinza">/</span>
                        <Contador valor={nAnom} />
                      </>,
                      'anomalias completas ou finalizadas',
                    ],
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
                        variante="ponto"
                        ativa={aba}
                        mudar={(a) => comTransicao(() => setAba(a))}
                        itens={[
                          ['relatorio', 'Relatório'],
                          ['equipamentos', `Equipamentos ${rel.equipamentos.length}`],
                          ['anomalias', `Anomalias ${nAnom}`],
                        ]}
                      />
                      <span className="tag ml-auto truncate text-sm text-cinza" title="Código do relatório">
                        {rel.codigo}
                      </span>
                      <Copiar texto={rel.codigo} rotulo="código do relatório" />
                      <Seletor
                        classe="seletor-status"
                        rotulo="Andamento do relatório"
                        valor={rel.status ?? 'rascunho'}
                        estiloBotao={{ ['--c' as string]: STATUS_RELATORIO[rel.status ?? 'rascunho'].cor }}
                        mudar={(v) => atualizar((x) => ({ ...x, status: v as StatusRelatorio, emitidoEm: v === 'emitido' ? (x.emitidoEm ?? new Date().toISOString()) : x.emitidoEm }))}
                        opcoes={(Object.keys(STATUS_RELATORIO) as StatusRelatorio[]).map((k) => ({ valor: k, rotulo: STATUS_RELATORIO[k].nome, cor: STATUS_RELATORIO[k].cor }))}
                      />
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      {aba === 'relatorio' && <PainelRelatorio r={rel} atualizar={atualizar} tecnicos={tecnicos} raiz={raiz} />}
                      {aba === 'equipamentos' && <PainelEquipamentos r={rel} atualizar={atualizar} aoMudarCondicao={gravarNaPlanilha} />}
                      {aba === 'anomalias' && (
                        <PainelAnomalias r={rel} atualizar={atualizar} selecionado={anomaliaSel} selecionar={setAnomaliaSel} aoMudarCondicao={gravarNaPlanilha} />
                      )}
                    </div>
                  </div>
                </Panel>
                {previaAberta && (
                  <>
                    <Separator className="divisor mx-1.5 w-2" />
                    <Panel defaultSize="48" minSize="20">
                      <div className="painel h-full overflow-auto bg-[var(--t-tela-previa)]">
                        <AjustarLargura>
                          <Previa
                            r={rel}
                            visual={visual}
                            editarImagens={editarImagens}
                          />
                        </AjustarLargura>
                      </div>
                    </Panel>
                  </>
                )}
              </Group>
            </>
          )}
        </div>
        )}
      </div>

      <Avisos />
      {paleta && <Paleta itens={itensPaleta} fechar={() => setPaleta(false)} />}
      {pedirModelo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6 backdrop-blur-[3px]" onMouseDown={() => setPedirModelo(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-modelo"
            className="surgir w-full max-w-md rounded-[20px] border border-linha bg-elevada p-6 shadow-[var(--t-sombra)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="titulo-modelo" className="titulo text-xl">
              Falta o modelo do Word
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-grafite">
              Com o .docx modelo do relatório, o Word sai com a capa, a moldura, os logos e os gráficos do modelo. Ele fica guardado
              {raiz ? ' na pasta do SharePoint (VibDocs/config)' : ' neste navegador'} e só precisa ser escolhido uma vez.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <label className={`${btnPri} cursor-pointer`}>
                Escolher o modelo .docx
                <input
                  type="file"
                  accept=".docx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f || !rel) return
                    executar(async () => {
                      await guardarModelo(f, raiz)
                      window.dispatchEvent(new Event('vibdocs:modelo'))
                      await exportarWord()
                    })
                  }}
                />
              </label>
              <button className={btnFantasma} onClick={() => exportarWord(true)}>
                Exportar no layout padrão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impressão/PDF: a prévia fora do layout de painéis, em largura A4 real. */}
      {rel && (
        <div className="so-impressao">
          <Previa r={rel} visual={visual} />
        </div>
      )}
    </>
  )
}
