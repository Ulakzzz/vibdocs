// Editor das páginas de anomalia: cabeçalho, eixos (texto padrão + texto do técnico) e imagens.
import { useEffect, useRef, useState } from 'react'
import { PainelGut } from './PainelGut'
import { SeletorCondicao } from './PainelEquipamentos'
import { Seletor } from '../ui/Seletor'
import { CONDICOES } from '../lib/condicao'
import { mesCurto } from '../lib/historico'
import { guardarImagem, urlImagem } from '../lib/imagens'
import {
  aAnalisar,
  anomaliaDe,
  equipamentosAnomalia,
  faltandoNaPagina,
  paginaPreenchida,
  localizacaoPadrao,
  novoEixo,
  rotulosUsina,
  PARTES,
  reincidenciaAuto,
  SLOTS,
  type Anomalia,
  type EquipRel,
  type Eixo,
  type ImagemRef,
  type Relatorio,
  type Slot,
} from '../lib/relatorio'
import { textosAtuais, textoPorId } from '../lib/textos'
import { raizConfig, useConfig } from '../lib/config'
import { garantirFoto, itemCadastro } from '../lib/cadastro'
import { Abas, btn, btnMini, Campo, Texto, TextoLongo } from './campos'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

export function PainelAnomalias({
  r,
  atualizar,
  selecionado,
  selecionar,
  aoMudarCondicao,
}: {
  r: Relatorio
  atualizar: Atualizar
  selecionado?: string
  selecionar: (local: string) => void
  aoMudarCondicao?: (e: EquipRel, c: string) => void
}) {
  useConfig('textos-padrao') // relê a lista quando o administrador muda os textos
  useConfig('status-nomes')
  useConfig('gut-criterios')
  const fora = r.foraDaAnalise ?? []
  // na lista: os que geram página + os "a analisar" que foram tirados (aparecem apagados, com a caixa desmarcada)
  // mesma ordem do relatório (alarme, alerta, pré-alerta…); os tirados da análise vão no fim
  const lista = [...equipamentosAnomalia(r), ...r.equipamentos.filter((e) => aAnalisar(e) && fora.includes(e.local))]
  const atual = lista.find((e) => e.local === selecionado && !fora.includes(e.local)) ?? lista.find((e) => !fora.includes(e.local))
  const alternarAnalise = (local: string) =>
    atualizar((x) => {
      const f = x.foraDaAnalise ?? []
      return { ...x, foraDaAnalise: f.includes(local) ? f.filter((l) => l !== local) : [...f, local] }
    })
  const mudarCondicao = (e: EquipRel, c: string) => {
    atualizar((x) => ({ ...x, equipamentos: x.equipamentos.map((q) => (q.local === e.local ? { ...q, condicao: c } : q)) }))
    aoMudarCondicao?.(e, c)
  }

  if (!lista.length)
    return (
      <p className="p-4 text-sm text-cinza">
        Nenhum equipamento gera página de anomalia. Ajuste as condições na aba "Relatório" ou a condição dos equipamentos.
      </p>
    )

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-52 shrink-0 overflow-auto border-r border-linha bg-nevoa/60 p-2">
        {lista.map((e) => {
          const k = CONDICOES[e.condicao]
          const pendente = aAnalisar(e)
          const tirado = fora.includes(e.local)
          const pronta = paginaPreenchida(r, e)
          return (
            <div key={e.local} className={`anom-linha ${tirado ? 'tirado' : ''}`}>
              {pendente && (
                <input
                  type="checkbox"
                  className="anom-check"
                  checked={!tirado}
                  onChange={() => alternarAnalise(e.local)}
                  title={tirado ? 'Voltar para a lista de anomalias' : 'Tirar da lista de anomalias'}
                  aria-label={`${e.local} na lista de anomalias`}
                />
              )}
              <button
                onClick={() => !tirado && selecionar(e.local)}
                disabled={tirado}
                className={`anom-item ${e.local === atual?.local ? 'ativo' : ''}`}
                title={pronta ? 'Página preenchida' : `Falta: ${faltandoNaPagina(r, e).join(', ')}`}
              >
                <span className={`chip mr-1.5 ${pendente ? 'chip-analisar' : ''}`} style={k ? { background: k.cor, color: k.texto } : undefined}>
                  {e.condicao || '?'}
                </span>
                {pronta && <span className="anom-pronta" aria-label="preenchida">✓</span>}
                <span className="tag">{e.local}</span>
                <span className="mt-0.5 block truncate text-cinza">{pendente ? 'a analisar · ' : ''}{e.descricao}</span>
              </button>
            </div>
          )
        })}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto">
        {atual && <EditorAnomalia key={atual.local} r={r} e={atual} atualizar={atualizar} mudarCondicao={(c) => mudarCondicao(atual, c)} />}
      </div>
    </div>
  )
}

