/* tela.js — a conversa com o assistente do Suporte no App Compel (13/11/2026).
 *
 * Por que é assim:
 *   - É conversa, e não formulário (Dalton, 12/11: "quero um chat mesmo no app, como uma outra aba muito mais
 *     intuitiva"): saudação, quatro escolhas rápidas, a caixa de escrever presa no pé e o "Falar com uma pessoa".
 *   - Tudo vai ao servidor do Suporte pelo Casca.postarComSessao (casca 1.20.0): a sessão e o token ficam com a casca
 *     e nunca passam por aqui (FRONTEIRA §2.1). A primeira pergunta é que gasta o token do Núcleo, e não a abertura.
 *   - Sem sinal, nada é guardado: resposta que chega horas depois confunde mais do que ajuda (proposta do Suporte,
 *     aceita pelo App em 13/11). A conversa também não é guardada no celular: a pergunta é frase da pessoa.
 *   - Todo texto que vem do servidor entra por textContent. Trecho de documento e resposta do SGI são texto de
 *     terceiros; montados por innerHTML, um "<" executaria.
 */
'use strict';
var S = { pessoa: null, ocupado: false, ultima: null };
var LIMITE = 500;                       // o mesmo ASSISTENTE_PERGUNTA_MAX do servidor (Assistente.gs, 06/11/2026)
var ESPERA_MS = 90000;                  // a do postar da casca; o modelo pode levar alguns segundos
var TELEFONE_SGI = '(21) 96620-8740';   // reserva só para antes da primeira resposta; depois vale o que o servidor manda

function $(id) { return document.getElementById(id); }
function el(tag, classe, texto) {
  var e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined && texto !== null) e.textContent = String(texto);
  return e;
}
/* Link de documento só do Dropbox, como na tela do navegador: um href vindo de dado nunca pode ser javascript:. */
function linkDeDocumento(u) { return /^https:\/\/(www\.)?dropbox\.com\//.test(String(u || '')) ? String(u) : ''; }
/* "tel:" só com algarismos: o telefone vem de uma planilha que gente edita. */
function linkDeTelefone(t) {
  var d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return 'tel:+55' + d;
  if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) return 'tel:+' + d;
  return '';
}

/* ---------- o começo ---------- */
Casca.iniciar('suporte').then(function (r) {
  S.pessoa = r.pessoa;
  desenharTela();
  saudar();
});

function desenharTela() {
  var corpo = $('corpo');
  corpo.textContent = '';
  corpo.appendChild(el('h1', 'spt-h1', 'Dúvidas'));
  corpo.appendChild(el('p', 'spt-sub', 'Assistente do Suporte: procura a resposta nos documentos do SGI.'));
  // A ajuda fica no alto, e não depois da caixa presa no pé: lá ela some atrás da caixa (visto no Chromium, 13/11/2026).
  var ajuda = el('div', '');
  ajuda.id = 'ajuda';
  corpo.appendChild(ajuda);
  var conversa = el('div', 'spt-conversa');
  conversa.id = 'conversa';
  conversa.setAttribute('role', 'log');
  conversa.setAttribute('aria-live', 'polite');
  corpo.appendChild(conversa);

  var pe = el('form', 'spt-pe');
  pe.id = 'pe';
  pe.setAttribute('novalidate', '');
  var rot = el('label', '', 'Sua dúvida');
  rot.setAttribute('for', 'texto');
  pe.appendChild(rot);
  var linha = el('div', 'spt-linha');
  var caixa = el('textarea', 'spt-texto');
  caixa.id = 'texto';
  caixa.rows = 1;
  caixa.maxLength = LIMITE;
  caixa.setAttribute('enterkeyhint', 'send');
  caixa.setAttribute('placeholder', 'Ex.: como peço vale-transporte?');
  var enviar = el('button', 'btn auto spt-enviar', 'Enviar');
  enviar.type = 'submit';
  enviar.id = 'enviar';
  linha.appendChild(caixa);
  linha.appendChild(enviar);
  pe.appendChild(linha);
  var conta = el('small', 'spt-conta', '0 de ' + LIMITE);
  conta.id = 'conta';
  pe.appendChild(conta);
  corpo.appendChild(pe);

  Casca.ajuda(ajuda, 'Escreva a dúvida como falaria com um colega e toque em Enviar. O assistente procura nos documentos ' +
    'do SGI e mostra de onde tirou a resposta. Se não resolver, toque em "Falar com o SGI": a pergunta vai para uma ' +
    'pessoa, e a resposta aparece em "Minhas perguntas". Erro numa tela do app se relata pelo "!" no alto. ' +
    'Esta conversa precisa de sinal e não fica guardada no celular.');

  caixa.addEventListener('input', function () { ajustarCaixa(); });
  caixa.addEventListener('keydown', function (ev) {
    // Enter manda; Shift+Enter quebra a linha (o teclado do celular mostra "enviar" pelo enterkeyhint).
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); mandarPergunta(); }
  });
  pe.addEventListener('submit', function (ev) { ev.preventDefault(); mandarPergunta(); });
  ajustarCaixa();
}

