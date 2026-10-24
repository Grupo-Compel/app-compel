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
 * token do Núcleo é pedido pela casca no toque e vai direto para quem o usa, sem passar pelo bloco (§2.1, regra 1):
 * para a janela nova (Casca.abrirSistema) ou para o servidor do bloco (Casca.sessaoNova). A sessão que o servidor do
 * bloco devolve também fica com a casca, e sobe com cada registro pelo ctx.sessaoDe do envio.
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
/* Pedir o token de passagem de um módulo, no toque. As recusas são as mesmas para quem abre a tela do sistema e para
   quem cria a sessão de um bloco (Casca.sessaoNova): por isso moram numa função só, e não em duas cópias que um dia
   divergiriam. Devolve { ok, token } ou a recusa com a marca dela. O token nunca é guardado (FRONTEIRA §2.1, regra 1). */
function cascaPedirToken(pessoaGuardada, modulo) {
  return cascaPostarAoLogin({ acao: 'token', sessao: pessoaGuardada.sessao, modulo: modulo }).then(function (r) {
    var termo = cascaTermoPendente(r);
    if (termo) return { termo: termo };
    if (r && r.pedirCpf) return { pedirCpf: true, erro: r.erro || 'Entre de novo com o seu CPF.' };
    if (r && r.entrarDeNovo) return { entrarDeNovo: true, erro: r.erro || 'Sua senha mudou. Entre de novo com a senha nova.' };
    /* O `precisaTrocar` (cartas nº 30 à Interface e nº 16 ao App, do Núcleo, 22/10/2026): no app ele só chega quando
       a administração marca TROCAR_SENHA = SIM na CENTRAL sem trocar a senha (o reset vem como `entrarDeNovo`). Sem
       tratar, a pessoa lia o aviso e ficava no Início, sem caminho para a troca: a troca só começa numa entrada. */
    if (r && r.precisaTrocar) return { precisaTrocar: true, erro: r.erro || '' };
    if (!r || r.ok !== true || !r.token) return { erro: (r && r.erro) || 'O login não liberou a abertura.' };
    return { ok: true, token: r.token };
  }, function () { return { erro: 'Não consegui falar com o login. Tente com sinal melhor.' }; });
}
function cascaAbrirComToken(pessoaGuardada, modulo, url, janela) {
  var fechar = function (r) { if (janela) janela.close(); return r; };
  if (!url || !/^https:\/\/\S+$/.test(url)) return Promise.resolve(fechar({ erro: 'O endereço deste sistema está com defeito na planilha. Avise a administração.' }));
  if (navigator.onLine === false) return Promise.resolve(fechar({ erro: 'Sem sinal: as telas do sistema só abrem com sinal.' }));
  return cascaPedirToken(pessoaGuardada, modulo).then(function (t) {
    if (!t.ok) return fechar(t);
    var destino = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(t.token);
    if (janela) janela.location.href = destino; else location.href = destino;
    return { ok: true };
  });
}

/* ---------- o contexto entre blocos (FRONTEIRA §5.4, "uma tela, duas portas") ----------
   Quem abre a tela de outro bloco leva junto o que ela precisa saber (a equipe do dia, a placa), no fragmento do
   endereço: `#de=<bloco>&ctx=<base64url do JSON em UTF-8>`. O fragmento nunca sai do celular — nem no pedido da página
   nem no service worker —, então funciona sem sinal e não aparece em registro de servidor nenhum. A casca confere na
   ida e na volta, porque um link pode ser escrito à mão: nada de CPF, token, sessão ou senha, e no máximo 8.000
   caracteres. O contexto é uma sugestão de quem chamou, e nunca permissão: quem recebe confere no servidor dele
   (cartas nº 1 do Módulo Segurança, nº 1 do PESSOAS e nº 1 da Linha ao App, 23/10/2026). */
