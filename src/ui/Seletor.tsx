// Lista de escolha própria (substitui o <select> nativo, que no Windows abre cinza e sem animação).
// O valor rola como no odômetro quando muda; a lista abre com recorte de cima para baixo e as opções
// sobem uma a uma. Teclado: ↑/↓ para andar, Enter para escolher, Esc para fechar, letras para pular.
import { useEffect, useId, useRef, useState } from 'react'

export interface Opcao {
  valor: string
  rotulo: string
  extra?: string // texto pequeno à direita (ex.: quantidade)
}

export function Seletor(p: {
  valor: string
  opcoes: Opcao[]
  mudar: (v: string) => void
  rotulo: string // nome acessível
  classe?: string
  desabilitado?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const [anterior, setAnterior] = useState<string>()
  const ultimo = useRef(p.valor)
  const caixa = useRef<HTMLDivElement>(null)
  const id = useId()
  const atual = p.opcoes.find((o) => o.valor === p.valor)

  // rola o texto quando o valor muda (odômetro): o antigo sobe e sai, o novo entra por baixo
  useEffect(() => {
    if (ultimo.current === p.valor) return
    setAnterior(p.opcoes.find((o) => o.valor === ultimo.current)?.rotulo ?? ultimo.current)
    ultimo.current = p.valor
    const t = setTimeout(() => setAnterior(undefined), 450)
    return () => clearTimeout(t)
  }, [p.valor, p.opcoes])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false)
    addEventListener('pointerdown', fora)
    return () => removeEventListener('pointerdown', fora)
  }, [aberto])

  const abrir = () => {
    if (p.desabilitado) return
    setAtivo(Math.max(0, p.opcoes.findIndex((o) => o.valor === p.valor)))
    setAberto(true)
  }
  const escolher = (v: string) => {
    setAberto(false)
    if (v !== p.valor) p.mudar(v)
  }
  const teclado = (e: React.KeyboardEvent) => {
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        abrir()
      }
      return
    }
    if (e.key === 'Escape') setAberto(false)
    else if (e.key === 'ArrowDown') setAtivo((a) => Math.min(p.opcoes.length - 1, a + 1))
    else if (e.key === 'ArrowUp') setAtivo((a) => Math.max(0, a - 1))
    else if (e.key === 'Enter' || e.key === ' ') p.opcoes[ativo] && escolher(p.opcoes[ativo].valor)
    else if (e.key.length === 1) {
      const k = p.opcoes.findIndex((o) => o.rotulo.toLowerCase().startsWith(e.key.toLowerCase()))
      if (k >= 0) setAtivo(k)
      return
    } else return
    e.preventDefault()
  }

  return (
    <div className={`seletor ${aberto ? 'aberto' : ''} ${p.classe ?? ''}`} ref={caixa}>
      <button
        type="button"
        className="seletor-botao"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={`${p.rotulo}: ${atual?.rotulo ?? p.valor}`}
        disabled={p.desabilitado}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={teclado}
      >
        <span className="seletor-rolo">
          {anterior !== undefined && (
            <span className="sai" aria-hidden>
              {anterior}
            </span>
          )}
          <span key={p.valor} className={anterior !== undefined ? 'entra' : ''}>
            {atual?.rotulo ?? p.valor}
            {atual?.extra && <small> {atual.extra}</small>}
          </span>
        </span>
        <svg className="seletor-seta" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {aberto && (
        <ul className="seletor-lista" role="listbox" id={id} aria-label={p.rotulo}>
          {p.opcoes.map((o, i) => (
            <li
              key={o.valor}
              role="option"
              aria-selected={o.valor === p.valor}
              className={i === ativo ? 'ativo' : ''}
              style={{ ['--i' as string]: Math.min(i, 12) }}
              onPointerEnter={() => setAtivo(i)}
              onClick={() => escolher(o.valor)}
            >
              <span>{o.rotulo}</span>
              {o.extra && <small>{o.extra}</small>}
              {o.valor === p.valor && (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="ml-auto">
                  <path d="M2.5 6.5l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
