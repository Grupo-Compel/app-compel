/* app.js — a casca do App Compel (21/10/2026).
 *
 * O que a casca faz (FRONTEIRA_APP_COMPEL §2): a entrada (CPF e a senha do Portal, pelo login do Núcleo), o Início com
 * os módulos que a pessoa tem, os Avisos (as comunicações do Núcleo), o Envio (a fila dos blocos) e o Perfil, com o
 * "trocar de pessoa" do celular da equipe. As telas de cada bloco não são daqui; o que a casca dá a elas está em
 * servicos.js e casca.js.
 *
 * TRÊS REGRAS QUE ESTE ARQUIVO NÃO QUEBRA
 *  1. O CPF nunca fica guardado no celular nem aparece em tela. Ele é digitado, vai ao login e sai da memória. Quem já
 *     entrou neste celular é achado por um resumo do CPF (PBKDF2 com uma chave sorteada no próprio aparelho), que não
 *     volta a ser CPF sem uma conta de força bruta cara.
 *  2. O único endereço escrito no app é o do login, em config/login.js. Nenhuma resposta, link ou configuração troca
 *     esse endereço (carta nº 8 do Núcleo, 19/10/2026). O servidor de um bloco chega pelo login, com a senha conferida,
 *     e só recebe a fila depois de conferido pelo resumo que o bloco publicou (servicos.js).
 *  3. O token do Núcleo é pedido no toque e nunca guardado (FRONTEIRA §2.1, regra 2). O que fica guardado é a sessão
 *     do aparelho (30 dias), que só vale para pedir o token, os avisos e a entrada do dia.
 *
 * A ENTRADA DO DIA (decisão do Dalton, 19/10/2026, 19:52: "a pessoa entra no app todo dia")
 *  - com sinal: o login do Núcleo confere a senha e devolve a regra da entrada (até o fim do dia, no fuso da base);
 *  - sem sinal: entra quem já entrou com sinal neste celular, conferido pelo verificador da senha guardado aqui (a
 *    conta é PBKDF2; a senha nunca é guardada). A mesma regra do fim do dia vale com e sem sinal;
 *  - "o login não respondeu" (respondeu:false, ou falha de rede) é tratado como sem sinal: nunca vira "senha errada".
 */
'use strict';

// A versão, o banco da casca, o fuso e a conversa com o login moram em servicos.js e casca.js, que as telas dos blocos
// também carregam: a resposta para "a entrada de hoje vale?" tem de ser a mesma na casca e no bloco.
var DIAS_DOS_AVISOS = 30;                         // FRONTEIRA §2.1: os Avisos mostram 30 dias, pela data de cada um
var VOLTAS_DA_CHAVE_DO_CPF = 20000;               // o resumo do CPF: lento o bastante para não se adivinhar os 10^9 CPFs possíveis
// Só para o caso de a resposta do login vir sem os parâmetros: o valor que vale é o do Núcleo, que vem na resposta.
var PARAMETROS_DE_RESERVA = { errosAteTravar: 5, minutosDeTrava: 30, diasSemSinal: 7 };

var E = {
  tela: 'abrindo',
  aparelho: null,      // { id, chave }: sorteados uma vez neste celular
  pessoas: {},         // resumo do CPF -> o que fica guardado de quem já entrou aqui (sem CPF, sem senha)
  atual: null,         // { chave, dia }: quem está no celular e o dia (no fuso dela) em que entrou
  escolhida: null,     // na tela de entrada: a pessoa tocada na lista de "já entraram neste celular"
  erro: '', ok: '',
  memoria: null,       // { cpf?, chave?, senha }: só durante a troca de senha obrigatória; nunca vai ao disco
  avisos: null,        // { lista, quando } | { erro }
  ajuda: false,
  ocupado: false,
  envio: {}            // id do bloco -> { pendentes, estado, acordadas, enviando }: o que a tela de Envio mostra
};

/* ---------- utilidades ---------- */
function $(id) { return document.getElementById(id); }
function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sorteio(n) { return cascaHex(crypto.getRandomValues(new Uint8Array(n))); }
function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }
function brDe(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
function comSinal() { return navigator.onLine !== false; }

function cpfValido(onze) {
  if (!/^\d{11}$/.test(onze) || /^(\d)\1{10}$/.test(onze)) return false;
  var d = onze.split('').map(Number);
  for (var t = 9; t <= 10; t++) {
    var soma = 0;
    for (var i = 0; i < t; i++) soma += d[i] * (t + 1 - i);
    if ((soma * 10) % 11 % 10 !== d[t]) return false;
  }
  return true;
}
// A máscara do campo: só para ler melhor enquanto digita. O valor que vale é o de 11 algarismos.
function mascaraDoCpf(t) {
  var d = soDigitos(t).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function diasEntre(isoA, isoB) { return Math.round((Date.parse(isoB + 'T12:00:00Z') - Date.parse(isoA + 'T12:00:00Z')) / 86400000); }

/* ---------- o que fica guardado no celular (o banco da casca, em servicos.js) ---------- */
var lerKv = cascaLer, gravarKv = cascaGravar;
function gravarPessoas() { return gravarKv('pessoas', E.pessoas); }
function gravarAtual() { return gravarKv('atual', E.atual); }

/* ---------- as contas (WebCrypto) ---------- */
function pbkdf2(segredo, sal, voltas) {
  var t = new TextEncoder();
  return crypto.subtle.importKey('raw', t.encode(segredo), 'PBKDF2', false, ['deriveBits'])
    .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: t.encode(sal), iterations: voltas }, k, 256); })
    .then(cascaHex);
}
function chaveDoCpf(cpf) { return pbkdf2(cpf, E.aparelho.chave, VOLTAS_DA_CHAVE_DO_CPF); }
/* O verificador: o algoritmo e as voltas vêm do login (carta nº 9 do Núcleo: só "algo" e "rodadas"); o sal é sorteado
   aqui, por pessoa, e o sal da identidade nunca sai da CENTRAL. A casca só sabe fazer PBKDF2-SHA256: com outro
   algoritmo, ela não guarda nada, e a pessoa só entra com sinal até a casca aprender. */
function verificadorSuportado(v) { return !!(v && /pbkdf2/i.test(String(v.algo || '')) && /sha-?256/i.test(String(v.algo || '')) && +v.rodadas >= 1000); }

/* ---------- a conversa com o login do Núcleo (casca.js) ---------- */
var enderecoDoLogin = cascaEnderecoDoLogin, postarAoLogin = cascaPostarAoLogin;
function dadosDoAparelho() { return { id: E.aparelho.id, descricao: String(navigator.userAgent || '').slice(0, 160) }; }

