/* servicos.js — o que a casca do App Compel dá aos blocos (21/10/2026).
 *
 * RODA NOS DOIS LUGARES: na tela (a casca e as telas dos blocos) e no service worker (o pedaço que o Android acorda
 * sozinho quando o sinal volta). O envio em segundo plano e o botão "Enviar agora" têm de fazer exatamente a mesma
 * coisa, e a única forma de garantir isso é ser o mesmo código (a lição do app de teste da Operação, 07/10/2026).
 * Por isso nada aqui usa `document` nem `window`.
 *
 * DE ONDE VEIO: o `postar`, a trava única e a paciência do envio são os do `campo/fila.js` e do `campo/sw.js` da
 * Operação (5g, lidos no repositório deles em 21/10/2026), que a FRONTEIRA §5.5 passa para a casca. A casca não
 * reescreveu as regras: tirou delas o que era só da Operação (o banco `operacao-campo`, o `app: 'campo'` fixo, a
 * etiqueta `enviar-diarios`) e deixou cada bloco dizer o dele no `bloco.json`.
 *
 * O QUE NÃO ESTÁ AQUI: o que vai em cada envio e o que fazer com cada resposta do servidor. Isso é do bloco (§5.5).
 */
'use strict';

var VERSAO_APP = '1.7.1 (25/10/2026)';
var CASCA_BANCO = 'app-compel-casca';    // o banco da casca; o de cada bloco é do bloco, e a casca nunca o apaga
var FUSO_PADRAO = 'America/Sao_Paulo';   // pessoa sem base cai aqui (carta nº 9 do Núcleo): é o fuso que termina o dia primeiro
var CASCA_ESPERA_DO_ENVIO_MS = 90000;    // o mesmo do campo/: o Apps Script frio com foto passa de 30 s em rede fraca
var CASCA_ACORDADAS_GUARDADAS = 10;

/* ---------- o banco da casca ----------
   Abre e fecha a cada vez, como o fila.js da Operação: a tela e o service worker usam o mesmo banco, e uma conexão
   deixada aberta por um deles trava a mudança de versão do outro. */
function cascaAbrirBanco() {
  return new Promise(function (ok, falha) {
    var r = indexedDB.open(CASCA_BANCO, 1);
    r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = function () { ok(r.result); };
    r.onerror = function () { falha(r.error); };
  });
}
function cascaLer(chave) {
  return cascaAbrirBanco().then(function (db) {
    return new Promise(function (ok, falha) {
      var q = db.transaction('kv').objectStore('kv').get(chave);
      q.onsuccess = function () { db.close(); ok(q.result); };
      q.onerror = function () { db.close(); falha(q.error); };
    });
  });
}
function cascaGravar(chave, valor) {
  return cascaAbrirBanco().then(function (db) {
    return new Promise(function (ok, falha) {
      var t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(valor, chave);
      t.oncomplete = function () { db.close(); ok(); };
      t.onerror = function () { db.close(); falha(t.error); };
      t.onabort = function () { db.close(); falha(t.error || new Error('gravação cancelada')); };
    });
  });
}

/* ---------- o banco de um bloco ----------
   O banco é do bloco (o nome, as lojas e o que mora nelas). A casca só dá os ajudantes, para cada bloco não escrever
   de novo a mesma abertura com os mesmos cuidados. `lojas` é { nomeDaLoja: 'campoChave' }. */
