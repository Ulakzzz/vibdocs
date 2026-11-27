// Tela "Cadastros": critérios do GUT, textos padrão, nomes do farol, textos do relatório e cadastro de equipamentos.
// Só o administrador altera (o editor pode mudar os textos do relatório); os demais só consultam.
import { useEffect, useState } from 'react'
import { salvarConfig, useConfig } from '../lib/config'
import { salvarFoto, salvarItem, type Cadastro } from '../lib/cadastro'
import type { LinhaControle } from '../lib/controle'
import { lerPlanilhaGut, type CriteriosGut } from '../lib/gutCriterios'
import { urlImagem } from '../lib/imagens'
import { TEXTOS_PADRAO, type TextoPadrao } from '../lib/textos'
import { USINAS_RELATORIO, novoId, type NomesStatus } from '../lib/relatorio'
import { Abas, btn, btnMini, btnPri, Campo, Texto, TextoLongo } from '../editor/campos'
import { avisar } from '../ui/Avisos'
import type { ConfigAvisos } from '../lib/lembretesArquivo'
import { lerVinculos, type Vinculos } from '../lib/omnitrend/vinculos'

type Aba = 'gut' | 'textos' | 'status' | 'relatorio' | 'equipamentos' | 'avisos'

export function Cadastros({
  papel,
  raiz,
  linhas,
  emailUsuario = '',
}: {
  papel: string
  raiz?: FileSystemDirectoryHandle
  linhas: LinhaControle[]
  emailUsuario?: string
}) {
  const [aba, setAba] = useState<Aba>('gut')
  const admin = papel === 'admin'
  const editor = admin || papel === 'tecnico' || papel === 'revisor'
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-16 lg:px-10">
      <header className="surgir-lista">
        <p className="text-sm text-cinza">Cadastros {admin ? '· administrador' : '· somente leitura'}</p>
        <h1 className="titulo-grande mt-1 text-4xl">Cadastros</h1>
        <p className="mt-2 max-w-2xl text-grafite">
          O que vale para a equipe inteira: fica na pasta do SharePoint (VibDocs/config) e aparece para todos.
          {!admin && ' Só o administrador altera estes cadastros.'}
        </p>
      </header>
      <div className="mt-6">
        <Abas
          ativa={aba}
          mudar={setAba}
          itens={[
            ['gut', 'Critérios do GUT'],
            ['textos', 'Textos padrão'],
            ['status', 'Nomes do farol'],
            ['relatorio', 'Textos do relatório'],
            ['equipamentos', 'Equipamentos'],
            ['avisos', 'Avisos no Teams'],
          ]}
        />
      </div>
      <div className="mt-6">
        {aba === 'gut' && <TabGut pode={admin} />}
        {aba === 'textos' && <TabTextos pode={admin} />}
        {aba === 'status' && <TabStatus pode={admin} />}
        {aba === 'relatorio' && <TabRelatorio pode={editor} />}
        {aba === 'equipamentos' && <TabEquipamentos pode={admin} raiz={raiz} linhas={linhas} />}
        {aba === 'avisos' && <TabAvisos pode={admin} emailUsuario={emailUsuario} />}
      </div>
    </div>
  )
}

// ---------- avisos no Teams ----------
function TabAvisos({ pode, emailUsuario }: { pode: boolean; emailUsuario: string }) {
  const salvo = useConfig<ConfigAvisos>('avisos')
  const [c, setC] = useState<ConfigAvisos>({ modoTeste: true, emailTeste: emailUsuario, ...salvo })
  useEffect(() => setC({ modoTeste: true, emailTeste: emailUsuario, ...salvo }), [salvo, emailUsuario])
  return (
    <Bloqueado pode={pode}>
      <div className="cartao-inicio max-w-2xl space-y-4">
        <p className="text-sm text-cinza">
          O VibDocs grava os lembretes de cada relatório em VibDocs/lembretes. O fluxo do Power Automate lê a pasta todo dia e manda a
          mensagem no Teams para o e-mail de cada lembrete.
        </p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={c.modoTeste} onChange={(e) => setC({ ...c, modoTeste: e.target.checked })} />
          Modo de teste: todos os avisos vão só para o e-mail abaixo
        </label>
        <Campo rotulo="E-mail de teste" dica="Enquanto o modo de teste estiver ligado, ninguém mais recebe. Sem e-mail, nenhum aviso é gerado.">
          <Texto tipo="email" valor={c.emailTeste} mudar={(v) => setC({ ...c, emailTeste: v })} placeholder="nome@pruftechnik.com.br" />
        </Campo>
        {!c.modoTeste && (
          <p className="rounded-[10px] border border-dashed border-sinal px-3 py-2 text-xs">
            Modo real: cada aviso vai para o e-mail do técnico da análise do relatório (o do cabeçalho).
          </p>
        )}
        <button className={btnPri} onClick={() => void salvarConfig('avisos', c).then(() => avisar('Configuração dos avisos salva.', 'ok'))}>
          Salvar
        </button>
      </div>
    </Bloqueado>
  )
}

