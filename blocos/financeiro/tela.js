/* Bloco Financeiro 0.1.0 — Prestar contas, 100% no app (19/11/2026).

   DECISÃO DO DALTON, 18/11/2026, 16h30: "a tela seja 100% do app [...] não quero que entre dentro do módulo completo só
   para fazer essa parte do caixa, tem que ser algo simples e facil". Uma tela só, na ordem em que a pessoa vive a
   despesa: a foto do cupom primeiro (ela está com o cupom na mão), depois valor, onde foi, o que foi, e salvar.

   O QUE A TELA NÃO FAZ, de propósito:
   - Não decide permissão. Quem pode prestar (PRESTACAO, dono do caixa) é do servidor do Financeiro; a tela só mostra
     o que ele devolve e repete a frase dele quando ele recusa.
   - Não tem fila. É com sinal: sem sinal nada sai, e a tela diz isso com todas as letras (o Dalton disse "com sinal,
     sem fila"). O que a pessoa digitou fica na tela; a foto já enviada fica enviada.
   - Não manda sessão nem token. A casca preenche (Casca.postarComSessao), como no Suporte.

   O QUE NÃO FOI VISTO (19/11/2026): a casca de verdade e um celular. Esta tela foi testada contra uma casca de mentira
   que só tem a interface usada aqui, e contra o servidor de mentira da porta do App (54_PortaDoApp.gs). */

var $ = function (id) { return document.getElementById(id); };
var h = function (s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

/* Texto do "Ajuda" do pé da tela (padrão de ajuda das telas): curto, no tom de quem está na rua. */
var AJUDA = 'Prestar contas é registrar cada gasto do caixa que você recebeu. Tire a foto do cupom, da nota ou do ' +
  'recibo (pode ser mais de uma por gasto), diga o valor e onde foi, escolha em que linha do caixa ele entra e toque ' +
  'em Salvar. Gasto que não estava previsto entra em "Fora do previsto". Quando terminar, toque em Enviar prestação. ' +
  'Precisa de sinal de internet.';

var MSG_SEM_SINAL = 'Sem sinal agora. Esta tela precisa de internet e nada foi enviado. ' +
  'O que você digitou continua aqui; toque de novo quando o sinal voltar.';

/* A casca devolve a foto reduzida a ~200 KB. Pedimos um teto maior porque cupom térmico com letra miúda perde a leitura
   com muita compressão; 300 KB viram ~400 mil caracteres em base64, abaixo do teto de 600 mil da porta do servidor
   (54_PortaDoApp.gs, LIMITE_CORPO_FOTO_). Acima de 420 KB a tela recusa a foto antes de gastar o sinal do celular. */
var TETO_FOTO = 300 * 1024;
var MAX_FOTO = 420 * 1024;
var MAX_FOTOS = 5;
var PRAZO_FOTO = 120000;   // ms; foto em sinal fraco demora
var PRAZO_PEDIDO = 60000;

var TIPOS_DOC = [['CUPOM', 'Cupom fiscal'], ['NOTA', 'Nota fiscal'], ['RECIBO', 'Recibo']];

var S = {
  pessoa: null, tela: 'abrindo', msg: '', info: '', ocupado: false,
  caixas: [], classes: [], detalhe: null, idCaixa: '', ultimo: null, enviado: null
};

function hojeISO() {
  var d = new Date();
  var m = d.getMonth() + 1, dia = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dia < 10 ? '0' : '') + dia;
}

/* Chave única por tentativa de Salvar. Se a rede cai depois do servidor gravar, o segundo toque manda a MESMA chave e o
   servidor devolve o mesmo resultado em vez de lançar a despesa duas vezes (54_PortaDoApp.gs, `repetidoDoApp_`). */
