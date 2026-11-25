// Editor das páginas de anomalia: cabeçalho, eixos (texto padrão + texto do técnico) e imagens.
import { useEffect, useRef, useState } from 'react'
import { CONDICOES } from '../lib/condicao'
import { guardarImagem, urlImagem } from '../lib/imagens'
import {
  anomaliaDe,
  equipamentosAnomalia,
  novoEixo,
  SLOTS,
  type Anomalia,
  type EquipRel,
  type Eixo,
  type ImagemRef,
  type Relatorio,
  type Slot,
} from '../lib/relatorio'
import { TEXTOS_PADRAO, textoPorId } from '../lib/textos'
import { btn, btnMini, Campo, Texto, TextoLongo } from './campos'

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
      <p className="p-4 text-sm text-zinc-500">
        Nenhum equipamento gera página de anomalia. Ajuste as condições na aba "Relatório" ou a condição dos equipamentos.
      </p>
    )

  const completo = (e: EquipRel) => {
    const a = r.anomalias[e.local]
    return !!a && a.eixos.some((x) => x.situacaoPadrao || x.situacaoTecnico)
  }

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-44 shrink-0 overflow-auto border-r bg-zinc-50">
        {lista.map((e) => {
          const k = CONDICOES[e.condicao]
          return (
            <button
              key={e.local}
              onClick={() => selecionar(e.local)}
              className={`block w-full border-b px-2 py-1.5 text-left text-xs ${e.local === atual?.local ? 'bg-white font-semibold' : ''}`}
            >
              <span className="mr-1 inline-block w-4 rounded text-center" style={{ background: k?.cor, color: k?.texto }}>
                {e.condicao}
              </span>
              {completo(e) ? '✓ ' : ''}
              <span className="font-mono">{e.local}</span>
              <span className="block truncate text-zinc-500">{e.descricao}</span>
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
    <div className="space-y-4 p-3">
      <div>
        <div className="font-mono text-sm font-semibold">{e.local}</div>
        <div className="text-xs text-zinc-500">
          Condição {e.condicao} – {CONDICOES[e.condicao]?.nome}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Equipamento (como aparece no relatório)">
          <Texto valor={a.equipamento} mudar={(v) => mudar((an) => ({ ...an, equipamento: v }))} />
        </Campo>
        <Campo rotulo="Data da medição">
          <Texto valor={a.dataMedicao} placeholder="dd/mm/aa" mudar={(v) => mudar((an) => ({ ...an, dataMedicao: v }))} />
        </Campo>
        <Campo rotulo="Reincidente desde" dica="Automático pelo histórico numa próxima etapa; por enquanto manual.">
          <Texto valor={a.reincidenteDesde} placeholder="dd/mm/aa" mudar={(v) => mudar((an) => ({ ...an, reincidenteDesde: v }))} />
        </Campo>
        <Campo rotulo="Notas PR">
          <Texto valor={a.notasPR} mudar={(v) => mudar((an) => ({ ...an, notasPR: v }))} />
        </Campo>
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Situação e recomendação por eixo</h3>
          <button className={btnMini} onClick={() => mudar((an) => ({ ...an, eixos: [...an.eixos, novoEixo(an.eixos.length + 1)] }))}>
            + eixo
          </button>
        </div>
        <p className="mb-2 text-[11px] text-zinc-500">
          Escolha a falha para trazer o texto padrão (provisório até a base oficial) e complete com suas próprias observações.
        </p>
        <div className="space-y-3">
          {a.eixos.map((x, i) => (
            <div key={x.id} className="rounded border border-zinc-200 p-2">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className="w-28 rounded border px-2 py-1 text-sm font-semibold"
                  value={x.nome}
                  onChange={(ev) => mudarEixo(x.id, (y) => ({ ...y, nome: ev.target.value }))}
                />
                <select
                  className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
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
                  title="Remover eixo"
                  disabled={a.eixos.length === 1}
                  onClick={() => mudar((an) => ({ ...an, eixos: an.eixos.filter((y) => y.id !== x.id) }))}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
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

      <Imagens imagens={a.imagens} mudar={(imgs) => mudar((an) => ({ ...an, imagens: imgs }))} />
    </div>
  )
}

function Miniatura({ id }: { id: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    urlImagem(id).then(setUrl)
  }, [id])
  return url ? <img src={url} alt="" className="h-14 w-20 rounded border object-contain" /> : <div className="h-14 w-20 rounded border bg-zinc-100" />
}

function Imagens({ imagens, mudar }: { imagens: ImagemRef[]; mudar: (i: ImagemRef[]) => void }) {
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
      <h3 className="mb-1 text-sm font-semibold">Imagens</h3>
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
        className={`rounded border-2 border-dashed p-3 text-center text-xs outline-none focus:border-blue-400 ${
          arrastando ? 'border-blue-500 bg-blue-50' : 'border-zinc-300'
        }`}
      >
        <p className="mb-2 text-zinc-500">Arraste imagens aqui, clique nesta área e cole (Ctrl+V), ou escolha os arquivos.</p>
        <div className="flex items-center justify-center gap-2">
          <span>Colocar em:</span>
          <select className="rounded border px-1 py-0.5" value={destino} onChange={(ev) => setDestino(ev.target.value as Slot)}>
            {SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <label className={btn + ' cursor-pointer text-xs'}>
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
            <li key={img.id} className="flex items-center gap-2 text-xs">
              <Miniatura id={img.id} />
              <span className="min-w-0 flex-1 truncate">{img.nome}</span>
              <select
                className="rounded border px-1 py-0.5"
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
                className="rounded border px-1 py-0.5"
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
