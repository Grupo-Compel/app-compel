/* sw.js — a casca do App Compel (21/10/2026). O pedaço que o celular guarda: serve o app sem sinal e envia em
   segundo plano, pela casca e por todos os blocos. É o único service worker do app (FRONTEIRA §5.5, cuidado 1).

   PRIMEIRO O QUE ESTÁ GUARDADO: em campo, esperar a rede para depois cair no guardado deixa a tela branca até o tempo
   esgotar (aprendido no app do campo da Operação, 07/10/2026). Versão nova entra quando um arquivo deste service
   worker muda (este, o servicos.js, o índice dos blocos ou o envio de um bloco), e o app avisa no alto da tela.

   NENHUM POST PASSA PELO GUARDADO: só GET do próprio site é servido daqui. O login e os envios são POST, e uma
   resposta guardada seria uma entrada que o Núcleo não viu, ou um "enviado" que não chegou.

   OS BLOCOS: cada um diz no bloco.json os arquivos, o prefixo do cache, a etiqueta e o arquivo de envio, e a
   publicação junta tudo em blocos/indice.js. A casca guarda cada bloco no cache dele (prefixo + versão do bloco) e
   apaga só as versões velhas com o prefixo DAQUELE bloco, e só depois de a versão nova estar inteira guardada. Cache
   com prefixo que nenhum bloco declara não é tocado: pode ser de um bloco que saiu, com coisa ainda por enviar
   (§5.5, cuidado 2). O banco de um bloco a casca nunca abre para apagar. */
'use strict';
importScripts('servicos.js');

/* Um bloco quebrado não pode derrubar o app inteiro: se o índice ou o envio de um bloco não carregar, a casca
   continua, e o bloco fica marcado. A tela de envio diz isso, em vez de o app parar de abrir sem sinal. */
var PROBLEMAS = [];
try { importScripts('blocos/indice.js'); } catch (e) { PROBLEMAS.push('o índice dos blocos não carregou: ' + (e && e.message)); }
var BLOCOS = cascaBlocos();
BLOCOS.forEach(function (b) {
  if (!b.envia) return;
  try { importScripts(b.envia.script); } catch (e) { b.quebrado = 'o envio não carregou: ' + (e && e.message); PROBLEMAS.push(b.id + ': ' + b.quebrado); }
});

var VERSAO_CASCA = 'app-compel-casca-1.3';
var CACHE_DA_CASCA = VERSAO_CASCA + '-' + (typeof VERSAO_DOS_BLOCOS === 'string' ? VERSAO_DOS_BLOCOS : 'sem-blocos');
var ARQUIVOS = ['./', './index.html', './app.js', './servicos.js', './casca.js', './config/login.js', './manifest.webmanifest', './icone-192.png', './icone-512.png',
  './estilo/fontes.css', './estilo/nucleo.css',
  './estilo/fontes/barlow-condensed-latin-500-normal.woff2',
  './estilo/fontes/barlow-condensed-latin-600-normal.woff2',
  './estilo/fontes/barlow-condensed-latin-700-normal.woff2',
  './estilo/fontes/inter-latin-400-normal.woff2',
  './estilo/fontes/inter-latin-500-normal.woff2',
  './estilo/fontes/inter-latin-600-normal.woff2',
  './estilo/fontes/inter-latin-700-normal.woff2',
  './estilo/fontes/josefin-sans-latin-400-normal.woff2',
  './estilo/fontes/josefin-sans-latin-600-normal.woff2',
  './estilo/fontes/josefin-sans-latin-700-normal.woff2'];

function cacheDoBloco(b) { return b.cache + b.versao; }
/* 'reload': a cópia nova vem do servidor, e não do cache do navegador. O GitHub Pages manda guardar por 10 minutos, e
   sem isto um celular podia instalar a versão nova com um arquivo da velha. */
function buscarNovo(url) { return new Request(url, { cache: 'reload' }); }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_DA_CASCA).then(function (c) {
    return c.addAll(ARQUIVOS.map(buscarNovo)).then(function () {
      // O índice pode faltar (uma cópia do repositório aberta à mão, sem a montagem): a casca abre sem blocos.
      return c.add(buscarNovo('./blocos/indice.js')).catch(function () { });
    });
  }).then(function () {
    return Promise.all(BLOCOS.filter(function (b) { return b.arquivos && b.arquivos.length && b.cache; }).map(function (b) {
      return caches.open(cacheDoBloco(b)).then(function (c) { return c.addAll(b.arquivos.map(buscarNovo)); })
        .catch(function (err) { PROBLEMAS.push(b.id + ': os arquivos não ficaram guardados (' + (err && err.message) + ')'); });
    }));
  }).then(function () { return cascaGravar('instalacao', { quando: new Date().toISOString(), versao: CACHE_DA_CASCA, problemas: PROBLEMAS }).catch(function () { }); })
    .then(function () { return self.skipWaiting(); }));
});

