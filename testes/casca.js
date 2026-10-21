#!/usr/bin/env node
/*
 * A BATERIA DA CASCA (21/10/2026). Abre o app de verdade no Chromium, nas larguras de celular, e confere as regras da
 * entrada, do Início, dos Avisos e do Perfil.
 *
 * O login do Núcleo aqui é IMITADO, só dentro do teste: o Chromium intercepta o endereço e responde no formato
 * combinado por carta (cartas nº 8 a 10 do Núcleo, nº 12 do App). O app publicado não tem login imitado nenhum: ele
 * fala com o endereço de config/login.js, e enquanto esse endereço está vazio ninguém entra.
 *
 * Nenhum dado da Compel: os CPFs são sorteados na hora (dígitos certos, ninguém real por escolha), os nomes são
 * inventados, e nada disso fica escrito neste arquivo.
 *
 * Uso: node testes/casca.js            (precisa do Playwright; neste ambiente, NODE_PATH=/opt/npm-tools/node_modules)
 *      node testes/casca.js --so T08    (um teste só)
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }

var RAIZ = path.resolve(__dirname, '..');
var LOGIN = 'https://login.teste.invalid/exec';

/* ---------- um CPF sorteado, com os dígitos certos ---------- */
function cpfSorteado() {
  for (;;) {
    var d = []; for (var i = 0; i < 9; i++) d.push(Math.floor(Math.random() * 10));
    for (var t = 9; t <= 10; t++) { var s = 0; for (var j = 0; j < t; j++) s += d[j] * (t + 1 - j); d.push((s * 10) % 11 % 10); }
    var c = d.join('');
    if (!/^(\d)\1{10}$/.test(c)) return c;
  }
}
function formatado(c) { return c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9); }
function isoMenosDias(base, n) { var d = new Date(base); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

/* ---------- o login imitado ---------- */
function novoLogin() {
  var L = {
    pessoas: {}, sessoes: {}, pedidos: [], fora: false, hoje: '2026-10-21',
    criar: function (nome, dados) { var cpf = cpfSorteado(); L.pessoas[cpf] = Object.assign({ cpf: cpf, nome: nome }, dados); return cpf; }
  };
  L.resposta = function (p) {
    var sessao = 'sess-' + Math.random().toString(36).slice(2); L.sessoes[sessao] = p.cpf;
    return {
      ok: true,
      aparelho: { sessao: sessao, validaAte: isoMenosDias(L.hoje + 'T12:00:00Z', -30) },
      entrada: { ate: 'fimDoDia', fuso: p.fuso || 'America/Sao_Paulo' },
      pessoa: { nome: p.nome.split(' ').slice(0, 2).join(' '), nomeCompleto: p.nome, matricula: p.matricula || '', funcao: p.funcao || 'ELETRICISTA', lotacao: p.lotacao || 'DOURADOS', trocarSenha: !!p.temporaria },
      bases: ['DOU'],
      verificador: { algo: 'PBKDF2-SHA256', rodadas: 100000 },
      parametros: { errosAteTravar: 5, minutosDeTrava: 30, diasSemSinal: 7 },
      modulos: p.modulos || []
    };
  };
  L.atender = function (corpo) {
    L.pedidos.push(corpo);
    if (L.fora) return { respondeu: false };
    var p = corpo.cpf ? L.pessoas[corpo.cpf] : L.pessoas[L.sessoes[corpo.sessao]];
    switch (corpo.acao) {
      case 'entrar':
        if (!p) return corpo.sessao ? { ok: false, pedirCpf: true, erro: 'Entre com o CPF.' } : { ok: false, erro: 'CPF ou senha não conferem.' };
        if (!p.senha) return { ok: false, semSenha: true, erro: 'Você ainda não tem senha.' };
        if (p.senha !== corpo.senha) return { ok: false, erro: 'CPF ou senha não conferem.' };
        return L.resposta(p);
      case 'criarSenha':
        if (!p) return { ok: false, erro: 'CPF não encontrado.' };
        if (p.senha) return { ok: false, erro: 'Você já tem senha.' };
        p.senha = corpo.senha; p.email = corpo.email; return L.resposta(p);
      case 'trocarSenha':
        if (!p || p.senha !== corpo.senhaAtual) return { ok: false, erro: 'A senha atual não confere.' };
        p.senha = corpo.senhaNova; p.temporaria = false; return L.resposta(p);
      case 'esqueciSenha':
        if (!p) return { ok: false, erro: 'CPF não encontrado.' };
        return { ok: true, mensagem: 'Mandamos uma senha temporária para o e-mail cadastrado.' };
      case 'token':
        if (!p) return { ok: false, erro: 'Sessão vencida.' };
        return { ok: true, token: 'tok-' + Math.random().toString(36).slice(2) };
      case 'avisos':
        if (!p) return { ok: false, erro: 'Sessão vencida.' };
        return { ok: true, comunicacoes: L.comunicacoes || [] };
    }
    return { ok: false, erro: 'ação desconhecida' };
  };
  return L;
}

/* ---------- o site do app, servido da pasta do repositório ---------- */
function servir() {
  var tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  var srv = http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]); if (rel.endsWith('/')) rel += 'index.html';
    var arq = path.join(RAIZ, rel);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise(function (ok) { srv.listen(0, '127.0.0.1', function () { ok(srv); }); });
}

