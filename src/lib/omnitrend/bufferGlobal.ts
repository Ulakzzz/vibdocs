// Precisa vir antes do mdb-reader: ele e as dependências esperam os globais do Node (Buffer, process).
import { Buffer } from 'buffer'
const g = globalThis as unknown as { Buffer: typeof Buffer; process?: { env: Record<string, string>; browser?: boolean } }
g.Buffer = Buffer
g.process ??= { env: {}, browser: true }
export { Buffer }