/* ---------- quem já entrou neste celular ---------- */
function parametrosDe(p) { var r = {}; Object.keys(PARAMETROS_DE_RESERVA).forEach(function (k) { r[k] = p && p.parametros && +p.parametros[k] > 0 ? +p.parametros[k] : PARAMETROS_DE_RESERVA[k]; }); return r; }
function pessoaAtual() { return E.atual && E.pessoas[E.atual.chave] || null; }
function entradaValeHoje() { return cascaEntradaVale(E.atual, E.pessoas); }

/* A resposta boa do login vira o que fica guardado. Recebe a chave já calculada (pelo CPF ou pela pessoa escolhida). */
function guardarEntrada(chave, r, senha) {
  var antes = E.pessoas[chave] || {};
  var p = {
    nome: r.pessoa && r.pessoa.nome || antes.nome || '',
    nomeCompleto: r.pessoa && r.pessoa.nomeCompleto || '',
    matricula: r.pessoa && r.pessoa.matricula || '',
    funcao: r.pessoa && r.pessoa.funcao || '',
    lotacao: r.pessoa && r.pessoa.lotacao || '',
    bases: r.bases || [],
    modulos: r.modulos || [],
    sessao: r.aparelho && r.aparelho.sessao || '',
    sessaoAte: r.aparelho && r.aparelho.validaAte || '',
    entrada: r.entrada || { ate: 'fimDoDia', fuso: FUSO_PADRAO },
    parametros: r.parametros || null,
    ultimoContato: new Date().toISOString(),
    vistoAvisos: antes.vistoAvisos || '',
    erros: 0, travadoAte: ''
  };
  var feito = verificadorSuportado(r.verificador)
    ? (function () { var sal = sorteio(16); return pbkdf2(senha, sal, +r.verificador.rodadas).then(function (h) { p.verif = { algo: r.verificador.algo, rodadas: +r.verificador.rodadas, sal: sal, hash: h }; }); })()
    : Promise.resolve();
  return feito.then(function () {
    E.pessoas[chave] = p;
    E.atual = { chave: chave, dia: diaNoFuso(new Date(), fusoDe(p)) };
    // O endereço de cada módulo fica guardado para a fila dos blocos, que envia sem a pessoa na tela e sem sinal na
    // hora de guardar. Ele chegou com a senha conferida, e é conferido de novo pelo resumo antes de cada envio.
    return Promise.all([gravarPessoas(), gravarAtual(), cascaGuardarEnderecos(p.modulos)]);
  });
}

/* ---------- a entrada ---------- */
function mostrarErro(t) { E.erro = t; E.ok = ''; E.ocupado = false; desenhar(); }

/* Sem sinal (ou o login sem responder): só o verificador guardado decide. A trava conta os erros sem sinal, com o
   número e o tempo que o Núcleo mandou na última entrada com sinal. */