/* ---------- abrir o app num celular de teste ---------- */
var navegador, site, base;
async function abrir(L, op) {
  op = op || {};
  var ctx = await navegador.newContext({ viewport: { width: op.largura || 390, height: 800 }, timezoneId: op.fuso || 'America/Sao_Paulo', locale: 'pt-BR',
    serviceWorkers: op.comServiceWorker ? 'allow' : 'block', isMobile: true, hasTouch: true });
  if (L) {
    await ctx.route('**/config/login.js', function (r) { r.fulfill({ contentType: 'text/javascript', body: "var ENDERECO_DO_LOGIN = '" + LOGIN + "';" }); });
    await ctx.route(LOGIN + '*', function (r) {
      var corpo = JSON.parse(r.request().postData() || '{}');
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(L.atender(corpo)) });
    });
    await ctx.route('https://modulo.teste.invalid/**', function (r) { r.fulfill({ contentType: 'text/html', body: '<p>módulo</p>' }); });
  }
  var page = await ctx.newPage();
  if (op.relogio) await page.clock.install({ time: new Date(op.relogio) });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#corpo .cartao');
  return { ctx: ctx, page: page };
}
async function texto(page, sel) { return (await page.textContent(sel || '#corpo')) || ''; }
async function esperarTexto(page, trecho, sel) {
  await page.waitForFunction(function (a) { var el = document.querySelector(a[1] || '#corpo'); return el && el.textContent.indexOf(a[0]) >= 0; }, [trecho, sel], { timeout: 15000 });
}
async function entrarCpf(page, cpf, senha) {
  await page.fill('#cpf', cpf); await page.fill('#senha', senha); await page.click('[data-acao="entrarCpf"]');
}
async function oQueEstaGuardado(page) {
  return page.evaluate(function () {
    return new Promise(function (ok) {
      var r = indexedDB.open('app-compel-casca');
      r.onsuccess = function () {
        var t = r.result.transaction('kv'), st = t.objectStore('kv'), saida = {};
        var c = st.openCursor();
        c.onsuccess = function () { var x = c.result; if (x) { saida[x.key] = x.value; x.continue(); } else ok(JSON.stringify(saida) + JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage))); };
      };
    });
  });
}
function afirmar(cond, msg) { if (!cond) throw new Error(msg); }

