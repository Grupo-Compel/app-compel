/* tela.js — a tela do celular do bloco Segurança (23/10/2026). Funciona sem sinal.
 *
 * O que a pessoa vê depende de duas coisas que vêm de fora, e nenhuma é decidida aqui:
 *   - a FUNÇÃO (do Núcleo, pelo pacote): EPI/EPC sempre; luvas diário ou semanal; veicular para quem dirige (D1, D2);
 *   - o PERFIL no módulo (da ACESSOS, pelo pacote): o modo inspetor (SQP, Blitz, DDS na base) e a equipe do dia do
 *     encarregado (D4, D20).
 * Sem o pacote (primeira vez, sem sinal), a tela mostra o mínimo — o checklist de EPI/EPC com a lista que vem no
 * próprio bloco — e diz que falta abrir com sinal uma vez.
 *
 * Toda tela tem a ajuda dela (Casca.ajuda). Todo registro leva o carimbo da casca (quem fez e em nome de quem) e um ID
 * que nasce aqui: o servidor não grava duas vezes o mesmo ID.
 */
'use strict';
var S = { tela: 'inicio', pessoa: null, pacote: null, sessaoOk: false, msg: '', form: null, alvo: null, contexto: null, registros: [], lido: null };

function $(id) { return document.getElementById(id); }
/* Escapa também as aspas: o texto entra em atributos (data-m, data-k, value). O textContent→innerHTML não escapa
   aspas, e uma matrícula forjada no #ctx (`x" autofocus onfocus="…`) virava código na origem do app, onde moram as
   sessões (revisão de 23/10/2026). */
function h(t) { return String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function novoId(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
/* O dia no fuso da BASE da pessoa, que a casca entrega desde a 1.7 (Casca.pessoa().fuso, o mesmo fuso que fecha a
   entrada do dia). Antes, era o fuso do celular: um celular do Rio levado a Dourados (UTC−4) mudava de dia uma hora
   antes, e o checklist das 23h30 caía no dia seguinte. O fuso do celular fica só para casca antiga, sem o campo. */
function hoje() {
  var f = S.pessoa && S.pessoa.fuso;
  if (!f) { try { f = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { f = 'America/Sao_Paulo'; } }
  return diaNoFuso(new Date(), f);
}
function ehDe(perfis) { var p = S.pacote && S.pacote.pessoa && S.pacote.pessoa.perfil; return perfis.indexOf(p) >= 0; }
/* A resposta da Blitz é guardada pelo NOME do item, e não pela posição: o pacote é relido a cada 20 s, e o item que o
   SESMT acrescentou no meio passava a resposta "não conforme" para o item vizinho (revisão de 23/10/2026). */
// Pelo código, e não por escape no texto: a cópia de guarda no Drive troca os escapes pelo caractere (procedimento do
// Drive, 21/10/2026), e o arquivo deixaria de bater com o md5 do que foi testado.
var SEP_BLITZ = String.fromCharCode(0x241F);
function chaveBlitz(cat, item) { return cat + SEP_BLITZ + item; }
var INSPECIONA = ['INSPETOR', 'SUPERVISOR', 'COORDENADOR', 'GERENTE', 'ADMIN'], FAZ_POR_OUTRO = ['ENCARREGADO', 'SUPERVISOR', 'COORDENADOR', 'GERENTE', 'ADMIN'];

/* ---------- o começo ---------- */
Casca.iniciar('seguranca').then(function (r) {
  S.pessoa = r.pessoa;
  S.contexto = lerContexto(r.contexto);
  return segGravarConfig('ultimaMatricula', r.pessoa.matricula).then(carregarLocal).then(recuperarRascunho).then(function () {
    desenhar();
    /* Quando o sinal volta, a casca já manda a fila sozinha; a tela pede de novo para saber o resultado e mostrar o
       contador certo (a casca não avisa a tela quando termina um envio). E a cada 20 s a tela relê o banco do bloco: o
       envio em segundo plano também muda o que espera. Só redesenha a tela de início e a da fila, para não apagar o que
       alguém está preenchendo. */
    Casca.aoMudarOSinal(function (comSinal) { if (comSinal) garantirSessao().then(function () { enviarEAtualizar(0); }); });
    setInterval(function () { carregarLocal().then(redesenharSeSeguro); }, 20000);
    return garantirSessao();
  }).then(function () { desenhar(); if (Casca.sinal()) Casca.pedirEnvio().then(function () { return carregarLocal(); }).then(desenhar); });
});

/* A sessão em si fica com a casca, e não aqui (casca 1.7): este banco guarda só a marca "a sessão desta pessoa
   funcionou", com o valeAte e o perfil que o servidor devolveu. A marca é apagada pelo envio quando o servidor
   responde sessaoExpirada (envio.js), e é isso que faz a tela pedir outra. A releitura de 20 s só DESLIGA o
   S.sessaoOk (a marca sumiu ou venceu); quem liga é o garantirSessao, que confere também a casca. */
function marcaValida(m) { return !!(m && m.valeAte && m.valeAte > new Date().toISOString()); }
function carregarLocal() {
  return Promise.all([segConfig('pacote'), SEG_BANCO.listar('registros'), segConfig('sessao:' + S.pessoa.matricula)]).then(function (v) {
    S.pacote = v[0] || null; S.registros = v[1] || [];
    if (!marcaValida(v[2])) S.sessaoOk = false;
  });
}

/* A sessão no servidor do módulo. Quem a cria é a CASCA (1.7): ela confere o endereço, pede o token do Núcleo e o posta
   ao servidor SEGURANCA (acao 'sessaoDoNucleo'), sem que o token nem a sessão passem por este código (FRONTEIRA §2.1,
   regra 1). Cada sessaoNova gasta um token do Núcleo, então ela só é chamada quando falta: a casca não tem sessão
   (Casca.temSessao), ou tem mas o servidor já disse que venceu (a marca local apagada pelo envio). As duas são
   conferidas porque uma pode sumir sem a outra: a casca guarda a sessão num banco dela, e uma marca sozinha deixaria a
   fila presa em "falta entrar" para sempre. Casca sem
   temSessao/sessaoNova (anterior à 1.7): a tela funciona e guarda tudo, e a fila espera a atualização do app. */
function garantirSessao() {
  if (S.sessaoOk || !Casca.sinal()) return Promise.resolve();
  if (typeof Casca.sessaoNova !== 'function' || typeof Casca.temSessao !== 'function') { S.msg = 'semCasca'; return Promise.resolve(); }
  var mat = S.pessoa.matricula;
  return Promise.all([Casca.temSessao(), segConfig('sessao:' + mat)]).then(function (v) {
    var t = v[0] || {}, marca = v[1];
    if (t.tem && marcaValida(marca)) { S.sessaoOk = true; return; }
    return Casca.sessaoNova({}).then(function (r) {
      if (!r || !r.ok) { S.msg = mensagemDaSessao(r); return; }
      S.sessaoOk = true; S.msg = '';
      return segGravarConfig('sessao:' + mat, { valeAte: r.valeAte, perfil: r.perfil }).then(function () { return Casca.pedirEnvio(); }).then(carregarLocal);
    });
  }).catch(function () { S.msg = 'Não consegui abrir a sessão agora.'; });
}
/* As marcas da casca 1.7 viram frase de quem está no sol: o "erro" da casca já vem em português, e só o sem sinal
   ganha a frase da Segurança, porque nele nada se perde (tudo fica guardado e sobe depois). */
function mensagemDaSessao(r) {
  if (r && r.semSinal) return 'Sem sinal agora. Tudo fica guardado neste celular e sobe quando o sinal voltar.';
  return (r && r.erro) || 'O servidor da Segurança não abriu a sessão.';
}

/* O contexto de quem abriu: o diário da Operação abre esta tela com a equipe do dia (FRONTEIRA §5.4, "uma tela, duas
   portas"), pela Casca.abrirBloco. Quem lê o fragmento é a casca (1.7), que já recusa CPF, token, sessão e senha e o
   que passa de 8.000 caracteres; chega aqui pelo Casca.iniciar().contexto. A forma combinada com a Operação:
   { porta: 'operacao', base, prefixo, placa, equipe: [{ matricula, nome, funcao }] }. Sem contexto, é a porta do
   menu Segurança. */
function lerContexto(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.equipe)) return null;
  /* A conferência da casca é de segredo, e não de forma: qualquer um monta um link. Só passa o que tem a forma
     esperada — matrícula só com algarismos, textos curtos —, e o resto é jogado fora em vez de chegar à tela. */
  var curto = function (v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n || 80); };
  return { porta: curto(c.porta, 20), base: curto(c.base, 20).toUpperCase(), prefixo: curto(c.prefixo, 30), placa: curto(c.placa, 10).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    equipe: c.equipe.filter(function (p) { return p && /^\d{1,10}$/.test(String(p.matricula)); }).slice(0, 30).map(function (p) { return { matricula: String(p.matricula), nome: curto(p.nome), funcao: curto(p.funcao) }; }) };
}

