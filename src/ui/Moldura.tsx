// Moldura das telas de entrada e login: lado preto com a malha de pontos que vibra (A6), lado claro com o formulário.
import type { ReactNode } from 'react'
import { Malha } from './Malha'
import { BotaoTema } from './Tema'

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
      <section className="malha-entrada relative flex min-h-64 flex-col justify-between gap-16 overflow-hidden bg-preto p-8 text-white lg:min-h-full lg:p-12">
        <Malha className="absolute inset-0 h-full w-full" />
        <div className="relative z-[1] flex items-center gap-3">
          <Marca />
          <span className="titulo text-lg">VibDocs</span>
        </div>
        <div className="pointer-events-none relative z-[1] max-w-md">
          <h1 className="titulo-grande text-4xl leading-[1.02] lg:text-[3.4rem]">
            Vibração medida,
            <br />
            <span className="vazado">relatório</span>
            <br />
            <span className="bloco">
              <span>pronto.</span>
            </span>
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
            Planilhas de controle, histórico e anomalias num só lugar, com o relatório final sempre à vista.
          </p>
        </div>
      </section>
      <section className="relative flex items-center justify-center bg-superficie p-8 lg:p-12">
        <BotaoTema className="bt bt-fantasma absolute top-5 right-5 h-9 w-9 justify-center px-0" />
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  )
}