function ajustarCaixa() {
  var c = $('texto');
  c.style.height = 'auto';
  c.style.height = Math.min(140, c.scrollHeight + 3) + 'px';
  $('conta').textContent = c.value.length + ' de ' + LIMITE;
  $('enviar').disabled = S.ocupado || !c.value.trim();
}

function rolarParaOFim() {
  var p = $('pe');
  if (p && p.scrollIntoView) p.scrollIntoView({ block: 'end' });
}

/* Uma fala do assistente. `selo` é o rótulo pequeno em cima (de onde veio a resposta). */
function falaDoAssistente(texto, selo) {
  var b = el('div', 'spt-bolha');
  if (selo) b.appendChild(el('span', 'spt-selo', selo));
  if (texto) b.appendChild(document.createTextNode(texto));
  $('conversa').appendChild(b);
  rolarParaOFim();
  return b;
}
function falaDaPessoa(texto) {
  var b = el('div', 'spt-bolha spt-eu', texto);
  $('conversa').appendChild(b);
  rolarParaOFim();
}
function acao(rotulo, quando, forte) {
  var b = el('button', 'spt-acao' + (forte ? ' spt-forte' : ''), rotulo);
  b.type = 'button';
  b.addEventListener('click', quando);
  return b;
}

/* ---------- a saudação e as escolhas rápidas ---------- */
function saudar() {
  var nome = String((S.pessoa && S.pessoa.nome) || '').split(' ')[0];
  var b = falaDoAssistente('Olá' + (nome ? ', ' + nome : '') + '! Sou o assistente do Suporte. Escreva sua dúvida ou escolha um assunto.');
  var grade = el('div', 'spt-escolhas');
  grade.id = 'escolhas';
  [['procedimento', 'Dúvida de procedimento'], ['erro', 'Erro numa tela do app'], ['pessoa', 'Falar com uma pessoa'], ['minhas', 'Minhas perguntas']].forEach(function (x) {
    var e = el('button', 'spt-escolha', x[1]);
    e.type = 'button';
    e.setAttribute('data-escolha', x[0]);
    e.addEventListener('click', function () { escolher(x[0], x[1]); });
    grade.appendChild(e);
  });
  b.appendChild(grade);
}

function escolher(qual, rotulo) {
  falaDaPessoa(rotulo);
  if (qual === 'procedimento') {
    falaDoAssistente('Escreva a dúvida com as suas palavras, como falaria com um colega. Exemplo: "como peço vale-transporte?" ou "qual o prazo para entregar o atestado?".');
    $('texto').focus();
  } else if (qual === 'erro') {
    falaDoAssistente('Para erro numa tela, toque no "!" no alto da tela: ele manda ao SGI o que aconteceu e a foto da tela. Se for dúvida de como fazer alguma coisa, escreva aqui embaixo.');
  } else if (qual === 'pessoa') {
    mostrarQuemResponde();
  } else if (qual === 'minhas') {
    mostrarMinhasPerguntas();
  }
}

/* ---------- conversar com o servidor ---------- */
/* Toda ida ao servidor passa aqui: a espera com os três pontos, a trava contra o toque duplo e a frase de cada falha.
   A casca devolve a falha de rede como resposta (nunca como exceção); o catch é só a rede de segurança. */
function conversar(corpo, textoDaEspera, aoResponder, repetir) {
  if (S.ocupado) return;
  S.ocupado = true;
  ajustarCaixa();
  var espera = el('div', 'spt-bolha spt-pensando');
  espera.setAttribute('role', 'status');
  var pontos = el('span', 'spt-pontos');
  pontos.setAttribute('aria-hidden', 'true');
  pontos.appendChild(el('i')); pontos.appendChild(el('i')); pontos.appendChild(el('i'));
  espera.appendChild(pontos);
  espera.appendChild(el('span', '', textoDaEspera));
  $('conversa').appendChild(espera);
  rolarParaOFim();
  function fim() { if (espera.parentNode) espera.parentNode.removeChild(espera); S.ocupado = false; ajustarCaixa(); }
  Casca.postarComSessao(corpo, ESPERA_MS).then(function (r) {
    fim();
    if (r && r.ok) { aoResponder(r); return; }
    mostrarFalha(r, repetir);
  }, function () {
    fim();
    mostrarFalha({ ok: false, semRede: true }, repetir);
  });
}