/* ---------- o que a pessoa deve hoje ---------- */
function exigencias(funcao, matricula) {
  var p = S.pacote;
  if (!p) return { epi: true, luvas: 'NAO', veicular: false };
  var euMesmo = !matricula || String(matricula) === String(p.pessoa.matricula);
  /* A Operação manda a equipe do dia SEM a função (carta nº 1 da Operação, 24/10/2026: nenhuma fonte de campo dela tem
     a função). Função vazia de OUTRA pessoa não pode virar a função de quem está no celular — o ajudante herdaria o
     teste de luvas do encarregado de linha viva, ou o perderia. Sem a função, vale o mínimo de todo mundo, o EPI/EPC,
     até o pacote trazer a função pela matrícula (funcaoDe, quando o Treinamentos/Núcleo der a fonte). */
  if (!funcao && !euMesmo) funcao = (p.funcaoDe || {})[String(matricula)] || '';
  if (!funcao && !euMesmo) return { epi: true, luvas: 'NAO', veicular: false, semFuncao: true };
  if (euMesmo && (!funcao || funcao === p.pessoa.funcao)) return p.exigencias;
  var f = (p.funcoes || []).filter(function (x) { return normalizar(x.funcao) === normalizar(funcao); })[0];
  return f ? f.exige : { epi: true, luvas: 'NAO', veicular: false };
}
function normalizar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function feitoHoje(tipo, matricula) {
  return S.registros.filter(function (r) { return r.tipo === tipo && r.dia === hoje() && String(r.carimbo.emNomeDe.matricula) === String(matricula); })[0];
}
function devidosHoje(matricula, funcao) {
  var e = exigencias(funcao, matricula), l = [];
  if (e.epi) l.push('epi');
  if (e.luvas === 'DIARIO' || (e.luvas === 'SEMANAL' && !luvasNaSemana(matricula))) l.push('luvas');
  if (e.veicular) l.push('veicular');
  return l;
}
function luvasNaSemana(mat) {
  var d = new Date(hoje() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); var seg = d.toISOString().slice(0, 10);
  return S.registros.some(function (r) { return r.tipo === 'luvas' && r.dia >= seg && String(r.carimbo.emNomeDe.matricula) === String(mat); });
}

/* ---------- desenhar ---------- */
var TITULOS = { inicio: 'Segurança', epi: 'Checklist EPI/EPC', luvas: 'Teste de luvas', veicular: 'Checklist veicular', sqp: 'Inspeção SQP', blitz: 'Blitz de Segurança', dds: 'Presença no DDS', meus: 'Meus dados', equipe: 'Equipe do dia', fila: 'O que falta enviar' };
var AJUDAS = {
  inicio: 'Os checklists que a sua função pede hoje. Verde: feito. O que você faz aqui fica guardado no celular e sobe sozinho quando houver sinal; o número no topo diz quanto ainda espera para subir.',
  epi: 'Marque cada item: OK, com problema (foto e o que houve) ou faltando. O que estiver com problema ou faltando vira pedido para o almoxarifado. Se você avisou e ninguém corrigiu, isso conta a seu favor numa inspeção — salvo EPI: sem o EPI em condição, exerça o direito de recusa.',
  luvas: 'Infle a luva no dispositivo e faça o teste visual contra a luz. Se reprovar, o par sai de uso: tire a foto e avise o almoxarifado.',
  veicular: 'Item por item: aprovado ou reprovado. Reprovado pede foto. Se reprovar um item crítico (os marcados com !), o veículo fica RETIDO: a equipe não sai com ele até um superior liberar no sistema.',
  sqp: 'Escolha o desvio no catálogo: o nível vem da Política, não de você. Cada irregularidade com foto e os envolvidos. O sistema cruza com os checklists do dia de cada envolvido.',
  blitz: 'Escolha o que vai inspecionar (pessoa, veículo ou equipe) e marque item por item. Não conforme pede o motivo e a foto, e vira irregularidade com prazo de correção.',
  dds: 'Escolha a lista do DDS (a que foi impressa com todos da base), fotografe cada página assinada e confira o que ficou em amarelo. Presença só vale com a foto da lista — ela vai junto, como documento.',
  meus: 'O que você fez neste mês, contado neste celular. Sem percentual: o número que vale para a Campanha é o do extrato.',
  equipe: 'Cada pessoa da equipe com o que a função dela pede. Toque no que falta para fazer por ela: o registro fica no nome dela, marcado "feito no celular do encarregado", e no fim pede a foto do SEU rosto.',
  fila: 'Tudo o que foi feito neste celular e ainda não subiu, e o que o servidor recusou (com o motivo). O que espera sobe sozinho quando houver sinal.'
};
function desenhar() {
  var corpo = $('corpo'), t = S.tela;
  var esperando = S.registros.filter(function (r) { return r.estado === 'guardado'; }).length, recusados = S.registros.filter(function (r) { return r.estado === 'recusado'; }).length;
  var topo = '<div class="seg-topo"><button type="button" class="btn fantasma auto" data-acao="' + (t === 'inicio' ? 'voltarApp' : 'inicio') + '">‹ ' + (t === 'inicio' ? 'Início do app' : 'Voltar') + '</button>' +
    '<span class="seg-fila' + (esperando ? ' espera' : '') + '" data-acao="fila">' + (esperando ? esperando + ' para enviar' : 'tudo enviado') + (recusados ? ' · ' + recusados + ' recusado(s)' : '') + '</span></div>' +
    '<h1 class="seg-h1">' + h(S.alvo && t !== 'inicio' && t !== 'equipe' ? TITULOS[t] + ' · ' + S.alvo.nome : TITULOS[t]) + '</h1>';
  var avisos = '';
  if (S.recuperado && S.form) avisos += '<div class="aviso info">Continuando de onde você parou (o app foi fechado no meio).</div>';
  if (S.msg === 'semCasca') avisos += '<div class="aviso atencao">Tudo o que você fizer fica guardado neste celular. O envio ao servidor da Segurança espera uma atualização do app (a sessão do módulo).</div>';
  else if (S.msg) avisos += '<div class="aviso erro">' + h(S.msg) + '</div>';
  if (!S.pacote) avisos += '<div class="aviso info">' + (Casca.sinal() ? 'Baixando os dados da Segurança…' : 'Abra a Segurança com sinal uma vez para baixar os itens da sua função e o catálogo. Até lá, só o checklist de EPI/EPC.') + '</div>';
  var tela = ({ inicio: telaInicio, epi: telaEpi, luvas: telaLuvas, veicular: telaVeicular, sqp: telaSqp, blitz: telaBlitz, dds: telaDds, meus: telaMeus, equipe: telaEquipe, fila: telaFila })[t]();
  corpo.innerHTML = topo + avisos + tela + '<div id="ajuda"></div>';
  Casca.ajuda($('ajuda'), AJUDAS[t]);
  // Volta ao topo só quando a TELA muda: o redesenho de 20 em 20 s não pode jogar para cima quem está rolando a lista.
  if (S._ultimaTela !== t || S._ultimoAlvo !== S.alvo) window.scrollTo(0, 0);
  S._ultimaTela = t; S._ultimoAlvo = S.alvo;
  guardarRascunho();
}
/* "Ocupado" quer dizer que a casca já está mandando (a trava única): espera e pergunta de novo, para o contador da tela
   mostrar o resultado do envio que estava em curso, e não o de antes dele. */