function entrarSemSinal(chave, senha, motivo) {
  var p = E.pessoas[chave];
  var aviso = motivo || 'Sem sinal.';
  if (!p || !p.verif) return mostrarErro(aviso + ' A primeira entrada de cada pessoa neste celular precisa de sinal.');
  var par = parametrosDe(p);
  if (p.travadoAte && Date.parse(p.travadoAte) > Date.now()) return mostrarErro('Muitas senhas erradas sem sinal. Espere até ' + new Date(p.travadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' ou entre com sinal.');
  var hoje = new Date().toISOString().slice(0, 10), ultimo = String(p.ultimoContato || '').slice(0, 10);
  if (!ultimo || diasEntre(ultimo, hoje) > par.diasSemSinal) return mostrarErro(aviso + ' Faz mais de ' + par.diasSemSinal + ' dias que este celular não fala com o login: entre com sinal uma vez.');
  return pbkdf2(senha, p.verif.sal, p.verif.rodadas).then(function (h) {
    if (h !== p.verif.hash) {
      p.erros = (p.erros || 0) + 1;
      if (p.erros >= par.errosAteTravar) { p.travadoAte = new Date(Date.now() + par.minutosDeTrava * 60000).toISOString(); p.erros = 0; }
      return gravarPessoas().then(function () { mostrarErro(p.travadoAte && Date.parse(p.travadoAte) > Date.now() ? 'Senha errada. Muitas tentativas sem sinal: espere ' + par.minutosDeTrava + ' minutos ou entre com sinal.' : 'Senha errada (' + p.erros + ' de ' + par.errosAteTravar + ', sem sinal).'); });
    }
    p.erros = 0; p.travadoAte = '';
    E.atual = { chave: chave, dia: diaNoFuso(new Date(), fusoDe(p)) };
    return Promise.all([gravarPessoas(), gravarAtual()]).then(function () { irPara('inicio', 'Entrou sem sinal, com a senha conferida neste celular.'); });
  });
}

/* O que fazer com a resposta do login, venha ela do "entrar", do primeiro acesso ou da troca de senha. */
function tratarResposta(r, chave, senha, credencial) {
  if (!r || r.ok !== true) {
    if (r && r.semSenha) { E.tela = 'primeiro'; return mostrarErro(r.erro || 'Você ainda não tem senha. Crie a sua aqui.'); }
    if (r && r.pedirCpf) { E.escolhida = null; return mostrarErro(r.erro || 'Digite o CPF de novo.'); }
    return mostrarErro((r && r.erro) || 'O login recusou a entrada.');
  }
  if (r.pessoa && r.pessoa.trocarSenha) {
    // Senha temporária (a do "esqueci a senha"): nada fica guardado até a pessoa criar a dela.
    E.memoria = { credencial: credencial, senha: senha, chave: chave };
    E.tela = 'trocar'; E.erro = ''; E.ocupado = false;
    return desenhar();
  }
  return guardarEntrada(chave, r, senha).then(function () { E.memoria = null; irPara('inicio', ''); });
}

function entrarComCpf() {
  var cpf = soDigitos(($('cpf') || {}).value), senha = String(($('senha') || {}).value || '');
  if (!cpfValido(cpf)) return mostrarErro('Confira o CPF: os 11 números não fecham.');
  if (!senha) return mostrarErro('Digite a senha.');
  E.ocupado = true; E.erro = ''; desenhar();
  return chaveDoCpf(cpf).then(function (chave) {
    if (!comSinal()) return entrarSemSinal(chave, senha);
    return postarAoLogin({ acao: 'entrar', cpf: cpf, senha: senha, aparelho: dadosDoAparelho() })
      .then(function (r) { return tratarResposta(r, chave, senha, { cpf: cpf }); },
            function (e) { return e && e.semEndereco ? mostrarErro('O app ainda não está ligado ao login.') : entrarSemSinal(chave, senha, e && e.msg); });
  });
}

/* Quem já entrou neste celular só toca no nome e digita a senha: o CPF não precisa ser digitado todo dia, e não fica
   guardado. Com sinal, o login reconhece a pessoa pela sessão do aparelho (carta nº 12 do App ao Núcleo). */
function entrarComoEscolhida() {
  var chave = E.escolhida, p = E.pessoas[chave], senha = String(($('senha') || {}).value || '');
  if (!p) return mostrarErro('Escolha quem vai entrar.');
  if (!senha) return mostrarErro('Digite a senha.');
  E.ocupado = true; E.erro = ''; desenhar();
  if (!comSinal()) return entrarSemSinal(chave, senha);
  return postarAoLogin({ acao: 'entrar', sessao: p.sessao, senha: senha, aparelho: dadosDoAparelho() })
    .then(function (r) { return tratarResposta(r, chave, senha, { sessao: p.sessao }); },
          function (e) { return e && e.semEndereco ? mostrarErro('O app ainda não está ligado ao login.') : entrarSemSinal(chave, senha, e && e.msg); });
}

function criarSenha() {
  var cpf = soDigitos(($('cpf') || {}).value), email = String(($('email') || {}).value || '').trim();
  var s1 = String(($('senha') || {}).value || ''), s2 = String(($('senha2') || {}).value || '');
  if (!cpfValido(cpf)) return mostrarErro('Confira o CPF: os 11 números não fecham.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarErro('Confira o e-mail. É para ele que vai a senha nova, no dia em que você esquecer a sua.');
  if (!s1) return mostrarErro('Crie a senha.');
  if (s1 !== s2) return mostrarErro('As duas senhas não são iguais.');
  if (!comSinal()) return mostrarErro('Sem sinal: criar a senha precisa de sinal (o Wi-Fi da base serve).');
  E.ocupado = true; E.erro = ''; desenhar();
  return chaveDoCpf(cpf).then(function (chave) {
    return postarAoLogin({ acao: 'criarSenha', cpf: cpf, email: email, senha: s1, aparelho: dadosDoAparelho() })
      .then(function (r) { return tratarResposta(r, chave, s1, { cpf: cpf }); },
            function (e) { mostrarErro(e && e.semEndereco ? 'O app ainda não está ligado ao login.' : 'Não consegui falar com o login. Tente com sinal melhor.'); });
  });
}

function trocarSenha() {
  var m = E.memoria, s1 = String(($('senha') || {}).value || ''), s2 = String(($('senha2') || {}).value || '');
  if (!m) { E.tela = 'entrar'; return desenhar(); }
  if (!s1) return mostrarErro('Crie a senha nova.');
  if (s1 !== s2) return mostrarErro('As duas senhas não são iguais.');
  if (s1 === m.senha) return mostrarErro('A senha nova tem de ser diferente da temporária.');
  E.ocupado = true; E.erro = ''; desenhar();
  var corpo = { acao: 'trocarSenha', senhaAtual: m.senha, senhaNova: s1, aparelho: dadosDoAparelho() };
  if (m.credencial.cpf) corpo.cpf = m.credencial.cpf; else corpo.sessao = m.credencial.sessao;
  return postarAoLogin(corpo).then(function (r) {
    if (r && r.ok === true && r.pessoa && r.pessoa.trocarSenha) return mostrarErro('O login ainda pede a troca da senha. Tente de novo.');
    return tratarResposta(r, m.chave, s1, m.credencial);
  }, function () { mostrarErro('Não consegui falar com o login. Tente com sinal melhor.'); });
}

function esqueciSenha() {
  var cpf = soDigitos(($('cpf') || {}).value);
  if (!cpfValido(cpf)) return mostrarErro('Confira o CPF: os 11 números não fecham.');
  if (!comSinal()) return mostrarErro('Sem sinal: pedir a senha nova precisa de sinal.');
  E.ocupado = true; E.erro = ''; desenhar();
  return postarAoLogin({ acao: 'esqueciSenha', cpf: cpf }).then(function (r) {
    E.ocupado = false;
    if (!r || r.ok !== true) return mostrarErro((r && r.erro) || 'O login não conseguiu mandar a senha nova.');
    E.tela = 'entrar'; E.erro = ''; E.ok = r.mensagem || 'Mandamos uma senha temporária para o seu e-mail. Entre com ela e crie a sua.'; desenhar();
  }, function (e) { mostrarErro(e && e.semEndereco ? 'O app ainda não está ligado ao login.' : 'Não consegui falar com o login. Tente com sinal melhor.'); });
}

/* Sair: a próxima pessoa entra. O que esta pessoa deixou guardado (o verificador, a sessão) continua, para ela entrar
   sem sinal amanhã e para a fila dos blocos subir com a sessão dela (FRONTEIRA §2.1). */
function sair() { E.atual = null; E.escolhida = null; E.erro = ''; E.ok = ''; E.avisos = null; return gravarAtual().then(function () { irPara('entrar'); }); }
/* Tirar a pessoa deste celular: o verificador e a sessão saem. Não desliga nada no Núcleo (a sessão vence sozinha em
   30 dias sem contato, ou é cortada pelo administrador). */
function esquecerNesteCelular() {
  if (!E.atual) return;
  var p = E.pessoas[E.atual.chave];
  delete E.pessoas[E.atual.chave]; E.atual = null; E.escolhida = null;
  // Sai também a sessão da pessoa em cada bloco. O que ela fez e ainda não subiu continua no banco do bloco: ficaria
  // esperando que ela entre de novo, e não é da casca apagar (FRONTEIRA §5.5, cuidado 2).
  return Promise.all([gravarPessoas(), gravarAtual(), cascaEsquecerSessoes(p && p.matricula)]).then(function () { irPara('entrar', 'Seus dados saíram deste celular.'); });
}

/* ---------- Início: os módulos ---------- */
function siglaDe(m) { return String(m.modulo || m.nome || '?').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(); }
/* A ordem é a que veio do login (a coluna ORDEM da MODULOS): a casca não ordena nada (carta nº 9 do Núcleo).
   O módulo que tem tela do celular neste app (um bloco de espécie celular ou ambas) abre a tela guardada no próprio
   celular, com ou sem sinal. O outro abre a tela do sistema, numa janela nova, com o token pedido no toque. */
function telaDoCelular(m) { var b = cascaBlocoDoModulo(m.modulo); return b && b.entrada ? b : null; }
function abrirModulo(i) {
  var p = pessoaAtual(), m = p && p.modulos[i];
  if (!m || !m.url || m.liberado === false || !/^https:\/\/\S+$/.test(m.url)) return;
  var b = telaDoCelular(m);
  if (b) { location.href = b.entrada; return; }
  if (!comSinal()) return mostrarErro('Sem sinal: as telas do sistema só abrem com sinal.');
  var janela = cascaAbrirJanela();
  E.ocupado = true; E.erro = ''; desenhar();
  return cascaAbrirComToken(p, m.modulo, m.url, janela).then(function (r) {
    E.ocupado = false;
    if (r.termo) { E.termo = r.termo; return irPara('termo'); }
    if (r.pedirCpf) return exigirEntrada(true, r.erro);
    if (r.entrarDeNovo) return exigirEntrada(false, r.erro);
    if (r.erro) return mostrarErro(r.erro);
    desenhar();
  });
}

/* A sessão do aparelho deixou de valer no login (carta nº 14 do Núcleo): a entrada de hoje acaba aqui, e a pessoa
   entra de novo. Com `pedirCpf` (sessão cortada, vencida ou de outro aparelho), pelo CPF; com `entrarDeNovo` (a senha
   mudou em outro celular), pelo nome, com a senha nova — a sessão revive. Nada do que ela deixou guardado sai. */
function exigirEntrada(peloCpf, msg) {
  var chave = E.atual && E.atual.chave;
  E.atual = null; E.avisos = null; E.escolhida = peloCpf ? null : chave;
  return gravarAtual().then(function () { E.tela = 'entrar'; mostrarErro(msg); });
}

/* ---------- o termo (APP-09) ---------- */
function aceitarTermo() {
  var p = pessoaAtual(), t = E.termo;
  if (!p || !t) return irPara('inicio');
  if (!comSinal()) return mostrarErro('Sem sinal: aceitar o termo precisa de sinal.');
  E.ocupado = true; E.erro = ''; desenhar();
  return postarAoLogin({ acao: 'aceitarTermo', sessao: p.sessao, id: t.id, versao: t.versao }).then(function (r) {
    if (r && r.pedirCpf) return exigirEntrada(true, r.erro || 'Entre de novo com o seu CPF.');
    if (!r || r.ok !== true) return mostrarErro((r && r.erro) || 'O login não gravou o aceite. Tente de novo.');
    E.termo = null;
    irPara('inicio', 'Termo aceito. Toque de novo no sistema que você queria abrir.');
  }, function () { mostrarErro('Não consegui falar com o login. Tente com sinal melhor.'); });
}

/* ---------- Envio: a fila dos blocos ----------
   A fila é da casca, e o que vai nela é de cada bloco (FRONTEIRA §5.5). A tela mostra, por bloco que envia, quantos
   registros esperam, o último envio e as últimas vezes que o Android acordou o app; o "Enviar agora" faz o mesmo que
   o segundo plano, porque é a mesma função (servicos.js). */
function blocosQueEnviam() { return cascaBlocos().filter(function (b) { return b.envia; }); }
function carregarEnvioDosBlocos() {
  // A tela da casca carrega o envio de cada bloco, para contar o que espera e para o "Enviar agora". É o mesmo arquivo
  // que o service worker importa.
  return Promise.all(blocosQueEnviam().map(function (b) {
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = b.envia.script; s.onload = function () { ok(); }; s.onerror = function () { E.envio[b.id] = { quebrado: true }; ok(); };
      document.head.appendChild(s);
    });
  }));
}
function lerEnvio() {
  return Promise.all(blocosQueEnviam().map(function (b) {
    return Promise.all([cascaPendentes(b.id), cascaLer('envio:' + b.id), cascaLer('acordadas:' + b.id)]).then(function (v) {
      var antes = E.envio[b.id] || {};
      E.envio[b.id] = { pendentes: v[0], estado: v[1] || null, acordadas: v[2] || [], enviando: antes.enviando, quebrado: antes.quebrado && v[0] === null };
    });
  })).then(function () { return cascaLer('instalacao'); }).then(function (i) { E.instalacao = i || null; desenharSeLogado(); });
}
function totalPendente() { return Object.keys(E.envio).reduce(function (t, k) { return t + (+E.envio[k].pendentes || 0); }, 0); }
function enviarBloco(id, motivo) {
  var x = E.envio[id] = E.envio[id] || {};
  if (x.enviando) return Promise.resolve();
  x.enviando = true; desenharSeLogado();
  return cascaEnviar(id, motivo).then(function (r) {
    x.enviando = false;
    if (r && r.pendentes) { var b = cascaBloco(id); if (b) cascaPedirSegundoPlano(b.envia.etiqueta); }
  }, function () { x.enviando = false; }).then(lerEnvio);
}
/* Com sinal e com alguém entrado hoje, o app tenta mandar o que espera ao abrir e quando o sinal volta (o "envia
   quando o sinal volta" do app do campo). Com o endereço mudado não insiste: tentar de novo não conserta. */
