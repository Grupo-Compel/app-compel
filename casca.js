/* casca.js — o que a casca dá às telas (21/10/2026): à dela e às dos blocos. Só roda na tela (usa `window`); o que
 * roda também no service worker está em servicos.js, que tem de ser carregado antes deste.
 *
 * A TELA DE UM BLOCO carrega, nesta ordem:
 *   <script src="../../config/login.js"></script>
 *   <script src="../../servicos.js"></script>
 *   <script src="../indice.js"></script>
 *   <script src="../../casca.js"></script>
 *   <script src="envio.js"></script>          (só o bloco que envia: o mesmo arquivo do envia.script)
 * e começa por Casca.iniciar('<id do bloco>'). Sem a entrada de hoje, a casca leva a pessoa de volta para entrar.
 *
 * O QUE O BLOCO NÃO RECEBE (FRONTEIRA §5.2): o CPF, o resumo dele, a sessão do aparelho e o verificador da senha. O
 * token do Núcleo é pedido pela casca no toque (Casca.abrirSistema) e vai direto para a janela nova, sem passar pelo
 * bloco (§2.1, regra 2).
 */
'use strict';

var CASCA_ESPERA_DO_LOGIN_MS = 30000;

/* ---------- a conversa com o login do Núcleo ----------
   O único servidor com que a casca fala é o do login, em config/login.js. Nenhuma resposta, link ou configuração troca
   esse endereço (carta nº 8 do Núcleo, 19/10/2026). Texto puro pelo mesmo motivo do cascaPostar (servicos.js). */
function cascaEnderecoDoLogin() { return typeof ENDERECO_DO_LOGIN === 'string' ? ENDERECO_DO_LOGIN : ''; }
function cascaPostarAoLogin(corpo) {
  var url = cascaEnderecoDoLogin();
  if (!url) return Promise.reject({ semEndereco: true });
  /* O `versao` do envelope é a versão do app (carta nº 12 do App), mas o `aceitarTermo` do login usa o mesmo nome
     para a versão do TERMO (carta nº 14 do Núcleo). A versão do termo é a que decide o aceite, então ela fica, e a do
     app vai também em `versaoApp`. Achado pela bateria em 22/10/2026 (T28): o aceite saía com a versão do app no
     lugar da do termo, e o login respondia "termo desconhecido". */
  corpo.app = 'casca'; if (corpo.versao === undefined) corpo.versao = VERSAO_APP; corpo.versaoApp = VERSAO_APP;
  var controle = new AbortController(), relogio = setTimeout(function () { controle.abort(); }, CASCA_ESPERA_DO_LOGIN_MS);
  return fetch(url, { method: 'POST', body: JSON.stringify(corpo), redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: controle.signal })
    .then(function (r) { return r.text(); })
    .then(function (texto) {
      clearTimeout(relogio);
      var r;
      try { r = JSON.parse(texto); } catch (e) { throw { semResposta: true, msg: 'O login respondeu fora do combinado.' }; }
      // A CENTRAL fora do ar com o projeto do login no ar: a resposta chega inteira e diz que não respondeu (carta nº 9).
      if (r && r.respondeu === false) throw { semResposta: true, msg: r.erro || 'O cadastro está fora do ar agora.' };
      return r;
    }, function () { clearTimeout(relogio); throw { semResposta: true, rede: true }; });
}

/* Abrir uma tela do sistema já com a pessoa entrada. A janela abre no toque, antes de qualquer espera (senão o
   navegador a bloqueia): quem chama abre com cascaAbrirJanela() no próprio toque e passa a janela; o endereço entra
   quando o token chegar. Devolve uma promessa com { ok } ou { erro }. */