function mostrarFalha(r, repetir) {
  r = r || {};
  var texto, podeRepetir = !!repetir;
  if (r.semSinal) texto = 'Sem sinal agora. A conversa precisa de sinal, e nada ficou guardado no celular. Tente de novo quando o sinal voltar.';
  else if (r.semRede || r.servidorFora) texto = 'Não consegui falar com o Suporte agora. Tente de novo em instantes.';
  else if (r.enderecoMudou || r.servidorRecusado || r.semEndereco || r.semMatricula || r.termo || r.outraPessoa) { texto = r.erro || r.msg || 'Não consegui abrir a conversa. Avise a administração.'; podeRepetir = false; }
  else texto = r.erro || 'Não consegui completar. Tente de novo.';
  var b = falaDoAssistente(texto);
  var acoes = el('div', 'spt-acoes');
  if (podeRepetir) acoes.appendChild(acao('Tentar de novo', function () { acoes.textContent = ''; repetir(); }, true));
  acoes.appendChild(telefoneDoSgi(TELEFONE_SGI));
  b.appendChild(acoes);
}

function telefoneDoSgi(tel) {
  var a = el('a', 'spt-acao', 'Ligar para o SGI ' + tel);
  var href = linkDeTelefone(tel);
  if (href) a.href = href;
  return a;
}

/* ---------- a pergunta ---------- */
function mandarPergunta() {
  var c = $('texto');
  var texto = c.value.replace(/\s+/g, ' ').trim();
  if (!texto || S.ocupado) return;
  falaDaPessoa(texto);
  c.value = '';
  ajustarCaixa();
  perguntar(texto);
}

function perguntar(texto) {
  conversar({ acao: 'perguntar', texto: texto }, 'Procurando nos documentos…', function (r) { mostrarResposta(r, texto); },
    function () { perguntar(texto); });
}

function mostrarResposta(r, digitado) {
  S.ultima = r;
  if (r.pergunta && r.pergunta !== digitado) {
    falaDoAssistente('Tirei da sua pergunta um e-mail ou número comprido (CPF, telefone, matrícula) antes de procurar.');
  }
  if (r.caderno && r.caderno.resposta) {
    var bc = falaDoAssistente(r.caderno.resposta, 'Confirmada pelo SGI');
    if (r.caderno.fonte) bc.appendChild(el('span', 'spt-nota', 'Fonte: ' + r.caderno.fonte));
  }
  if (r.resposta) {
    var br = falaDoAssistente(r.resposta, 'Resposta do assistente');
    br.appendChild(el('span', 'spt-nota', 'Escrita só com os trechos dos documentos. Confira no documento antes de agir.'));
  }
  if (r.semModelo && r.motivoSemModelo && !r.resposta) falaDoAssistente(r.motivoSemModelo);
  var trechos = r.trechos || [];
  if (trechos.length) {
    var bt = falaDoAssistente('', r.caderno || r.resposta ? 'De onde veio' : 'Nos documentos do SGI');
    trechos.slice(0, 2).forEach(function (t) { bt.appendChild(cartaoDeTrecho(t)); });
    if (trechos.length > 2) {
      var mais = acao('Ver mais ' + (trechos.length - 2) + (trechos.length - 2 === 1 ? ' trecho' : ' trechos'), function () {
        mais.parentNode.removeChild(mais);
        trechos.slice(2).forEach(function (t) { bt.appendChild(cartaoDeTrecho(t)); });
      });
      bt.appendChild(mais);
    }
  }
  if (!r.caderno && !r.resposta && !trechos.length) {
    falaDoAssistente('Não achei isso nos documentos que li. Uma pessoa do SGI pode responder.');
  }
  depoisDaResposta(r);
}

function cartaoDeTrecho(t) {
  var c = el('div', 'spt-trecho');
  c.appendChild(el('b', '', [t.codigo, t.titulo].filter(Boolean).join(' · ')));
  var meta = [t.revisao ? 'rev. ' + t.revisao : '', t.data, t.status, t.secao].filter(Boolean).join(' · ');
  if (meta) c.appendChild(el('small', '', meta));
  c.appendChild(el('p', '', t.texto || ''));
  var link = linkDeDocumento(t.link);
  if (link) {
    var a = el('a', '', 'Abrir o documento');
    a.href = link; a.target = '_blank'; a.rel = 'noopener';
    c.appendChild(a);
  }
  return c;
}

/* "Isso respondeu?" aparece com qualquer resposta (decisão do Dalton, 06/11/2026, na tela do navegador), e o caminho
   para uma pessoa nunca some: a avaliação que falha não trava o "Falar com o SGI". */