function cascaBanco(nome, versao, lojas) {
  function abrir() {
    return new Promise(function (ok, falha) {
      var r = indexedDB.open(nome, versao);
      r.onupgradeneeded = function () {
        Object.keys(lojas).forEach(function (l) { if (!r.result.objectStoreNames.contains(l)) r.result.createObjectStore(l, { keyPath: lojas[l] }); });
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { falha(r.error); };
    });
  }
  function noBanco(loja, modo, faz) {
    return abrir().then(function (db) {
      return new Promise(function (ok, falha) {
        var t = db.transaction(loja, modo), resultado, q = faz(t.objectStore(loja));
        if (q) q.onsuccess = function () { resultado = q.result; };
        t.oncomplete = function () { db.close(); ok(resultado); };
        t.onerror = function () { db.close(); falha(t.error); };
        t.onabort = function () { db.close(); falha(t.error || new Error('gravação cancelada')); };
      });
    });
  }
  return {
    ler: function (loja, chave) { return noBanco(loja, 'readonly', function (s) { return s.get(chave); }); },
    gravar: function (loja, valor) { return noBanco(loja, 'readwrite', function (s) { return s.put(valor); }); },
    listar: function (loja) { return noBanco(loja, 'readonly', function (s) { return s.getAll(); }).then(function (l) { return l || []; }); },
    apagar: function (loja, chave) { return noBanco(loja, 'readwrite', function (s) { return s.delete(chave); }); }
  };
}

/* ---------- o dia, no fuso da base ----------
   O dia de hoje no fuso da base da pessoa, e não no do celular: em Dourados (UTC−4) o dia acaba uma hora depois de
   Brasília, e um celular com o fuso errado não pode encurtar nem esticar a entrada (carta nº 9 do App, 19/10/2026).
   Mora aqui porque a casca e a tela do bloco têm de dar a mesma resposta para "a entrada de hoje vale?". */
function fusoQueVale(fuso) {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: fuso }); return fuso; } catch (e) { return FUSO_PADRAO; }
}
function diaNoFuso(data, fuso) {
  var p = new Intl.DateTimeFormat('en-CA', { timeZone: fusoQueVale(fuso || FUSO_PADRAO), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(data);
  var v = {}; p.forEach(function (x) { v[x.type] = x.value; });
  return v.year + '-' + v.month + '-' + v.day;
}
function fusoDe(p) { return fusoQueVale(p && p.entrada && p.entrada.fuso || FUSO_PADRAO); }
function cascaEntradaVale(atual, pessoas) {
  var p = atual && pessoas && pessoas[atual.chave];
  return !!(p && atual.dia && atual.dia === diaNoFuso(new Date(), fusoDe(p)));
}
/* Quem está no celular hoje, ou null. É o que a tela do bloco pergunta antes de abrir. */
function cascaPessoaDoDia() {
  return Promise.all([cascaLer('atual'), cascaLer('pessoas')]).then(function (v) {
    return cascaEntradaVale(v[0], v[1] || {}) ? v[1][v[0].chave] : null;
  });
}
/* O que o bloco recebe da pessoa (FRONTEIRA §5.2): nunca o CPF, nem o resumo dele, nem a sessão do aparelho, nem o
   verificador da senha. E nenhum campo se chama `base` (o defeito de 18/08, carta nº 8 do Núcleo, C7).
   O `fuso` é o da base da pessoa, o mesmo que fecha a entrada do dia (carta nº 1 do Módulo Segurança, 23/10/2026): sem
   ele, o bloco contava o dia no fuso do celular, e um celular do Rio levado a Dourados mudaria de dia uma hora antes. */
function cascaPessoaParaBloco(p) {
  if (!p) return null;
  return { nome: p.nome || '', nomeCompleto: p.nomeCompleto || '', matricula: p.matricula || '', funcao: p.funcao || '',
           lotacao: p.lotacao || '', bases: JSON.parse(JSON.stringify(p.bases || [])), fuso: fusoDe(p) };
}
/* A matrícula como chave: só os algarismos, sem os zeros da frente (a mesma conta do campo/, 5d). Sem isso, "0123" do
   pacote e "123" do cadastro seriam duas pessoas. */
function cascaMatricula(m) { return String(m === undefined || m === null ? '' : m).replace(/\D/g, '').replace(/^0+/, ''); }

/* ---------- o resumo do endereço ---------- */
function cascaHex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
function cascaResumo(texto) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto))).then(cascaHex); }

/* ---------- os blocos deste app ----------
   A lista vem do `blocos/indice.js`, que a publicação monta a partir dos `bloco.json` (conferencia/indice.js). Ele não
   mora no repositório: se morasse, cada bloco novo teria de mexer num arquivo fora da pasta dele, e a regra 5 da
   conferência recusaria. */
function cascaBlocos() { return typeof BLOCOS_DO_APP !== 'undefined' && Array.isArray(BLOCOS_DO_APP) ? BLOCOS_DO_APP : []; }
function cascaBloco(id) { return cascaBlocos().filter(function (b) { return b.id === id; })[0] || null; }
function cascaBlocoDoModulo(modulo) { return cascaBlocos().filter(function (b) { return b.servidor === modulo; })[0] || null; }

/* ---------- o servidor do bloco ----------
   O endereço chega pelo login, com a senha conferida (o `url` da MODULOS, FRONTEIRA §5.1), e fica guardado por módulo
   para o envio sem sinal e em segundo plano. Antes de qualquer envio, a casca confere o resumo que o bloco publicou: o
   endereço que não bate é recusado, nada se apaga, e nenhum outro endereço é tentado (cartas nº 10 e nº 11 do Núcleo;
   nº 6 da Operação). A conferência é da casca, e não de cada bloco, para existir uma vez só. */