function Bloqueado({ pode, children }: { pode: boolean; children: React.ReactNode }) {
  return <fieldset disabled={!pode} className={pode ? '' : 'somente-leitura'}>{children}</fieldset>
}

// ---------- GUT ----------
function TabGut({ pode }: { pode: boolean }) {
  const salvo = useConfig<CriteriosGut>('gut-criterios')
  const [c, setC] = useState<CriteriosGut | undefined>(salvo)
  const [modo, setModo] = useState(0)
  useEffect(() => setC(salvo), [salvo])
  const importar = async (f?: File) => {
    if (!f) return
    const novo = lerPlanilhaGut(await f.arrayBuffer(), f.name)
    if (!novo.modos.length) return avisar('Não encontrei blocos “GUT <modo>” com G, U e T nessa planilha.', 'erro')
    setC(novo)
    setModo(0)
    avisar(`${novo.modos.length} modos de falha lidos de ${f.name}. Confira e clique em Salvar.`, 'info')
  }
  const salvar = async () => {
    if (!c) return
    await salvarConfig('gut-criterios', { ...c, atualizado: new Date().toISOString() })
    avisar('Critérios do GUT salvos para a equipe.', 'ok')
  }
  const m = c?.modos[modo]
  const setNota = (k: 'G' | 'U' | 'T', n: string, v: string) =>
    setC((x) => x && { ...x, modos: x.modos.map((mm, i) => (i === modo ? { ...mm, [k]: { ...mm[k], [n]: v } } : mm)) })
  return (
    <Bloqueado pode={pode}>
      <div className="cartao-inicio">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${btn} cursor-pointer`}>
            Importar planilha do GUT (.xlsx)
            <input type="file" accept=".xlsx" className="sr-only" aria-label="Planilha do GUT" onChange={(e) => void importar(e.target.files?.[0])} />
          </label>
          <button className={btnPri} onClick={() => void salvar()} disabled={!c || c === salvo}>
            Salvar
          </button>
          <span className="text-xs text-cinza">
            {salvo ? `Em uso: ${salvo.origem ?? 'critérios salvos'} · ${salvo.modos.length} modos` : 'Ainda sem critérios: importe a planilha “GUT Vibração”.'}
          </span>
        </div>
        {c && (
          <>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {c.modos.map((mm, i) => (
                <button key={mm.nome} className={`banco-data ${i === modo ? 'on' : ''}`} style={i === modo ? { borderColor: 'var(--color-sinal)' } : undefined} onClick={() => setModo(i)}>
                  {mm.nome}
                </button>
              ))}
            </div>
            {m && (
              <table className="banco-tabela mt-4">
                <thead>
                  <tr>
                    <th>Nota</th>
                    <th>G · Gravidade</th>
                    <th>U · Urgência</th>
                    <th>T · Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.max(5, ...[m.G, m.U, m.T].flatMap((x) => Object.keys(x).map(Number))) }, (_, i) => String(i + 1)).map((n) => (
                    <tr key={n}>
                      <td>
                        <b>{n}</b>
                      </td>
                      {(['G', 'U', 'T'] as const).map((k) => (
                        <td key={k}>
                          <textarea className="campo text-xs" rows={2} value={m[k][n] ?? ''} onChange={(e) => setNota(k, n, e.target.value)} aria-label={`${k} nota ${n}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="titulo mb-2 text-sm">Fator pela criticidade SAP</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(c.fatores).map(([k, v]) => (
                    <label key={k} className="flex items-center gap-1 text-sm">
                      <b>{k}</b>
                      <input
                        className="campo w-20"
                        type="number"
                        step="0.1"
                        value={v}
                        onChange={(e) => setC({ ...c, fatores: { ...c.fatores, [k]: Number(e.target.value) } })}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="titulo mb-2 text-sm">Faixas (GUT ≥ mínimo)</h3>
                <table className="banco-tabela">
                  <thead>
                    <tr>
                      <th>Mínimo</th>
                      <th>Prioridade</th>
                      <th>Prazo (dias)</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.faixas.map((f, i) => (
                      <tr key={i}>
                        {(['minimo', 'prioridade', 'prazoDias', 'situacao'] as const).map((k) => (
                          <td key={k}>
                            <input
                              className="campo text-xs"
                              value={f[k] ?? ''}
                              onChange={(e) =>
                                setC({
                                  ...c,
                                  faixas: c.faixas.map((x, j) =>
                                    j === i ? { ...x, [k]: k === 'minimo' || k === 'prazoDias' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } : x,
                                  ),
                                })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Bloqueado>
  )
}

// ---------- textos padrão ----------
function TabTextos({ pode }: { pode: boolean }) {
  const salvo = useConfig<{ textos: TextoPadrao[] }>('textos-padrao')
  const [lista, setLista] = useState<TextoPadrao[]>(salvo?.textos ?? TEXTOS_PADRAO)
  useEffect(() => setLista(salvo?.textos ?? TEXTOS_PADRAO), [salvo])
  const mudar = (i: number, p: Partial<TextoPadrao>) => setLista((l) => l.map((t, j) => (j === i ? { ...t, ...p } : t)))
  return (
    <Bloqueado pode={pode}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={btnPri} onClick={() => void salvarConfig('textos-padrao', { textos: lista }).then(() => avisar('Textos padrão salvos.', 'ok'))}>
          Salvar textos
        </button>
        <button className={btn} onClick={() => setLista((l) => [...l, { id: novoId(), nome: 'Nova falha', situacao: '', recomendacao: '' }])}>
          Adicionar texto
        </button>
        <span className="text-xs text-cinza">“Situação observada” e “Recomendação” que aparecem na escolha da falha de cada parte.</span>
      </div>
      <div className="space-y-3">
        {lista.map((t, i) => (
          <div key={t.id} className="cartao-inicio grid gap-3 md:grid-cols-[14rem_1fr_1fr_auto]">
            <Campo rotulo="Falha">
              <Texto valor={t.nome} mudar={(v) => mudar(i, { nome: v })} />
            </Campo>
            <Campo rotulo="Situação observada">
              <TextoLongo valor={t.situacao} mudar={(v) => mudar(i, { situacao: v })} linhas={2} />
            </Campo>
            <Campo rotulo="Recomendação">
              <TextoLongo valor={t.recomendacao} mudar={(v) => mudar(i, { recomendacao: v })} linhas={2} />
            </Campo>
            <button className={`${btnMini} self-start`} onClick={() => setLista((l) => l.filter((_, j) => j !== i))}>
              Excluir
            </button>
          </div>
        ))}
      </div>
    </Bloqueado>
  )
}

// ---------- nomes do farol ----------
type CfgStatus = { padrao?: Partial<NomesStatus>; porUsina?: Record<string, Partial<NomesStatus>> }
function TabStatus({ pode }: { pode: boolean }) {
  const salvo = useConfig<CfgStatus>('status-nomes')
  const [c, setC] = useState<CfgStatus>(salvo ?? {})
  useEffect(() => setC(salvo ?? {}), [salvo])
  const linha = (rot: string, v: Partial<NomesStatus> | undefined, mudar: (n: Partial<NomesStatus>) => void, ph: NomesStatus) => (
    <div className="grid grid-cols-[9rem_1fr_1fr_1fr] items-center gap-2">
      <b className="text-sm">{rot}</b>
      {(['alarme', 'alerta', 'pre'] as const).map((k) => (
        <input key={k} className="campo" placeholder={ph[k]} value={v?.[k] ?? ''} onChange={(e) => mudar({ ...v, [k]: e.target.value })} aria-label={`${rot} ${k}`} />
      ))}
    </div>
  )
  const ph = { alarme: 'Alarme', alerta: 'Alerta', pre: 'Pré-Alerta' }
  return (
    <Bloqueado pode={pode}>
      <div className="cartao-inicio space-y-2">
        <p className="mb-2 text-sm text-cinza">Nomes dos três níveis do quadro de severidade (“farol”) na página de anomalia. Vazio = nome padrão.</p>
        <div className="grid grid-cols-[9rem_1fr_1fr_1fr] gap-2 text-xs text-cinza">
          <span />
          <span>Nível 1 (vermelho)</span>
          <span>Nível 2 (laranja)</span>
          <span>Nível 3 (amarelo)</span>
        </div>
        {linha('Todas as usinas', c.padrao, (n) => setC({ ...c, padrao: n }), ph)}
        {USINAS_RELATORIO.map((u) =>
          linha(u, c.porUsina?.[u], (n) => setC({ ...c, porUsina: { ...c.porUsina, [u]: n } }), { ...ph, ...c.padrao, ...(u === 'Mineração' ? { pre: 'Monitoramento' } : {}) } as NomesStatus),
        )}
        <button className={`${btnPri} mt-3`} onClick={() => void salvarConfig('status-nomes', c).then(() => avisar('Nomes do farol salvos.', 'ok'))}>
          Salvar
        </button>
      </div>
    </Bloqueado>
  )
}

// ---------- textos do relatório ----------
export interface TextosRelatorio {
  resumo: string
  definicao: string
}
function TabRelatorio({ pode }: { pode: boolean }) {
  const salvo = useConfig<TextosRelatorio>('textos-relatorio')
  const [t, setT] = useState<TextosRelatorio>(salvo ?? { resumo: '', definicao: '' })
  useEffect(() => setT(salvo ?? { resumo: '', definicao: '' }), [salvo])
  return (
    <Bloqueado pode={pode}>
      <div className="cartao-inicio space-y-4">
        <p className="text-sm text-cinza">
          Textos padrão das seções “Resumo” e “Definição da atividade”. Entram no relatório quando a opção estiver marcada na aba Relatório
          (cada relatório pode ajustar o seu). Use {'{usina}'}, {'{area}'} e {'{mes}'} para preencher sozinho.
        </p>
        <Campo rotulo="Resumo">
          <TextoLongo valor={t.resumo} mudar={(v) => setT({ ...t, resumo: v })} linhas={5} />
        </Campo>
        <Campo rotulo="Definição da atividade">
          <TextoLongo valor={t.definicao} mudar={(v) => setT({ ...t, definicao: v })} linhas={5} />
        </Campo>
        <button className={btnPri} onClick={() => void salvarConfig('textos-relatorio', t).then(() => avisar('Textos do relatório salvos.', 'ok'))}>
          Salvar
        </button>
      </div>
    </Bloqueado>
  )
}

// ---------- equipamentos ----------
function Foto({ id }: { id?: string }) {
  const [u, setU] = useState<string>()
  useEffect(() => {
    if (id) urlImagem(id).then(setU)
  }, [id])
  return u ? <img src={u} alt="" className="h-14 w-20 rounded-md object-cover" /> : <span className="grid h-14 w-20 place-items-center rounded-md bg-[var(--t-hover)] text-[10px] text-cinza">sem foto</span>
}
function TabEquipamentos({ pode, raiz, linhas }: { pode: boolean; raiz?: FileSystemDirectoryHandle; linhas: LinhaControle[] }) {
  const cad = useConfig<Cadastro>('cadastro-equipamentos') ?? {}
  const [vinc, setVinc] = useState<Vinculos>()
  useEffect(() => {
    lerVinculos(raiz).then(setVinc)
  }, [raiz])
  const [q, setQ] = useState('')
  const [limite, setLimite] = useState(40)
  const lista = linhas.filter((l) => !q || `${l.local} ${l.descricao}`.toLowerCase().includes(q.toLowerCase()))
  if (!linhas.length) return <p className="cartao-inicio text-sm text-cinza">Abra uma usina (planilha de controle carregada) para cadastrar os equipamentos dela.</p>
  return (
    <Bloqueado pode={pode}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className="campo max-w-md" placeholder="Buscar TAG ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar equipamento" />
        <span className="text-xs text-cinza">A foto entra sozinha no quadro “Foto” das novas páginas de anomalia. O nome e a localização substituem os da planilha no laudo.</span>
      </div>
      <div className="cartao-inicio overflow-auto">
        <table className="banco-tabela">
          <thead>
            <tr>
              <th>TAG</th>
              <th>Nome no laudo</th>
              <th>Localização no laudo</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, limite).map((l) => {
              const it = cad[l.local] ?? {}
              return (
                <tr key={l.local}>
                  <td>
                    <span className="tag">{l.local}</span>
                    <small className="block text-cinza">{l.descricao}</small>
                    {vinc?.[l.local] ? (
                      <small className="block text-cinza">⛓ {vinc[l.local].caminho.slice(-2).join(' › ')}</small>
                    ) : (
                      <button
                        type="button"
                        className="mt-1 text-xs underline decoration-sinal decoration-2 underline-offset-2"
                        onClick={() => window.dispatchEvent(new CustomEvent('vibdocs:banco', { detail: { tag: l.local, descricao: l.descricao } }))}
                      >
                        vincular à árvore do Omnitrend
                      </button>
                    )}
                  </td>
                  <td>
                    <input className="campo" placeholder={l.descricao} defaultValue={it.nome ?? ''} onBlur={(e) => e.target.value !== (it.nome ?? '') && void salvarItem(raiz, l.local, { ...it, nome: e.target.value || undefined })} />
                  </td>
                  <td>
                    <input className="campo" placeholder="automático" defaultValue={it.localizacao ?? ''} onBlur={(e) => e.target.value !== (it.localizacao ?? '') && void salvarItem(raiz, l.local, { ...it, localizacao: e.target.value || undefined })} />
                  </td>
                  <td>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Foto id={it.foto} />
                      <span className={btnMini}>{it.foto ? 'Trocar' : 'Enviar'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        aria-label={`Foto de ${l.local}`}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void salvarFoto(raiz, l.local, f).then(() => avisar(`Foto de ${l.local} cadastrada.`, 'ok'))
                        }}
                      />
                    </label>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {lista.length > limite && (
          <button className={`${btnMini} mt-3`} onClick={() => setLimite((x) => x + 40)}>
            Mostrar mais ({lista.length - limite})
          </button>
        )}
      </div>
    </Bloqueado>
  )
}