function depoisDaResposta(r) {
  var tel = r.telefone || TELEFONE_SGI;
  var b = falaDoAssistente('Isso respondeu a sua dúvida?');
  var aval = el('div', 'spt-acoes');
  var sim = acao('Sim, resolveu', function () { avaliar(true); });
  var nao = acao('Não', function () { avaliar(false); });
  aval.appendChild(sim); aval.appendChild(nao);
  b.appendChild(aval);
  var humano = el('div', 'spt-acoes');
  var falar = acao('Falar com o SGI', function () { falarComSgi(r, falar); }, true);
  falar.setAttribute('data-falar', '1');
  humano.appendChild(falar);
  humano.appendChild(telefoneDoSgi(tel));
  b.appendChild(humano);
  b.appendChild(el('span', 'spt-nota', r.foraDoHorario
    ? 'Agora está fora do horário do SGI (8h às 16h, de segunda a sexta): a pergunta fica na fila e é respondida a partir das 8h.'
    : 'O SGI atende de 8h às 16h, de segunda a sexta.'));

  function avaliar(atendeu) {
    if (sim.disabled) return;
    sim.disabled = true; nao.disabled = true;
    Casca.postarComSessao({ acao: 'avaliar', texto: r.pergunta, atendeu: atendeu === true, cadernoId: r.caderno ? r.caderno.id : '' }, ESPERA_MS).then(function (x) {
      if (!x || !x.ok) { sim.disabled = false; nao.disabled = false; falaDoAssistente('Não consegui registrar agora. Tente de novo.'); return; }
      falaDoAssistente(atendeu ? 'Obrigado por avisar. Que bom que ajudou.' : 'Obrigado por avisar. Toque em "Falar com o SGI" para uma pessoa responder.');
      if (!atendeu) falar.focus();
    }, function () { sim.disabled = false; nao.disabled = false; });
  }
}

function falarComSgi(r, botao) {
  if (botao.disabled || S.ocupado) return;
  botao.disabled = true;
  var mostrados = (r.trechos || []).map(function (t) { return t.codigo; }).join(', ');
  conversar({ acao: 'falarComSgi', texto: r.pergunta, mostrados: mostrados }, 'Mandando ao SGI…', function () {
    botao.textContent = 'Mandado ao SGI';
    falaDoAssistente('Mandei sua pergunta ao SGI. A resposta aparece em "Minhas perguntas", aqui nesta tela.');
  }, function () { botao.disabled = false; falarComSgi(r, botao); });
}

/* ---------- quem responde e minhas perguntas ---------- */
function mostrarQuemResponde() {
  conversar({ acao: 'quemResponde' }, 'Buscando os contatos…', function (r) {
    var itens = r.itens || [];
    var b = falaDoAssistente(itens.length ? 'Quem responde por cada assunto:' : 'Ainda não há setores com telefone cadastrados. O SGI encaminha a sua dúvida.');
    itens.forEach(function (s) {
      var d = el('div', 'spt-setor');
      d.appendChild(el('b', '', s.setor + (s.responsavel ? ' — ' + s.responsavel : '')));
      if (s.assuntos) d.appendChild(el('span', 'spt-nota', s.assuntos));
      var linha = el('span', 'spt-nota');
      var href = linkDeTelefone(s.telefone);
      if (href) { var a = el('a', '', s.telefone); a.href = href; linha.appendChild(a); }
      else linha.appendChild(document.createTextNode(s.telefone || ''));
      if (s.horario) linha.appendChild(document.createTextNode(' · ' + s.horario));
      d.appendChild(linha);
      b.appendChild(d);
    });
    var acoes = el('div', 'spt-acoes');
    acoes.appendChild(telefoneDoSgi(TELEFONE_SGI));
    b.appendChild(acoes);
    b.appendChild(el('span', 'spt-nota', 'Para mandar por escrito: escreva a dúvida embaixo e, na resposta, toque em "Falar com o SGI".'));
  }, function () { mostrarQuemResponde(); });
}

function mostrarMinhasPerguntas() {
  conversar({ acao: 'minhasPerguntas' }, 'Buscando as suas perguntas…', function (r) {
    var itens = r.itens || [];
    if (!itens.length) { falaDoAssistente('Você ainda não mandou pergunta ao SGI. Quando mandar, a resposta aparece aqui.'); return; }
    var b = falaDoAssistente('', 'Suas perguntas ao SGI');
    itens.slice(0, 10).forEach(function (q) {
      var d = el('div', 'spt-trecho');
      d.appendChild(el('b', '', q.pergunta));
      d.appendChild(el('small', '', q.estado === 'RESPONDIDA' ? 'Respondida' : 'Aguardando o SGI'));
      if (q.resposta) d.appendChild(el('p', '', q.resposta));
      b.appendChild(d);
    });
    if (itens.length > 10) b.appendChild(el('span', 'spt-nota', 'Mostrando as 10 mais recentes de ' + itens.length + '.'));
  }, function () { mostrarMinhasPerguntas(); });
}