function cascaGuardarEnderecos(modulos) {
  return cascaLer('enderecos').then(function (antes) {
    var e = antes || {};
    (modulos || []).forEach(function (m) {
      var url = String(m && m.url || '').trim();
      if (m && m.modulo && /^https:\/\/\S+$/.test(url)) e[m.modulo] = url;
    });
    return cascaGravar('enderecos', e);
  });
}
function cascaServidorDe(bloco) {
  return cascaLer('enderecos').then(function (e) {
    var url = String(e && e[bloco.servidor] || '').trim(), nome = bloco.nome || bloco.id;
    if (!url) return { semEndereco: true, erro: 'O endereço do servidor de ' + nome + ' ainda não chegou a este celular. Entre no app com sinal uma vez.' };
    return cascaResumo(url).then(function (r) {
      if (!bloco.resumo || r !== bloco.resumo) return { enderecoMudou: true, erro: 'O endereço do servidor de ' + nome + ' mudou. Avise a administração.' };
      return { ok: true, url: url };
    });
  });
}

/* ---------- o postar ----------
   Texto puro (JSON), e não "application/json": é o que deixa o navegador do celular falar com o Apps Script sem a
   pergunta prévia (CORS) que ele não responde. Resposta que não é JSON é a tela de login do Google (implantação fora
   de "Qualquer pessoa"): não conta como resposta. O `app` é o que o servidor do bloco espera (`campo` na Operação,
   FRONTEIRA §5.5, cuidado 3): é por ele que o servidor separa o celular do app de teste. */
function cascaPostar(url, corpo, opcoes) {
  opcoes = opcoes || {};
  var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var relogio = controle ? setTimeout(function () { controle.abort(); }, opcoes.ms || CASCA_ESPERA_DO_ENVIO_MS) : null;
  corpo.app = opcoes.app; corpo.versao = opcoes.versao || VERSAO_APP;
  /* O relógio e o fuso do celular na hora do envio (campo 6e, 15/10/2026): a hora do toque só vale se o relógio do
     celular estava certo, e o fuso diz que hora local o toque marcou (Dourados é UTC−4; o Rio, UTC−3). */
  corpo.relogio = new Date().toISOString(); corpo.fuso = new Date().getTimezoneOffset();
  return fetch(url, { method: 'POST', body: JSON.stringify(corpo), redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                      signal: controle ? controle.signal : undefined })
    .then(function (resp) { return resp.text(); })
    .then(function (texto) {
      if (relogio) clearTimeout(relogio);
      try { return JSON.parse(texto); }
      catch (e) { throw { servidor: true, msg: 'O servidor não respondeu como esperado (a implantação precisa estar como "Qualquer pessoa").' }; }
    }, function () {
      if (relogio) clearTimeout(relogio);
      var comSinal = typeof navigator !== 'undefined' && navigator.onLine !== false;
      /* COM SINAL E SEM RESPOSTA NÃO QUER DIZER "NÃO CHEGOU" (07/10/2026, 20:39): o servidor pode ter gravado e a
         resposta se perdido. Por isso o ID de cada registro nasce no celular, e o servidor do bloco não grava duas vezes. */
      throw { rede: true, comSinal: comSinal, msg: comSinal ? 'Com sinal, mas a resposta do servidor não chegou. Vai de novo (se já tinha chegado, o servidor não duplica).' : 'Sem sinal.' };
    });
}

/* ---------- a trava única ----------
   A tela e o segundo plano mandariam o mesmo registro pela mesma rede fraca (o app de teste mostrou, 08/10/2026).
   Uma trava por bloco: o envio de um bloco não espera o do outro. */
var cascaTravasSemLocks = {};
function cascaComTrava(nome, faz) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request(nome, { ifAvailable: true }, function (trava) { return trava ? faz() : { ocupado: true }; });
  }
  if (cascaTravasSemLocks[nome]) return Promise.resolve({ ocupado: true });
  cascaTravasSemLocks[nome] = true;
  return Promise.resolve().then(faz).then(function (r) { delete cascaTravasSemLocks[nome]; return r; }, function (e) { delete cascaTravasSemLocks[nome]; throw e; });
}

/* ---------- a sessão de cada pessoa no servidor do bloco ----------
   É a `sessaoDe` do campo/ (5d), passada para a casca (FRONTEIRA §5.5): no celular da equipe, cada registro sobe com a
   sessão de quem o fez, e não com a de quem está no celular agora. Guardada pela matrícula, nunca pelo CPF. */
