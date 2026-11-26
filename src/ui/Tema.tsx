// Tema claro/escuro: segue o sistema por padrão; a escolha manual fica salva neste navegador.
// O index.html aplica o tema antes da página aparecer (sem "piscar" no tema errado).
import { useEffect, useState, type ReactNode } from 'react'

export type ModoTema = 'sistema' | 'claro' | 'escuro'
const CHAVE = 'vibdocs.tema'
const escuroNoSistema = () => matchMedia('(prefers-color-scheme: dark)').matches

function aplicar(modo: ModoTema) {
  const escuro = modo === 'escuro' || (modo === 'sistema' && escuroNoSistema())
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro'
}

export function useTema() {
  const [modo, setModo] = useState<ModoTema>(() => (localStorage.getItem(CHAVE) as ModoTema) || 'sistema')
  useEffect(() => {
    aplicar(modo)
    localStorage.setItem(CHAVE, modo)
    if (modo !== 'sistema') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const mudou = () => aplicar('sistema')
    mq.addEventListener('change', mudou)
    return () => mq.removeEventListener('change', mudou)
  }, [modo])
  return [modo, setModo] as const
}

const ICONES: Record<ModoTema, ReactNode> = {
  claro: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  escuro: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  ),
  sistema: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
}
const NOMES: Record<ModoTema, string> = { sistema: 'Tema do sistema', claro: 'Tema claro', escuro: 'Tema escuro' }
const PROXIMO: Record<ModoTema, ModoTema> = { sistema: 'claro', claro: 'escuro', escuro: 'sistema' }

/** Botão que alterna Sistema → Claro → Escuro. */
export function BotaoTema({ className = '' }: { className?: string }) {
  const [modo, setModo] = useTema()
  return (
    <button
      className={className}
      onClick={() => setModo(PROXIMO[modo])}
      title={`${NOMES[modo]} (clique para ${NOMES[PROXIMO[modo]].toLowerCase()})`}
      aria-label={`${NOMES[modo]}. Mudar para ${NOMES[PROXIMO[modo]].toLowerCase()}`}
    >
      <span key={modo} className="girar-entrada inline-grid">
        {ICONES[modo]}
      </span>
    </button>
  )
}
