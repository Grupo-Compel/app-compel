/* sw.js — a casca do App Compel (21/10/2026). O pedaço que o celular guarda: serve o app sem sinal.

   PRIMEIRO O QUE ESTÁ GUARDADO: em campo, esperar a rede para depois cair no guardado deixa a tela branca até o tempo
   esgotar (aprendido no app do campo da Operação, 07/10/2026). Versão nova entra quando VERSAO_CACHE muda, e o app
   avisa no alto da tela.

   O LOGIN NUNCA PASSA PELO GUARDADO: só GET do próprio site é servido daqui. O login é POST, para outro endereço, e
   uma resposta guardada seria uma entrada que o Núcleo não viu.

   OS BLOCOS: quando um bloco entrar (blocos/<bloco>/), os arquivos dele entram nesta lista pela casca, a pedido da
   frente dona, por carta (FRONTEIRA §5.5). A casca nunca apaga cache de bloco: só os dela, pelo prefixo. */
var VERSAO_CACHE = 'app-compel-casca-1.1';
var ARQUIVOS = ['./', './index.html', './app.js', './config/login.js', './manifest.webmanifest', './icone-192.png', './icone-512.png',
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

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO_CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return /^app-compel-casca-/.test(n) && n !== VERSAO_CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSAO_CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (guardado) {
    if (guardado) return guardado;
    return fetch(req).catch(function () {
      if (req.mode === 'navigate') return caches.open(VERSAO_CACHE).then(function (c) { return c.match('./index.html'); });
      throw new Error('sem sinal e sem cópia guardada: ' + req.url);
    });
  }));
});
