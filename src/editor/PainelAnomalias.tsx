// Editor das páginas de anomalia: cabeçalho, eixos (texto padrão + texto do técnico) e imagens.
import { useEffect, useRef, useState } from 'react'
import { PainelGut } from './PainelGut'
import { CONDICOES } from '../lib/condicao'
import { mesCurto } from '../lib/historico'
import { guardarImagem, urlImagem } from '../lib/imagens'
import {
  anomaliaDe,
  equipamentosAnomalia,
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
import { TEXTOS_PADRAO, textoPorId } from '../lib/textos'
import { Abas, btn, btnMini, Campo, Texto, TextoLongo } from './campos'

type Atualizar = (f: (r: Relatorio) => Relatorio) => void

export function PainelAnomalias({
  r,
  atualizar,
  selecionado,
  selecionar,
}: {
  r: Relatorio
  atualizar: Atualizar
  selecionado?: string
  selecionar: (local: string) => void
}) {
  const lista = equipamentosAnomalia(r)
  const atual = lista.find((e) => e.local === selecionado) ?? lista[0]

  if (!lista.length)
    return (
      <p className="p-4 text-sm text-cinza">
        Nenhum equipamento gera página de anomalia. Ajuste as condições na aba "Relatório" ou a condição dos equipamentos.
      </p>
    )

  const completo = (e: EquipRel) => {
    const a = r.anomalias[e.local]
    return !!a && a.eixos.some((x) => x.situacaoPadrao || x.situacaoTecnico)
  }

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-52 shrink-0 overflow-auto border-r border-linha bg-nevoa/60 p-2">
        {lista.map((e) => {
          const k = CONDICOES[e.condicao]
          return (
            <button
              key={e.local}
              onClick={() => selecionar(e.local)}
              className={`anom-item ${e.local === atual?.local ? 'ativo' : ''}`}
            >
              <span className="chip mr-1.5" style={{ background: k?.cor, color: k?.texto }}>
                {e.condicao}
              </span>
              {completo(e) ? '✓ ' : ''}
              <span className="tag">{e.local}</span>
              <span className="mt-0.5 block truncate text-cinza">{e.descricao}</span>
            </button>
          )
        })}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto">{atual && <EditorAnomalia key={atual.local} r={r} e={atual} atualizar={atualizar} />}</div>
    </div>
  )
}

function EditorAnomalia({ r, e, atualizar }: { r: Relatorio; e: EquipRel; atualizar: Atualizar }) {
  const a = anomaliaDe(r, e)
  const mudar = (f: (a: Anomalia) => Anomalia) =>
    atualizar((x) => ({ ...x, anomalias: { ...x.anomalias, [e.local]: f(anomaliaDe(x, e)) } }))
  const mudarEixo = (id: string, f: (x: Eixo) => Eixo) => mudar((an) => ({ ...an, eixos: an.eixos.map((x) => (x.id === id ? f(x) : x)) }))

  return (
    <div className="space-y-6 p-5">
      <div>
        <div className="titulo text-lg">{e.local}</div>
        <div className="text-xs text-cinza">
          Condição {e.condicao} – {CONDICOES[e.condicao]?.nome}
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

      <PainelGut r={r} e={e} a={a} mudar={mudar} />

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
                <input
                  className="campo titulo w-32 text-sm"
                  list="partes-sugeridas"
                  aria-label="Parte do equipamento"
                  value={x.nome}
                  onChange={(ev) => mudarEixo(x.id, (y) => ({ ...y, nome: ev.target.value }))}
                />
                <select
                  className="campo min-w-0 flex-1"
                  value={x.falha}
                  onChange={(ev) => {
                    const t = textoPorId(ev.target.value)
                    mudarEixo(x.id, (y) => ({
                      ...y,
                      falha: ev.target.value,
                      situacaoPadrao: t?.situacao ?? '',
                      recomendacaoPadrao: t?.recomendacao ?? '',
                    }))
                  }}
                >
                  <option value="">— falha / texto padrão —</option>
                  {TEXTOS_PADRAO.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
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