function enviarEAtualizar(n) {
  return Casca.pedirEnvio().then(function (r) {
    if (r && r.ocupado && n < 20) return new Promise(function (ok) { setTimeout(ok, 1000); }).then(function () { return enviarEAtualizar(n + 1); });
    return carregarLocal().then(redesenharSeSeguro);
  });
}
function hora(iso) { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso).slice(11, 16); } }
function redesenharSeSeguro() { if (S.tela === 'inicio' || S.tela === 'fila' || S.tela === 'equipe') desenhar(); }
function ir(t, alvo) { if (S.msg !== 'semCasca') S.msg = ''; S.tela = t; S.alvo = alvo || null; S.form = null; S.lido = null; S.recuperado = false; apagarRascunho(); desenhar(); }

/* ---------- o rascunho ----------
   O formulário pela metade é guardado no banco do bloco a cada redesenho e a cada letra: no Android, abrir a câmera
   costuma matar a página, e o checklist de 40 itens recomeçava do zero (revisão de 23/10/2026). Ao abrir, o rascunho
   de até 12 horas volta para a mesma tela; sair pelo "Voltar" ou salvar o apaga. */
var RASCUNHO_HORAS = 12, _rascunhoTimer = null;
function guardarRascunho() {
  clearTimeout(_rascunhoTimer);
  _rascunhoTimer = setTimeout(function () {
    segGravarConfig('rascunho', S.form ? { tela: S.tela, alvo: S.alvo, form: S.form, em: new Date().toISOString(), matricula: S.pessoa.matricula } : null);
  }, 300);
}
/* Salvo ou abandonado, o rascunho sai na hora, sem a espera de 300 ms do guardar: a página pode morrer logo depois. */
function apagarRascunho() { clearTimeout(_rascunhoTimer); return segGravarConfig('rascunho', null); }
function recuperarRascunho() {
  return segConfig('rascunho').then(function (r) {
    if (!r || !r.form || String(r.matricula) !== String(S.pessoa.matricula)) return;
    if (Date.now() - new Date(r.em).getTime() > RASCUNHO_HORAS * 3600000) return segGravarConfig('rascunho', null);
    S.tela = r.tela; S.alvo = r.alvo || null; S.form = r.form; S.recuperado = true;
  });
}

/* ---------- início ---------- */
function telaInicio() {
  var eu = S.pessoa, dev = devidosHoje(eu.matricula), feitos = dev.filter(function (t) { return feitoHoje(t, eu.matricula); }).length;
  var html = '<p class="n-saudacao">Olá, ' + h(eu.nome.split(' ')[0]) + '.</p>';
  if (ehDe(INSPECIONA)) {
    var p = S.pacote, meta = p.meta || { sqp: 0 }, mes = hoje().slice(0, 7);
    var sqpMes = (p.feitasNoMes && p.feitasNoMes.sqp || 0) + S.registros.filter(function (r) { return r.tipo === 'sqp' && r.estado !== 'enviado' && r.dia.slice(0, 7) === mes; }).length;
    html += '<div class="seg-tiles">' + tile('sqp', 'Inspeção SQP', 'em campo', '⚑') + tile('blitz', 'Blitz', 'na base', '✓') + tile('dds', 'DDS', 'presença pela lista', '☰') + '</div>';
    if (meta.sqp) html += '<div class="cartao seg-meta">' + anel(sqpMes, meta.sqp) + '<div><b>Sua meta do mês</b><br><span class="seg-sub">' + sqpMes + ' de ' + meta.sqp + ' inspeções SQP</span></div></div>';
    var hojeBase = p.hoje || {}, n = Object.keys(hojeBase).length;
    html += '<div class="cartao"><b>Checklists de hoje nas suas bases</b><p class="seg-sub">' + (n ? n + ' pessoa(s) já mandaram (até a última vez que o celular falou com o servidor).' : 'Nenhum checklist chegou ainda hoje.') + ' Quem não fez depende da equipe do dia, que vem da Operação.</p></div>';
  }
  if (S.contexto || ehDe(['ENCARREGADO'])) html += '<button type="button" class="btn secundario" data-acao="equipe">Equipe do dia' + (S.contexto ? ' · ' + h(S.contexto.prefixo || '') : '') + '</button>';
  html += '<div class="cartao seg-meta">' + anel(feitos, dev.length) + '<div><b>Hoje</b><br><span class="seg-sub">' + feitos + ' de ' + dev.length + ' checklists da sua função</span></div></div>';
  html += '<div class="seg-tiles">';
  dev.forEach(function (t) { var f = feitoHoje(t, eu.matricula); html += tile(t, TITULOS[t], f ? 'feito às ' + hora(f.carimbo.feitoEm) + (f.retido ? ' · RETIDO' : '') : 'falta fazer', { epi: '⛑', luvas: '✋', veicular: '🚚' }[t], f ? (f.retido ? 'ruim' : 'ok') : 'pend'); });
  html += tile('meus', 'Meus dados', 'o que você fez no mês', '☺') + '</div>';
  return html;
}
function tile(t, nome, sub, icone, estado) { return '<button type="button" class="seg-tile ' + (estado || '') + '" data-acao="abrir" data-tela="' + t + '"><span class="seg-ico">' + h(icone || '•') + '</span><b>' + h(nome) + '</b><small>' + h(sub) + '</small></button>'; }
function anel(n, de) {
  var C = 2 * Math.PI * 26, f = de ? Math.min(1, n / de) : 0;
  return '<svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="' + n + ' de ' + de + '"><circle cx="32" cy="32" r="26" fill="none" stroke="#E4E6EA" stroke-width="8"/><circle cx="32" cy="32" r="26" fill="none" stroke="#2a78d6" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (C * f).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="15" font-weight="700" fill="#231F20">' + n + '/' + de + '</text></svg>';
}

/* ---------- o carimbo e a gravação ---------- */
function carimboDoAlvo() { return S.alvo ? Casca.carimbo({ matricula: S.alvo.matricula, nome: S.alvo.nome }) : Casca.carimbo(); }
function baseDoRegistro() { return (S.contexto && S.contexto.base) || (S.pacote && S.pacote.pessoa.bases && S.pacote.pessoa.bases[0] !== '*' && S.pacote.pessoa.bases[0]) || (S.pessoa.bases && S.pessoa.bases[0] && (S.pessoa.bases[0].id || S.pessoa.bases[0])) || ''; }
function gravar(reg) {
  reg.dia = hoje(); reg.base = String(baseDoRegistro() || '').toUpperCase(); reg.carimbo = carimboDoAlvo();
  // O botão já fica apagado sem o rosto; a conferência aqui é a segunda trava, para nenhum caminho gravar sem ele.
  if (S.alvo && !reg.fotoRosto) { S.msg = 'Falta a foto do seu rosto.'; desenhar(); return Promise.resolve(false); }
  return segGuardarRegistro(reg).then(function () { return Casca.pedirEnvio(); }).then(function (x) {
    S.msg = ''; return carregarLocal().then(function () { return x; });
  });
}
function concluir(reg, frase) {
  gravar(reg).then(function (x) {
    if (x === false) return;
    var ret = S.alvo ? 'equipe' : 'inicio'; S.tela = ret; S.alvo = null; S.form = null; S.recuperado = false; apagarRascunho(); desenhar();
    var c = $('corpo'), d = document.createElement('div');
    d.className = 'aviso ' + (reg.retido ? 'erro' : 'ok');
    d.textContent = frase + (x && x.esperando ? ' Guardado: sobe quando houver sinal.' : x && x.erro ? ' Guardado: ' + x.erro : ' Enviado.');
    c.insertBefore(d, c.children[2] || null);
  });
}

