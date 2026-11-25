// Testes da lógica de contas (sem navegador): npx tsx scripts/testar-usuarios.ts
import assert from 'node:assert/strict'
import {
  criarConta,
  definirAtivo,
  definirPapel,
  entrar,
  redefinirSenha,
  salvarPerfil,
  trocarSenha,
  type RepoUsuarios,
  type Usuario,
} from '../src/lib/usuarios'

let banco: Usuario[] = []
const repo: RepoUsuarios = { onde: 'navegador', ler: async () => structuredClone(banco), gravar: async (l) => void (banco = structuredClone(l)) }

const rejeita = async (p: Promise<unknown>, trecho: RegExp) => assert.match(String(await p.then(() => 'NAO REJEITOU', (e) => e.message)), trecho)

const admin = await criarConta(repo, { nome: 'Ana Admin', email: '', cargo: '', senha: 'segredo1' })
assert.equal(admin.papel, 'admin', 'primeira conta vira admin')
assert.ok(!JSON.stringify(banco).includes('segredo1'), 'senha não pode ficar em texto')

const tec = await criarConta(repo, { nome: 'Bruno Técnico', email: 'b@x', cargo: 'Técnico', senha: 'abc123' })
assert.equal(tec.papel, 'tecnico', 'demais contas viram técnico')
await rejeita(criarConta(repo, { nome: '  bruno técnico ', email: '', cargo: '', senha: 'abc123' }), /Já existe/)
await rejeita(criarConta(repo, { nome: 'Carla', email: '', cargo: '', senha: '123' }), /pelo menos/)

assert.equal((await entrar(repo, tec.id, 'abc123')).nome, 'Bruno Técnico')
await rejeita(entrar(repo, tec.id, 'errada'), /incorretos/)

await salvarPerfil(repo, tec.id, { nome: 'Bruno Silva', email: 'b@x', cargo: 'Técnico II' })
assert.equal((await entrar(repo, tec.id, 'abc123')).nome, 'Bruno Silva')

await rejeita(trocarSenha(repo, tec.id, 'errada', 'nova123'), /atual está incorreta/)
await trocarSenha(repo, tec.id, 'abc123', 'nova123')
await rejeita(entrar(repo, tec.id, 'abc123'), /incorretos/)
await entrar(repo, tec.id, 'nova123')

await redefinirSenha(repo, tec.id, 'temp99')
assert.equal((await entrar(repo, tec.id, 'temp99')).trocarSenha, true, 'redefinida pede troca')
assert.equal((await trocarSenha(repo, tec.id, 'temp99', 'final1')).trocarSenha, false)

await rejeita(definirPapel(repo, admin.id, 'tecnico'), /pelo menos um administrador/)
await rejeita(definirAtivo(repo, admin.id, false), /pelo menos um administrador/)
await definirPapel(repo, tec.id, 'admin')
await definirPapel(repo, admin.id, 'revisor') // agora pode: Bruno é admin

await rejeita(definirAtivo(repo, tec.id, false), /pelo menos um administrador/) // Bruno é o único admin
await definirAtivo(repo, admin.id, false)
await rejeita(entrar(repo, admin.id, 'segredo1'), /incorretos/) // conta desativada não entra

console.log('OK: todos os testes de contas passaram')
