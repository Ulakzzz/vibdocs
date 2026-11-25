// Moldura das telas de entrada e login: lado preto com a onda, lado branco com o formulário.
import type { ReactNode } from 'react'
import { Onda } from './Onda'

export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  // Marca do VibDocs: um "V" desenhado como um pico de sinal
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#FFC20E" />
      <path d="M5 11h5l6 13 6-13h5" fill="none" stroke="#000" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Moldura({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-full lg:grid-cols-[1.15fr_1fr]">
      <section className="relative flex min-h-64 flex-col justify-between gap-16 overflow-hidden bg-preto p-8 text-white lg:min-h-full lg:p-12">
        <div className="flex items-center gap-3">
          <Marca />
          <span className="titulo text-lg">VibDocs</span>
        </div>
        <Onda className="absolute inset-x-0 top-1/2 h-[46%] w-full -translate-y-1/2" />
        <div className="relative max-w-md">
          <h1 className="titulo-grande text-4xl lg:text-5xl">Relatórios de vibração, do controle ao PDF.</h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
            Planilhas de controle, histórico e anomalias num só lugar, com o relatório final sempre à vista.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center bg-white p-8 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  )
}