function EditorAnomalia({ r, e, atualizar, mudarCondicao }: { r: Relatorio; e: EquipRel; atualizar: Atualizar; mudarCondicao: (c: string) => void }) {
  const a = anomaliaDe(r, e)
  const mudar = (f: (a: Anomalia) => Anomalia) =>
    atualizar((x) => ({ ...x, anomalias: { ...x.anomalias, [e.local]: f(anomaliaDe(x, e)) } }))
  // foto do cadastro do equipamento entra sozinha no quadro "Foto" (uma vez por página)
  const fotoCad = itemCadastro(e.local)?.foto
  useEffect(() => {
    if (!fotoCad || a.fotoCadastro || a.imagens.some((i) => i.slot === 'foto')) return
    let vivo = true
    garantirFoto(raizConfig(), e.local).then((id) => {
      if (!vivo || !id) return
      mudar((an) =>
        an.fotoCadastro || an.imagens.some((i) => i.slot === 'foto')
          ? an
          : { ...an, fotoCadastro: true, imagens: [...an.imagens, { id, slot: 'foto', nome: 'Foto do cadastro', ajuste: 'conter' }] },
      )
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotoCad, e.local])
  const mudarEixo = (id: string, f: (x: Eixo) => Eixo) => mudar((an) => ({ ...an, eixos: an.eixos.map((x) => (x.id === id ? f(x) : x)) }))

  return (
    <div className="space-y-6 p-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="titulo text-lg">{e.local}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-cinza">
              Condição
              <SeletorCondicao valor={e.condicao} mudar={mudarCondicao} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="bt bt-sec"
            title="Tendência e espectros deste equipamento no banco Omnitrend"
            onClick={() => window.dispatchEvent(new CustomEvent('vibdocs:banco', { detail: { tag: e.local, descricao: e.descricao } }))}
          >
            Banco
          </button>
          <button
            type="button"
            className="bt bt-sec"
            title="Buscar relatórios antigos deste equipamento no Histórico preditivo"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('vibdocs:historico', {
                  detail: { busca: e.local, sugestoes: [...new Set([e.local, e.descricao, a.equipamento].filter(Boolean))] },
                }),
              )
            }
          >
            Relatórios antigos
          </button>
          <button
            type="button"
            className={`bt-finalizar ${a.finalizada ? 'feito' : ''}`}
            aria-pressed={!!a.finalizada}
            onClick={() => mudar((an) => ({ ...an, finalizada: !an.finalizada }))}
            title={
              a.finalizada
                ? 'Página marcada como finalizada (clique para reabrir)'
                : paginaPreenchida(r, e)
                  ? 'Tudo preenchido'
                  : `Falta: ${faltandoNaPagina(r, e).join(', ')}. Finalizar conta a página como preenchida assim mesmo.`
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {a.finalizada ? 'Finalizada' : 'Finalizar'}
          </button>
          </div>
        </div>
        <LinhaDoTempo r={r} e={e} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Localização" dica={r.usina === 'Jeceaba' ? 'Automático: Local de instalação.' : 'Automático: nome da área.'}>
          <Texto valor={a.localizacao ?? ''} placeholder={localizacaoPadrao(r, e)} mudar={(v) => mudar((an) => ({ ...an, localizacao: v }))} />
        </Campo>
        <Campo rotulo="Equipamento (como aparece no relatório)">
          <Texto valor={a.equipamento} mudar={(v) => mudar((an) => ({ ...an, equipamento: v }))} />
        </Campo>
        <Campo rotulo={rotulosUsina(r.usina).data}>
          <Texto valor={a.dataMedicao} placeholder="dd/mm/aa" mudar={(v) => mudar((an) => ({ ...an, dataMedicao: v }))} />
        </Campo>
        <Campo
          rotulo="Reincidente desde"
          dica={
            reincidenciaAuto(r, e)
              ? `Automático: ${reincidenciaAuto(r, e)} (pelo histórico). Digite para substituir.`
              : r.historico
                ? 'Sem anomalia em sequência nos meses anteriores. Digite se quiser informar.'
                : 'Histórico não carregado: informe manualmente.'
          }
        >
          <Texto
            valor={a.reincidenteDesde}
            placeholder={reincidenciaAuto(r, e) ?? 'dd/mm/aa'}
            mudar={(v) => mudar((an) => ({ ...an, reincidenteDesde: v }))}
          />
        </Campo>
        <Campo rotulo="Nota PR" dica="Várias notas: separe com /">
          <Texto valor={a.notasPR} mudar={(v) => mudar((an) => ({ ...an, notasPR: v }))} />
        </Campo>
      </div>

      <PainelGut r={r} e={e} a={a} mudar={mudar} mudarCondicao={mudarCondicao} />

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="titulo text-base">Situação e recomendação</h3>
          <datalist id="partes-sugeridas">
            {PARTES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button className={btnMini} onClick={() => mudar((an) => ({ ...an, eixos: [...an.eixos, novoEixo(an.eixos.length + 1)] }))}>
            Adicionar parte
          </button>
        </div>
        <p className="mb-2 text-[11px] text-cinza">
          Escolha a falha para trazer o texto padrão (provisório até a base oficial) e complete com suas próprias observações.
        </p>
        <div className="space-y-3">
          {a.eixos.map((x, i) => (
            <div key={x.id} className="eixo rounded-[14px] border border-linha p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="parte-campo">
                  <input
                    className="campo titulo w-36 text-sm"
                    list="partes-sugeridas"
                    aria-label="Parte do equipamento"
                    placeholder="sem parte"
                    title="Qualquer nome (Motor, Bomba, Mancal LA…). Vazio: o texto sai sem a parte e sem os dois pontos."
                    value={x.nome}
                    onChange={(ev) => mudarEixo(x.id, (y) => ({ ...y, nome: ev.target.value }))}
                  />
                  {x.nome && (
                    <button
                      type="button"
                      className="parte-limpar"
                      title="Sem parte: o texto sai sem “Motor:”"
                      aria-label="Tirar a parte"
                      onClick={() => mudarEixo(x.id, (y) => ({ ...y, nome: '' }))}
                    >
                      ×
                    </button>
                  )}
                </div>
                <Seletor
                  classe="seletor-campo min-w-0 flex-1 seletor-falha"
                  rotulo="Falha / texto padrão"
                  valor={x.falha}
                  mudar={(v) => {
                    const t = textoPorId(v)
                    mudarEixo(x.id, (y) => ({ ...y, falha: v, situacaoPadrao: t?.situacao ?? '', recomendacaoPadrao: t?.recomendacao ?? '' }))
                  }}
                  opcoes={[{ valor: '', rotulo: '— falha / texto padrão —' }, ...textosAtuais().map((t) => ({ valor: t.id, rotulo: t.nome }))]}
                />
                <button
                  className={btnMini}
                  title="Mover para cima"
                  disabled={i === 0}
                  onClick={() =>
                    mudar((an) => {
                      const ex = [...an.eixos]
                      ;[ex[i - 1], ex[i]] = [ex[i], ex[i - 1]]
                      return { ...an, eixos: ex }
                    })
                  }
                >
                  ↑
                </button>
                <button
                  className={btnMini}
                  title="Remover parte"
                  disabled={a.eixos.length === 1}
                  onClick={() => mudar((an) => ({ ...an, eixos: an.eixos.filter((y) => y.id !== x.id) }))}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Situação – texto padrão (editável)">
                  <TextoLongo valor={x.situacaoPadrao} mudar={(v) => mudarEixo(x.id, (y) => ({ ...y, situacaoPadrao: v }))} />
                </Campo>
                <Campo rotulo="Recomendação – texto padrão (editável)">
                  <TextoLongo valor={x.recomendacaoPadrao} mudar={(v) => mudarEixo(x.id, (y) => ({ ...y, recomendacaoPadrao: v }))} />
                </Campo>
                <Campo rotulo="Situação – observação do técnico">
                  <TextoLongo
                    valor={x.situacaoTecnico}
                    placeholder="Texto livre"
                    mudar={(v) => mudarEixo(x.id, (y) => ({ ...y, situacaoTecnico: v }))}
                  />
                </Campo>
                <Campo rotulo="Recomendação – recomendação do técnico">
                  <TextoLongo
                    valor={x.recomendacaoTecnico}
                    placeholder="Texto livre"
                    mudar={(v) => mudarEixo(x.id, (y) => ({ ...y, recomendacaoTecnico: v }))}
                  />
                </Campo>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Campo rotulo="Observações adicionais (opcional)" dica="Avaliação em campo, sensitiva, histórico de intervenções… Sai num quadro próprio quando preenchido.">
        <TextoLongo valor={a.observacoes ?? ''} mudar={(v) => mudar((an) => ({ ...an, observacoes: v }))} linhas={3} />
      </Campo>

      <Imagens
        imagens={a.imagens}
        mudar={(imgs) => mudar((an) => ({ ...an, imagens: imgs }))}
        layout={a.layoutImagens ?? 'padrao'}
        mudarLayout={(l) => mudar((an) => ({ ...an, layoutImagens: l }))}
      />
    </div>
  )
}

/** Condição do equipamento mês a mês (histórico + mês do relatório). */
function LinhaDoTempo({ r, e }: { r: Relatorio; e: EquipRel }) {
  const meses = { ...(r.historico?.condicoes[e.local] ?? {}), [r.mesReferencia]: e.condicao }
  const lista = Object.entries(meses)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
  if (lista.length < 2) return null
  return (
    <div className="mt-2 flex flex-wrap items-end gap-1" title="Condição nas últimas medições">
      {lista.map(([m, c]) => {
        const k = CONDICOES[c] ?? CONDICOES.X
        return (
          <div key={m} className="text-center">
            <div className="chip h-6 w-10" style={{ background: k.cor, color: k.texto }} title={k.nome}>
              {c}
            </div>
            <div className={`text-[10px] ${m === r.mesReferencia ? 'font-bold' : 'text-cinza'}`}>{mesCurto(m)}</div>
          </div>
        )
      })}
    </div>
  )
}

function Miniatura({ id }: { id: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    urlImagem(id).then(setUrl)
  }, [id])
  return url ? <img src={url} alt="" className="h-14 w-20 rounded-lg border border-linha bg-white object-contain" /> : <div className="h-14 w-20 rounded-lg bg-nevoa" />
}

function Imagens({
  imagens,
  mudar,
  layout,
  mudarLayout,
}: {
  imagens: ImagemRef[]
  mudar: (i: ImagemRef[]) => void
  layout: 'padrao' | 'livre'
  mudarLayout: (l: 'padrao' | 'livre') => void
}) {
  const [destino, setDestino] = useState<Slot>('tendencia')
  const [arrastando, setArrastando] = useState(false)
  const [erro, setErro] = useState('')
  const zona = useRef<HTMLDivElement>(null)

  // Próximo espaço livre na ordem padrão: tendência → espectro → foto.
  const proximoLivre = (atuais: ImagemRef[]): Slot => SLOTS.find((s) => !atuais.some((i) => i.slot === s.id))?.id ?? destino

  const adicionar = async (arquivos: Blob[], nomes: string[]) => {
    setErro('')
    let atuais = [...imagens]
    for (let k = 0; k < arquivos.length; k++) {
      try {
        const id = await guardarImagem(arquivos[k])
        const slot = arquivos.length === 1 ? destino : proximoLivre(atuais)
        atuais = [...atuais, { id, slot, nome: nomes[k] || 'imagem', ajuste: 'conter' }]
      } catch (e) {
        setErro(`Não foi possível ler "${nomes[k]}": ${(e as Error).message}`)
      }
    }
    mudar(atuais)
    setDestino(proximoLivre(atuais))
  }

  // Ctrl+V com a área de imagens em foco (print do Omnitrend, por exemplo).
  const colar = (ev: React.ClipboardEvent) => {
    const arqs = [...ev.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()!)
    if (arqs.length) {
      ev.preventDefault()
      adicionar(arqs, arqs.map(() => 'imagem colada'))
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="titulo text-base">Imagens</h3>
        <Abas
          ativa={layout}
          mudar={mudarLayout}
          itens={[
            ['padrao', 'Espaços fixos'],
            ['livre', 'Posição livre'],
          ]}
        />
        {layout === 'livre' && imagens.some((i) => i.livre) && (
          <button className={btnMini} onClick={() => mudar(imagens.map(({ livre: _l, ...i }) => i))}>
            Reorganizar
          </button>
        )}
      </div>
      {layout === 'livre' && (
        <p className="mb-3 rounded-[10px] bg-sinal-claro px-3 py-2 text-xs">
          Na prévia, arraste cada imagem para mover e puxe o canto amarelo para redimensionar. Com a imagem selecionada, as setas movem e
          Shift+setas mudam o tamanho.
        </p>
      )}
      <div
        ref={zona}
        tabIndex={0}
        onPaste={colar}
        onDragOver={(ev) => {
          ev.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(ev) => {
          ev.preventDefault()
          setArrastando(false)
          const arqs = [...ev.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
          adicionar(arqs, arqs.map((f) => f.name))
        }}
        className={`zona-solta ${arrastando ? 'ativa' : ''}`}
      >
        <p className="mb-2 text-cinza">Arraste imagens aqui, clique nesta área e cole (Ctrl+V), ou escolha os arquivos.</p>
        <div className="flex items-center justify-center gap-2">
          <span>Colocar em:</span>
          <select className="campo w-auto py-1" value={destino} onChange={(ev) => setDestino(ev.target.value as Slot)}>
            {SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <label className={btn}>
            Escolher arquivos…
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(ev) => {
                const arqs = [...(ev.target.files ?? [])]
                adicionar(arqs, arqs.map((f) => f.name))
                ev.target.value = ''
              }}
            />
          </label>
        </div>
      </div>
      {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}

      {imagens.length > 0 && (
        <ul className="mt-2 space-y-1">
          {imagens.map((img) => (
            <li key={img.id} className="linha-viva flex items-center gap-3 rounded-[12px] border border-linha p-2 text-xs">
              <Miniatura id={img.id} />
              <span className="min-w-0 flex-1 truncate">{img.nome}</span>
              <select
                className="campo w-auto py-1"
                value={img.slot}
                onChange={(ev) => mudar(imagens.map((i) => (i.id === img.id ? { ...i, slot: ev.target.value as Slot } : i)))}
              >
                {SLOTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
              <select
                className="campo w-auto py-1"
                title="Ajuste automático de tamanho"
                value={img.ajuste}
                onChange={(ev) =>
                  mudar(imagens.map((i) => (i.id === img.id ? { ...i, ajuste: ev.target.value as ImagemRef['ajuste'] } : i)))
                }
              >
                <option value="conter">Ajustar (inteira)</option>
                <option value="preencher">Preencher (recorta)</option>
              </select>
              <button className={btnMini} onClick={() => mudar(imagens.filter((i) => i.id !== img.id))}>
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