function cascaAbrirJanela() {
  var janela = window.open('', '_blank');
  if (janela) { try { janela.opener = null; janela.document.title = 'Abrindo…'; } catch (e) { } }
  return janela;
}
function cascaAbrirComToken(pessoaGuardada, modulo, url, janela) {
  var fechar = function (r) { if (janela) janela.close(); return r; };
  if (!url || !/^https:\/\/\S+$/.test(url)) return Promise.resolve(fechar({ erro: 'O endereço deste sistema está com defeito na planilha. Avise a administração.' }));
  if (navigator.onLine === false) return Promise.resolve(fechar({ erro: 'Sem sinal: as telas do sistema só abrem com sinal.' }));
  return cascaPostarAoLogin({ acao: 'token', sessao: pessoaGuardada.sessao, modulo: modulo }).then(function (r) {
    var termo = cascaTermoPendente(r);
    if (termo) return fechar({ termo: termo });
    if (r && r.pedirCpf) return fechar({ pedirCpf: true, erro: r.erro || 'Entre de novo com o seu CPF.' });
    if (r && r.entrarDeNovo) return fechar({ entrarDeNovo: true, erro: r.erro || 'Sua senha mudou. Entre de novo com a senha nova.' });
    /* O `precisaTrocar` (cartas nº 30 à Interface e nº 16 ao App, do Núcleo, 22/10/2026): no app ele só chega quando
       a administração marca TROCAR_SENHA = SIM na CENTRAL sem trocar a senha (o reset vem como `entrarDeNovo`). Sem
       tratar, a pessoa lia o aviso e ficava no Início, sem caminho para a troca: a troca só começa numa entrada. */
    if (r && r.precisaTrocar) return fechar({ precisaTrocar: true, erro: r.erro || '' });
    if (!r || r.ok !== true || !r.token) return fechar({ erro: (r && r.erro) || 'O login não liberou a abertura.' });
    var destino = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(r.token);
    if (janela) janela.location.href = destino; else location.href = destino;
    return { ok: true };
  }, function () { return fechar({ erro: 'Não consegui falar com o login. Tente com sinal melhor.' }); });
}

/* O TERMO PENDENTE (carta nº 14 do Núcleo, 22/10/2026). O token não sai enquanto a pessoa não aceitar o termo ativo,
   e para quem é de campo e não abre o Portal a ação `aceitarTermo` do app é o único caminho. A forma é a mesma do
   `api_abrir` do Portal (CODIGO_GS_DO_PORTAL_21-10): { ok:false, precisaAceitarTermo:true, id, versao, titulo,
   texto, link, quantos }. A casca aceita também o termo dentro de um objeto, para não depender de qual das duas formas o
   login escolheu; `id` e `versao` são o que volta no aceite, e sem eles nada é mostrado. */
function cascaTermoPendente(r) {
  if (!r || !r.precisaAceitarTermo) return null;
  var t = typeof r.precisaAceitarTermo === 'object' ? r.precisaAceitarTermo : r.termo && typeof r.termo === 'object' ? r.termo : r;
  if (!t.id || t.versao === undefined || t.versao === null || t.versao === '') return null;
  /* O `quantos` (carta nº 15 do Núcleo, 22/10/2026): o token traz um termo por vez, e a pessoa precisa saber que
     outro vem depois, senão o segundo parece o primeiro voltando. Número estranho vira 1. */
  var quantos = Math.floor(Number(r.quantos || t.quantos || 1)); if (!(quantos >= 1)) quantos = 1;
  return { id: String(t.id), versao: t.versao, titulo: String(t.titulo || 'Termo para aceitar'), texto: String(t.texto || t.detalhe || ''),
           link: /^https:\/\/\S+$/.test(String(t.link || '')) ? String(t.link) : '', quantos: quantos };
}

/* Pedir ao Android que acorde o app para enviar quando o sinal voltar. No iPhone isso não existe (não medido; a
   FRONTEIRA §5.5 pede a medida num iPhone), e o envio acontece com o app aberto. */
function cascaPedirSegundoPlano(etiqueta) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(false);
  return navigator.serviceWorker.ready.then(function (reg) { return reg.sync ? reg.sync.register(etiqueta).then(function () { return true; }) : false; }).catch(function () { return false; });
}
function cascaEhIphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

/* ---------- a foto ----------
   A mesma escada do campo/ (app.js da Operação, 5a): reduz o lado e a qualidade até caber no teto, com a marca d'água
   GRAVADA na imagem (o book é impresso, e texto ao lado da foto se perde). A foto fica como arquivo (Blob): como
   texto, ocuparia um terço a mais no celular. */