/* A versão de um bloco só está guardada se todos os arquivos dele estão no cache: antes disso, a velha fica. */
function blocoInteiro(b) {
  // caches.has antes do open: o open criaria um cache vazio com o nome da versão nova.
  return caches.has(cacheDoBloco(b)).then(function (tem) {
    if (!tem) return false;
    return caches.open(cacheDoBloco(b)).then(function (c) { return c.keys(); }).then(function (k) { return k.length >= b.arquivos.length; });
  });
}

self.addEventListener('activate', function (e) {
  e.waitUntil(Promise.all([caches.keys()].concat(BLOCOS.filter(function (b) { return b.cache; }).map(function (b) { return blocoInteiro(b).then(function (ok) { return ok ? b : null; }); })))
    .then(function (v) {
      var nomes = v[0], inteiros = v.slice(1).filter(Boolean);
      return Promise.all(nomes.filter(function (n) {
        if (/^app-compel-casca-/.test(n)) return n !== CACHE_DA_CASCA;
        return inteiros.some(function (b) { return n.indexOf(b.cache) === 0 && n !== cacheDoBloco(b); });
      }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); }));
});

function blocoDoCaminho(caminho) {
  var m = /\/blocos\/([^\/]+)\//.exec(caminho);
  return m ? BLOCOS.filter(function (b) { return b.id === m[1] && b.cache; })[0] || null : null;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var b = blocoDoCaminho(url.pathname), nome = b ? cacheDoBloco(b) : CACHE_DA_CASCA;
  // match com cacheName, e não caches.open: o open criaria vazio o cache de uma versão que não chegou a ser guardada.
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: nome }).then(function (guardado) {
    if (guardado) return guardado;
    return fetch(req).catch(function () {
      // A versão nova de um bloco ainda não guardada inteira: a velha, que ficou, serve sem sinal.
      return caches.match(req, { ignoreSearch: true }).then(function (velho) {
        if (velho) return velho;
        if (req.mode === 'navigate') return caches.open(CACHE_DA_CASCA).then(function (c) { return c.match('./index.html'); });
        throw new Error('sem sinal e sem cópia guardada: ' + req.url);
      });
    });
  }));
});

/* ENVIO EM SEGUNDO PLANO (Android/Chrome): acordado, o app espera e tenta de novo dentro da mesma vez, porque a rede
   que acabou de voltar ainda não está de pé (07/10/2026, 16:14 e 20:38: 5, 15, 30 e 60 s). Se o Chrome cortar
   antes, nada se perde: o registro continua na fila do bloco. */
var ESPERAS_SEM_REDE = [5000, 15000, 30000, 60000];
function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
function enviarComPaciencia(id, tentativa) {
  return cascaEnviar(id, 'segundo plano').then(function (r) {
    if (r && (r.semRede || r.servidorFora) && tentativa < ESPERAS_SEM_REDE.length)
      return esperar(ESPERAS_SEM_REDE[tentativa]).then(function () { return enviarComPaciencia(id, tentativa + 1); });
    if (r) r.tentativa = tentativa + 1;
    return r;
  });
}
function textoDaAcordada(r) {
  var vez = r && r.tentativa > 1 ? ' (na ' + r.tentativa + 'ª tentativa)' : '';
  if (r && r.ocupado) return 'o app aberto já estava enviando';
  if (r && r.erro) return 'parou: ' + r.erro + vez;
  return (r ? +r.enviados || 0 : 0) + ' enviado(s)' + vez;
}

self.addEventListener('sync', function (e) {
  var b = BLOCOS.filter(function (x) { return x.envia && x.envia.etiqueta === e.tag; })[0];
  if (!b) return;
  e.waitUntil(enviarComPaciencia(b.id, 0).then(function (r) {
    return cascaAnotarAcordada(b.id, textoDaAcordada(r)).then(avisarAsTelas).then(function () {
      // Sem rede: o erro devolve a vez ao navegador, que tenta de novo mais tarde. Endereço mudado não: tentar de
      // novo não conserta, e é a administração quem conserta.
      if (r && (r.semRede || r.servidorFora)) throw new Error('sem rede: o navegador tenta de novo');
    });
  }, function (erro) {
    return cascaAnotarAcordada(b.id, 'falhou: ' + (erro && erro.message)).then(function () { throw erro; });
  }));
});

/* A tela aberta relê a fila quando o segundo plano mexeu nela. */
function avisarAsTelas() {
  return self.clients.matchAll({ type: 'window' }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ fila: true }); }); }).catch(function () { });
}
