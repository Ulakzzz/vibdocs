// Lista de escolha própria (substitui o <select> nativo, que no Windows abre cinza e sem animação).
// O valor rola como no odômetro quando muda; a lista abre com recorte de cima para baixo e as opções
// sobem uma a uma. Teclado: ↑/↓ para andar, Enter para escolher, Esc para fechar, letras para pular.
import { useEffect, useId, useRef, useState } from 'react'

export interface Opcao {
  valor: string
  rotulo: string
  extra?: string // texto pequeno à direita (ex.: quantidade)
  cor?: string // amostra de cor à esquerda (condição)
  corTexto?: string
  numero?: string // número da condição dentro da amostra
}

export function Seletor(p: {
  valor: string
  opcoes: Opcao[]
  mudar: (v: string) => void
  rotulo: string // nome acessível
  classe?: string
  desabilitado?: boolean
  /** estilo do botão (ex.: a etiqueta colorida da condição) e texto mostrado nele */
  estiloBotao?: React.CSSProperties
  classeBotao?: string
  textoBotao?: string
}) {
  const [aberto, setAberto] = useState(false)
  // a lista flutua na tela (position: fixed) para não ser cortada pelo painel; abre para cima se faltar espaço
  const [lugar, setLugar] = useState<React.CSSProperties>({})
  const [ativo, setAtivo] = useState(0)
  const [anterior, setAnterior] = useState<string>()
  const ultimo = useRef(p.valor)
  const textoMostrado = p.textoBotao ?? p.opcoes.find((o) => o.valor === p.valor)?.rotulo ?? p.valor
  const ultimoTexto = useRef(textoMostrado)
  const caixa = useRef<HTMLDivElement>(null)
  const id = useId()
  const atual = p.opcoes.find((o) => o.valor === p.valor)

  // rola o texto quando o valor muda (odômetro): o antigo sobe e sai, o novo entra por baixo
  useEffect(() => {
    if (ultimo.current === p.valor) return
    setAnterior(ultimoTexto.current)
    ultimo.current = p.valor
    ultimoTexto.current = textoMostrado
    const t = setTimeout(() => setAnterior(undefined), 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.valor])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false)
    // rolou a página ou o painel: a lista acompanha o botão (fecha só se o botão sair da tela)
    const rolou = () => {
      const r = caixa.current?.getBoundingClientRect()
      if (!r || r.bottom < 0 || r.top > innerHeight) return setAberto(false)
      posicionar()
    }
    const redimensionou = () => posicionar()
    addEventListener('pointerdown', fora)
    addEventListener('scroll', rolou, true)
    addEventListener('resize', redimensionou)
    return () => {
      removeEventListener('pointerdown', fora)
      removeEventListener('scroll', rolou, true)
      removeEventListener('resize', redimensionou)
    }
  }, [aberto])

  const posicionar = () => {
    const r = caixa.current!.getBoundingClientRect()
    const alturaLista = Math.min(320, p.opcoes.length * 36 + 14)
    const emCima = r.bottom + alturaLista + 12 > innerHeight && r.top > alturaLista + 12
    setLugar({
      position: 'fixed',
      left: Math.min(r.left, innerWidth - 300),
      minWidth: Math.max(r.width, 176),
      ...(emCima ? { top: 'auto', bottom: innerHeight - r.top + 6, transformOrigin: 'bottom' } : { top: r.bottom + 6 }),
    })
  }
  const abrir = () => {
    if (p.desabilitado) return
    posicionar()
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
        className={`seletor-botao ${p.classeBotao ?? ''}`}
        style={p.estiloBotao}
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
            {p.textoBotao ?? atual?.rotulo ?? p.valor}
            {atual?.extra && <small> {atual.extra}</small>}
          </span>
        </span>
        <svg className="seletor-seta" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {aberto && (
        <ul className="seletor-lista" role="listbox" id={id} aria-label={p.rotulo} style={lugar}>
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
              {o.cor && (
                <span className="seletor-cor" style={{ background: o.cor, color: o.corTexto }}>
                  {o.numero}
                </span>
              )}
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
