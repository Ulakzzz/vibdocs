// Componentes de formulário e classes de botão (estilos em index.css, ver docs/VibDocs-design.md).
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const btn = 'bt bt-sec'
export const btnPri = 'bt bt-pri'
export const btnFantasma = 'bt bt-fantasma'
export const btnMini = 'bt bt-sec bt-mini'

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-grafite">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-cinza">{dica}</span>}
    </label>
  )
}

export function Texto(p: { valor: string; mudar: (v: string) => void; placeholder?: string; tipo?: string }) {
  return (
    <input className="campo" type={p.tipo ?? 'text'} value={p.valor} placeholder={p.placeholder} onChange={(e) => p.mudar(e.target.value)} />
  )
}

export function TextoLongo(p: { valor: string; mudar: (v: string) => void; placeholder?: string; linhas?: number }) {
  return (
    <textarea
      className="campo leading-relaxed"
      rows={p.linhas ?? 3}
      value={p.valor}
      placeholder={p.placeholder}
      onChange={(e) => p.mudar(e.target.value)}
    />
  )
}

/** Abas com indicador que desliza até a aba ativa. */
export function Abas<T extends string>({ itens, ativa, mudar }: { itens: [T, ReactNode][]; ativa: T; mudar: (t: T) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, width: 0 })
  useLayoutEffect(() => {
    const el = caixa.current?.querySelector<HTMLButtonElement>(`[data-aba="${ativa}"]`)
    if (el) setPos({ left: el.offsetLeft, width: el.offsetWidth })
  }, [ativa, itens])
  return (
    <div className="abas" role="tablist" ref={caixa}>
      <span className="indicador" style={pos} aria-hidden />
      {itens.map(([id, rotulo]) => (
        <button key={id} role="tab" data-aba={id} aria-selected={id === ativa} onClick={() => mudar(id)}>
          {rotulo}
        </button>
      ))}
    </div>
  )
}
