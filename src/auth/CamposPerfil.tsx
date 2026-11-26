// Campos do perfil que vão para o relatório: nome completo, telefone, ART e selo de certificação.
import { useState } from 'react'
import { btnFantasma, btnMini, Campo, Texto } from '../editor/campos'
import type { DadosPerfil } from '../lib/usuarios'

/** Reduz a imagem do selo (máx. 700 px) e devolve PNG em data URL — fica pequena o bastante para o cadastro. */
async function reduzirSelo(arquivo: File): Promise<string> {
  const bmp = await createImageBitmap(arquivo)
  const escala = Math.min(1, 700 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala)
  c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  let url = c.toDataURL('image/png')
  if (url.length > 380_000) url = c.toDataURL('image/jpeg', 0.85) // foto grande: JPEG fica bem menor
  return url
}

export function CamposPerfil({ valor, mudar }: { valor: DadosPerfil; mudar: (v: DadosPerfil) => void }) {
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)

  const carregar = async (f?: File) => {
    setErro('')
    if (!f) return
    if (!f.type.startsWith('image/')) return setErro('Escolha uma imagem (PNG ou JPG).')
    try {
      mudar({ ...valor, selo: await reduzirSelo(f) })
    } catch {
      setErro('Não foi possível ler a imagem.')
    }
  }

  return (
    <div className="space-y-3">
      <Campo rotulo="Nome completo (sai no relatório como equipe técnica)">
        <Texto valor={valor.nomeCompleto ?? ''} mudar={(v) => mudar({ ...valor, nomeCompleto: v })} placeholder="Nome e sobrenome completos" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Telefone (cabeçalho do relatório)">
          <Texto tipo="tel" valor={valor.telefone ?? ''} mudar={(v) => mudar({ ...valor, telefone: v })} placeholder="+55 31 9…" />
        </Campo>
        <Campo rotulo="ART / registro (opcional)">
          <Texto valor={valor.art ?? ''} mudar={(v) => mudar({ ...valor, art: v })} />
        </Campo>
      </div>

      <div>
        <span className="mb-1 block text-[13px] font-medium text-grafite">Selo de certificação</span>
        <div
          className={`zona-solta flex items-center gap-4 text-left ${arrastando ? 'ativa' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastando(false)
            carregar(e.dataTransfer.files[0])
          }}
        >
          {valor.selo ? (
            <img src={valor.selo} alt="Selo de certificação" className="h-16 max-w-40 rounded-md bg-white object-contain p-1" />
          ) : (
            <div className="grid h-16 w-24 place-items-center rounded-md bg-nevoa text-[11px] text-cinza">sem selo</div>
          )}
          <div className="text-xs text-cinza">
            Ex.: Vibration Analyst II. Arraste a imagem aqui ou
            <div className="mt-2 flex gap-2">
              <label className={btnMini}>
                Escolher imagem
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => carregar(e.target.files?.[0])} />
              </label>
              {valor.selo && (
                <button type="button" className={`${btnFantasma} bt-mini`} onClick={() => mudar({ ...valor, selo: '' })}>
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>
        {erro && <p className="mt-1 text-xs text-red-700">{erro}</p>}
      </div>
    </div>
  )
}
