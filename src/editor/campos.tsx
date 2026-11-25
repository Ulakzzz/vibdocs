// Campos de formulário simples e reutilizáveis.
import type { ReactNode } from 'react'

export const btn = 'rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50'
export const btnPri = 'rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50'
export const btnMini = 'rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-50'
const entrada = 'w-full rounded border border-zinc-300 px-2 py-1 text-sm'

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-zinc-600">{rotulo}</span>
      {children}
      {dica && <span className="mt-0.5 block text-[11px] text-zinc-400">{dica}</span>}
    </label>
  )
}

export function Texto(p: { valor: string; mudar: (v: string) => void; placeholder?: string; tipo?: string }) {
  return (
    <input
      className={entrada}
      type={p.tipo ?? 'text'}
      value={p.valor}
      placeholder={p.placeholder}
      onChange={(e) => p.mudar(e.target.value)}
    />
  )
}

export function TextoLongo(p: { valor: string; mudar: (v: string) => void; placeholder?: string; linhas?: number }) {
  return (
    <textarea
      className={entrada}
      rows={p.linhas ?? 2}
      value={p.valor}
      placeholder={p.placeholder}
      onChange={(e) => p.mudar(e.target.value)}
    />
  )
}