function enviarOQueEspera(motivo) {
  if (!comSinal() || !entradaValeHoje()) return Promise.resolve();
  return Promise.all(blocosQueEnviam().map(function (b) {
    var x = E.envio[b.id] || {};
    if (!x.pendentes || (x.estado && x.estado.enderecoMudou)) return null;
    return enviarBloco(b.id, motivo);
  }));
}
function desenharSeLogado() { if (telaLogada()) desenhar(); }

/* ---------- Avisos ---------- */
function avisosDaJanela(lista, p) {
  var hoje = diaNoFuso(new Date(), fusoDe(p));
  return (lista || []).filter(function (a) { var d = String(a.data || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) && diasEntre(d, hoje) >= 0 && diasEntre(d, hoje) < DIAS_DOS_AVISOS; })
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
}
function quantosNovos() {
  var p = pessoaAtual();
  if (!p || !E.avisos || !E.avisos.lista) return 0;
  return E.avisos.lista.filter(function (a) { return String(a.data).slice(0, 10) > String(p.vistoAvisos || ''); }).length;
}
function buscarAvisos() {
  var p = pessoaAtual();
  if (!p || !p.sessao || !comSinal() || !enderecoDoLogin()) return Promise.resolve();
  return postarAoLogin({ acao: 'avisos', sessao: p.sessao }).then(function (r) {
    if (r && r.pedirCpf) return exigirEntrada(true, r.erro || 'Entre de novo com o seu CPF.');
    if (r && r.entrarDeNovo) return exigirEntrada(false, r.erro || 'Sua senha mudou. Entre de novo com a senha nova.');
    if (!r || r.ok !== true) { E.avisos = { erro: (r && r.erro) || 'O login não mandou os avisos.' }; return desenhar(); }
    E.avisos = { lista: avisosDaJanela(r.comunicacoes, p) };
    if (E.tela === 'avisos') marcarAvisosVistos();
    desenhar();
  }, function (e) { E.avisos = { erro: e && e.msg || 'Sem sinal agora.' }; desenhar(); });
}
/* O celular guarda só a data do aviso mais novo que a pessoa já viu (FRONTEIRA §2.1): nada do conteúdo fica. */
function marcarAvisosVistos() {
  var p = pessoaAtual();
  if (!p || !E.avisos || !E.avisos.lista || !E.avisos.lista.length) return;
  var maisNovo = String(E.avisos.lista[0].data).slice(0, 10);
  if (maisNovo > String(p.vistoAvisos || '')) { E.avisosNovosAntes = p.vistoAvisos || ''; p.vistoAvisos = maisNovo; gravarPessoas(); }
}