function cascaCarregarImagem(arquivo) {
  if (self.createImageBitmap) return createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(arquivo); });
  return new Promise(function (ok, falha) { var img = new Image(); img.onload = function () { ok(img); }; img.onerror = falha; img.src = URL.createObjectURL(arquivo); });
}
function cascaMarcaDagua(ctx, w, h, linhas) {
  if (!linhas || !linhas.length) return;
  var fonte = Math.max(13, Math.round(w / 42)), alto = Math.round(fonte * 1.35 * linhas.length + fonte * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, h - alto, w, alto);
  ctx.fillStyle = '#fff'; ctx.font = '600 ' + fonte + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
  linhas.forEach(function (t, i) { ctx.fillText(t, Math.round(fonte * 0.6), h - alto + Math.round(fonte * 0.4) + i * Math.round(fonte * 1.35)); });
}
function cascaReduzirFoto(arquivo, lados, teto, linhas) {
  return cascaCarregarImagem(arquivo).then(function (img) {
    var w0 = img.width, h0 = img.height, tentativas = [];
    lados.forEach(function (lado) { [0.72, 0.6, 0.5, 0.4].forEach(function (q) { tentativas.push([lado, q]); }); });
    var i = 0;
    function tenta() {
      var lado = tentativas[i][0], q = tentativas[i][1], f = Math.min(1, lado / Math.max(w0, h0));
      var c = document.createElement('canvas');
      c.width = Math.round(w0 * f); c.height = Math.round(h0 * f);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      cascaMarcaDagua(ctx, c.width, c.height, linhas);
      return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', q); }).then(function (b) {
        i++;
        if (b.size <= teto || i >= tentativas.length) return { blob: b, largura: c.width, altura: c.height };
        return tenta();
      });
    }
    return tenta().then(function (r) { if (img.close) img.close(); return r; });
  });
}
/* A posição na hora da foto, ou nada em 8 segundos (sem sinal o GPS funciona, mas pode demorar; campo/, 5c). */
function cascaLerPosicao() {
  return new Promise(function (ok) {
    if (!navigator.geolocation) return ok(null);
    var feito = false, fim = function (v) { if (!feito) { feito = true; ok(v); } };
    setTimeout(function () { fim(null); }, 8000);
    try {
      navigator.geolocation.getCurrentPosition(function (p) { fim({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: Math.round(p.coords.accuracy || 0) }); },
        function () { fim(null); }, { enableHighAccuracy: true, timeout: 7500, maximumAge: 60000 });
    } catch (e) { fim(null); }
  });
}

/* ---------- a ajuda ----------
   Toda tela tem a ajuda dela (a regra da conferência, FRONTEIRA §4), com o mesmo jeito das telas da casca: o link
   "Como funciona esta tela" e o texto num aviso informativo. */
function cascaAjuda(elemento, texto) {
  var aberto = false;
  function desenha() {
    elemento.innerHTML = '<button type="button" class="link-texto" data-casca-ajuda="1">' + (aberto ? 'Fechar a ajuda' : 'Como funciona esta tela') + '</button>' +
      (aberto ? '<div class="aviso info" data-casca-texto-ajuda="1"></div>' : '');
    if (aberto) elemento.querySelector('[data-casca-texto-ajuda]').textContent = texto;
  }
  elemento.addEventListener('click', function (ev) { if (ev.target.closest('[data-casca-ajuda]')) { aberto = !aberto; desenha(); } });
  desenha();
}