function novaChave() {
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function formVazio(manter) {
  return {
    fotos: [],   // [{ link, url (miniatura local, não vai ao rascunho) }]
    valor: '', data: hojeISO(), fornecedor: '', idClassificacao: '', idLinha: '',
    descricao: '', numDocumento: '',
    tipoDocumento: (manter && manter.tipoDocumento) || 'CUPOM',
    chave: novaChave()
  };
}
var F = formVazio();

// ---------------------------------------------------------------------------
//  Falar com o servidor
// ---------------------------------------------------------------------------

/* UM lugar só para falar com o Financeiro. A assinatura de Casca.postarComSessao(corpo, ms) vem das cartas do App
   (nº 2, 19/11/2026) e do uso no Suporte; não li o casca.js. Se a assinatura for outra, muda aqui e em mais nenhum lugar. */
function pedir(corpo, ms) {
  if (typeof Casca.sinal === 'function' && !Casca.sinal()) {
    return Promise.resolve({ ok: false, semSinal: true, erro: MSG_SEM_SINAL });
  }
  return Promise.resolve()
    .then(function () { return Casca.postarComSessao(corpo, ms || PRAZO_PEDIDO); })
    .then(function (r) {
      if (!r) return { ok: false, erro: 'O Financeiro não respondeu. Tente de novo.' };
      if (r.semSinal) r.erro = MSG_SEM_SINAL;
      return r;
    })
    .catch(function () { return { ok: false, erro: 'Não consegui falar com o Financeiro agora. Tente de novo.' }; });
}

// ---------------------------------------------------------------------------
//  Rascunho: a câmera do celular às vezes mata a página
// ---------------------------------------------------------------------------

/* Ao abrir a câmera, alguns celulares descarregam a página. O que já foi digitado volta; a miniatura local não (só o
   link da foto que o servidor já guardou). Fica em sessionStorage, que some ao fechar a aba, e não guarda nenhum dado
   além do que a pessoa digitou nesta tela. */
var CHAVE_RASCUNHO = 'financeiro-prestar-rascunho';
function guardarRascunho() {
  try {
    // Só grava com o formulário na tela. Apagar é com `limparRascunho`, nos três pontos em que a despesa de fato acabou
    // (salvou, voltou à lista, enviou); apagar aqui, a cada redesenho, destruía o rascunho antes de a abertura lê-lo.
    if (!S.idCaixa || S.tela !== 'form') return;
    var f = JSON.parse(JSON.stringify(F));
    f.fotos = f.fotos.map(function (x) { return { link: x.link }; });
    sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ idCaixa: S.idCaixa, f: f }));
  } catch (e) { /* vigia: sem armazenamento a tela funciona igual; só perde a recuperação depois da câmera */ }
}
function lerRascunho() {
  try {
    var r = JSON.parse(sessionStorage.getItem(CHAVE_RASCUNHO) || 'null');
    return r && r.idCaixa && r.f && Array.isArray(r.f.fotos) ? r : null;
  } catch (e) { return null; /* vigia: rascunho ilegível vale como sem rascunho */ }
}
function limparRascunho() {
  try { sessionStorage.removeItem(CHAVE_RASCUNHO); } catch (e) { /* vigia: nada a limpar se não há armazenamento */ }
}

// ---------------------------------------------------------------------------
//  Valores
// ---------------------------------------------------------------------------