function cascaSessaoDoBloco(id, matricula) {
  return cascaLer('sessoes:' + id).then(function (s) { var x = (s || {})[cascaMatricula(matricula)]; return x && x.sessao || ''; });
}
function cascaGuardarSessaoDoBloco(id, matricula, sessao, validaAte) {
  return cascaLer('sessoes:' + id).then(function (s) {
    s = s || {}; s[cascaMatricula(matricula)] = { sessao: String(sessao || ''), validaAte: validaAte || '' };
    return cascaGravar('sessoes:' + id, s);
  });
}
/* "Tirar meus dados deste celular" leva junto a sessão da pessoa em cada bloco. O banco do bloco fica: um registro
   feito e ainda não enviado mora lá, e não é da casca apagá-lo (§5.5, cuidado 2). */
function cascaEsquecerSessoes(matricula) {
  var m = cascaMatricula(matricula);
  return Promise.all(cascaBlocos().map(function (b) {
    return cascaLer('sessoes:' + b.id).then(function (s) { if (s && s[m]) { delete s[m]; return cascaGravar('sessoes:' + b.id, s); } });
  }));
}

/* ---------- o envio de cada bloco ----------
   O bloco registra, no arquivo de envio dele (o `envia.script` do bloco.json), duas funções:
     enviar(ctx)  → Promise do resumo { enviados, pendentes, erro, semRede, servidorFora }
     pendentes()  → Promise do número de registros esperando
   O `ctx` traz o servidor já conferido, o `postar` com o `app` do bloco, a sessão de cada pessoa e quem pediu o envio. */
var CASCA_ENVIOS = {};
function cascaBlocoEnvia(id, funcoes) { CASCA_ENVIOS[id] = funcoes; }

function cascaEnviar(id, enviadoPor) {
  var b = cascaBloco(id), f = CASCA_ENVIOS[id];
  if (!b || !b.envia) return Promise.resolve({ erro: 'Este bloco não envia.' });
  if (!f || typeof f.enviar !== 'function') return Promise.resolve({ erro: 'O envio de ' + (b.nome || id) + ' não carregou neste celular.' });
  return cascaComTrava('app-compel-enviar-' + id, function () {
    return cascaServidorDe(b).then(function (s) {
      if (!s.ok) return s;
      var ctx = {
        servidor: s.url, enviadoPor: enviadoPor || '',
        postar: function (corpo, ms) { return cascaPostar(s.url, corpo, { app: b.envia.app, versao: b.versao, ms: ms }); },
        sessaoDe: function (matricula) { return cascaSessaoDoBloco(id, matricula); }
      };
      return Promise.resolve(f.enviar(ctx)).then(function (r) { return r || {}; }, function (e) {
        // A exceção do bloco não pode derrubar a fila da casca: vira o erro do resumo, e o que não subiu espera.
        return { erro: e && (e.msg || e.message) || String(e), semRede: !!(e && e.rede && !e.comSinal), servidorFora: !!(e && e.rede && e.comSinal) };
      });
    }).then(function (r) {
      if (r.ocupado) return r;
      var estado = { quando: new Date().toISOString(), enviadoPor: enviadoPor || '', enviados: +r.enviados || 0, pendentes: r.pendentes,
                     erro: r.erro || '', enderecoMudou: !!r.enderecoMudou, semEndereco: !!r.semEndereco, semRede: !!r.semRede, servidorFora: !!r.servidorFora };
      return cascaGravar('envio:' + id, estado).then(function () { return r; });
    });
  });
}
function cascaPendentes(id) {
  var f = CASCA_ENVIOS[id];
  if (!f || typeof f.pendentes !== 'function') return Promise.resolve(null);
  return Promise.resolve(f.pendentes()).then(function (n) { return +n || 0; }, function () { return null; });
}

/* As 10 últimas vezes que o Android acordou o app, por bloco: sem isso não se sabe se ele nunca acordou ou se acordou
   e o envio falhou (07/10/2026). */
function cascaAnotarAcordada(id, resultado) {
  return cascaLer('acordadas:' + id).then(function (l) {
    return cascaGravar('acordadas:' + id, (l || []).concat([{ quando: new Date().toISOString(), resultado: resultado }]).slice(-CASCA_ACORDADAS_GUARDADAS));
  }).catch(function () { });
}

/* Quem fez e em nome de quem (D20, Dalton, 19/10/2026): todo registro de bloco leva quem entrou no celular e para quem
   foi feito. Quando são pessoas diferentes, o registro fica no nome do dono da matrícula, marcado como feito no celular
   de outro. */
function cascaCarimbo(quemEntrou, emNomeDe) {
  var q = quemEntrou || {}, n = emNomeDe || q;
  var outro = cascaMatricula(n.matricula) !== cascaMatricula(q.matricula);
  return { feitoPor: { matricula: q.matricula || '', nome: q.nome || '' }, emNomeDe: { matricula: n.matricula || '', nome: n.nome || '' },
           noCelularDeOutro: outro, feitoEm: new Date().toISOString() };
}
