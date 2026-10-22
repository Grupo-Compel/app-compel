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
 *   4. bloco sem a declaração (`blocos/<bloco>/bloco.json`, FRONTEIRA §5.1), ou com ela incompleta: o servidor escrito
 *      como endereço, a tela do celular sem os arquivos que guarda, o cache que se confunde com outro, o bloco que envia
 *      sem o resumo do endereço do servidor (ver lerBlocos);
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

  // Regra 4: cada pasta de bloco declara quem é (lerBlocos, abaixo, que a montagem do índice também usa).
  lerBlocos(raiz).achados.forEach(function (a) { achados.push(a); });
  return achados;
}

/*
 * A DECLARAÇÃO DE CADA BLOCO (FRONTEIRA §5.1; ampliada em 21/10/2026, com a fila e o service worker da casca, §5.5).
 *
 * Uma função só lê e confere os `bloco.json`, e duas a usam: a conferência (regra 4) e a montagem do índice que a
 * publicação faz (conferencia/indice.js). Se fossem duas leituras, a conferência poderia aceitar o que o índice lê
 * diferente (família 2 do 02_LICOES: a mesma regra escrita em dois lugares).
 *
 * O que se confere, além dos campos de sempre:
 *   - a tela do celular (espécie celular ou ambas) diz a entrada, os arquivos que o celular guarda e o prefixo do cache
 *     dela. Todo arquivo da lista existe e está dentro da pasta do bloco: um arquivo que falta faria o service worker da
 *     casca não guardar o bloco, e o bloco não abriria sem sinal;
 *   - o prefixo do cache é só do bloco. É por ele que a casca sabe quais caches são versões velhas DESTE bloco, e nunca
 *     toca nos outros (§5.5, cuidado 2). Dois blocos com o mesmo prefixo apagariam um ao outro;
 *   - o bloco que envia diz a etiqueta do envio em segundo plano (única no app), o `app` que o servidor dele espera e o
 *     arquivo com as funções de envio; e publica `servidor.sha256`, com o resumo do endereço do servidor dele, numa
 *     linha só (cartas nº 10 e nº 11 do Núcleo; nº 8 do App à Operação: um resumo só, o do servidor de verdade).
 */
var NOME_DO_RESUMO = 'servidor.sha256';
var FORMA_DO_ID = /^[a-z0-9][a-z0-9-]*$/;
var FORMA_DO_PREFIXO = /^[a-z0-9][a-z0-9-]*-$/;
var PREFIXO_DA_CASCA = 'app-compel-casca-';

function caminhoDentroDaPasta(rel) {
  return typeof rel === 'string' && rel !== '' && rel.indexOf('\\') < 0 && rel.charAt(0) !== '/' &&
    rel.split('/').every(function (p) { return p !== '' && p !== '.' && p !== '..'; });
}