var CASCA_TAMANHO_DO_CONTEXTO = 8000;
// "sessao" inteira, e não "sess": "assessor" e "assessoria" são campos que um contexto pode ter.
var CASCA_CHAVE_PROIBIDA = /cpf|token|sessao|sessão|session|senha|verificador/i;
var CASCA_PARECE_CPF = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
function cascaContextoRecusado(dados) {
  var achado = '';
  (function olhar(v, onde) {
    if (achado || v === null || v === undefined) return;
    if (typeof v === 'string') { if (CASCA_PARECE_CPF.test(v.trim())) achado = 'o valor em "' + onde + '" parece um CPF'; return; }
    if (typeof v !== 'object') return;
    Object.keys(v).forEach(function (k) {
      if (!achado && !Array.isArray(v) && CASCA_CHAVE_PROIBIDA.test(k)) achado = 'o campo "' + k + '" não pode ir no contexto';
      olhar(v[k], onde ? onde + '.' + k : k);
    });
  })(dados, '');
  if (achado) return achado;
  if (JSON.stringify(dados).length > CASCA_TAMANHO_DO_CONTEXTO) return 'o contexto passa de ' + CASCA_TAMANHO_DO_CONTEXTO + ' caracteres';
  return '';
}
function cascaB64Url(texto) {
  var bin = ''; new TextEncoder().encode(texto).forEach(function (b) { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cascaDeB64Url(b64) {
  var s = String(b64).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  var bin = atob(s), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
/* O que veio no fragmento desta página: { de, contexto }, ou nulos. Contexto recusado chega como nulo, e não pela
   metade: um contexto podado em silêncio esconderia o defeito de quem chamou. */
function cascaContextoDaPagina() {
  var q = new URLSearchParams(String(location.hash || '').replace(/^#/, '')), de = q.get('de'), ctx = q.get('ctx'), dados = null;
  if (ctx) { try { dados = JSON.parse(cascaDeB64Url(ctx)); } catch (e) { dados = null; } }
  if (dados !== null && (typeof dados !== 'object' || cascaContextoRecusado(dados))) dados = null;
  return { de: de && cascaBloco(de) ? de : null, contexto: dados };
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
  var estado = { id: '', bloco: null, guardada: null, pessoa: null, de: null };
  function raiz() { var p = location.pathname, i = p.indexOf('/blocos/'); return i >= 0 ? p.slice(0, i + 1) : './'; }
  function exigir() { if (!estado.pessoa) throw new Error('Casca.iniciar ainda não terminou'); }
  // O que a tela do bloco recebe de volta de um servidor: nunca a sessão nem o token, que ficam com a casca.
  function semSegredos(r) { var c = Object.assign({}, r || {}); delete c.sessao; delete c.token; return c; }
  // Campos que o `extra` do sessaoNova não troca: são o pedido em si, e o resto a casca põe em todo postar.
  var DA_CASCA = ['acao', 'token', 'sessao', 'app', 'versao', 'relogio', 'fuso'];
  return {
    versao: VERSAO_APP,
    /* Confere a entrada de hoje e devolve { pessoa, bloco, contexto, de }. Sem ela, volta para a entrada da casca, e a
       promessa não se resolve (a tela do bloco não chega a desenhar nada). `contexto` e `de` só vêm quando outro bloco
       abriu esta tela (Casca.abrirBloco); senão, nulos. */
    iniciar: function (id) {
      estado.id = id; estado.bloco = cascaBloco(id);
      return cascaPessoaDoDia().then(function (p) {
        if (!p || !estado.bloco) { location.replace(raiz()); return new Promise(function () { }); }
        estado.guardada = p; estado.pessoa = cascaPessoaParaBloco(p);
        var c = cascaContextoDaPagina(); estado.de = c.de;
        // A tela do bloco é onde a equipe passa o dia: o sinal que volta com ela aberta manda o que espera, sem depender
        // do Android acordar o app (no iPhone, ele não acorda).
        if (estado.bloco.envia) window.addEventListener('online', function () { cascaEnviar(id, 'o sinal voltou'); });
        return { pessoa: JSON.parse(JSON.stringify(estado.pessoa)), bloco: { id: estado.bloco.id, nome: estado.bloco.nome, versao: estado.bloco.versao },
                 contexto: c.contexto, de: c.de };
      });
    },
    pessoa: function () { exigir(); return JSON.parse(JSON.stringify(estado.pessoa)); },
    sinal: function () { return navigator.onLine !== false; },
    aoMudarOSinal: function (fn) { window.addEventListener('online', function () { fn(true); }); window.addEventListener('offline', function () { fn(false); }); },
    /* De volta para quem abriu esta tela: o bloco que chamou (o diário, depois do checklist), ou o Início. */
    voltar: function () {
      var de = estado.de && cascaBloco(estado.de);
      location.href = raiz() + (de && de.entrada ? de.entrada : '');
    },
    /* Abre a tela do celular de outro bloco, levando o contexto (ver cascaContextoRecusado). Funciona sem sinal. */
    abrirBloco: function (id, contexto) {
      exigir();
      var b = cascaBloco(id);
      if (!b || !b.entrada) return { erro: 'O bloco "' + id + '" não tem tela neste celular.' };
      var dados = contexto === undefined ? null : contexto;
      if (dados !== null && typeof dados !== 'object') return { erro: 'O contexto é um objeto.' };
      var recusa = dados === null ? '' : cascaContextoRecusado(dados);
      if (recusa) return { erro: 'O contexto foi recusado: ' + recusa + '.' };
      location.href = raiz() + b.entrada + '#de=' + encodeURIComponent(estado.id) + (dados === null ? '' : '&ctx=' + cascaB64Url(JSON.stringify(dados)));
      return { ok: true };
    },
    /* A sessão desta pessoa no servidor do bloco existe e não venceu? Diz só sim ou não, e até quando: a sessão em si
       fica com a casca e vai pelo ctx.sessaoDe do envio. É para o bloco chamar o sessaoNova só quando precisa, e não a
       cada abertura (cada chamada gasta um token do Núcleo). */
    temSessao: function () {
      exigir();
      return cascaLer('sessoes:' + estado.id).then(function (s) {
        var x = (s || {})[cascaMatricula(estado.pessoa.matricula)];
        if (!x || !x.sessao) return { tem: false };
        var ate = x.validaAte === '' || x.validaAte === undefined ? null : typeof x.validaAte === 'number' ? x.validaAte : Date.parse(x.validaAte);
        if (ate !== null && !isNaN(ate) && ate <= Date.now()) return { tem: false, venceu: true, valeAte: x.validaAte };
        return { tem: true, valeAte: x.validaAte };
      });
    },
    /* A sessão desta pessoa no servidor do bloco, nascida do token do Núcleo (cartas nº 8 a 10 da Operação e nº 1 do
       Módulo Segurança ao App, 22 a 24/10/2026). No toque: pede o token ao login, confere o endereço pelo resumo e posta
       `{ acao: 'sessaoDoNucleo', token, ...extra }` ao servidor do bloco. O token vai direto da casca ao servidor e
       nunca passa pela tela (FRONTEIRA §2.1, regra 1); a sessão que volta fica guardada pela matrícula e também não
       passa. A tela recebe a resposta do servidor sem a sessão, ou a recusa com a marca dela. */
    sessaoNova: function (extra) {
      exigir();
      var b = estado.bloco, mat = cascaMatricula(estado.pessoa.matricula);
      if (!b.envia) return Promise.resolve({ ok: false, erro: 'Este bloco não tem servidor para entrar.' });
      if (!mat) return Promise.resolve({ ok: false, semMatricula: true, erro: 'O seu cadastro não tem matrícula, e este sistema precisa dela. Avise a administração.' });
      if (navigator.onLine === false) return Promise.resolve({ ok: false, semSinal: true, erro: 'Sem sinal: a entrada neste sistema precisa de sinal.' });
      // O endereço é conferido antes de pedir o token: com o resumo errado, nenhum token é gasto nem vai a lugar nenhum.
      return cascaServidorDe(b).then(function (s) {
        if (!s.ok) return Object.assign({ ok: false }, s);
        function tentar(vez) {
          return cascaPedirToken(estado.guardada, b.servidor).then(function (t) {
            if (t.termo) return { ok: false, termo: true, erro: 'Há um termo da Compel para aceitar. Volte ao Início e toque no sistema por lá.' };
            if (!t.ok) return Object.assign({ ok: false }, t);
            var corpo = {};
            Object.keys(extra || {}).forEach(function (k) { if (DA_CASCA.indexOf(k) < 0) corpo[k] = extra[k]; });
            corpo.acao = 'sessaoDoNucleo'; corpo.token = t.token;
            return cascaPostar(s.url, corpo, { app: b.envia.app, versao: b.versao }).then(function (r) {
              // Token já usado ou vencido no caminho (a Operação, carta nº 9): um outro, uma vez só.
              if (r && r.tokenRecusado && vez === 1) return tentar(2);
              if (!r || r.ok !== true || !r.sessao) return Object.assign(semSegredos(r), { ok: false, erro: (r && r.erro) || 'O sistema não abriu a sua entrada.' });
              // A sessão é guardada pela matrícula de quem entrou no celular. Se o servidor responder por outra
              // pessoa, guardar faria os registros de uma subirem com a sessão da outra.
              var devolvida = cascaMatricula(r.matricula !== undefined ? r.matricula : r.mat);
              if (devolvida && devolvida !== mat) return { ok: false, outraPessoa: true, erro: 'O sistema respondeu com outra pessoa. Nada foi guardado. Avise a administração.' };
              return cascaGuardarSessaoDoBloco(b.id, mat, r.sessao, r.valeAte).then(function () { return semSegredos(r); });
            }, function (e) {
              return { ok: false, semRede: !!(e && e.rede && !e.comSinal), servidorFora: !!(e && (e.servidor || (e.rede && e.comSinal))), erro: (e && e.msg) || 'Não consegui falar com o sistema.' };
            });
          });
        }
        return tentar(1);
      });
    },
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
