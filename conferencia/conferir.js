#!/usr/bin/env node
/*
 * A CONFERÊNCIA DO REPOSITÓRIO DO APP COMPEL (20/10/2026)
 *
 * Por que existe: várias frentes publicam neste repositório, e ele é público. A pergunta da casa é "quem tem de lembrar
 * de quê?", e a resposta aqui é ninguém: esta bateria roda antes de toda publicação (o workflow `publicar.yml` só
 * publica se ela passar) e recusa o que nenhuma frente pode mandar (FRONTEIRA_APP_COMPEL, §4).
 *
 * O que ela recusa hoje:
 *   1. código do Apps Script (.gs, appsscript.json, .clasp.json). O servidor de cada módulo mora no projeto dele, e
 *      nunca aqui;
 *   2. endereço de servidor (Apps Script, planilha, documento, formulário, pasta do Drive). A única exceção é o
 *      endereço do login do Núcleo, num lugar só (`config/login.js`), por decisão do Dalton em 20/10/2026: o endereço
 *      do login não é segredo, porque vai estar em todo celular, e nenhum caminho em uso pode trocá-lo;
 *   3. CPF: onze algarismos com os dígitos verificadores certos, com ou sem pontuação;
 *   4. bloco sem a declaração (`blocos/<bloco>/bloco.json`, FRONTEIRA §5.1), ou com o servidor escrito como endereço;
 *   5. um envio que mexe em mais de uma área (a raiz, que é da casca, ou um bloco). Cada frente edita só a pasta dela.
 *
 * O que ainda não confere, e entra quando houver tela: tela sem ajuda, e tela que passa da largura do celular (360 e
 * 412 px, no Chromium).
 *
 * Uso:
 *   node conferencia/conferir.js                  confere a árvore inteira (regras 1 a 4)
 *   node conferencia/conferir.js --desde <ref>    também a regra 5, com os arquivos mudados desde <ref>
 *   node conferencia/conferir.js --raiz <pasta>   confere outra pasta (é o que o teste usa)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

// Só se lê texto. Imagem e PDF não carregam CPF digitado nem endereço, e lê-los como texto daria achado falso.
var EXTENSOES_DE_TEXTO = ['.js', '.mjs', '.json', '.html', '.htm', '.css', '.md', '.txt', '.webmanifest', '.yml',
  '.yaml', '.svg', '.csv', '.xml'];
var PASTAS_IGNORADAS = ['.git', 'node_modules'];
var ARQUIVOS_DO_APPS_SCRIPT = /(\.gs$|^appsscript\.json$|^\.clasp\.json$)/i;
var LUGAR_DO_ENDERECO_DO_LOGIN = 'config/login.js';
var ESPECIES_DE_BLOCO = ['celular', 'sistema', 'ambas'];

// Os endereços que dizem onde mora um dado ou um servidor da Compel. O do Apps Script fica separado porque é o único
// que tem exceção.
var ENDERECO_APPS_SCRIPT = /script\.google\.com\/(?:a\/[^\/\s]+\/)?macros\/s\/[A-Za-z0-9_-]{10,}/g;
var ENDERECOS_DE_DADO = [
  /docs\.google\.com\/(?:spreadsheets|document|forms|presentation)\/d\/[A-Za-z0-9_-]{10,}/g,
  /drive\.google\.com\/(?:file\/d\/|drive\/(?:u\/\d+\/)?folders\/|open\?id=)[A-Za-z0-9_-]{10,}/g,
  /script\.google\.com\/(?:home\/)?projects\/[A-Za-z0-9_-]{10,}/g
];

// Onze algarismos, com ou sem a pontuação 000.000.000-00, sem outro algarismo colado antes ou depois.
var FORMA_DE_CPF = /(?<![\d.\-\/])(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})(?![\d\-\/]|\.\d)/g;

function cpfValido(onze) {
  // Onze algarismos iguais passam na conta dos dígitos e não são CPF de ninguém: aparecem como número de teste.
  if (/^(\d)\1{10}$/.test(onze)) return false;
  var d = onze.split('').map(Number);
  for (var t = 9; t <= 10; t++) {
    var soma = 0;
    for (var i = 0; i < t; i++) soma += d[i] * (t + 1 - i);
    var dv = (soma * 10) % 11 % 10;
    if (dv !== d[t]) return false;
  }
  return true;
}

function listarArquivos(raiz) {
  var saida = [];
  (function andar(rel) {
    fs.readdirSync(path.join(raiz, rel), { withFileTypes: true }).forEach(function (e) {
      if (PASTAS_IGNORADAS.indexOf(e.name) >= 0) return;
      var r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) andar(r); else saida.push(r);
    });
  })('');
  return saida.sort();
}

function linhaDe(texto, posicao) { return texto.slice(0, posicao).split('\n').length; }

function conferirArvore(raiz) {
  var achados = [];
  var anotar = function (arquivo, regra, msg) { achados.push({ arquivo: arquivo, regra: regra, msg: msg }); };
  var arquivos = listarArquivos(raiz);

  arquivos.forEach(function (rel) {
    if (ARQUIVOS_DO_APPS_SCRIPT.test(path.basename(rel))) {
      anotar(rel, 1, 'código do Apps Script não entra no repositório do app: ele mora no projeto do módulo');
    }
    if (EXTENSOES_DE_TEXTO.indexOf(path.extname(rel).toLowerCase()) < 0) return;
    var texto = fs.readFileSync(path.join(raiz, rel), 'utf8');

    var m, enderecosDoLogin = 0;
    ENDERECO_APPS_SCRIPT.lastIndex = 0;
    while ((m = ENDERECO_APPS_SCRIPT.exec(texto))) {
      if (rel === LUGAR_DO_ENDERECO_DO_LOGIN) { enderecosDoLogin++; continue; }
      anotar(rel, 2, 'linha ' + linhaDe(texto, m.index) + ': endereço de servidor. O único permitido é o do login, em ' +
        LUGAR_DO_ENDERECO_DO_LOGIN + '; o servidor de um bloco vem do Núcleo, na entrada');
    }
    if (enderecosDoLogin > 1) anotar(rel, 2, 'há ' + enderecosDoLogin + ' endereços aqui, e o login tem um só');
    ENDERECOS_DE_DADO.forEach(function (re) {
      re.lastIndex = 0;
      while ((m = re.exec(texto))) anotar(rel, 2, 'linha ' + linhaDe(texto, m.index) + ': endereço de planilha, documento ou pasta da Compel');
    });

    FORMA_DE_CPF.lastIndex = 0;
    while ((m = FORMA_DE_CPF.exec(texto))) {
      if (cpfValido(m[1] + m[2] + m[3] + m[4])) anotar(rel, 3, 'linha ' + linhaDe(texto, m.index) + ': um CPF (os dígitos verificadores conferem). Nada de CPF no repositório');
    }
  });

  // Regra 4: cada pasta de bloco declara quem é. Sem a declaração, a casca não sabe mostrar o bloco nem a quem.
  var pastaBlocos = path.join(raiz, 'blocos');
  if (fs.existsSync(pastaBlocos)) {
    fs.readdirSync(pastaBlocos, { withFileTypes: true }).filter(function (e) { return e.isDirectory(); }).forEach(function (e) {
      var rel = 'blocos/' + e.name + '/bloco.json';
      var arq = path.join(raiz, rel);
      if (!fs.existsSync(arq)) return anotar(rel, 4, 'o bloco "' + e.name + '" não tem a declaração (FRONTEIRA §5.1)');
      var d;
      try { d = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (err) { return anotar(rel, 4, 'a declaração não é JSON válido: ' + err.message); }
      ['nome', 'dono', 'especie', 'quemVe', 'servidor'].forEach(function (c) {
        if (d[c] === undefined || d[c] === '' || (Array.isArray(d[c]) && !d[c].length)) anotar(rel, 4, 'falta o campo "' + c + '"');
      });
      if (d.especie && ESPECIES_DE_BLOCO.indexOf(d.especie) < 0) anotar(rel, 4, 'a espécie tem de ser ' + ESPECIES_DE_BLOCO.join(', ') + ' (veio "' + d.especie + '")');
      if (d.quemVe !== undefined && !Array.isArray(d.quemVe)) anotar(rel, 4, '"quemVe" é uma lista de perfis ou funções');
      if (typeof d.servidor === 'string' && /[:\/]/.test(d.servidor)) anotar(rel, 4, 'o servidor vai pelo nome do módulo na MODULOS, nunca pelo endereço');
    });
  }
  return achados;
}

// A área de um arquivo: um bloco ("blocos/operacao") ou a casca (todo o resto).
function areaDe(rel) {
  var m = /^blocos\/([^\/]+)\//.exec(rel);
  return m ? 'blocos/' + m[1] : 'casca (a raiz)';
}

function conferirAreas(mudados) {
  var areas = {};
  mudados.forEach(function (rel) { (areas[areaDe(rel)] = areas[areaDe(rel)] || []).push(rel); });
  var nomes = Object.keys(areas);
  if (nomes.length <= 1) return [];
  return [{ arquivo: '(o envio)', regra: 5, msg: 'este envio mexe em ' + nomes.length + ' áreas (' + nomes.join('; ') +
    '). Cada frente edita só a pasta dela, e o que atravessa vai por carta' }];
}

function arquivosMudadosDesde(raiz, ref) {
  var out = childProcess.execFileSync('git', ['-C', raiz, 'diff', '--name-only', ref, 'HEAD'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function principal(argv) {
  var raiz = process.cwd(), desde = null;
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--raiz') raiz = path.resolve(argv[++i]);
    else if (argv[i] === '--desde') desde = argv[++i];
  }
  var achados = conferirArvore(raiz);
  if (desde) achados = achados.concat(conferirAreas(arquivosMudadosDesde(raiz, desde)));
  if (!achados.length) {
    console.log('Conferência do repositório: nada a recusar (' + listarArquivos(raiz).length + ' arquivos).');
    return 0;
  }
  console.log('Conferência do repositório: ' + achados.length + ' achado(s). Nada é publicado até eles saírem.\n');
  achados.forEach(function (a) { console.log('  [regra ' + a.regra + '] ' + a.arquivo + ' — ' + a.msg); });
  return 1;
}

module.exports = { conferirArvore: conferirArvore, conferirAreas: conferirAreas, cpfValido: cpfValido, areaDe: areaDe };
if (require.main === module) process.exitCode = principal(process.argv.slice(2));