/* ---------- as telas ----------
   O VISUAL É O DO PORTAL (Dalton, 21/10/2026: "a estrutura visual não está adequada ao que temos hoje no portal").
   As telas usam as classes da folha do Núcleo (estilo/nucleo.css), as mesmas do App.html do Portal: a tela de
   entrada com a moldura vermelha e a marca quadrada, a barra grafite com a marca horizontal, a saudação, o rótulo
   "Seus sistemas" e os cartões .n-modulo. O que só o app tem leva o prefixo app- e mora no index.html. */
var CODIGOS = { entrar: 'APP-01', primeiro: 'APP-02', trocar: 'APP-03', esqueci: 'APP-04', inicio: 'APP-05', avisos: 'APP-06', perfil: 'APP-07', envio: 'APP-08', termo: 'APP-09' };
var TELAS_DE_DENTRO = ['inicio', 'avisos', 'envio', 'perfil', 'termo'];
var AJUDAS = {
  entrar: 'Entre com o seu CPF e a mesma senha do Portal. Quem já entrou neste celular aparece na lista: toque no seu nome e digite só a senha. Sem sinal, só entra quem já entrou neste celular com sinal antes. A entrada vale até o fim do dia; amanhã o app pede a senha de novo.',
  primeiro: 'Primeira vez no app ou no Portal: digite o CPF, o seu e-mail e crie a senha. O e-mail é para onde vai uma senha nova se um dia você esquecer a sua. Precisa de sinal.',
  trocar: 'Você entrou com uma senha temporária. Crie agora a sua senha, que vale também para o Portal.',
  esqueci: 'Digite o CPF. O sistema manda uma senha temporária para o e-mail cadastrado. Entre com ela, e o app pede para você criar a sua.',
  inicio: 'Aqui estão os sistemas que você pode abrir. Toque num deles para abrir, já com você entrado. Os que estão apagados dizem o motivo. Os marcados "funciona sem sinal" abrem no próprio celular; os outros precisam de sinal.',
  termo: 'A Compel pede que você leia e aceite este termo antes de abrir os sistemas. O aceite fica registrado com a data, e vale também para o Portal. Se o texto tiver um documento completo, ele abre pelo link. Precisa de sinal.',
  envio: 'O que foi feito no celular e ainda não chegou ao sistema. Fica guardado aqui e sobe sozinho quando houver sinal; "Enviar agora" manda na hora. Nada é apagado enquanto não chega. Se aparecer que o endereço do servidor mudou, avise a administração: o celular não manda para um endereço que não reconhece.',
  avisos: 'As comunicações da Compel dos últimos 30 dias. As marcadas como "novo" chegaram depois da última vez que você abriu esta tela. Precisa de sinal.',
  perfil: 'Os seus dados, como estão no cadastro. "Trocar de pessoa" deixa outra pessoa entrar neste celular. "Tirar meus dados deste celular" apaga daqui a sua entrada sem sinal.'
};
function ajuda(tela) {
  return '<button type="button" class="link-texto" data-acao="ajuda">' + (E.ajuda ? 'Fechar a ajuda' : 'Como funciona esta tela') + '</button>' +
    (E.ajuda ? '<div class="aviso info" id="textoAjuda">' + esc(AJUDAS[tela]) + '</div>' : '');
}
function mensagens() {
  return (E.erro ? '<div class="aviso erro" id="erro" role="alert">' + esc(E.erro) + '</div>' : '') + (E.ok ? '<div class="aviso ok" id="ok">' + esc(E.ok) + '</div>' : '');
}
function campo(id, rotulo, extra, dica) {
  return '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label><input id="' + id + '" ' + extra + '>' + (dica ? '<div class="ajuda">' + esc(dica) + '</div>' : '') + '</div>';
}
function campoCpf() { return campo('cpf', 'Seu CPF', 'type="tel" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="000.000.000-00"'); }
function campoSenha(id, rotulo, nova) { return campo(id, rotulo, 'type="password" autocomplete="' + (nova ? 'new-password' : 'current-password') + '"'); }
function botao(acao, texto, ocupado, fantasma, desligado) {
  return '<button type="button" class="btn' + (fantasma ? ' fantasma' : '') + '" data-acao="' + acao + '"' + (desligado ? ' disabled' : '') + '>' + esc(texto) + '</button>';
}
function semLogin() { return enderecoDoLogin() ? '' : '<div class="aviso atencao" id="semLogin">O app ainda não está ligado ao login do Núcleo. Por enquanto, ninguém entra.</div>'; }
function semSinalNaEntrada() { return '<div class="aviso atencao app-sem-sinal' + (comSinal() ? ' oculto' : '') + '">Sem sinal: só entra quem já entrou neste celular.</div>'; }
// A tela de entrada é a do Portal: a moldura vermelha, a marca quadrada e o rodapé da Compel. O código da tela fica no
// mesmo canto das outras telas, como no Portal (o App.html dele explica: quem liga para pedir ajuda procura ali).
function telaDeEntrada(tela, corpo) {
  return '<div class="login-tela"><span class="n-codigo-tela">' + CODIGOS[tela] + '</span><div class="moldura">' +
    '<div class="login-marca"><svg class="logo-oficial" role="img" aria-label="Grupo Compel"><use href="#marca-quadrada"/></svg><div class="sub">App</div></div>' +
    '<div class="cartao">' + semLogin() + semSinalNaEntrada() + corpo + mensagens() + ajuda(tela) + '</div>' +
    '<div class="login-rodape">Desde 1983, excelência em energia elétrica</div><div class="app-versao">versão ' + esc(VERSAO_APP) + '</div></div></div>';
}

