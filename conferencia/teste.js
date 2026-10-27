#!/usr/bin/env node
/*
 * O TESTE DA CONFERÊNCIA (20/10/2026)
 *
 * Por que existe: uma conferência que nunca foi vista recusando é afirmação sobre nada. Cada caso abaixo monta uma
 * pasta de mentira com UMA coisa errada e exige que a conferência a ache, com o número da regra certa. E monta uma
 * pasta limpa, que tem de passar sem achado nenhum: conferência que recusa tudo também não confere nada.
 *
 * O CPF e os endereços dos casos são montados aqui, na hora, e nunca escritos por extenso. Escritos, a própria
 * conferência recusaria este arquivo, com razão.
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var C = require('./conferir.js');

// Um CPF que passa na conta dos dígitos, calculado a partir de nove algarismos sorteados. Não é de ninguém conhecido,
// e muda a cada rodada.
function cpfDeMentira() {
  var d = [];
  for (var i = 0; i < 9; i++) d.push(Math.floor(Math.random() * 10));
  if (d.every(function (x) { return x === d[0]; })) d[0] = (d[0] + 1) % 10;
  for (var t = 9; t <= 10; t++) {
    var soma = 0;
    for (var j = 0; j < t; j++) soma += d[j] * (t + 1 - j);
    d.push((soma * 10) % 11 % 10);
  }
  return d.join('');
}
function pontuado(c) { return c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9); }
var ID = 'AKfycb' + 'x'.repeat(40);
var ENDERECO_SCRIPT = 'https://script.' + 'google.com/macros/s/' + ID + '/exec';
var ENDERECO_PLANILHA = 'https://docs.' + 'google.com/spreadsheets/d/' + '1'.repeat(30) + '/edit';
// O bloco bom tem a tela do celular e envia (21/10/2026): a declaração inteira, com os arquivos, o cache e o envio.
var DECLARACAO_BOA = { nome: 'Operação', dono: 'Operação', especie: 'ambas', quemVe: ['ENCARREGADO', 'CAMPO'], servidor: 'OPERACAO', versao: '5g-1',
  entrada: 'index.html', arquivos: ['index.html', 'fila.js'], cache: 'operacao-campo-',
  envia: { etiqueta: 'enviar-diarios', app: 'campo', script: 'fila.js' },
  // O acesso rápido bem declarado tem de passar (casca 1.11, 27/10/2026).
  atalhos: [{ id: 'diario', nome: 'Diário da equipe', icone: '📋', perfis: ['ENCARREGADO'] }, { id: 'viabilidade', nome: 'Viabilidade', perfis: ['VIABILIZADOR', 'SUPERVISOR'] }],
  completo: ['SUPERVISOR', 'ADMIN'] };
var BLOCO_BOM = JSON.stringify(DECLARACAO_BOA);
// A declaração boa com uma mudança: { campo: valor } troca, { campo: undefined } tira.
function declaracao(mudar) { var d = JSON.parse(BLOCO_BOM); Object.keys(mudar).forEach(function (k) { if (mudar[k] === undefined) delete d[k]; else d[k] = mudar[k]; }); return JSON.stringify(d); }
var RESUMO = 'a'.repeat(64) + '\n';

function pasta(arquivos) {
  var raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'conferencia-'));
  Object.keys(arquivos).forEach(function (rel) {
    var p = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, arquivos[rel]);
  });
  return raiz;
}

var LIMPA = {
  'index.html': '<!doctype html><title>App Compel</title><p>Versão 1.0 de 20/10/2026, 12345 registros, R$ 207,28</p>',
  'config/login.js': "var ENDERECO_DO_LOGIN = '" + ENDERECO_SCRIPT + "';",
  'blocos/operacao/bloco.json': BLOCO_BOM,
  'blocos/operacao/index.html': '<p>Hoje</p>',
  'blocos/operacao/fila.js': 'cascaBlocoEnvia("operacao", {});',
  'blocos/operacao/servidor.sha256': RESUMO,
  // Um bloco só de sistema não tem pasta de telas: a declaração basta.
  'blocos/dp/bloco.json': JSON.stringify({ nome: 'DP', dono: 'DP', especie: 'sistema', quemVe: ['TODOS'], servidor: 'DP', versao: '1' }),
  'icone.png': 'binário qualquer ' + ENDERECO_PLANILHA
};
function com(extra) { var o = {}; Object.keys(LIMPA).forEach(function (k) { o[k] = LIMPA[k]; }); Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
function sem(chave) { var o = com({}); delete o[chave]; return o; }

var cpf = cpfDeMentira();
var casos = [
  { nome: 'a pasta limpa passa', arquivos: LIMPA, regras: [] },
  { nome: 'arquivo .gs', arquivos: com({ 'blocos/operacao/27_AppCampo.gs': 'function doPost() {}' }), regras: [1] },
  { nome: 'appsscript.json', arquivos: com({ 'appsscript.json': '{}' }), regras: [1] },
  { nome: 'endereço do Apps Script fora do lugar do login', arquivos: com({ 'casca/fila.js': "var s = '" + ENDERECO_SCRIPT + "';" }), regras: [2] },
  { nome: 'dois endereços no lugar do login', arquivos: com({ 'config/login.js': "var a = '" + ENDERECO_SCRIPT + "', b = '" + ENDERECO_SCRIPT + "';" }), regras: [2] },
  { nome: 'endereço de planilha', arquivos: com({ 'README.md': 'A base: ' + ENDERECO_PLANILHA }), regras: [2] },
  { nome: 'CPF pontuado', arquivos: com({ 'blocos/operacao/teste.json': '{"cpf":"' + pontuado(cpf) + '"}' }), regras: [3] },
  { nome: 'CPF só com algarismos', arquivos: com({ 'casca/massa.js': 'var pessoa = { cpf: "' + cpf + '" };' }), regras: [3] },
  { nome: 'bloco sem declaração', arquivos: com({ 'blocos/seguranca/index.html': '<p>checklist</p>' }), regras: [4] },
  { nome: 'declaração sem o dono', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ dono: undefined }) }), regras: [4] },
  { nome: 'servidor do bloco como endereço', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ servidor: 'https://exemplo/exec' }) }), regras: [4] },
  { nome: 'espécie inventada', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ especie: 'web' }) }), regras: [4] },
  // 21/10/2026: a tela do celular, o cache e o envio (FRONTEIRA §5.1 e §5.5).
  { nome: 'declaração sem a versão', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ versao: undefined }) }), regras: [4] },
  { nome: 'tela do celular sem a lista dos arquivos', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ arquivos: undefined }) }), regras: [4] },
  { nome: 'arquivo da lista que não existe', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ arquivos: ['index.html', 'fila.js', 'pdfjs/pdf.min.js'] }) }), regras: [4] },
  { nome: 'arquivo da lista fora da pasta do bloco', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ arquivos: ['index.html', 'fila.js', '../../app.js'] }) }), regras: [4] },
  { nome: 'entrada fora da lista dos arquivos', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ entrada: 'hoje.html' }), 'blocos/operacao/hoje.html': '<p>x</p>' }), regras: [4] },
  { nome: 'tela do celular sem o prefixo do cache', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ cache: undefined }) }), regras: [4] },
  { nome: 'prefixo do cache que se confunde com o da casca', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ cache: 'app-compel-casca-op-' }) }), regras: [4] },
  { nome: 'dois blocos com o mesmo prefixo', arquivos: com({
      'blocos/seguranca/bloco.json': declaracao({ nome: 'Segurança', servidor: 'SEGURANCA', envia: undefined }),
      'blocos/seguranca/index.html': '<p>x</p>', 'blocos/seguranca/fila.js': '//' }), regras: [4] },
  { nome: 'dois blocos com a mesma etiqueta de envio', arquivos: com({
      'blocos/seguranca/bloco.json': declaracao({ nome: 'Segurança', servidor: 'SEGURANCA', cache: 'seguranca-' }),
      'blocos/seguranca/index.html': '<p>x</p>', 'blocos/seguranca/fila.js': '//', 'blocos/seguranca/servidor.sha256': RESUMO }), regras: [4] },
  { nome: 'bloco que envia sem o resumo do servidor', arquivos: sem('blocos/operacao/servidor.sha256'), regras: [4] },
  { nome: 'resumo com dois valores (a segunda porta)', arquivos: com({ 'blocos/operacao/servidor.sha256': RESUMO + 'b'.repeat(64) + '\n' }), regras: [4] },
  { nome: 'resumo que não é SHA-256', arquivos: com({ 'blocos/operacao/servidor.sha256': 'abc\n' }), regras: [4] },
  { nome: 'envio sem o app que o servidor espera', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ envia: { etiqueta: 'enviar-diarios', script: 'fila.js' } }) }), regras: [4] },
  { nome: 'arquivo de envio fora da lista', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ envia: { etiqueta: 'enviar-diarios', app: 'campo', script: 'envio.js' } }), 'blocos/operacao/envio.js': '//' }), regras: [4] },
  // O acesso rápido (casca 1.11, 27/10/2026): o atalho precisa do id que a tela recebe, do nome do botão e de quem o vê.
  { nome: 'atalho sem id', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ atalhos: [{ nome: 'Diário', perfis: ['ENCARREGADO'] }] }) }), regras: [4] },
  { nome: 'atalho sem perfis', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ atalhos: [{ id: 'diario', nome: 'Diário' }] }) }), regras: [4] },
  { nome: 'atalho sem nome', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ atalhos: [{ id: 'diario', nome: ' ', perfis: ['*'] }] }) }), regras: [4] },
  { nome: 'dois atalhos com o mesmo id', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ atalhos: [{ id: 'diario', nome: 'Diário', perfis: ['*'] }, { id: 'diario', nome: 'Outro', perfis: ['*'] }] }) }), regras: [4] },
  { nome: 'completo que não é lista', arquivos: com({ 'blocos/operacao/bloco.json': declaracao({ completo: 'ADMIN' }) }), regras: [4] },
  { nome: 'atalho num bloco de sistema', arquivos: com({ 'blocos/dp/bloco.json': JSON.stringify({ nome: 'DP', dono: 'DP', especie: 'sistema', quemVe: ['TODOS'], servidor: 'DP', versao: '1', atalhos: [{ id: 'ferias', nome: 'Férias', perfis: ['*'] }] }) }), regras: [4] },
  { nome: 'bloco de sistema que envia', arquivos: com({ 'blocos/dp/bloco.json': JSON.stringify({ nome: 'DP', dono: 'DP', especie: 'sistema', quemVe: ['TODOS'], servidor: 'DP', versao: '1', envia: { etiqueta: 'enviar-dp', app: 'dp', script: 'x.js' } }) }), regras: [4] }
];

var falhas = 0;
casos.forEach(function (c) {
  var raiz = pasta(c.arquivos);
  var achados = C.conferirArvore(raiz);
  var regras = achados.map(function (a) { return a.regra; }).filter(function (r, i, l) { return l.indexOf(r) === i; }).sort();
  var ok = JSON.stringify(regras) === JSON.stringify(c.regras);
  if (!ok) falhas++;
  console.log((ok ? 'ok    ' : 'FALHOU') + '  ' + c.nome + (ok ? '' : ' — esperava regras [' + c.regras + '], veio [' + regras + ']: ' + JSON.stringify(achados)));
  fs.rmSync(raiz, { recursive: true, force: true });
});

// Números que parecem CPF e não são: a conta dos dígitos tem de deixá-los passar.
[['11111111111', false], ['12345678900', false], [cpf, true]].forEach(function (p) {
  var ok = C.cpfValido(p[0]) === p[1];
  if (!ok) falhas++;
  console.log((ok ? 'ok    ' : 'FALHOU') + '  cpfValido(' + (p[1] ? 'o de mentira' : p[0]) + ') = ' + p[1]);
});

// A regra 5, das áreas.
[
  ['um envio só da casca', ['index.html', 'casca/fila.js', 'README.md'], 0],
  ['um envio só de um bloco', ['blocos/operacao/app.js', 'blocos/operacao/bloco.json'], 0],
  ['a casca e um bloco juntos', ['index.html', 'blocos/operacao/app.js'], 1],
  ['dois blocos juntos', ['blocos/operacao/app.js', 'blocos/seguranca/app.js'], 1]
].forEach(function (p) {
  var n = C.conferirAreas(p[1]).length;
  var ok = n === p[2];
  if (!ok) falhas++;
  console.log((ok ? 'ok    ' : 'FALHOU') + '  áreas: ' + p[0] + (ok ? '' : ' — esperava ' + p[2] + ' achado(s), veio ' + n));
});

// O índice que a publicação monta: lê a mesma declaração, e não sai com bloco errado.
(function () {
  var I = require('./indice.js');
  var raiz = pasta(LIMPA), r = I.montar(raiz);
  var texto = fs.existsSync(path.join(raiz, 'blocos/indice.js')) ? fs.readFileSync(path.join(raiz, 'blocos/indice.js'), 'utf8') : '';
  var op = r.blocos && r.blocos.filter(function (b) { return b.id === 'operacao'; })[0];
  var ok = !r.erro && op && op.envia.script === 'blocos/operacao/fila.js' && op.resumo === 'a'.repeat(64) && op.arquivos[0] === 'blocos/operacao/index.html' &&
    /var BLOCOS_DO_APP = /.test(texto) && !/\d{4}-\d{2}-\d{2}/.test(texto);
  if (!ok) falhas++;
  console.log((ok ? 'ok    ' : 'FALHOU') + '  índice: monta os blocos com os caminhos da raiz, o resumo, e sem data' + (ok ? '' : ' — ' + JSON.stringify(r)));
  fs.rmSync(raiz, { recursive: true, force: true });
  raiz = pasta(sem('blocos/operacao/servidor.sha256')); r = I.montar(raiz);
  ok = !!r.erro && !fs.existsSync(path.join(raiz, 'blocos/indice.js'));
  if (!ok) falhas++;
  console.log((ok ? 'ok    ' : 'FALHOU') + '  índice: com um bloco errado, não monta nada');
  fs.rmSync(raiz, { recursive: true, force: true });
})();

console.log(falhas ? '\n' + falhas + ' caso(s) falharam.' : '\nTodos os casos passaram.');
process.exitCode = falhas ? 1 : 0;
