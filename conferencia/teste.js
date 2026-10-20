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
var BLOCO_BOM = JSON.stringify({ nome: 'Operação', dono: 'Operação', especie: 'ambas', quemVe: ['ENCARREGADO', 'CAMPO'], servidor: 'OPERACAO' });

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
  { nome: 'declaração sem o dono', arquivos: com({ 'blocos/operacao/bloco.json': JSON.stringify({ nome: 'Operação', especie: 'ambas', quemVe: ['CAMPO'], servidor: 'OPERACAO' }) }), regras: [4] },
  { nome: 'servidor do bloco como endereço', arquivos: com({ 'blocos/operacao/bloco.json': JSON.stringify({ nome: 'Operação', dono: 'Operação', especie: 'ambas', quemVe: ['CAMPO'], servidor: 'https://exemplo/exec' }) }), regras: [4] },
  { nome: 'espécie inventada', arquivos: com({ 'blocos/operacao/bloco.json': JSON.stringify({ nome: 'Operação', dono: 'Operação', especie: 'web', quemVe: ['CAMPO'], servidor: 'OPERACAO' }) }), regras: [4] }
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

console.log(falhas ? '\n' + falhas + ' caso(s) falharam.' : '\nTodos os casos passaram.');
process.exitCode = falhas ? 1 : 0;