function telaEntrar() {
  var ja = Object.keys(E.pessoas).map(function (k) { return { chave: k, p: E.pessoas[k] }; })
    .sort(function (a, b) { return String(a.p.nome).localeCompare(String(b.p.nome)); });
  var comNome = E.escolhida && E.pessoas[E.escolhida], h = '';
  if (ja.length) {
    h += '<p class="etiqueta app-rotulo">Já entraram neste celular</p><div class="app-pessoas">' + ja.map(function (x) {
      var trava = x.p.travadoAte && Date.parse(x.p.travadoAte) > Date.now();
      return '<button type="button" data-acao="escolher" data-chave="' + esc(x.chave) + '" class="' + (E.escolhida === x.chave ? 'ativo' : '') + '"><span class="app-inicial">' + esc(primeiroNome(x.p.nome).charAt(0)) + '</span><span class="app-quem"><b>' + esc(x.p.nome) + '</b><small>' + esc(x.p.funcao || '') + '</small></span>' + (trava ? '<span class="selo andando">aguarde</span>' : '') + '</button>';
    }).join('') + '<button type="button" data-acao="escolher" data-chave="" class="' + (comNome ? '' : 'ativo') + '"><span class="app-inicial">+</span><span class="app-quem"><b>Outra pessoa</b><small>Entrar com o CPF</small></span></button></div>';
  }
  if (comNome) h += '<p class="n-saudacao app-ola">Olá, ' + esc(primeiroNome(comNome.nome)) + '.</p>' + campoSenha('senha', 'Senha de ' + primeiroNome(comNome.nome));
  else h += campoCpf() + campoSenha('senha', 'Sua senha');
  h += botao(comNome ? 'entrarEscolhida' : 'entrarCpf', E.ocupado ? 'Entrando…' : 'Entrar', E.ocupado, false, E.ocupado || !enderecoDoLogin());
  h += botao('irPrimeiro', 'Primeiro acesso: criar a senha', false, true) + botao('irEsqueci', 'Esqueci minha senha', false, true);
  return telaDeEntrada('entrar', h);
}
function telaPrimeiro() {
  return telaDeEntrada('primeiro', '<p class="etiqueta n-secao app-sem-margem">Primeiro acesso</p>' + campoCpf() +
    campo('email', 'Seu e-mail', 'type="email" inputmode="email" autocomplete="email" placeholder="nome@dominio.com"', 'É por aqui que a senha temporária chega, se um dia você esquecer a sua.') +
    campoSenha('senha', 'Crie uma senha', true) + campoSenha('senha2', 'Repita a senha', true) +
    botao('criarSenha', E.ocupado ? 'Criando…' : 'Criar senha e entrar', E.ocupado, false, E.ocupado || !enderecoDoLogin()) + botao('irEntrar', 'Voltar', false, true));
}
function telaTrocar() {
  return telaDeEntrada('trocar', '<p class="etiqueta n-secao app-sem-margem">Troca de senha</p><p>Você entrou com uma senha temporária. Escolha uma senha sua para continuar.</p>' +
    campoSenha('senha', 'Nova senha', true) + campoSenha('senha2', 'Repita a nova senha', true) +
    botao('trocarSenha', E.ocupado ? 'Gravando…' : 'Salvar e continuar', E.ocupado, false, E.ocupado) + botao('irEntrar', 'Cancelar', false, true));
}
function telaEsqueci() {
  return telaDeEntrada('esqueci', '<p class="etiqueta n-secao app-sem-margem">Esqueci minha senha</p>' + campoCpf() +
    botao('esqueciSenha', E.ocupado ? 'Pedindo…' : 'Mandar uma senha nova para o meu e-mail', E.ocupado, false, E.ocupado || !enderecoDoLogin()) + botao('irEntrar', 'Voltar', false, true));
}

