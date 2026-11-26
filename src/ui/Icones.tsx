// Ícones de traço simples (24×24), herdam a cor do texto.
import type { ReactNode } from 'react'

const Svg = ({ children, t = 20 }: { children: ReactNode; t?: number }) => (
  <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const IcRelatorio = () => (
  <Svg>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </Svg>
)
export const IcEquipamentos = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M3 9h18M8 9v11" />
  </Svg>
)
export const IcAnomalia = () => (
  <Svg>
    <path d="M2 12h4l2-5 3 10 3-14 3 9h5" />
  </Svg>
)
export const IcMais = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IcConta = () => (
  <Svg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
)
export const IcPrevia = () => (
  <Svg t={18}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M13 4v16" />
  </Svg>
)
export const IcInicio = () => (
  <Svg>
    <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
  </Svg>
)
