#!/usr/bin/env node
/*
 * A MONTAGEM DO ÍNDICE DOS BLOCOS (21/10/2026)
 *
 * Por que existe: o service worker da casca é um só para o app inteiro (FRONTEIRA §5.5, cuidado 1), e ele precisa
 * saber, de cada bloco, os arquivos que o celular guarda, o prefixo do cache, a etiqueta do envio e o arquivo com as
 * funções de envio. Se essa lista morasse no repositório, cada bloco novo teria de mexer num arquivo da casca, e a
 * regra 5 da conferência (uma área por envio) recusaria. Então a lista é montada na publicação, a partir dos
 * `bloco.json`, e nunca é escrita à mão: `blocos/indice.js` está no .gitignore.
 *
 * A leitura dos `bloco.json` é a mesma da conferência (lerBlocos, em conferir.js). Bloco com declaração errada não
 * entra no índice, e a montagem para com erro: a publicação não sai com um bloco pela metade.
 *
 * O arquivo não leva data nem hora de propósito: o service worker do celular se atualiza quando um arquivo dele muda
 * de conteúdo, e uma data mudaria o arquivo a cada publicação, mesmo sem bloco novo.
 *
 * Uso:
 *   node conferencia/indice.js                monta blocos/indice.js deste repositório
 *   node conferencia/indice.js --raiz <pasta> monta o de outra pasta (é o que a bateria usa)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var C = require('./conferir.js');

function montar(raiz) {
  var r = C.lerBlocos(raiz);
  if (r.achados.length) return { erro: r.achados };
  var lista = JSON.stringify(r.blocos, null, 2);
  // A versão dos blocos entra no nome do cache da casca: quando um bloco muda, o celular guarda o índice novo.
  var versao = crypto.createHash('sha256').update(lista).digest('hex').slice(0, 12);
  var texto = '/* blocos/indice.js — montado na publicação por conferencia/indice.js, a partir dos bloco.json.\n' +
    '   Não se edita: quem muda um bloco muda o bloco.json dele. */\n' +
    'var VERSAO_DOS_BLOCOS = ' + JSON.stringify(versao) + ';\n' +
    'var BLOCOS_DO_APP = ' + lista + ';\n';
  fs.mkdirSync(path.join(raiz, 'blocos'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'blocos', 'indice.js'), texto);
  return { blocos: r.blocos, versao: versao };
}

module.exports = { montar: montar };

if (require.main === module) {
  var argv = process.argv.slice(2), raiz = process.cwd();
  for (var i = 0; i < argv.length; i++) if (argv[i] === '--raiz') raiz = path.resolve(argv[++i]);
  var r = montar(raiz);
  if (r.erro) {
    console.log('O índice dos blocos não foi montado: ' + r.erro.length + ' achado(s) nas declarações.');
    r.erro.forEach(function (a) { console.log('  [regra ' + a.regra + '] ' + a.arquivo + ' — ' + a.msg); });
    process.exitCode = 1;
  } else {
    console.log('Índice dos blocos montado: ' + r.blocos.length + ' bloco(s)' + (r.blocos.length ? ' (' + r.blocos.map(function (b) { return b.id; }).join(', ') + ')' : '') + ', versão ' + r.versao + '.');
  }
}
