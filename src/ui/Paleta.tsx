// Paleta de comandos (Ctrl+K): busca usina, área, equipamento, rascunho ou ação e vai direto.
// A busca ignora acentos e maiúsculas; todas as palavras digitadas precisam aparecer.
import { useEffect, useMemo, useRef, useState } from 'react'

export interface ItemPaleta {
  id: string
  grupo: string
  rotulo: string
  detalhe?: string
  atalho?: string
  cor?: string // bolinha de cor (condição)
  fazer: () => void
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function Paleta({ itens, fechar }: { itens: ItemPaleta[]; fechar: () => void }) {
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const lista = useRef<HTMLUListElement>(null)

  const achados = useMemo(() => {
    const termos = normal(busca).split(/\s+/).filter(Boolean)
    const ok = itens.filter((i) => {
      const alvo = normal(`${i.rotulo} ${i.detalhe ?? ''} ${i.grupo}`)
      return termos.every((t) => alvo.includes(t))
    })
    // melhores primeiro: a busca inteira aparece seguida (ignorando espaços e hífens), depois quem começa com ela
    if (termos.length) {
      const junto = termos.join('').replace(/[^a-z0-9]/g, '')
      const nota = (i: ItemPaleta) =>
        (normal(`${i.rotulo} ${i.detalhe ?? ''}`).replace(/[^a-z0-9]/g, '').includes(junto) ? 2 : 0) +
        (normal(i.rotulo).startsWith(termos[0]) ? 1 : 0)
      ok.sort((a, b) => nota(b) - nota(a))
    }
    return ok.slice(0, 40)
  }, [busca, itens])

  useEffect(() => setAtivo(0), [busca])
  useEffect(() => {
    lista.current?.querySelector('.ativo')?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  const escolher = (i?: ItemPaleta) => {
    if (!i) return
    fechar()
    // deixa a paleta sair antes de mudar de tela
    requestAnimationFrame(() => i.fazer())
  }
  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setAtivo((a) => Math.min(achados.length - 1, a + 1))
    else if (e.key === 'ArrowUp') setAtivo((a) => Math.max(0, a - 1))
    else if (e.key === 'Enter') escolher(achados[ativo])
    else if (e.key === 'Escape') fechar()
    else return
    e.preventDefault()
  }

  let grupoAnterior = ''
  return (
    <div className="paleta-fundo" onMouseDown={fechar}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Buscar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="paleta-busca">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={teclado}
            placeholder="Buscar usina, área, equipamento, relatório ou ação…"
            aria-label="Buscar"
            aria-controls="paleta-lista"
            aria-activedescendant={achados[ativo] ? `pal-${achados[ativo].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul ref={lista} id="paleta-lista" role="listbox" className="paleta-lista">
          {achados.length === 0 && <li className="paleta-vazio">Nada encontrado para “{busca}”.</li>}
          {achados.map((i, k) => {
            const cabeca = i.grupo !== grupoAnterior && !busca
            grupoAnterior = i.grupo
            return (
              <li key={i.id} role="presentation">
                {cabeca && <div className="paleta-grupo">{i.grupo}</div>}
                <div
                  id={`pal-${i.id}`}
                  role="option"
                  aria-selected={k === ativo}
                  className={`paleta-item ${k === ativo ? 'ativo' : ''}`}
                  onPointerMove={() => setAtivo(k)}
                  onClick={() => escolher(i)}
                >
                  {busca && <small className="paleta-tipo">{i.grupo}</small>}
                  {i.cor && <span className="paleta-cor" style={{ background: i.cor }} />}
                  <span className="truncate">{i.rotulo}</span>
                  {i.detalhe && <span className="paleta-detalhe truncate">{i.detalhe}</span>}
                  {i.atalho && <kbd className="ml-auto">{i.atalho}</kbd>}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="paleta-rodape">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span className="ml-auto">
            <kbd>Ctrl</kbd> <kbd>K</kbd> abre de qualquer tela
          </span>
        </div>
      </div>
    </div>
  )
}