function telaInicio() {
  var p = pessoaAtual(), mods = p.modulos || [];
  var h = '<p class="n-saudacao">Olá, ' + esc(primeiroNome(p.nome)) + '.</p>' + mensagens();
  var n = quantosNovos();
  if (n) h += '<div class="aviso info" id="avisoNovo">' + (n === 1 ? 'Há 1 aviso novo.' : 'Há ' + n + ' avisos novos.') + ' <a href="#" data-aba="avisos">Ver</a></div>';
  h += '<p class="etiqueta n-secao">Seus sistemas</p>';
  if (!mods.length) h += '<div class="vazio" id="semModulos">Nenhum sistema liberado para você ainda.<br>Fale com o seu supervisor.</div>';
  else h += '<div class="n-grade" id="modulos">' + mods.map(function (m, i) {
    // O endereço vem da célula URL da MODULOS como está, só sem os espaços das pontas (carta nº 11 do Núcleo, 21/10/2026).
    // Uma quebra de linha ou um espaço no meio não sai com o trim, e o endereço não abre em lugar nenhum: o cartão diz
    // que a célula está com defeito, em vez de abrir uma página de erro do Google.
    var breve = !m.url, defeito = !breve && !/^https:\/\/\S+$/.test(m.url), travado = m.liberado === false, local = !!telaDoCelular(m), semRede = !comSinal() && !local;
    var motivo = travado ? (m.motivo || 'Ainda não liberado.') : breve ? 'Em breve.' : defeito ? 'O endereço deste sistema está com defeito na planilha. Avise a administração.' : semRede ? 'Precisa de sinal para abrir.' : '';
    return '<button type="button" class="n-modulo' + (motivo ? ' n-bloqueado' : '') + '" data-acao="abrirModulo" data-i="' + i + '"' + (motivo || E.ocupado ? ' disabled' : '') + '>' +
      (m.icone ? '<span class="n-icone">' + esc(m.icone) + '</span>' : '') + '<span class="n-nome">' + esc(m.nome || m.modulo) + '</span>' +
      (m.perfil ? '<span class="n-perfil">' + esc(m.perfil) + '</span>' : '') + (motivo ? '<span class="n-motivo">' + esc(motivo) + '</span>' : local ? '<span class="n-perfil app-local">funciona sem sinal</span>' : '') + '</button>';
  }).join('') + '</div>';
  return '<div class="conteudo">' + h + ajuda('inicio') + '</div>';
}
function telaAvisos() {
  var p = pessoaAtual(), h = '<p class="etiqueta n-secao app-sem-margem">Avisos</p>' + mensagens();
  if (!comSinal()) h += '<div class="aviso atencao">Sem sinal: os avisos aparecem quando o celular tiver sinal.</div>';
  else if (!E.avisos) h += '<div class="carregando">Buscando os avisos…</div>';
  else if (E.avisos.erro) h += '<div class="aviso atencao">' + esc(E.avisos.erro) + '</div>';
  else if (!E.avisos.lista.length) h += '<div class="vazio" id="semAvisos">Nenhum aviso nos últimos ' + DIAS_DOS_AVISOS + ' dias.</div>';
  else h += '<div id="listaAvisos">' + E.avisos.lista.map(function (a) {
    var novo = String(a.data).slice(0, 10) > String(E.avisosNovosAntes !== undefined ? E.avisosNovosAntes : p.vistoAvisos || '');
    var prop = /^\d+:\d+$/.test(String(a.proporcao || '')) ? String(a.proporcao).replace(':', ' / ') : '4 / 5';
    return '<div class="cartao aviso-item"><div class="app-linha">' + (a.categoria ? '<span class="app-cat">' + esc(a.categoria) + '</span>' : '') + (novo ? '<span class="app-novo">novo</span>' : '') + '</div>' +
      '<b class="app-titulo">' + esc(a.titulo) + '</b><span class="app-data">' + esc(brDe(a.data)) + '</span>' +
      (a.arte ? '<img src="' + esc(a.arte) + '" alt="' + esc(a.titulo) + '" loading="lazy" style="aspect-ratio:' + prop + '">' : '') +
      (a.link ? '<a class="link-texto" href="' + esc(a.link) + '" target="_blank" rel="noopener">Abrir</a>' : '') + '</div>';
  }).join('') + '</div>';
  return '<div class="conteudo">' + h + ajuda('avisos') + '</div>';
}
function quandoDe(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function telaEnvio() {
  var h = '<p class="etiqueta n-secao app-sem-margem">Envio</p>' + mensagens();
  if (!comSinal()) h += '<div class="aviso atencao">Sem sinal: o que está guardado sobe quando o sinal voltar.</div>';
  if (cascaEhIphone()) h += '<div class="aviso info" id="notaIphone">No iPhone, o envio pode só acontecer com o app aberto. Quando tiver sinal, abra o app e confira esta tela.</div>';
  if (E.instalacao && E.instalacao.problemas && E.instalacao.problemas.length) h += '<div class="aviso atencao" id="problemaInstalacao">Uma parte do app não ficou guardada neste celular. Abra o app com sinal de novo. Se repetir, avise a administração.</div>';
  h += blocosQueEnviam().map(function (b) {
    var x = E.envio[b.id] || {}, e = x.estado || {}, n = x.pendentes;
    var c = '<div class="cartao app-envio" data-bloco="' + esc(b.id) + '"><div class="app-linha"><b class="app-titulo">' + esc(b.nome) + '</b>' +
      '<span class="selo' + (n ? ' andando' : '') + '" data-pendentes="' + esc(n === null || n === undefined ? '' : n) + '">' +
      (x.quebrado ? 'não carregou' : n === null || n === undefined ? '…' : n ? n + ' esperando' : 'nada esperando') + '</span></div>';
    // O endereço recusado aparece uma vez, no bloco, e não como erro em cada registro (carta nº 6 da Operação).
    if (e.enderecoMudou) c += '<div class="aviso erro app-endereco" role="alert">' + esc(e.erro) + '</div>';
    else if (x.quebrado) c += '<div class="aviso erro">O envio deste sistema não carregou neste celular. Abra o app com sinal de novo.</div>';
    else if (e.erro) c += '<div class="aviso atencao">' + esc(e.erro) + '</div>';
    if (e.quando) c += '<p class="ajuda app-ultimo">Última tentativa: ' + esc(quandoDe(e.quando)) + ' (' + esc(e.enviadoPor || '') + ') · ' + esc(e.enviados || 0) + ' enviado(s)</p>';
    // Com o endereço recusado, o botão fica apagado: tentar de novo não conserta, e o conserto é da administração.
    c += botao('enviarBloco', x.enviando ? 'Enviando…' : 'Enviar agora', x.enviando, false, x.enviando || !comSinal() || x.quebrado || !n || e.enderecoMudou);
    if (x.acordadas && x.acordadas.length) c += '<details class="app-acordadas"><summary>As últimas vezes que o celular acordou o app para enviar</summary><ul>' +
      x.acordadas.slice().reverse().map(function (a) { return '<li>' + esc(quandoDe(a.quando)) + ': ' + esc(a.resultado) + '</li>'; }).join('') + '</ul></details>';
    return c.replace('data-acao="enviarBloco"', 'data-acao="enviarBloco" data-bloco="' + esc(b.id) + '"') + '</div>';
  }).join('');
  return '<div class="conteudo">' + h + ajuda('envio') + '</div>';
}
function telaTermo() {
  var t = E.termo;
  if (!t) return '<div class="conteudo"><div class="vazio">Nenhum termo para aceitar.</div>' + ajuda('termo') + '</div>';
  return '<div class="conteudo"><p class="etiqueta n-secao app-sem-margem">Termo</p>' + mensagens() +
    '<div class="cartao" id="termo"><b class="app-titulo">' + esc(t.titulo) + '</b>' +
    (t.texto ? '<p class="app-termo-texto">' + esc(t.texto) + '</p>' : '') +
    (t.link ? '<a class="link-texto" href="' + esc(t.link) + '" target="_blank" rel="noopener">Ler o documento completo</a>' : '') +
    botao('aceitarTermo', E.ocupado ? 'Gravando…' : 'Li e aceito', E.ocupado, false, E.ocupado || !comSinal()) +
    '<button type="button" class="btn fantasma" data-aba="inicio">Agora não</button></div>' + ajuda('termo') + '</div>';
}
function telaPerfil() {
  var p = pessoaAtual(), par = parametrosDe(p);
  var linhas = [['Nome', p.nomeCompleto || p.nome], ['Matrícula', p.matricula], ['Função', p.funcao], ['Lotação', p.lotacao]].filter(function (l) { return l[1]; });
  return '<div class="conteudo"><p class="etiqueta n-secao app-sem-margem">Perfil</p>' + mensagens() +
    '<div class="cartao"><dl class="app-resumo" id="dados">' + linhas.map(function (l) { return '<dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd>'; }).join('') + '</dl></div>' +
    '<p class="etiqueta n-secao">Neste celular</p><div class="cartao"><dl class="app-resumo">' +
    '<dt>Entrada</dt><dd>vale até o fim de hoje (' + esc(fusoDe(p).replace('America/', '').replace('_', ' ')) + ')</dd>' +
    '<dt>Sem sinal</dt><dd>' + (p.verif ? 'entra com a senha, até ' + par.diasSemSinal + ' dias sem falar com o login' : 'só entra com sinal') + '</dd>' +
    (p.sessaoAte ? '<dt>Aparelho</dt><dd>registrado até ' + esc(brDe(p.sessaoAte)) + ' (renova a cada entrada com sinal)</dd>' : '') + '</dl>' +
    botao('sair', 'Trocar de pessoa') + botao('esquecer', 'Tirar meus dados deste celular', false, true) + '</div>' +
    ajuda('perfil') + '<p class="app-versao">App Compel · versão ' + esc(VERSAO_APP) + '</p></div>';
}

function desenhar() {
  var tela = E.tela, logado = TELAS_DE_DENTRO.indexOf(tela) >= 0;
  if (logado && !entradaValeHoje()) { tela = E.tela = 'entrar'; logado = false; if (E.atual) { E.escolhida = E.atual.chave; E.atual = null; gravarAtual(); } }
  var s = $('sinal'); s.className = 'app-sinal ' + (comSinal() ? 'on' : 'off'); s.textContent = comSinal() ? 'Com sinal' : 'Sem sinal';
  $('codigo').textContent = CODIGOS[tela] || '';
  // Na entrada não há barra (como no Portal); dentro, a barra grafite com a marca e as abas de baixo.
  $('topo').classList.toggle('oculto', !logado);
  $('abas').classList.toggle('oculto', !logado);
  Array.prototype.forEach.call(document.querySelectorAll('#abas button'), function (b) { b.classList.toggle('ativo', b.getAttribute('data-aba') === tela); });
  var n = logado ? quantosNovos() : 0, bol = $('bolinha'); bol.classList.toggle('oculto', !n); bol.textContent = n > 9 ? '9+' : n;
  // A aba de Envio só existe quando algum bloco deste app envia; a bolinha dela é o que espera para subir.
  $('abaEnvio').classList.toggle('oculto', !blocosQueEnviam().length);
  var pe = logado ? totalPendente() : 0, bolE = $('bolinhaEnvio'); bolE.classList.toggle('oculto', !pe); bolE.textContent = pe > 9 ? '9+' : pe;
  // O que a pessoa já digitou no CPF e no e-mail sobrevive ao redesenho (um erro não a obriga a digitar de novo).
  // A senha não: depois de um erro, ela é digitada outra vez.
  var guardados = {};
  if (E.telaDesenhada === tela) ['cpf', 'email'].forEach(function (id) { var c = $(id); if (c) guardados[id] = c.value; });
  E.telaDesenhada = tela;
  var html = { entrar: telaEntrar, primeiro: telaPrimeiro, trocar: telaTrocar, esqueci: telaEsqueci, inicio: telaInicio, avisos: telaAvisos, envio: telaEnvio, termo: telaTermo, perfil: telaPerfil }[tela];
  $('corpo').innerHTML = html ? html() : '<div class="carregando">Abrindo…</div>';
  Object.keys(guardados).forEach(function (id) { var c = $(id); if (c) c.value = guardados[id]; });
}
function telaLogada() { return TELAS_DE_DENTRO.indexOf(E.tela) >= 0; }
/* O sinal que vai e volta não redesenha a tela de entrada (apagaria o que a pessoa está digitando): só o aviso do
   topo muda. Nas telas de dentro, redesenha, porque os módulos e os avisos dependem do sinal. */
function mudouOSinal() {
  if (comSinal()) enviarOQueEspera('o sinal voltou');
  if (telaLogada()) { desenhar(); if (comSinal() && pessoaAtual() && !E.avisos) buscarAvisos(); return; }
  var s = $('sinal'); s.className = 'app-sinal ' + (comSinal() ? 'on' : 'off'); s.textContent = comSinal() ? 'Com sinal' : 'Sem sinal';
  var aviso = document.querySelector('.app-sem-sinal'); if (aviso) aviso.classList.toggle('oculto', comSinal());
}

function irPara(tela, ok) {
  E.tela = tela; E.erro = ''; E.ok = ok || ''; E.ajuda = false; E.ocupado = false;
  if (tela === 'avisos') { if (E.avisos && E.avisos.lista) marcarAvisosVistos(); else buscarAvisos(); }
  if (tela === 'inicio' && !E.avisos) buscarAvisos();
  if (tela !== 'avisos') delete E.avisosNovosAntes;
  if (tela === 'envio') lerEnvio();
  desenhar();
  window.scrollTo(0, 0);
}

/* ---------- os toques ---------- */
document.addEventListener('click', function (ev) {
  var aba = ev.target.closest('[data-aba]');
  if (aba) { ev.preventDefault(); return irPara(aba.getAttribute('data-aba')); }
  var b = ev.target.closest('[data-acao]');
  if (!b || b.disabled) return;
  var a = b.getAttribute('data-acao');
  if (a === 'ajuda') { E.ajuda = !E.ajuda; return desenhar(); }
  if (a === 'atualizar') return location.reload();
  if (a === 'escolher') { E.escolhida = b.getAttribute('data-chave') || ''; E.erro = ''; desenhar(); var c = $(E.escolhida ? 'senha' : 'cpf'); if (c) c.focus(); return; }
  if (a === 'entrarCpf') return entrarComCpf();
  if (a === 'entrarEscolhida') return entrarComoEscolhida();
  if (a === 'criarSenha') return criarSenha();
  if (a === 'trocarSenha') return trocarSenha();
  if (a === 'esqueciSenha') return esqueciSenha();
  if (a === 'irPrimeiro') return irPara('primeiro');
  if (a === 'irEsqueci') return irPara('esqueci');
  if (a === 'irEntrar') { E.memoria = null; return irPara('entrar'); }
  if (a === 'abrirModulo') return abrirModulo(+b.getAttribute('data-i'));
  if (a === 'aceitarTermo') return aceitarTermo();
  if (a === 'enviarBloco') return enviarBloco(b.getAttribute('data-bloco'), 'Enviar agora');
  if (a === 'sair') return sair();
  if (a === 'esquecer') return esquecerNesteCelular();
});
document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'cpf') ev.target.value = mascaraDoCpf(ev.target.value); });
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Enter' || !ev.target || ev.target.tagName !== 'INPUT') return;
  var b = $('corpo').querySelector('.btn:not(.fantasma)'); if (b && !b.disabled) { ev.preventDefault(); b.click(); }
});
window.addEventListener('online', mudouOSinal);
window.addEventListener('offline', mudouOSinal);
// Um celular que fica aberto de um dia para o outro: ao voltar para o app, a entrada é conferida de novo.
document.addEventListener('visibilitychange', function () { if (!document.hidden && telaLogada() && !entradaValeHoje()) desenhar(); });

