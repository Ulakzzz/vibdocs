// Layout livre das imagens de uma anomalia: cada imagem tem posição e tamanho (em % da área).
// Na prévia da tela, dá para arrastar (mover) e puxar o canto (redimensionar), com encaixe numa grade.
// Na impressão, é só o desenho estático.
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react'
import { urlImagem } from '../lib/imagens'
import { AREA_IMAGENS_MM, posicaoLivre, type ImagemRef } from '../lib/relatorio'

type Pos = { x: number; y: number; l: number; a: number }
const GRADE = 2.5 // %
const MIN = 10 // tamanho mínimo, %
const enc = (v: number) => Math.round(v / GRADE) * GRADE
const limitar = (p: Pos): Pos => {
  const l = Math.min(100, Math.max(MIN, p.l))
  const a = Math.min(100, Math.max(MIN, p.a))
  return { l, a, x: Math.min(100 - l, Math.max(0, p.x)), y: Math.min(100 - a, Math.max(0, p.y)) }
}

function Foto({ img }: { img: ImagemRef }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    urlImagem(img.id).then(setUrl)
  }, [img.id])
  return url ? (
    <img src={url} alt={img.nome} draggable={false} className="h-full w-full" style={{ objectFit: img.ajuste === 'preencher' ? 'cover' : 'contain' }} />
  ) : null
}

export function AreaLivre({ imagens, editar }: { imagens: ImagemRef[]; editar?: (imagens: ImagemRef[]) => void }) {
  const area = useRef<HTMLDivElement>(null)
  const [arrasto, setArrasto] = useState<{ id: string; modo: 'mover' | 'redim'; inicio: { x: number; y: number }; pos: Pos; atual: Pos }>()

  const comecar = (ev: PE, img: ImagemRef, modo: 'mover' | 'redim') => {
    if (!editar) return
    ev.preventDefault()
    ev.stopPropagation()
    ;(ev.target as Element).setPointerCapture(ev.pointerId)
    const pos = posicaoLivre(img, imagens)
    setArrasto({ id: img.id, modo, inicio: { x: ev.clientX, y: ev.clientY }, pos, atual: pos })
  }
  const mover = (ev: PE) => {
    if (!arrasto || !area.current) return
    const r = area.current.getBoundingClientRect()
    const dx = ((ev.clientX - arrasto.inicio.x) / r.width) * 100
    const dy = ((ev.clientY - arrasto.inicio.y) / r.height) * 100
    const p = arrasto.pos
    const atual =
      arrasto.modo === 'mover'
        ? limitar({ ...p, x: enc(p.x + dx), y: enc(p.y + dy) })
        : limitar({ ...p, l: enc(p.l + dx), a: enc(p.a + dy) })
    setArrasto({ ...arrasto, atual })
  }
  const soltar = () => {
    if (!arrasto || !editar) return
    editar(imagens.map((i) => (i.id === arrasto.id ? { ...i, livre: arrasto.atual } : i.livre ? i : { ...i, livre: posicaoLivre(i, imagens) })))
    setArrasto(undefined)
  }
  // teclado: setas movem 2,5%; Shift+setas redimensionam
  const teclado = (ev: React.KeyboardEvent, img: ImagemRef) => {
    if (!editar) return
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]
    if (!d) return
    ev.preventDefault()
    const p = posicaoLivre(img, imagens)
    const n = ev.shiftKey ? limitar({ ...p, l: p.l + d[0] * GRADE, a: p.a + d[1] * GRADE }) : limitar({ ...p, x: p.x + d[0] * GRADE, y: p.y + d[1] * GRADE })
    editar(imagens.map((i) => (i.id === img.id ? { ...i, livre: n } : i)))
  }

  return (
    <div
      ref={area}
      className={`area-livre ${editar ? 'editavel' : ''} ${arrasto ? 'arrastando' : ''}`}
      style={{ height: `${AREA_IMAGENS_MM.a}mm` }}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={() => setArrasto(undefined)}
    >
      {imagens.map((img) => {
        const p = arrasto?.id === img.id ? arrasto.atual : posicaoLivre(img, imagens)
        return (
          <div
            key={img.id}
            className={`peca ${arrasto?.id === img.id ? 'ativa' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.l}%`, height: `${p.a}%` }}
            onPointerDown={(ev) => comecar(ev, img, 'mover')}
            tabIndex={editar ? 0 : undefined}
            onKeyDown={(ev) => teclado(ev, img)}
            title={editar ? 'Arraste para mover. Puxe o canto para redimensionar. Setas movem; Shift+setas redimensionam.' : undefined}
          >
            <Foto img={img} />
            {editar && <span className="alca" onPointerDown={(ev) => comecar(ev, img, 'redim')} aria-hidden />}
          </div>
        )
      })}
    </div>
  )
}