/* ---------- foto ---------- */
var fotoPendente = null;
function pedirFoto(onde, frente) {
  fotoPendente = onde;
  var i = $('arquivoFoto'); i.setAttribute('capture', frente ? 'user' : 'environment'); i.value = ''; i.click();
}
function aoEscolherFoto(arquivo) {
  var onde = fotoPendente; fotoPendente = null;
  if (!arquivo || !onde) return;
  var idFoto = novoId('foto');
  Casca.foto(arquivo, { linhas: ['Segurança · ' + S.pessoa.nome, new Date().toLocaleString('pt-BR')] }).then(function (f) {
    return segGuardarFoto({ id: idFoto, idRegistro: S.form.id, blob: f.blob, meta: f.meta }).then(function () { onde(idFoto, URL.createObjectURL(f.blob)); desenhar(); });
  });
}

/* ---------- EPI/EPC ---------- */
function itensEpiDa(funcao) {
  var lista = S.pacote ? S.pacote.itensEpi : ITENS_EPI_MINIMOS.map(function (i) { return { item: i, funcoes: [] }; });
  return lista.filter(function (i) { return !i.funcoes.length || i.funcoes.some(function (f) { return normalizar(f) === normalizar(funcao); }); }).map(function (i) { return i.item; });
}
/* A lista que o bloco traz consigo para o primeiro uso sem sinal: os itens que todo mundo de campo usa. A lista
   completa (41 itens, SMS-FORM-051) e a da função chegam no pacote. */