/* Uma pessoa com módulos na ordem da ORDEM da MODULOS (que não é a alfabética, de propósito). */
var MODULOS_DA_ANA = [
  { modulo: 'TREINAMENTO', nome: 'Treinamentos', url: 'https://modulo.teste.invalid/treino', perfil: 'ALUNO', liberado: true },
  { modulo: 'OPERACAO', nome: 'Operação', url: 'https://modulo.teste.invalid/operacao', perfil: 'ENCARREGADO', liberado: true },
  { modulo: 'FINANCEIRO', nome: 'Financeiro', url: 'https://modulo.teste.invalid/fin', perfil: 'CONSULTA', liberado: false, motivo: 'Complete seu cadastro para liberar' },
  { modulo: 'GESTAO_A_VISTA', nome: 'Gestão à Vista', url: '', perfil: 'CONSULTA', liberado: true }
];
function loginComAna(dados) {
  var L = novoLogin();
  var cpf = L.criar('Ana Teste Exemplo', Object.assign({ senha: 'senha-da-ana', fuso: 'America/Campo_Grande', matricula: '99901', modulos: MODULOS_DA_ANA }, dados || {}));
  return { L: L, cpf: cpf };
}

/* ---------- os testes ---------- */
var TESTES = {
  T01_sem_endereco_ninguem_entra: async function () {
    var a = await abrir(null);
    await esperarTexto(a.page, 'ainda não está ligado ao login');
    afirmar(await a.page.isDisabled('[data-acao="entrarCpf"]'), 'o botão Entrar devia estar desligado sem o endereço do login');
    await a.ctx.close();
  },
  T02_entrar_com_cpf_e_a_ordem_dos_modulos: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, formatado(x.cpf), 'senha-da-ana');
    await esperarTexto(a.page, 'Olá, Ana');
    var nomes = await a.page.$$eval('#modulos .n-modulo .n-nome', function (bs) { return bs.map(function (b) { return b.textContent; }); });
    afirmar(nomes.join('|') === 'Treinamentos|Operação|Financeiro|Gestão à Vista', 'a ordem dos módulos tem de ser a do login, e veio ' + nomes.join('|'));
    afirmar(await a.page.isDisabled('#modulos .n-modulo[data-i="2"]'), 'o módulo não liberado devia estar apagado');
    afirmar((await texto(a.page, '#modulos .n-modulo[data-i="2"]')).indexOf('Complete seu cadastro') >= 0, 'o motivo do módulo não liberado não apareceu');
    afirmar((await texto(a.page, '#modulos .n-modulo[data-i="3"]')).indexOf('Em breve') >= 0, 'o módulo sem endereço devia dizer "Em breve"');
    afirmar((await texto(a.page, '#codigo')) === 'APP-05', 'o código da tela do Início');
    await a.ctx.close();
  },
  T03_nenhum_cpf_guardado_nem_na_tela: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana');
    await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-aba="perfil"]'); await esperarTexto(a.page, 'Matrícula');
    var guardado = await oQueEstaGuardado(a.page), tela = await a.page.textContent('body');
    [x.cpf, formatado(x.cpf)].forEach(function (c) {
      afirmar(guardado.indexOf(c) < 0, 'o CPF ficou guardado no celular');
      afirmar(tela.indexOf(c) < 0, 'o CPF apareceu na tela');
    });
    afirmar(guardado.indexOf('senha-da-ana') < 0, 'a senha ficou guardada no celular');
    await a.ctx.close();
  },
  T04_quem_ja_entrou_toca_no_nome_e_o_cpf_nao_vai: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-aba="perfil"]'); await a.page.click('[data-acao="sair"]');
    await esperarTexto(a.page, 'Já entraram neste celular');
    await a.page.click('[data-acao="escolher"][data-chave]:not([data-chave=""])');
    await a.page.fill('#senha', 'senha-da-ana'); await a.page.click('[data-acao="entrarEscolhida"]');
    await esperarTexto(a.page, 'Olá, Ana');
    var ultimo = x.L.pedidos.filter(function (p) { return p.acao === 'entrar'; }).pop();
    afirmar(!ultimo.cpf && ultimo.sessao, 'a entrada pelo nome devia mandar a sessão do aparelho, e não o CPF');
    await a.ctx.close();
  },
  T05_sem_sinal_entra_pelo_verificador_e_trava: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-aba="perfil"]'); await a.page.click('[data-acao="sair"]');
    await a.ctx.setOffline(true);
    var antes = x.L.pedidos.length;
    await a.page.click('[data-acao="escolher"][data-chave]:not([data-chave=""])');
    await a.page.fill('#senha', 'errada'); await a.page.click('[data-acao="entrarEscolhida"]');
    await esperarTexto(a.page, '1 de 5, sem sinal');
    for (var i = 2; i <= 5; i++) { await a.page.fill('#senha', 'errada'); await a.page.click('[data-acao="entrarEscolhida"]'); await a.page.waitForSelector('#erro'); }
    await esperarTexto(a.page, 'espere 30 minutos');
    await a.page.fill('#senha', 'senha-da-ana'); await a.page.click('[data-acao="entrarEscolhida"]');
    await esperarTexto(a.page, 'Muitas senhas erradas sem sinal');
    afirmar(x.L.pedidos.length === antes, 'sem sinal, nada podia ir ao login');
    await a.ctx.close();
    // Outro celular, a mesma pessoa: a senha certa sem sinal entra.
    var b = await abrir(x.L);
    await entrarCpf(b.page, x.cpf, 'senha-da-ana'); await esperarTexto(b.page, 'Olá, Ana');
    await b.page.click('[data-aba="perfil"]'); await b.page.click('[data-acao="sair"]');
    await b.ctx.setOffline(true);
    await b.page.click('[data-acao="escolher"][data-chave]:not([data-chave=""])');
    await b.page.fill('#senha', 'senha-da-ana'); await b.page.click('[data-acao="entrarEscolhida"]');
    await esperarTexto(b.page, 'Entrou sem sinal');
    await b.ctx.close();
  },
  T06_login_sem_responder_e_sem_sinal_e_nunca_senha_errada: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-aba="perfil"]'); await a.page.click('[data-acao="sair"]');
    x.L.fora = true;
    await a.page.click('[data-acao="escolher"][data-chave]:not([data-chave=""])');
    await a.page.fill('#senha', 'senha-da-ana'); await a.page.click('[data-acao="entrarEscolhida"]');
    await esperarTexto(a.page, 'Entrou sem sinal');
    await a.ctx.close();
    // Quem nunca entrou neste celular, com o login sem responder: a mensagem é de sinal, nunca "senha errada".
    var b = await abrir(x.L);
    await entrarCpf(b.page, x.cpf, 'senha-da-ana');
    await esperarTexto(b.page, 'primeira entrada de cada pessoa neste celular precisa de sinal');
    afirmar((await texto(b.page)).indexOf('não conferem') < 0, 'o login sem responder virou "senha errada"');
    await b.ctx.close();
  },
  T07_cpf_invalido_e_senha_errada_com_sinal: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    var errado = x.cpf.slice(0, 10) + String((+x.cpf[10] + 1) % 10);
    await entrarCpf(a.page, errado, 'senha-da-ana');
    await esperarTexto(a.page, 'Confira o CPF');
    afirmar((await a.page.inputValue('#cpf')).replace(/\D/g, '') === errado, 'o CPF digitado devia continuar no campo depois do erro');
    afirmar(x.L.pedidos.length === 0, 'CPF que não fecha não vai ao login');
    await entrarCpf(a.page, x.cpf, 'outra');
    await esperarTexto(a.page, 'CPF ou senha não conferem');
    afirmar((await oQueEstaGuardado(a.page)).indexOf('"pessoas":{}') >= 0 || (await oQueEstaGuardado(a.page)).indexOf('"pessoas"') < 0, 'senha errada não guarda ninguém');
    await a.ctx.close();
  },
  T08_a_entrada_vale_ate_o_fim_do_dia_no_fuso_da_base: async function () {
    // Ana é de Campo Grande (UTC−4). O celular está no horário de Brasília. Ela entra às 22h30 de Brasília.
    var x = loginComAna(), a = await abrir(x.L, { relogio: '2026-10-21T22:30:00-03:00' });
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    // 00h30 de Brasília = 23h30 em Campo Grande: ainda é o dia dela.
    await a.page.clock.setSystemTime(new Date('2026-10-22T00:30:00-03:00'));
    await a.page.click('[data-aba="perfil"]'); await esperarTexto(a.page, 'Matrícula');
    // 01h10 de Brasília = 00h10 em Campo Grande: o dia dela acabou.
    await a.page.clock.setSystemTime(new Date('2026-10-22T01:10:00-03:00'));
    await a.page.click('[data-aba="inicio"]');
    await esperarTexto(a.page, 'Senha de Ana');
    await a.ctx.close();
    // A mesma conta para quem é de São Paulo: às 00h30 de Brasília o dia já acabou.
    var y = loginComAna({ fuso: 'America/Sao_Paulo' }), b = await abrir(y.L, { relogio: '2026-10-21T22:30:00-03:00' });
    await entrarCpf(b.page, y.cpf, 'senha-da-ana'); await esperarTexto(b.page, 'Olá, Ana');
    await b.page.clock.setSystemTime(new Date('2026-10-22T00:30:00-03:00'));
    await b.page.click('[data-aba="perfil"]');
    await esperarTexto(b.page, 'Senha de Ana');
    await b.ctx.close();
  },
  T09_primeiro_acesso_cria_a_senha_e_entra: async function () {
    var L = novoLogin(), cpf = L.criar('Bruno Teste Exemplo', { modulos: MODULOS_DA_ANA.slice(0, 1) }), a = await abrir(L);
    await entrarCpf(a.page, cpf, 'qualquer');
    await esperarTexto(a.page, 'ainda não tem senha');
    afirmar((await texto(a.page, '#codigo')) === 'APP-02', 'sem senha, o app devia ir para o primeiro acesso');
    await a.page.fill('#cpf', cpf); await a.page.fill('#email', 'bruno@exemplo.invalid');
    await a.page.fill('#senha', 'nova-do-bruno'); await a.page.fill('#senha2', 'nova-do-bruno');
    await a.page.click('[data-acao="criarSenha"]');
    await esperarTexto(a.page, 'Olá, Bruno');
    afirmar(L.pessoas[cpf].email === 'bruno@exemplo.invalid', 'o e-mail digitado devia ir ao login');
    await a.ctx.close();
  },
  T10_senha_temporaria_pede_a_troca_e_nada_fica_antes: async function () {
    var L = novoLogin(), cpf = L.criar('Carla Teste Exemplo', { senha: 'temp-123', temporaria: true, modulos: MODULOS_DA_ANA.slice(0, 1) }), a = await abrir(L);
    await entrarCpf(a.page, cpf, 'temp-123');
    await esperarTexto(a.page, 'senha temporária');
    afirmar((await texto(a.page, '#codigo')) === 'APP-03', 'a senha temporária devia levar à troca');
    // Espera o tempo de uma conta do verificador (100 mil voltas): o que fosse guardado já estaria lá.
    await a.page.waitForTimeout(1500);
    afirmar((await oQueEstaGuardado(a.page)).indexOf('Carla') < 0, 'com a senha temporária, nada da pessoa podia ficar guardado');
    await a.page.fill('#senha', 'minha-da-carla'); await a.page.fill('#senha2', 'minha-da-carla');
    await a.page.click('[data-acao="trocarSenha"]');
    await esperarTexto(a.page, 'Olá, Carla');
    afirmar(L.pessoas[cpf].senha === 'minha-da-carla', 'a senha nova devia ir ao login');
    await a.ctx.close();
  },
  T11_esqueci_a_senha: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await a.page.click('[data-acao="irEsqueci"]');
    await a.page.fill('#cpf', x.cpf); await a.page.click('[data-acao="esqueciSenha"]');
    await esperarTexto(a.page, 'senha temporária para o e-mail');
    afirmar((await texto(a.page, '#codigo')) === 'APP-01', 'depois do pedido, a volta é para a entrada');
    await a.ctx.close();
  },
  T12_avisos_de_30_dias_e_o_novo: async function () {
    var x = loginComAna({ fuso: 'America/Sao_Paulo' });
    x.L.comunicacoes = [
      { id: 'a', titulo: 'Aviso de hoje', data: '2026-10-21', categoria: 'Segurança', proporcao: '4:5' },
      { id: 'b', titulo: 'Aviso de 40 dias', data: isoMenosDias('2026-10-21T12:00:00Z', 40) },
      { id: 'c', titulo: 'Aviso de 10 dias', data: isoMenosDias('2026-10-21T12:00:00Z', 10) },
      { id: 'd', titulo: 'Aviso do futuro', data: '2026-11-30' }
    ];
    var a = await abrir(x.L, { relogio: '2026-10-21T10:00:00-03:00' });
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await esperarTexto(a.page, 'Há 2 avisos novos');
    afirmar((await texto(a.page, '#bolinha')) === '2', 'a aba Avisos devia mostrar 2');
    await a.page.click('[data-aba="avisos"]');
    await a.page.waitForSelector('#listaAvisos');
    var titulos = await a.page.$$eval('#listaAvisos .aviso-item .app-titulo', function (bs) { return bs.map(function (b) { return b.textContent; }); });
    afirmar(titulos.join('|') === 'Aviso de hoje|Aviso de 10 dias', 'os avisos da janela de 30 dias, do mais novo para o mais velho; veio ' + titulos.join('|'));
    afirmar((await a.page.$$('#listaAvisos .app-novo')).length === 2, 'na primeira visita, os dois são novos');
    await a.page.click('[data-aba="inicio"]');
    afirmar(await a.page.isHidden('#bolinha'), 'depois de ver, a bolinha some');
    await a.page.click('[data-aba="avisos"]'); await a.page.waitForSelector('#listaAvisos');
    afirmar((await a.page.$$('#listaAvisos .app-novo')).length === 0, 'na segunda visita, nenhum é novo');
    var guardado = await oQueEstaGuardado(a.page);
    afirmar(guardado.indexOf('Aviso de hoje') < 0, 'o conteúdo dos avisos não fica guardado no celular');
    await a.ctx.close();
  },
  T13_o_token_e_pedido_no_toque_e_nao_fica: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    afirmar(!x.L.pedidos.some(function (p) { return p.acao === 'token'; }), 'nenhum token antes do toque');
    var aguardar = a.ctx.waitForEvent('page');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    var janela = await aguardar;
    await janela.waitForURL(/modulo\.teste\.invalid\/treino\?t=tok-/);
    var pedido = x.L.pedidos.filter(function (p) { return p.acao === 'token'; }).pop();
    afirmar(pedido && pedido.modulo === 'TREINAMENTO' && !pedido.cpf, 'o token é pedido pela sessão, com o módulo');
    var token = new URL(janela.url()).searchParams.get('t');
    afirmar((await oQueEstaGuardado(a.page)).indexOf(token) < 0, 'o token não pode ficar guardado');
    await a.ctx.close();
  },
  T14_nenhuma_tela_passa_da_largura_do_celular: async function () {
    for (var largura of [360, 412]) {
      var x = loginComAna(); x.L.comunicacoes = [{ id: 'a', titulo: 'Um aviso com um título bem comprido para ver se quebra a linha direito', data: '2026-10-21', categoria: 'Comunicação interna' }];
      var a = await abrir(x.L, { largura: largura, relogio: '2026-10-21T10:00:00-03:00' });
      var conferir = async function (nome) {
        var passa = await a.page.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
        afirmar(passa <= 0, 'a tela ' + nome + ' passa ' + passa + ' px da largura de ' + largura);
      };
      await a.page.click('[data-acao="ajuda"]'); await conferir('Entrar com a ajuda aberta');
      await a.page.click('[data-acao="irPrimeiro"]'); await conferir('Primeiro acesso');
      await a.page.click('[data-acao="irEntrar"]'); await a.page.click('[data-acao="irEsqueci"]'); await conferir('Esqueci a senha');
      await a.page.click('[data-acao="irEntrar"]');
      await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana'); await conferir('Início');
      await a.page.click('[data-aba="avisos"]'); await a.page.waitForSelector('#listaAvisos'); await conferir('Avisos');
      await a.page.click('[data-aba="perfil"]'); await conferir('Perfil');
      await a.page.click('[data-acao="sair"]'); await conferir('Entrar com a lista de quem já entrou');
      await a.ctx.close();
    }
  },
  T15_toda_tela_tem_ajuda: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    var conferir = async function (nome) {
      await a.page.click('[data-acao="ajuda"]');
      var t = await a.page.textContent('#textoAjuda').catch(function () { return ''; });
      afirmar(t && t.length > 40, 'a tela ' + nome + ' não tem ajuda');
    };
    await conferir('Entrar');
    await a.page.click('[data-acao="irPrimeiro"]'); await conferir('Primeiro acesso');
    await a.page.click('[data-acao="irEntrar"]'); await a.page.click('[data-acao="irEsqueci"]'); await conferir('Esqueci a senha');
    await a.page.click('[data-acao="irEntrar"]');
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana'); await conferir('Início');
    await a.page.click('[data-aba="avisos"]'); await conferir('Avisos');
    await a.page.click('[data-aba="perfil"]'); await conferir('Perfil');
    await a.ctx.close();
  },
  T16_abre_sem_sinal_depois_de_aberto_uma_vez: async function () {
    // "Sem rede" aqui é o site fora do ar de verdade: o setOffline do Chromium não alcança o que o service worker busca
    // (medido em 21/10/2026: com a página fora da lista do service worker, o teste passava do mesmo jeito).
    var proprio = await servir(), endereco = 'http://127.0.0.1:' + proprio.address().port;
    var ctx = await navegador.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow' });
    var page = await ctx.newPage();
    await page.goto(endereco + '/index.html');
    await page.evaluate(function () { return navigator.serviceWorker.ready; });
    await page.reload();
    afirmar(await page.evaluate(function () { return !!navigator.serviceWorker.controller; }), 'o service worker não assumiu a página');
    proprio.closeAllConnections(); await new Promise(function (ok) { proprio.close(ok); });
    await ctx.setOffline(true);
    await page.reload();
    await esperarTexto(page, 'Entrar');
    afirmar((await texto(page, '#sinal')) === 'Sem sinal', 'sem rede, o topo devia dizer "Sem sinal"');
    // O visual do Portal sem sinal: as fontes e a marca vêm do próprio app, e não da internet.
    var visual = await page.evaluate(async function () {
      await document.fonts.ready;
      // check() sozinho devolve "sim" quando a fonte nem foi declarada. O que prova é pedir a face e vê-la chegar:
      // sem rede, ela só chega se o app a guardou.
      var carregar = function (f) { return document.fonts.load(f).then(function (l) { return l.length > 0 && l.every(function (x) { return x.status === 'loaded'; }); }, function () { return false; }); };
      var r = await Promise.all([carregar('16px Inter'), carregar('700 20px "Josefin Sans"'), carregar('600 16px "Barlow Condensed"')]);
      return { inter: r[0], josefin: r[1], barlow: r[2],
               marca: !!document.querySelector('symbol#marca-quadrada') && document.querySelector('.login-marca svg use') !== null };
    });
    afirmar(visual.inter && visual.josefin && visual.barlow, 'sem sinal, as fontes do Portal não carregaram: ' + JSON.stringify(visual));
    afirmar(visual.marca, 'sem sinal, a marca da Compel não apareceu');
    await ctx.close();
  },
  T18_o_visual_e_o_do_portal: async function () {
    // As peças que fazem a tela ser a do Portal: a folha do Núcleo, a marca oficial e as três fontes.
    var x = loginComAna(), a = await abrir(x.L);
    var entrada = await a.page.evaluate(async function () {
      await document.fonts.ready;
      var m = document.querySelector('.moldura'), cs = m && getComputedStyle(m);
      // A marca tem de DESENHAR, e não só estar pedida: um <use> que aponta para um símbolo que não existe fica vazio,
      // sem erro nenhum. A largura do que foi desenhado é a prova.
      var uso = document.querySelector('.login-marca svg.logo-oficial use[href="#marca-quadrada"]');
      return { moldura: cs ? cs.borderTopColor : '', marca: !!uso && uso.getBBox().width > 0,
               fonte: getComputedStyle(document.body).fontFamily,
               inter: await document.fonts.load('16px Inter').then(function (l) { return l.length > 0 && l[0].status === 'loaded'; }) };
    });
    afirmar(entrada.moldura === 'rgb(237, 28, 36)', 'a moldura da entrada devia ser o vermelho da marca (#ED1C24), e veio ' + entrada.moldura);
    afirmar(entrada.marca, 'a entrada devia ter a marca quadrada oficial');
    afirmar(/Inter/.test(entrada.fonte) && entrada.inter, 'o texto devia estar na Inter, carregada do próprio app');
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    var dentro = await a.page.evaluate(function () {
      var t = document.getElementById('topo');
      var uso = t.querySelector('use[href="#marca-horizontal"]');
      return { barra: getComputedStyle(t).backgroundColor, marca: !!uso && uso.getBBox().width > 0, cartoes: document.querySelectorAll('.n-grade .n-modulo').length };
    });
    afirmar(dentro.barra === 'rgb(35, 31, 32)', 'a barra de cima devia ser a grafite do Portal, e veio ' + dentro.barra);
    afirmar(dentro.marca, 'a barra devia ter a marca horizontal oficial');
    afirmar(dentro.cartoes === 4, 'os sistemas deviam ser os cartões .n-modulo do Portal');
    await a.ctx.close();
  },
  T17_tirar_meus_dados_deste_celular: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-aba="perfil"]'); await a.page.click('[data-acao="esquecer"]');
    await esperarTexto(a.page, 'Seus dados saíram deste celular');
    afirmar((await oQueEstaGuardado(a.page)).indexOf('Ana') < 0, 'os dados da pessoa deviam ter saído');
    await a.ctx.setOffline(true);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana');
    await esperarTexto(a.page, 'precisa de sinal');
    await a.ctx.close();
  }
};

(async function () {
  var so = process.argv.indexOf('--so') >= 0 ? process.argv[process.argv.indexOf('--so') + 1] : null;
  site = await servir(); base = 'http://127.0.0.1:' + site.address().port;
  navegador = await pw.chromium.launch();
  var falhas = 0, nomes = Object.keys(TESTES).filter(function (n) { return !so || n.indexOf(so) === 0; });
  for (var n of nomes) {
    var t0 = Date.now();
    try { await TESTES[n](); console.log('  ok    ' + n + ' (' + (Date.now() - t0) + ' ms)'); }
    catch (e) { falhas++; console.log('  FALHA ' + n + ': ' + (e && e.message || e).split('\n')[0]); }
  }
  await navegador.close(); site.close();
  console.log(falhas ? '\n' + falhas + ' de ' + nomes.length + ' falharam.' : '\nTodos os ' + nomes.length + ' passaram.');
  process.exitCode = falhas ? 1 : 0;
})();