function lerBlocos(raiz) {
  var achados = [], blocos = [];
  var anotar = function (arquivo, msg) { achados.push({ arquivo: arquivo, regra: 4, msg: msg }); };
  var pastaBlocos = path.join(raiz, 'blocos');
  if (!fs.existsSync(pastaBlocos)) return { blocos: blocos, achados: achados };
  var prefixos = {}, etiquetas = {};
  fs.readdirSync(pastaBlocos, { withFileTypes: true }).filter(function (e) { return e.isDirectory(); }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (e) {
    var id = e.name, base = 'blocos/' + id + '/', rel = base + 'bloco.json';
    var arq = path.join(raiz, rel), erros = achados.length;
    if (!FORMA_DO_ID.test(id)) anotar(base, 'o nome da pasta vira o nome do bloco no app: só letras minúsculas, algarismos e hífen');
    if (!fs.existsSync(arq)) return anotar(rel, 'o bloco "' + id + '" não tem a declaração (FRONTEIRA §5.1)');
    var d;
    try { d = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (err) { return anotar(rel, 'a declaração não é JSON válido: ' + err.message); }
    ['nome', 'dono', 'especie', 'quemVe', 'servidor', 'versao'].forEach(function (c) {
      if (d[c] === undefined || d[c] === '' || (Array.isArray(d[c]) && !d[c].length)) anotar(rel, 'falta o campo "' + c + '"');
    });
    if (d.especie && ESPECIES_DE_BLOCO.indexOf(d.especie) < 0) anotar(rel, 'a espécie tem de ser ' + ESPECIES_DE_BLOCO.join(', ') + ' (veio "' + d.especie + '")');
    if (d.quemVe !== undefined && !Array.isArray(d.quemVe)) anotar(rel, '"quemVe" é uma lista de perfis ou funções');
    if (typeof d.servidor === 'string' && /[:\/]/.test(d.servidor)) anotar(rel, 'o servidor vai pelo nome do módulo na MODULOS, nunca pelo endereço');
    if (d.versao !== undefined && !/^[A-Za-z0-9._-]{1,40}$/.test(String(d.versao))) anotar(rel, '"versao" entra no nome do cache: só letras, algarismos, ponto, hífen e sublinhado');

    var celular = d.especie === 'celular' || d.especie === 'ambas';
    var arquivos = Array.isArray(d.arquivos) ? d.arquivos : [];
    if (celular) {
      if (!Array.isArray(d.arquivos) || !d.arquivos.length) anotar(rel, 'a tela do celular diz os arquivos que o celular guarda ("arquivos")');
      arquivos.forEach(function (a) {
        if (!caminhoDentroDaPasta(a)) return anotar(rel, '"' + a + '" não é um arquivo dentro da pasta do bloco');
        if (!fs.existsSync(path.join(raiz, base + a))) anotar(rel, 'o arquivo "' + a + '" está na lista e não existe na pasta: o celular não guardaria o bloco');
      });
      if (!d.entrada) anotar(rel, 'a tela do celular diz o arquivo que abre ("entrada")');
      else if (arquivos.indexOf(d.entrada) < 0) anotar(rel, 'a entrada "' + d.entrada + '" tem de estar na lista dos arquivos, para abrir sem sinal');
      if (!d.cache) anotar(rel, 'a tela do celular diz o prefixo do cache dela ("cache"), por exemplo "' + id + '-"');
      else if (!FORMA_DO_PREFIXO.test(d.cache)) anotar(rel, 'o prefixo do cache é de letras minúsculas, algarismos e hífen, e termina em hífen (veio "' + d.cache + '")');
      else if (d.cache.indexOf(PREFIXO_DA_CASCA) === 0 || PREFIXO_DA_CASCA.indexOf(d.cache) === 0) anotar(rel, 'o prefixo "' + d.cache + '" se confunde com o da casca (' + PREFIXO_DA_CASCA + ')');
      else {
        Object.keys(prefixos).forEach(function (outro) {
          if (outro.indexOf(d.cache) === 0 || d.cache.indexOf(outro) === 0) anotar(rel, 'o prefixo "' + d.cache + '" se confunde com o do bloco ' + prefixos[outro] + ' ("' + outro + '"): um apagaria as versões do outro');
        });
        prefixos[d.cache] = id;
      }
    }

    var envia = null;
    if (d.envia !== undefined) {
      var v = d.envia || {};
      if (!celular) anotar(rel, 'só a tela do celular envia pela fila da casca (espécie celular ou ambas)');
      if (!v.etiqueta || !/^[a-z0-9-]+$/.test(v.etiqueta)) anotar(rel, '"envia.etiqueta" é o nome do envio em segundo plano: letras minúsculas, algarismos e hífen');
      else if (etiquetas[v.etiqueta]) anotar(rel, 'a etiqueta "' + v.etiqueta + '" já é do bloco ' + etiquetas[v.etiqueta]);
      else etiquetas[v.etiqueta] = id;
      if (!v.app) anotar(rel, '"envia.app" é o que o servidor do bloco espera no campo app (na Operação, "campo")');
      if (!v.script) anotar(rel, '"envia.script" é o arquivo com as funções de envio do bloco');
      else if (arquivos.indexOf(v.script) < 0) anotar(rel, 'o arquivo de envio "' + v.script + '" tem de estar na lista dos arquivos');
      var rr = base + NOME_DO_RESUMO, linhas = fs.existsSync(path.join(raiz, rr)) ? fs.readFileSync(path.join(raiz, rr), 'utf8').split(/\r?\n/).filter(function (l) { return l.trim(); }) : null;
      if (!linhas) anotar(rr, 'o bloco que envia publica o resumo do endereço do servidor dele (FRONTEIRA §5.1)');
      else if (linhas.length !== 1 || !/^[0-9a-f]{64}$/.test(linhas[0].trim())) anotar(rr, 'o resumo é uma linha só, com os 64 caracteres do SHA-256 em minúsculas: um segundo resumo seria uma segunda porta');
      envia = { etiqueta: v.etiqueta, app: v.app, script: base + v.script, resumo: linhas && linhas[0] ? linhas[0].trim() : '' };
    }
    if (achados.length > erros) return;
    blocos.push({ id: id, nome: d.nome, icone: d.icone || '', servidor: d.servidor, especie: d.especie, quemVe: d.quemVe, versao: String(d.versao),
                  entrada: celular ? base + d.entrada : '', arquivos: celular ? arquivos.map(function (a) { return base + a; }) : [],
                  cache: celular ? d.cache : '', envia: envia ? { etiqueta: envia.etiqueta, app: envia.app, script: envia.script } : null,
                  resumo: envia ? envia.resumo : '' });
  });
  return { blocos: blocos, achados: achados };
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

module.exports = { lerBlocos: lerBlocos, conferirArvore: conferirArvore, conferirAreas: conferirAreas, cpfValido: cpfValido, areaDe: areaDe };
if (require.main === module) process.exitCode = principal(process.argv.slice(2));