/* ---------- o objeto que a tela do bloco usa ---------- */
var Casca = (function () {
  var estado = { id: '', bloco: null, guardada: null, pessoa: null };
  function raiz() { var p = location.pathname, i = p.indexOf('/blocos/'); return i >= 0 ? p.slice(0, i + 1) : './'; }
  function exigir() { if (!estado.pessoa) throw new Error('Casca.iniciar ainda não terminou'); }
  return {
    versao: VERSAO_APP,
    /* Confere a entrada de hoje e devolve { pessoa, bloco }. Sem ela, volta para a entrada da casca, e a promessa não
       se resolve (a tela do bloco não chega a desenhar nada). */
    iniciar: function (id) {
      estado.id = id; estado.bloco = cascaBloco(id);
      return cascaPessoaDoDia().then(function (p) {
        if (!p || !estado.bloco) { location.replace(raiz()); return new Promise(function () { }); }
        estado.guardada = p; estado.pessoa = cascaPessoaParaBloco(p);
        // A tela do bloco é onde a equipe passa o dia: o sinal que volta com ela aberta manda o que espera, sem depender
        // do Android acordar o app (no iPhone, ele não acorda).
        if (estado.bloco.envia) window.addEventListener('online', function () { cascaEnviar(id, 'o sinal voltou'); });
        return { pessoa: JSON.parse(JSON.stringify(estado.pessoa)), bloco: { id: estado.bloco.id, nome: estado.bloco.nome, versao: estado.bloco.versao } };
      });
    },
    pessoa: function () { exigir(); return JSON.parse(JSON.stringify(estado.pessoa)); },
    sinal: function () { return navigator.onLine !== false; },
    aoMudarOSinal: function (fn) { window.addEventListener('online', function () { fn(true); }); window.addEventListener('offline', function () { fn(false); }); },
    voltar: function () { location.href = raiz(); },
    /* O banco do bloco, com os ajudantes da casca. O nome é do bloco; a casca nunca o apaga. */
    banco: function (nome, versao, lojas) { return cascaBanco(nome, versao, lojas); },
    /* Quem fez e em nome de quem (D20). Sem `emNomeDe`, é a própria pessoa. */
    carimbo: function (emNomeDe) { exigir(); return cascaCarimbo(estado.pessoa, emNomeDe); },
    /* "Guarde e mande quando der": o bloco já gravou o registro no banco dele; a casca pede ao Android que acorde o app
       e, com sinal, tenta agora. Devolve o resumo do envio (ou { esperando: true }, sem sinal). */
    pedirEnvio: function () {
      var b = estado.bloco;
      if (!b || !b.envia) return Promise.resolve({ erro: 'Este bloco não envia.' });
      cascaPedirSegundoPlano(b.envia.etiqueta);
      if (navigator.onLine === false) return Promise.resolve({ esperando: true });
      return cascaEnviar(b.id, 'na hora');
    },
    guardarSessao: function (matricula, sessao, validaAte) { return cascaGuardarSessaoDoBloco(estado.id, matricula, sessao, validaAte); },
    /* A foto de um arquivo que a pessoa acabou de tirar (o <input type="file" capture> é do bloco: o navegador só abre
       a câmera num toque). Devolve { blob, largura, altura, meta: { lat, lon, precisao, tiradaEm } }. */
    foto: function (arquivo, opcoes) {
      var o = opcoes || {}, tiradaEm = new Date().toISOString();
      return Promise.all([cascaReduzirFoto(arquivo, o.lados || [1600, 1280], o.teto || 200 * 1024, o.linhas || []), o.semGps ? null : cascaLerPosicao()]).then(function (v) {
        var r = v[0], pos = v[1] || {};
        r.meta = { lat: pos.lat, lon: pos.lon, precisao: pos.precisao, tiradaEm: tiradaEm };
        return r;
      });
    },
    ajuda: function (elemento, texto) { cascaAjuda(elemento, texto); },
    /* Uma tela do sistema deste bloco (espécie ambas), com a pessoa já entrada. Chamar no toque. */
    abrirSistema: function () {
      exigir();
      if (navigator.onLine === false) return Promise.resolve({ erro: 'Sem sinal: as telas do sistema só abrem com sinal.' });
      var janela = cascaAbrirJanela();
      return cascaLer('enderecos').then(function (e) {
        var url = String(e && e[estado.bloco.servidor] || '').trim();
        if (!url) { if (janela) janela.close(); return { erro: 'O endereço do sistema ainda não chegou a este celular. Entre no app com sinal uma vez.' }; }
        // O termo e a sessão cortada se resolvem na casca, e não na tela do bloco: o bloco recebe só o recado.
        return cascaAbrirComToken(estado.guardada, estado.bloco.servidor, url, janela).then(function (r) {
          if (r.termo) return { erro: 'Há um termo da Compel para aceitar. Volte ao Início e toque no sistema por lá.' };
          return r;
        });
      });
    }
  };
})();
