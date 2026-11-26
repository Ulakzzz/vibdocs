// Substitui o pacote "create-hash" usado pelo mdb-reader só em bancos com senha (os do Omnitrend não têm).
// O pacote original puxa módulos do Node (stream/events) que não existem no navegador.
export default function createHash(): never {
  throw new Error('Banco Access com senha não é suportado.')
}