/* ---------- a versão nova ---------- */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // O segundo plano mexeu na fila: a tela relê.
  navigator.serviceWorker.addEventListener('message', function (ev) { if (ev.data && ev.data.fila) lerEnvio(); });
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    reg.addEventListener('updatefound', function () {
      var novo = reg.installing;
      if (!novo) return;
      novo.addEventListener('statechange', function () {
        // Só avisa quando já havia uma versão antes: na primeira instalação não há o que trocar.
        if (novo.state === 'activated' && navigator.serviceWorker.controller) $('barraVersao').classList.remove('oculto');
      });
    });
  }).catch(function () { });
}

/* ---------- abrir ---------- */
function iniciar() {
  return Promise.all([lerKv('aparelho'), lerKv('pessoas'), lerKv('atual')]).then(function (v) {
    E.aparelho = v[0]; E.pessoas = v[1] || {}; E.atual = v[2] || null;
    if (!E.aparelho) { E.aparelho = { id: sorteio(16), chave: sorteio(16) }; return gravarKv('aparelho', E.aparelho); }
  }).then(function () {
    if (E.atual && !E.pessoas[E.atual.chave]) E.atual = null;
    var chaves = Object.keys(E.pessoas);
    E.escolhida = chaves.length === 1 ? chaves[0] : null;
    irPara(E.atual && entradaValeHoje() ? 'inicio' : 'entrar');
    return carregarEnvioDosBlocos().then(lerEnvio).then(function () { return enviarOQueEspera('ao abrir'); });
  }, function () {
    $('corpo').innerHTML = '<div class="conteudo"><div class="aviso erro">Este navegador não deixou o app guardar dados (modo anônimo?). Abra o app instalado ou o navegador normal.</div></div>';
  });
}
iniciar();
registrarServiceWorker();