var ITENS_EPI_MINIMOS = ['Capacete de segurança aba total', 'Óculos de segurança lentes incolor', 'Calçado de segurança s/ parte metálica', 'Luva de vaqueta (2 pares)', 'Perneira', 'Protetor auricular', 'Uniforme retardante a chama RF'];
function telaEpi() {
  var f = S.form = S.form || { id: novoId('epi'), tipo: 'epi', estados: {}, fotos: {}, obs: {} };
  var alvo = S.alvo || S.pessoa, itens = itensEpiDa(alvo.funcao || (S.pacote && S.pacote.pessoa.funcao));
  var html = '<div class="cartao"><button type="button" class="btn fantasma auto" data-acao="todosOk">Marcar todos como OK</button></div>';
  itens.forEach(function (it, i) {
    var e = f.estados[it] || '';
    html += '<div class="cartao seg-item"><b>' + h(it) + '</b><div class="seg-tres">' +
      ['ok', 'problema', 'falta'].map(function (x) { return '<button type="button" class="chip' + (e === x ? ' ativo' : '') + '" data-acao="estadoItem" data-i="' + i + '" data-v="' + x + '">' + { ok: 'OK', problema: 'Com problema', falta: 'Faltando' }[x] + '</button>'; }).join('') + '</div>' +
      (e === 'problema' ? '<div class="campo"><input placeholder="O que houve" data-obs="' + i + '" value="' + h(f.obs[it] || '') + '"></div><button type="button" class="btn secundario auto" data-acao="fotoItem" data-i="' + i + '">' + (f.fotos[it] ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' : '') + '</div>';
  });
  var faltam = itens.filter(function (it) { return !f.estados[it]; }).length, semFoto = itens.filter(function (it) { return f.estados[it] === 'problema' && !f.fotos[it]; }).length;
  html += rostoSePreciso(f) + '<button type="button" class="btn" data-acao="salvarEpi"' + (faltam || semFoto || (S.alvo && !f.rosto) ? ' disabled' : '') + '>Salvar checklist</button>' +
    (faltam ? '<p class="seg-sub">Faltam ' + faltam + ' item(ns).</p>' : semFoto ? '<p class="seg-sub">Item com problema precisa de foto.</p>' : '');
  f._itens = itens;
  return html;
}
function rostoSePreciso(f) {
  if (!S.alvo) return '';
  return '<div class="cartao"><b>A foto do seu rosto</b><p class="seg-sub">Você está fazendo por ' + h(S.alvo.nome) + '. O registro fica no nome dele, e a sua foto mostra quem fez (D20).</p><button type="button" class="btn secundario" data-acao="rosto">' + (f.rosto ? 'Foto do rosto tirada ✓' : 'Tirar a foto do meu rosto') + '</button></div>';
}

/* ---------- luvas ---------- */
function telaLuvas() {
  var f = S.form = S.form || { id: novoId('luv'), tipo: 'luvas', classe: '', esquerda: '', direita: '', inflagem: '', visual: '' };
  var sel = function (campo, op) { return '<div class="seg-tres">' + op.map(function (x) { return '<button type="button" class="chip' + (f[campo] === x[0] ? ' ativo' : '') + '" data-acao="campo" data-c="' + campo + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; };
  var reprov = f.inflagem === 'reprovado' || f.visual === 'reprovado';
  return '<div class="cartao"><b>Classe do par</b>' + sel('classe', [['0', '0'], ['2', '2'], ['3', '3'], ['4', '4']]) +
    /* Esquerda e direita em campos separados (23/10/2026): a planilha de hoje tem uma coluna para cada, e a leitura por
       letra do motor da Campanha desalinha a linha quando uma vem vazia (LEITURA §2.4 b). */
    '<div class="seg-dois"><div class="campo"><label>Luva esquerda (nº)</label><input data-campo="esquerda" inputmode="numeric" value="' + h(f.esquerda) + '" placeholder="ex.: 1234"></div>' +
    '<div class="campo"><label>Luva direita (nº)</label><input data-campo="direita" inputmode="numeric" value="' + h(f.direita) + '" placeholder="ex.: 1235"></div></div></div>' +
    '<div class="cartao"><b>Inflagem</b>' + sel('inflagem', [['aprovado', 'Aprovada'], ['reprovado', 'Reprovada']]) + '<b>Teste visual contra a luz</b>' + sel('visual', [['aprovado', 'Aprovado'], ['reprovado', 'Reprovado']]) + '</div>' +
    (reprov ? '<div class="aviso erro">Par reprovado: sai de uso hoje. Tire a foto e avise o almoxarifado.</div><button type="button" class="btn secundario" data-acao="fotoCampo" data-c="foto">' + (f.foto ? 'Foto tirada ✓' : 'Tirar foto do defeito') + '</button>' : '') +
    rostoSePreciso(f) + '<button type="button" class="btn" data-acao="salvarLuvas"' + (!f.classe || !f.inflagem || !f.visual || (reprov && !f.foto) || (S.alvo && !f.rosto) ? ' disabled' : '') + '>Salvar teste</button>';
}

/* ---------- veicular ---------- */
function telaVeicular() {
  var f = S.form = S.form || { id: novoId('vei'), tipo: 'veicular', placa: (S.contexto && S.contexto.placa) || '', tipoV: '', estados: {}, fotos: {}, obs: {} };
  var tipos = S.pacote ? Object.keys(S.pacote.veiculos) : [], crit = (S.pacote ? S.pacote.criticosVeiculo : []).map(normalizar);
  var html = '<div class="cartao"><div class="campo"><label>Placa</label><input data-campo="placa" value="' + h(f.placa) + '" placeholder="ABC1D23" autocapitalize="characters"></div><b>Tipo do veículo</b><div class="seg-chips">' +
    tipos.map(function (t) { return '<button type="button" class="chip' + (f.tipoV === t ? ' ativo' : '') + '" data-acao="campo" data-c="tipoV" data-v="' + h(t) + '">' + h(t) + '</button>'; }).join('') + '</div></div>';
  if (!S.pacote) return html + '<div class="aviso atencao">Os itens de cada tipo de veículo chegam com o pacote. Abra com sinal uma vez.</div>';
  if (!f.tipoV) return html;
  var v = S.pacote.veiculos[f.tipoV], itens = v.itens.concat(v.lataria.map(function (x) { return 'Lataria ' + x; })).concat(v.iluminacao);
  var retidos = [];
  html += '<div class="cartao"><button type="button" class="btn fantasma auto" data-acao="todosOk">Marcar o que falta como aprovado</button></div>';
  itens.forEach(function (it, i) {
    var e = f.estados[it] || '', ehCrit = crit.indexOf(normalizar(it)) >= 0;
    if (e === 'reprovado' && ehCrit) retidos.push(it);
    html += '<div class="cartao seg-item' + (e === 'reprovado' && ehCrit ? ' seg-critico' : '') + '"><b>' + (ehCrit ? '! ' : '') + h(it) + '</b><div class="seg-tres">' +
      ['aprovado', 'reprovado'].map(function (x) { return '<button type="button" class="chip' + (e === x ? ' ativo' : '') + '" data-acao="estadoItem" data-i="' + i + '" data-v="' + x + '">' + (x === 'aprovado' ? 'Aprovado' : 'Reprovado') + '</button>'; }).join('') + '</div>' +
      (e === 'reprovado' ? '<div class="campo"><input placeholder="O que houve" data-obs="' + i + '" value="' + h(f.obs[it] || '') + '"></div><button type="button" class="btn secundario auto" data-acao="fotoItem" data-i="' + i + '">' + (f.fotos[it] ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' : '') + '</div>';
  });
  f._itens = itens; f._retidos = retidos;
  /* O aviso aparece aqui, sem sinal, pela mesma lista que o servidor usa (o pacote): a equipe não pode sair achando
     que está tudo certo só porque o celular ainda não falou com o servidor. */
  if (retidos.length && S.pacote.retencaoLigada) html = '<div class="aviso erro"><div><b>Veículo retido.</b> Item crítico reprovado: ' + h(retidos.join(', ')) + '. A equipe não sai com este veículo até um superior (supervisor, coordenador ou gerente) liberar no sistema. A supervisão é avisada quando isto subir.</div></div>' + html;
  var faltam = itens.filter(function (it) { return !f.estados[it]; }).length, semFoto = itens.filter(function (it) { return f.estados[it] === 'reprovado' && !f.fotos[it]; }).length;
  return html + rostoSePreciso(f) + '<button type="button" class="btn" data-acao="salvarVeicular"' + (faltam || semFoto || (S.alvo && !f.rosto) ? ' disabled' : '') + '>Salvar checklist</button>' +
    (faltam ? '<p class="seg-sub">Faltam ' + faltam + ' item(ns).</p>' : semFoto ? '<p class="seg-sub">Item reprovado precisa de foto.</p>' : '');
}

/* ---------- SQP ---------- */
function telaSqp() {
  var f = S.form = S.form || { id: novoId('sqp'), tipo: 'sqp', equipe: (S.contexto && S.contexto.prefixo) || '', local: '', placa: '', irr: [], busca: '', nova: null };
  var html = '<div class="cartao"><div class="campo"><label>Equipe (prefixo)</label><input data-campo="equipe" value="' + h(f.equipe) + '"></div><div class="campo"><label>Local (endereço ou referência)</label><input data-campo="local" value="' + h(f.local) + '"></div><div class="campo"><label>Placa do veículo da equipe (se houver)</label><input data-campo="placa" value="' + h(f.placa) + '"></div></div>';
  html += '<h2 class="seg-h2">Irregularidades (' + f.irr.length + ')</h2>' + f.irr.map(function (x, i) {
    var d = desvio(x.desvio); return '<div class="cartao seg-item"><b>' + h(x.desvio) + ' · ' + h(d ? d.desvio : '') + '</b><span class="selo">' + h(d ? d.nivel : '') + '</span><p class="seg-sub">Envolvidos: ' + h(x.envolvidos.join(', ') || '—') + (x.solucionadaNaHora ? ' · solucionada na hora' : '') + '</p><button type="button" class="link-texto" data-acao="tirarIrr" data-i="' + i + '">Tirar</button></div>';
  }).join('');
  if (!f.nova) html += '<button type="button" class="btn secundario" data-acao="novaIrr">+ Irregularidade</button>';
  else html += formIrregularidade(f);
  html += '<button type="button" class="btn" data-acao="salvarSqp"' + (f.nova ? ' disabled' : '') + '>Concluir inspeção' + (f.irr.length ? '' : ' sem irregularidade') + '</button>';
  return html;
}
function desvio(id) { return S.pacote && S.pacote.desvios.filter(function (d) { return d.id === id; })[0]; }
function formIrregularidade(f) {
  var n = f.nova, q = normalizar(f.busca);
  var achados = !q ? [] : S.pacote.desvios.filter(function (d) { return normalizar(d.id + ' ' + d.desvio + ' ' + d.area).indexOf(q) >= 0; }).slice(0, 8);
  var equipe = (S.contexto && S.contexto.equipe) || [];
  return '<div class="cartao"><div class="campo"><label>Desvio (procure por palavra: perneira, escada, cone…)</label><input data-campo="busca" value="' + h(f.busca) + '"></div>' +
    achados.map(function (d) { return '<button type="button" class="seg-opcao' + (n.desvio === d.id ? ' ativo' : '') + '" data-acao="escolherDesvio" data-v="' + h(d.id) + '"><b>' + h(d.id) + '</b> ' + h(d.desvio) + ' <span class="selo">' + h(d.nivel === 'sesmt' ? 'a classificar' : d.nivel) + '</span></button>'; }).join('') +
    (n.desvio ? '<p><b>Escolhido:</b> ' + h(n.desvio) + '</p>' : '') +
    '<div class="campo"><label>Matrículas dos envolvidos (separadas por vírgula)</label><input data-nova="envolvidosTxt" inputmode="numeric" value="' + h(n.envolvidosTxt || '') + '"></div>' +
    (equipe.length ? '<div class="seg-chips">' + equipe.map(function (p) { return '<button type="button" class="chip" data-acao="addEnvolvido" data-v="' + h(p.matricula) + '">' + h(p.nome) + '</button>'; }).join('') + '</div>' : '') +
    '<div class="campo"><label>O que viu</label><input data-nova="obs" value="' + h(n.obs || '') + '"></div>' +
    '<button type="button" class="chip' + (n.solucionadaNaHora ? ' ativo' : '') + '" data-acao="alternar" data-c="solucionadaNaHora">Solucionada na hora</button> ' +
    '<button type="button" class="btn secundario auto" data-acao="fotoNova">' + (n.foto ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' +
    '<div class="seg-tres"><button type="button" class="btn auto" data-acao="addIrr"' + (n.desvio && n.foto ? '' : ' disabled') + '>Acrescentar</button><button type="button" class="btn fantasma auto" data-acao="cancelarIrr">Cancelar</button></div></div>';
}

/* ---------- Blitz ---------- */
function telaBlitz() {
  var f = S.form = S.form || { id: novoId('blz'), tipo: 'blitz', alvoTipo: 'pessoa', alvoId: '', cat: '', resp: {}, motivo: {}, fotos: {} };
  if (!S.pacote) return '<div class="aviso atencao">A Blitz precisa do pacote (itens e catálogo). Abra com sinal uma vez.</div>';
  var cats = Object.keys(S.pacote.blitz).filter(function (c) { return f.alvoTipo === 'equipe' || S.pacote.blitz[c][0].alvo === f.alvoTipo; });
  if (cats.indexOf(f.cat) < 0) f.cat = cats[0] || '';
  var html = '<div class="cartao"><div class="seg-tres">' + [['pessoa', 'Pessoa'], ['veiculo', 'Veículo'], ['equipe', 'Equipe']].map(function (x) { return '<button type="button" class="chip' + (f.alvoTipo === x[0] ? ' ativo' : '') + '" data-acao="campo" data-c="alvoTipo" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
    '<div class="campo"><label>' + { pessoa: 'Matrícula', veiculo: 'Placa', equipe: 'Prefixo da equipe' }[f.alvoTipo] + '</label><input data-campo="alvoId" value="' + h(f.alvoId) + '"></div></div>' +
    '<div class="seg-chips">' + cats.map(function (c) { var n = S.pacote.blitz[c].filter(function (it) { return f.resp[chaveBlitz(c, it.item)]; }).length; return '<button type="button" class="chip' + (f.cat === c ? ' ativo' : '') + '" data-acao="campo" data-c="cat" data-v="' + h(c) + '">' + h(c) + ' <b>' + n + '/' + S.pacote.blitz[c].length + '</b></button>'; }).join('') + '</div>';
  (S.pacote.blitz[f.cat] || []).forEach(function (it, i) {
    var k = chaveBlitz(f.cat, it.item), r = f.resp[k];
    html += '<div class="cartao seg-item"><b>' + h(it.item) + '</b><div class="seg-tres">' + ['C', 'NC', 'NA'].map(function (x) { return '<button type="button" class="chip' + (r === x ? ' ativo' : '') + '" data-acao="blitzResp" data-k="' + h(k) + '" data-v="' + x + '">' + { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' }[x] + '</button>'; }).join('') + '</div>' +
      (r === 'NC' ? '<div class="seg-chips">' + S.pacote.motivosNaoConforme.map(function (m) { return '<button type="button" class="chip' + (f.motivo[k] === m ? ' ativo' : '') + '" data-acao="blitzMotivo" data-k="' + h(k) + '" data-v="' + h(m) + '">' + h(m) + '</button>'; }).join('') + '</div><button type="button" class="btn secundario auto" data-acao="blitzFoto" data-k="' + h(k) + '">' + (f.fotos[k] ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' : '') + '</div>';
  });
  var nc = Object.keys(f.resp).filter(function (k) { return f.resp[k] === 'NC'; }), incompletos = nc.filter(function (k) { return !f.motivo[k] || !f.fotos[k]; }).length;
  return html + '<button type="button" class="btn" data-acao="salvarBlitz"' + (!Object.keys(f.resp).length || incompletos ? ' disabled' : '') + '>Concluir Blitz (' + nc.length + ' não conforme)</button>' + (incompletos ? '<p class="seg-sub">Não conforme precisa do motivo e da foto.</p>' : '');
}

/* ---------- DDS ---------- */
function telaDds() {
  /* Só o DDS NA BASE. O DDS em campo é da Operação: o diário marca a presença de toda a equipe e pede a foto da lista
     de presença, revisada na base (decisão 10.10 do Dalton, 24/10/2026, 13h03). Dois donos para a mesma presença
     dariam dois números para o mesmo dia — então, mesmo aberta pela porta da Operação, esta tela registra a base. */
  var f = S.form = S.form || { id: novoId('dds'), tipo: 'dds', onde: 'base', tema: '', lista: '', paginas: {}, conf: {}, manuais: {}, fotoLista: '' };
  var aviso = S.contexto ? '<div class="aviso info">Esta é a presença do DDS feito na base. O DDS em campo, com a equipe, é marcado no diário da Operação, com a foto da lista.</div>' : '';
  var listas = (S.pacote && S.pacote.listasDds) || [];
  if (!listas.length) return aviso + '<div class="aviso atencao">Nenhuma lista do DDS dos últimos 7 dias chegou a este celular. A lista é gerada no sistema (tela "Lista do DDS"), impressa, e chega ao celular no próximo sinal.</div>' +
    '<button type="button" class="btn secundario" data-acao="buscarPacote">Buscar as listas agora</button>';
  var html = aviso + '<div class="cartao"><b>Qual lista?</b>' + listas.map(function (l) { return '<button type="button" class="seg-opcao' + (f.lista === l.id ? ' ativo' : '') + '" data-acao="campo" data-c="lista" data-v="' + h(l.id) + '">' + h(l.base) + ' · ' + h(l.cab.data) + ' · ' + l.pessoas.length + ' pessoas</button>'; }).join('') +
    '<div class="campo"><label>Tema</label><input data-campo="tema" value="' + h(f.tema) + '"></div></div>';
  if (!f.lista) return html;
  var lista = listas.filter(function (l) { return l.id === f.lista; })[0], lays = FolhaLista.layout(lista.pessoas, lista.cab);
  html += '<div class="cartao"><b>Fotografe cada página assinada</b><div class="seg-tres">' + lays.map(function (l, i) { return '<button type="button" class="btn ' + (f.paginas[i + 1] ? 'secundario' : '') + ' auto" data-acao="fotoPagina" data-p="' + (i + 1) + '">Página ' + (i + 1) + (f.paginas[i + 1] ? ' ✓' : '') + '</button>'; }).join('') + '</div>' +
    (S.lido && S.lido.erro ? '<div class="aviso erro">' + h(S.lido.erro) + '</div>' : '') + '</div>';
  var linhas = [];
  Object.keys(f.paginas).forEach(function (p) { (f.paginas[p].linhas || []).forEach(function (l) { linhas.push(l); }); });
  if (!linhas.length) return html;
  var nomes = {}; lista.pessoas.forEach(function (p) { nomes[p.mat] = p.nome; });
  var pend = 0, pres = 0;
  html += '<div class="cartao"><b>O que o celular leu</b>' + linhas.map(function (l) {
    var c = f.conf[l.mat], est = l.estado === 'conferir' ? (c === true ? 'presente' : c === false ? 'ausente' : 'conferir') : l.estado;
    if (est === 'conferir') pend++; if (est === 'presente') pres++;
    /* Só aparece o que pede atenção: a dúvida, e o presente ou ausente com aviso. Os presentes limpos viram um número
       no fim — 57 linhas verdes para rolar no sol escondem a única amarela. */
    if ((est === 'ausente' || est === 'presente') && !(l.avisos || []).length) return '';
    return '<div class="seg-lido ' + est + '"><span><b>' + h(nomes[l.mat] || l.mat) + '</b><small>' + h(est === 'conferir' ? 'Conferir: ' + ((l.avisos || [])[0] || 'bolinha em dúvida') : est + ((l.avisos || []).length ? ' · ' + l.avisos.join(', ') : '')) + '</small></span>' +
      (l.estado === 'conferir' ? '<span><button type="button" class="chip' + (c === true ? ' ativo' : '') + '" data-acao="conf" data-m="' + h(l.mat) + '" data-v="1">Estava</button><button type="button" class="chip' + (c === false ? ' ativo' : '') + '" data-acao="conf" data-m="' + h(l.mat) + '" data-v="0">Não</button></span>' : '') + '</div>';
  }).join('') + '<p class="seg-sub">' + linhas.filter(function (l) { return l.estado === 'presente'; }).length + ' presentes lidos sem dúvida, de ' + linhas.length + ' linhas impressas.</p></div>';
  Object.keys(f.paginas).forEach(function (p) { (f.paginas[p].manuais || []).filter(function (m) { return m.temTinta; }).forEach(function (m) {
    html += '<div class="cartao"><b>Linha ' + m.linha + ', escrita à mão</b><div class="campo"><label>Digite a matrícula que está escrita</label><input data-manual="' + m.linha + '" inputmode="numeric" value="' + h(f.manuais[m.linha] || '') + '"></div></div>';
  }); });
  return html + '<button type="button" class="btn" data-acao="salvarDds"' + (pend ? ' disabled' : '') + '>Enviar presença com a foto da lista (' + (pres + Object.keys(f.manuais).filter(function (k) { return f.manuais[k]; }).length) + ')</button>' + (pend ? '<p class="seg-sub">Confira o que está em amarelo antes de enviar.</p>' : '');
}
/* A leitura da foto, no próprio celular: desenha a foto num canvas e passa os pixels ao leitor (leitor.js). Lida da
   foto ORIGINAL, e não da reduzida que vai como documento: o leitor foi medido com fotos de 1600 a 3000 px de largura. */
function lerPagina(arquivo, pagina) {
  var f = S.form, lista = S.pacote.listasDds.filter(function (l) { return l.id === f.lista; })[0], lays = FolhaLista.layout(lista.pessoas, lista.cab);
  /* A imagem pela casca (cascaCarregarImagem): ela tem o plano B para o navegador sem createImageBitmap (iOS antes do
     15) e para o que recusa a opção de orientação. Sem isso, o toque não fazia nada naquele celular (revisão de 23/10). */
  var carregar = typeof cascaCarregarImagem === 'function' ? cascaCarregarImagem : function (a) { return createImageBitmap(a); };
  return Promise.resolve().then(function () { return carregar(arquivo); }).then(function (img) {
    var esc = Math.min(1, 2400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
    var g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    var r = LeitorLista.ler(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, lays, { paginaEsperada: pagina, idEsperado: lista.cab.id });
    if (!r.ok) { S.lido = r; return; }
    if (r.id && r.id !== lista.cab.id) { S.lido = { erro: 'Esta folha é de outra lista (' + r.id + '). Escolha a lista certa.' }; return; }
    S.lido = null; f.paginas[r.pagina || pagina] = r;
    return Casca.foto(arquivo, { lados: [2000], teto: 450 * 1024, semGps: false }).then(function (ft) {
      var idF = novoId('lista');
      if (!f.fotoLista) f.fotoLista = idF;
      return segGuardarFoto({ id: idF, idRegistro: f.id, blob: ft.blob, meta: ft.meta });
    });
  }).then(desenhar, function (e) { S.lido = { erro: 'Não consegui ler a foto: ' + (e && e.message || e) }; desenhar(); });
}

/* ---------- equipe do dia (porta da Operação) ---------- */
function telaEquipe() {
  var eq = (S.contexto && S.contexto.equipe) || [];
  if (!eq.length) return '<div class="aviso info">A equipe do dia vem do diário da Operação: abra esta tela pela etapa "quem vai trabalhar comigo hoje" do diário.</div>';
  return '<div class="cartao"><b>' + h(S.contexto.prefixo || '') + '</b> · ' + h(S.contexto.placa || '') + '</div>' + eq.map(function (p) {
    var dev = devidosHoje(p.matricula, p.funcao);
    return '<div class="cartao seg-item"><b>' + h(p.nome) + '</b><small class="seg-sub">' + h(p.funcao || '') + '</small><div class="seg-chips">' + dev.map(function (t) {
      var r = feitoHoje(t, p.matricula);
      return '<button type="button" class="chip ' + (r ? 'seg-ok' : 'seg-pend') + '" ' + (r ? '' : 'data-acao="fazerPor" data-t="' + t + '" data-m="' + h(p.matricula) + '"') + '>' + h(TITULOS[t]) + (r ? ' · ' + (r.carimbo.noCelularDeOutro ? 'feito por você' : 'fez') + ' ' + hora(r.carimbo.feitoEm) + (r.retido ? ' · RETIDO' : '') : ' · falta') + '</button>';
    }).join('') + '</div></div>';
  }).join('') + '<p class="seg-sub">"Fez" aqui é o que foi feito neste celular ou já chegou a ele. O que a pessoa fez no celular dela aparece quando os dois tiverem falado com o servidor.</p>';
}

/* ---------- meus dados e fila ---------- */
function telaMeus() {
  var mes = hoje().slice(0, 7), meus = S.registros.filter(function (r) { return r.dia.slice(0, 7) === mes && String(r.carimbo.emNomeDe.matricula) === String(S.pessoa.matricula); });
  var conta = function (t) { return meus.filter(function (r) { return r.tipo === t; }).length; };
  return '<div class="cartao"><b>Neste mês, neste celular</b><p>Checklists de EPI/EPC: <b>' + conta('epi') + '</b><br>Testes de luvas: <b>' + conta('luvas') + '</b><br>Checklists veiculares: <b>' + conta('veicular') + '</b></p><p class="seg-sub">Sem percentual de propósito: o número que vale para a Campanha é o do seu extrato, na área pessoal.</p></div>';
}
function telaFila() {
  var l = S.registros.filter(function (r) { return r.estado !== 'enviado'; });
  if (!l.length) return '<div class="aviso ok">Nada esperando: tudo o que foi feito neste celular já subiu.</div>';
  /* O recusado tem "mandar de novo": a recusa é da regra (perfil, base, documento), e quando a regra muda — o acesso
     chega, a lista é gerada — o mesmo registro passa. */
  return l.map(function (r) { return '<div class="cartao seg-item"><b>' + h(TITULOS[r.tipo]) + '</b> · ' + h(r.carimbo.emNomeDe.nome || r.carimbo.emNomeDe.matricula) + '<small class="seg-sub">' + h(r.dia) + ' · ' + (r.estado === 'recusado' ? 'RECUSADO: ' + h(r.ultimoErro) : 'esperando sinal' + (r.ultimoErro ? ' (' + h(r.ultimoErro) + ')' : '')) + '</small>' +
    (r.estado === 'recusado' ? '<button type="button" class="btn secundario auto" data-acao="reenviar" data-id="' + h(r.id) + '">Mandar de novo</button>' : '') + '</div>'; }).join('') +
    '<button type="button" class="btn secundario" data-acao="enviarAgora">Enviar agora</button>';
}

/* ---------- os toques ---------- */
document.addEventListener('input', function (ev) {
  var t = ev.target, f = S.form; if (!f) return;
  if (t.dataset.nova && f.nova) f.nova[t.dataset.nova] = t.value;
  if (t.dataset.campo) { f[t.dataset.campo] = t.value; if (t.dataset.campo === 'busca') redesenharMantendoFoco(t); }
  if (t.dataset.obs !== undefined) f.obs[f._itens[+t.dataset.obs]] = t.value;
  if (t.dataset.manual) { f.manuais[t.dataset.manual] = t.value.replace(/\D/g, ''); }
  guardarRascunho();
});
/* Texto digitado NÃO redesenha a tela ao sair do campo: redesenhar no "change" troca o botão debaixo do dedo, e o toque
   que vem logo depois de digitar se perde (a bateria pegou em 23/10/2026: o "+ Irregularidade" não respondia). O que
   depende de texto é conferido no toque do botão, com a frase do que falta. */
document.addEventListener('change', function (ev) { if (ev.target.id === 'arquivoFoto') aoEscolherFoto(ev.target.files[0]); });
function falta(msg) { S.msg = msg; desenhar(); return true; }
function redesenharMantendoFoco(el) { var nome = el.dataset.campo, pos = el.selectionStart; desenhar(); var n = document.querySelector('[data-campo="' + nome + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } }

document.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-acao]'); if (!b || b.disabled) return;
  var a = b.dataset.acao, f = S.form, v = b.dataset.v;
  if (a === 'voltarApp') return Casca.voltar();
  if (a === 'inicio') return ir(S.alvo ? 'equipe' : 'inicio');
  if (a === 'abrir') return ir(b.dataset.tela);
  if (a === 'equipe') return ir('equipe');
  if (a === 'fila') return ir('fila');
  if (a === 'enviarAgora' || a === 'buscarPacote') return segGravarConfig('pacoteEm', null).then(function () { return enviarEAtualizar(0); }).then(carregarLocal).then(desenhar);
  if (a === 'reenviar') return SEG_BANCO.ler('registros', b.dataset.id).then(function (r) { if (!r) return; r.estado = 'guardado'; r.ultimoErro = ''; return SEG_BANCO.gravar('registros', r); }).then(function () { return enviarEAtualizar(0); }).then(carregarLocal).then(desenhar);
  if (a === 'fazerPor') { var p = S.contexto.equipe.filter(function (x) { return String(x.matricula) === String(b.dataset.m); })[0]; return ir(b.dataset.t, p); }
  if (a === 'estadoItem') { f.estados[f._itens[+b.dataset.i]] = v; return desenhar(); }
  if (a === 'todosOk') { var bom = f.tipo === 'veicular' ? 'aprovado' : 'ok'; f._itens.forEach(function (it) { if (!f.estados[it]) f.estados[it] = bom; }); return desenhar(); }
  if (a === 'fotoItem') return pedirFoto(function (id) { f.fotos[f._itens[+b.dataset.i]] = id; });
  if (a === 'fotoCampo') return pedirFoto(function (id) { f[b.dataset.c] = id; });
  if (a === 'rosto') return pedirFoto(function (id) { f.rosto = id; }, true);
  if (a === 'campo') { f[b.dataset.c] = v; return desenhar(); }
  if (a === 'alternar') { f.nova[b.dataset.c] = !f.nova[b.dataset.c]; return desenhar(); }
  if (a === 'novaIrr') { f.nova = { desvio: '', foto: '' }; f.busca = ''; return desenhar(); }
  if (a === 'cancelarIrr') { f.nova = null; return desenhar(); }
  if (a === 'escolherDesvio') { f.nova.desvio = v; return desenhar(); }
  if (a === 'addEnvolvido') { f.nova.envolvidosTxt = (f.nova.envolvidosTxt ? f.nova.envolvidosTxt + ', ' : '') + v; return desenhar(); }
  if (a === 'fotoNova') return pedirFoto(function (id) { f.nova.foto = id; });
  if (a === 'addIrr') { f.irr.push({ desvio: f.nova.desvio, envolvidos: String(f.nova.envolvidosTxt || '').split(/[,;\s]+/).filter(String), foto: f.nova.foto, obs: f.nova.obs || '', solucionadaNaHora: !!f.nova.solucionadaNaHora }); f.nova = null; return desenhar(); }
  if (a === 'tirarIrr') { f.irr.splice(+b.dataset.i, 1); return desenhar(); }
  if (a === 'blitzResp') { f.resp[b.dataset.k] = v; return desenhar(); }
  if (a === 'blitzMotivo') { f.motivo[b.dataset.k] = v; return desenhar(); }
  if (a === 'blitzFoto') return pedirFoto(function (id) { f.fotos[b.dataset.k] = id; });
  if (a === 'conf') { f.conf[b.dataset.m] = v === '1'; return desenhar(); }
  if (a === 'fotoPagina') { var pg = +b.dataset.p; fotoPendente = null; var i = $('arquivoFoto'); i.setAttribute('capture', 'environment'); i.value = ''; i.onchange = function () { i.onchange = null; lerPagina(i.files[0], pg); }; i.click(); return; }
  if (a === 'salvarEpi') return concluir({ id: f.id, tipo: 'epi', funcao: (S.alvo || {}).funcao || (S.pacote && S.pacote.pessoa.funcao) || '', fotoRosto: f.rosto,
    itens: f._itens.map(function (it) { return { item: it, estado: f.estados[it], obs: f.obs[it] || '', foto: f.fotos[it] || '' }; }) }, 'Checklist de EPI/EPC salvo.');
  if (a === 'salvarLuvas' && (!String(f.esquerda).trim() || !String(f.direita).trim()) && falta('Digite o número das duas luvas, a esquerda e a direita.')) return;
  if (a === 'salvarLuvas') return concluir({ id: f.id, tipo: 'luvas', fotoRosto: f.rosto, luvas: { classe: f.classe, esquerda: String(f.esquerda).trim(), direita: String(f.direita).trim(), par: String(f.esquerda).trim() + ' / ' + String(f.direita).trim(), inflagem: f.inflagem, visual: f.visual, foto: f.foto || '' } },
    f.inflagem === 'reprovado' || f.visual === 'reprovado' ? 'Par reprovado registrado: ele sai de uso.' : 'Teste de luvas salvo.');
  if (a === 'salvarVeicular' && !String(f.placa).trim() && falta('Digite a placa do veículo.')) return;
  if (a === 'salvarVeicular') { var reg = { id: f.id, tipo: 'veicular', fotoRosto: f.rosto, veiculo: { placa: f.placa, tipo: f.tipoV }, retido: !!(f._retidos.length && S.pacote.retencaoLigada),
    itens: f._itens.map(function (it) { return { item: it.replace(/^Lataria /, 'Lataria '), estado: f.estados[it], obs: f.obs[it] || '', foto: f.fotos[it] || '' }; }) };
    return concluir(reg, reg.retido ? 'VEÍCULO RETIDO: não saia com ele até um superior liberar.' : 'Checklist veicular salvo.'); }
  if (a === 'salvarSqp') return concluir({ id: f.id, tipo: 'sqp', inspecao: { equipe: f.equipe, local: f.local, placa: f.placa, irregularidades: f.irr } }, 'Inspeção SQP salva (' + f.irr.length + ' irregularidade(s)).');
  if (a === 'salvarBlitz' && !String(f.alvoId).trim() && falta('Diga quem ou o que foi inspecionado (matrícula, placa ou prefixo).')) return;
  if (a === 'salvarBlitz') {
    var irr = Object.keys(f.resp).filter(function (k) { return f.resp[k] === 'NC'; }).map(function (k) {
      var p = k.split(SEP_BLITZ), it = (S.pacote.blitz[p[0]] || []).filter(function (x) { return x.item === p[1]; })[0];
      return it ? { desvio: it.desvio, envolvidos: f.alvoTipo === 'pessoa' ? [f.alvoId] : [], itemBlitz: p[0] + ' · ' + it.item, motivo: f.motivo[k], foto: f.fotos[k] } : null;
    }).filter(Boolean);
    return concluir({ id: f.id, tipo: 'blitz', inspecao: { alvo: { tipo: f.alvoTipo, id: f.alvoId }, placa: f.alvoTipo === 'veiculo' ? f.alvoId : '', irregularidades: irr } }, 'Blitz salva (' + irr.length + ' não conforme).');
  }
  if (a === 'salvarDds' && !String(f.tema).trim() && falta('Escreva o tema do DDS.')) return;
  if (a === 'salvarDds' && document.querySelector('[data-manual]') && Array.prototype.some.call(document.querySelectorAll('[data-manual]'), function (x) { return !x.value.trim(); }) && falta('Digite a matrícula de cada linha escrita à mão.')) return;
  if (a === 'salvarDds') {
    var pres = [];
    Object.keys(f.paginas).forEach(function (pg) { (f.paginas[pg].linhas || []).forEach(function (l) {
      var c = f.conf[l.mat], est = l.estado === 'conferir' ? (c ? 'presente' : 'ausente') : l.estado;
      pres.push({ matricula: l.mat, estado: est, como: l.estado === 'conferir' ? 'confirmado' : 'leitura', confirmadoPor: l.estado === 'conferir' ? S.pessoa.matricula : '', tintaBola: l.tinta_bola, assinatura: l.assinatura, avisos: l.avisos || [] });
    }); });
    Object.keys(f.manuais).forEach(function (ln) { if (f.manuais[ln]) pres.push({ matricula: f.manuais[ln], estado: 'presente', como: 'confirmado', confirmadoPor: S.pessoa.matricula, avisos: ['escrita à mão na linha ' + ln] }); });
    return concluir({ id: f.id, tipo: 'dds', dds: { onde: f.onde, tema: f.tema, conduziu: S.pessoa.matricula, fotoLista: f.fotoLista, idLista: f.lista, presencas: pres } }, 'Presença no DDS salva, com a foto da lista.');
  }
});