/* "1.234,56", "12,5", "12.50" -> número. Vírgula é o decimal; se há vírgula, o ponto é milhar. Vazio ou lixo -> 0. */
function lerValor(txt) {
  var t = String(txt || '').replace(/[^\d.,]/g, '');
  if (!t) return 0;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(t);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/* O que falta para poder salvar, na ordem em que a tela pede. A mesma frase aparece embaixo do botão apagado. */
function oQueFalta() {
  if (!F.fotos.length) return 'Falta a foto do cupom, da nota ou do recibo.';
  if (!lerValor(F.valor)) return 'Falta o valor.';
  if (!String(F.fornecedor).trim()) return 'Falta dizer onde foi a despesa.';
  if (!F.idClassificacao) return 'Falta escolher o tipo de gasto.';
  if (F.tipoDocumento === 'RECIBO' && !String(F.descricao).trim()) return 'Recibo precisa de descrição: o que foi comprado ou contratado.';
  return '';
}

// ---------------------------------------------------------------------------
//  Passos
// ---------------------------------------------------------------------------

function carregarCaixas() {
  S.tela = 'abrindo'; S.msg = ''; desenhar();
  return pedir({ acao: 'meusCaixas' }).then(function (r) {
    if (!r.ok) { S.tela = 'erro'; S.msg = r.erro || 'Não consegui abrir seus caixas.'; return desenhar(); }
    S.caixas = (r.itens || []).filter(function (c) { return c.podePrestar; });
    var rasc = lerRascunho();
    if (rasc && S.caixas.some(function (c) { return c.id === rasc.idCaixa; })) {
      return abrirCaixa(rasc.idCaixa, rasc.f);
    }
    if (S.caixas.length === 1) return abrirCaixa(S.caixas[0].id);
    S.tela = 'lista'; desenhar();
  });
}

function abrirCaixa(id, rascunho) {
  S.idCaixa = id; S.msg = ''; S.info = ''; S.tela = 'abrindo'; desenhar();
  return Promise.all([pedir({ acao: 'caixa', idCaixa: id }), S.classes.length ? Promise.resolve({ ok: true, itens: S.classes }) : pedir({ acao: 'classificacoes' })])
    .then(function (v) {
      var cx = v[0], cl = v[1];
      if (!cx.ok || !cl.ok) {
        S.tela = 'erro'; S.msg = (!cx.ok ? cx.erro : cl.erro) || 'Não consegui abrir o caixa.';
        return desenhar();
      }
      S.detalhe = cx; S.classes = cl.itens || [];
      F = rascunho ? Object.assign(formVazio(), rascunho) : formVazio();
      if (rascunho) { S.info = 'Continuando de onde você parou.'; }
      S.tela = 'form'; desenhar();
    });
}

/* A foto: reduzida pela casca, guardada no servidor NA HORA. Assim, se o sinal cai depois, a foto não se perde; e se a
   página for descarregada pela câmera, o link já está no rascunho. */
function tirarFoto(arquivo) {
  if (!arquivo || S.ocupado) return;
  if (F.fotos.length >= MAX_FOTOS) { S.msg = 'No máximo ' + MAX_FOTOS + ' fotos por despesa. Salve esta e lance outra.'; return desenhar(); }
  S.ocupado = true; S.msg = ''; S.info = 'Enviando a foto…'; desenhar();
  var miniatura = '';
  Casca.foto(arquivo, { teto: TETO_FOTO })
    .then(function (f) {
      if (!f || !f.blob) throw new Error('sem foto');
      if (f.blob.size > MAX_FOTO) { var e = new Error('grande'); e.grande = true; throw e; }
      try { miniatura = URL.createObjectURL(f.blob); } catch (e2) { /* vigia: sem miniatura a foto vale igual */ }
      return blobParaBase64(f.blob).then(function (dados) {
        return pedir({
          acao: 'guardarFoto', idCaixa: S.idCaixa, chave: novaChave(),
          nome: 'foto.jpg', tipo: 'image/jpeg', dados: dados,
          tipoDocumento: F.tipoDocumento, fornecedor: F.fornecedor, valor: lerValor(F.valor) || undefined, data: F.data
        }, PRAZO_FOTO);
      });
    })
    .then(function (r) {
      S.ocupado = false; S.info = '';
      if (!r.ok) { S.msg = r.erro || 'Não consegui enviar a foto. Tire de novo.'; return desenhar(); }
      F.fotos.push({ link: r.link, url: miniatura });
      desenhar();
    })
    .catch(function (e) {
      S.ocupado = false; S.info = '';
      S.msg = e && e.grande ? 'A foto ficou pesada demais. Tire de novo, um pouco mais longe.' : 'Não consegui ler a foto. Tire de novo.';
      desenhar();
    });
}

function blobParaBase64(blob) {
  return new Promise(function (ok, erro) {
    var leitor = new FileReader();
    leitor.onload = function () { ok(String(leitor.result).split(',')[1] || ''); };
    leitor.onerror = function () { erro(new Error('leitura')); };
    leitor.readAsDataURL(blob);
  });
}

function salvar() {
  var falta = oQueFalta();
  if (falta) { S.msg = falta; return desenhar(); }
  if (S.ocupado) return;
  S.ocupado = true; S.msg = ''; S.info = 'Salvando…'; desenhar();
  pedir({
    acao: 'lancarItem', chave: F.chave, idCaixa: S.idCaixa, idLinha: F.idLinha,
    dataDespesa: F.data, fornecedor: String(F.fornecedor).trim(), idClassificacao: F.idClassificacao,
    descricao: String(F.descricao).trim(), tipoDocumento: F.tipoDocumento, numDocumento: String(F.numDocumento).trim(),
    valor: lerValor(F.valor), links: F.fotos.map(function (x) { return x.link; })
  }).then(function (r) {
    S.ocupado = false; S.info = '';
    if (!r.ok) { S.msg = r.erro || 'Não consegui salvar. Tente de novo.'; return desenhar(); }
    S.ultimo = r;
    F = formVazio(F);
    S.tela = 'feito'; limparRascunho(); desenhar();
    atualizarSaldo();
  });
}

/* O saldo do caixa no topo da próxima despesa: relido do servidor, sem travar a tela de "Lançado". */
function atualizarSaldo() {
  pedir({ acao: 'caixa', idCaixa: S.idCaixa }).then(function (r) { if (r.ok) S.detalhe = r; });
}

function enviarPrestacao() {
  if (S.ocupado) return;
  S.ocupado = true; S.msg = ''; S.info = 'Enviando a prestação…'; desenhar();
  pedir({ acao: 'enviarPrestacao', idCaixa: S.idCaixa, chave: 'e' + S.idCaixa + '-' + S.chaveEnvio }).then(function (r) {
    S.ocupado = false; S.info = '';
    if (!r.ok) { S.msg = r.erro || 'Não consegui enviar. Tente de novo.'; S.tela = 'confirmarEnvio'; return desenhar(); }
    S.enviado = r; S.tela = 'enviado'; limparRascunho(); desenhar();
  });
}

function voltar() {
  S.msg = ''; S.info = '';
  if (S.tela === 'form' || S.tela === 'feito' || S.tela === 'confirmarEnvio') {
    if (S.caixas.length > 1) { S.tela = 'lista'; limparRascunho(); return desenhar(); }
  }
  return Casca.voltar();
}

// ---------------------------------------------------------------------------
//  Desenho
// ---------------------------------------------------------------------------

function cartaoDoCaixa(c) {
  return '<button type="button" class="fin-caixa' + (c.atrasado ? ' atrasado' : '') + '" data-acao="caixa" data-id="' + h(c.id) + '">' +
    '<b>' + h(c.tipo) + ' · ' + h(c.mes) + '</b>' +
    '<small>Recebido R$ ' + h(c.aprovado) + ' · já prestado R$ ' + h(c.prestado) + ' · falta R$ ' + h(c.saldo) + '</small>' +
    (c.prazo ? '<small>' + (c.atrasado ? 'Venceu em ' : 'Prazo até ') + h(c.prazo) + '</small>' : '') + '</button>';
}

function opcoes(lista, atual, vazio) {
  return (vazio ? '<option value="">' + h(vazio) + '</option>' : '') + lista.map(function (o) {
    return '<option value="' + h(o[0]) + '"' + (String(atual) === String(o[0]) ? ' selected' : '') + '>' + h(o[1]) + '</option>';
  }).join('');
}

function telaForm() {
  var c = S.detalhe.caixa, falta = oQueFalta();
  var linhas = [['', 'Fora do previsto']].concat((S.detalhe.linhas || []).map(function (l) {
    return [l.id, l.descricao + (l.classificacao ? ' — ' + l.classificacao : '')];
  }));
  var classes = S.classes.map(function (k) { return [k.id, k.nome]; });
  var fotos = F.fotos.map(function (x, i) {
    return '<div class="fin-foto">' + (x.url ? '<img alt="Foto ' + (i + 1) + '" src="' + h(x.url) + '">' : '<span class="fin-foto-vazia">Foto ' + (i + 1) + '<br>enviada</span>') +
      '<button type="button" data-acao="tirarFoto-' + i + '" title="Remover esta foto" aria-label="Remover a foto ' + (i + 1) + '">×</button></div>';
  }).join('');
  return '<h1 class="fin-h1">Nova despesa</h1>' +
    '<div class="fin-resumo"><b>' + h(c.tipo) + ' · ' + h(c.mes) + '</b><br>Recebido R$ ' + h(c.aprovado) + ' · prestado R$ ' + h(c.prestado) + ' · falta R$ ' + h(c.saldo) + '</div>' +
    '<h2 class="fin-h2">1. Foto do comprovante</h2>' +
    '<div class="fin-fotos">' + fotos + '</div>' +
    '<button type="button" class="btn fin-foto-obrig" data-acao="foto"' + (S.ocupado || F.fotos.length >= MAX_FOTOS ? ' disabled' : '') + '>' +
    (F.fotos.length ? 'Tirar outra foto desta despesa' : 'Tirar a foto do cupom, nota ou recibo') + '</button>' +
    '<h2 class="fin-h2">2. A despesa</h2>' +
    '<div class="fin-dois">' +
    '<label class="fin-campo"><span>Valor (R$)</span><input data-campo="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + h(F.valor) + '"></label>' +
    '<label class="fin-campo"><span>Data</span><input data-campo="data" type="date" max="' + hojeISO() + '" value="' + h(F.data) + '"></label></div>' +
    '<label class="fin-campo"><span>Onde foi</span><input data-campo="fornecedor" maxlength="60" autocomplete="off" placeholder="Ex.: Posto Ipiranga" value="' + h(F.fornecedor) + '"></label>' +
    '<label class="fin-campo"><span>Tipo de gasto</span><select data-campo="idClassificacao">' + opcoes(classes, F.idClassificacao, 'Escolha…') + '</select></label>' +
    '<label class="fin-campo"><span>Em que linha do caixa entra</span><select data-campo="idLinha">' + opcoes(linhas, F.idLinha) + '</select></label>' +
    '<label class="fin-campo"><span>O que foi (opcional)</span><textarea data-campo="descricao" maxlength="120" placeholder="Ex.: almoço da equipe">' + h(F.descricao) + '</textarea></label>' +
    '<div class="fin-dois">' +
    '<label class="fin-campo"><span>Documento</span><select data-campo="tipoDocumento">' + opcoes(TIPOS_DOC, F.tipoDocumento) + '</select></label>' +
    '<label class="fin-campo"><span>Número (opcional)</span><input data-campo="numDocumento" autocomplete="off" value="' + h(F.numDocumento) + '"></label></div>' +
    '<div class="fin-rodape"><button type="button" class="btn" data-acao="salvar"' + (falta || S.ocupado ? ' disabled' : '') + '>Salvar despesa</button>' +
    (falta ? '<p class="fin-falta">' + h(falta) + '</p>' : '') +
    '</div>';
}

function telaFeito() {
  var u = S.ultimo || {};
  return '<h1 class="fin-h1">Despesa salva</h1>' +
    '<div class="aviso info">' + (u.foraDoPrevisto ? 'Entrou como "fora do previsto". ' : '') + 'Já lançado: R$ ' + h(u.jaLancado) + ' · falta prestar: R$ ' + h(u.faltaPrestar) + '.' +
    (u.repetido ? ' (Este envio já tinha chegado; não foi lançado duas vezes.)' : '') + '</div>' +
    (u.sugereEnviar ? '<div class="aviso atencao">Você já lançou várias despesas. Quando terminar, envie a prestação.</div>' : '') +
    '<div class="fin-rodape"><button type="button" class="btn" data-acao="outra">Lançar outra despesa</button>' +
    '<button type="button" class="btn fantasma" data-acao="querEnviar">Enviar a prestação</button></div>';
}

function telaConfirmarEnvio() {
  var c = (S.detalhe && S.detalhe.caixa) || {};
  return '<h1 class="fin-h1">Enviar a prestação?</h1>' +
    '<div class="fin-resumo">Caixa ' + h(c.tipo) + ' · ' + h(c.mes) + '<br>Prestado até agora: <b>R$ ' + h(c.prestado) + '</b><br>Falta prestar: R$ ' + h(c.saldo) + '</div>' +
    '<p>Ao enviar, o financeiro passa a analisar. Se ainda faltar valor, você pode continuar lançando depois.</p>' +
    '<div class="fin-rodape"><button type="button" class="btn" data-acao="enviarMesmo"' + (S.ocupado ? ' disabled' : '') + '>Sim, enviar</button>' +
    '<button type="button" class="btn fantasma" data-acao="outra">Voltar e lançar mais</button></div>';
}

function telaEnviado() {
  var r = S.enviado || {};
  return '<h1 class="fin-h1">Prestação enviada</h1>' +
    '<div class="aviso info">' + h(r.proximoPasso || 'Enviado para análise do financeiro.') + '</div>' +
    '<div class="fin-resumo">Prestado: <b>R$ ' + h(r.prestado) + '</b>' + (r.parcial ? '<br>Falta prestar: R$ ' + h(r.falta) : '') + '</div>' +
    '<div class="fin-rodape"><button type="button" class="btn" data-acao="sair">Voltar ao app</button></div>';
}

function desenhar() {
  var corpo = $('corpo');
  if (typeof Casca.barra === 'function') {
    Casca.barra({ voltar: voltar, rotulo: S.tela === 'form' && S.caixas.length > 1 ? 'Meus caixas' : 'Início do app' });
  }
  var avisos = '';
  if (S.msg) avisos += '<div class="aviso erro" role="alert">' + h(S.msg) + '</div>';
  else if (S.info) avisos += '<div class="aviso info" role="status">' + h(S.info) + '</div>';

  var t = S.tela, tela = '';
  if (t === 'abrindo') tela = '<div class="carregando">Abrindo…</div>';
  else if (t === 'erro') tela = '<h1 class="fin-h1">Prestar contas</h1><div class="fin-rodape"><button type="button" class="btn" data-acao="recarregar">Tentar de novo</button></div>';
  else if (t === 'lista') {
    tela = '<h1 class="fin-h1">Prestar contas</h1>' + (S.caixas.length
      ? '<span class="fin-sub">Escolha o caixa.</span>' + S.caixas.map(cartaoDoCaixa).join('')
      : '<div class="aviso info">Você não tem caixa aberto para prestar contas agora.</div>');
  }
  else if (t === 'form') tela = telaForm();
  else if (t === 'feito') tela = telaFeito();
  else if (t === 'confirmarEnvio') tela = telaConfirmarEnvio();
  else if (t === 'enviado') tela = telaEnviado();

  /* O foco e a rolagem do formulário sobrevivem ao redesenho: ele só roda em ação (foto, salvar, erro), e nunca a cada
     letra digitada (a digitação só atualiza F e o texto embaixo do botão). */
  var rolagem = window.pageYOffset;
  corpo.innerHTML = avisos + tela + '<div id="ajuda"></div>';
  Casca.ajuda($('ajuda'), AJUDA);
  if (S._ultimaTela !== t) window.scrollTo(0, 0); else window.scrollTo(0, rolagem);
  S._ultimaTela = t;
  guardarRascunho();
}

/* Texto embaixo do botão e botão apagado/aceso acompanham a digitação SEM redesenhar (redesenhar tira o foco do campo). */
function atualizarBotao() {
  var b = document.querySelector('[data-acao="salvar"]'); if (!b) return;
  var falta = oQueFalta();
  b.disabled = !!falta || S.ocupado;
  var p = document.querySelector('.fin-falta');
  if (falta) {
    if (!p) { p = document.createElement('p'); p.className = 'fin-falta'; b.parentNode.appendChild(p); }
    p.textContent = falta;
  } else if (p) p.parentNode.removeChild(p);
}

// ---------------------------------------------------------------------------
//  Eventos (delegados: a tela é redesenhada e os botões mudam)
// ---------------------------------------------------------------------------

function ligar() {
  var corpo = $('corpo');
  corpo.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-acao]') : null;
    if (!el || el.disabled) return;
    var a = el.getAttribute('data-acao');
    if (a === 'caixa') return abrirCaixa(el.getAttribute('data-id'));
    if (a === 'foto') { $('arquivoFoto').value = ''; return $('arquivoFoto').click(); }
    if (a.indexOf('tirarFoto-') === 0) { F.fotos.splice(parseInt(a.slice(10), 10), 1); F.chave = novaChave(); return desenhar(); }
    if (a === 'salvar') return salvar();
    if (a === 'outra') { S.msg = ''; S.tela = 'form'; return desenhar(); }
    if (a === 'querEnviar') { S.chaveEnvio = novaChave(); S.msg = ''; S.tela = 'confirmarEnvio'; return desenhar(); }
    if (a === 'enviarMesmo') return enviarPrestacao();
    if (a === 'recarregar') return carregarCaixas();
    if (a === 'sair') return Casca.voltar();
  });
  /* Digitar não redesenha. A chave de repetição muda quando a pessoa mexe num campo depois de uma tentativa: se o
     primeiro envio tivesse chegado, devolver o resultado antigo engoliria a correção dela em silêncio. */
  var aoMudar = function (e) {
    var campo = e.target && e.target.getAttribute ? e.target.getAttribute('data-campo') : null;
    if (!campo) return;
    F[campo] = e.target.value;
    F.chave = novaChave();
    atualizarBotao(); guardarRascunho();
  };
  corpo.addEventListener('input', aoMudar);
  corpo.addEventListener('change', aoMudar);
  $('arquivoFoto').addEventListener('change', function (e) { tirarFoto(e.target.files && e.target.files[0]); });
}

function iniciar() {
  ligar();
  Casca.iniciar('financeiro').then(function (r) {
    S.pessoa = (r && r.pessoa) || null;
    return carregarCaixas();
  }).catch(function () {
    S.tela = 'erro'; S.msg = 'Não consegui abrir o Financeiro agora. Tente de novo.'; desenhar();
  });
}

iniciar();
