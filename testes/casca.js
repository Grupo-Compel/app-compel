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
 * O SITE DA BATERIA É UMA CÓPIA (21/10/2026): o repositório é copiado para uma pasta temporária, e nela entram o
 * bloco de exemplo (testes/bloco-exemplo, em blocos/exemplo/), o resumo do endereço inventado do servidor dele e o
 * índice dos blocos, montado pela mesma função da publicação (conferencia/indice.js). O repositório não muda: o bloco
 * de exemplo nunca é publicado, e o resumo do servidor inventado nunca vai para um arquivo publicado (carta nº 8 do
 * App à Operação: o arquivo publicado aceita um resumo só, o do servidor de verdade).
 *
 * Uso: node testes/casca.js            (precisa do Playwright; neste ambiente, NODE_PATH=/opt/npm-tools/node_modules)
 *      node testes/casca.js --so T08    (um teste só)
 */
'use strict';
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
// O envio em segundo plano sai do service worker: sem isto, o Chromium não deixa a bateria imitar o servidor do bloco
// para os pedidos que saem de lá.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
var pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }

var REPOSITORIO = path.resolve(__dirname, '..');
var LOGIN = 'https://login.teste.invalid/exec';
var SERVIDOR_EXEMPLO = 'https://exemplo.teste.invalid/exec';
var SERVIDOR_OUTRO = 'https://outro.teste.invalid/exec';
var SERVIDOR_OPERACAO = 'https://operacao.teste.invalid/exec';

/* ---------- a cópia do site, com o bloco de exemplo ---------- */
function prepararSite() {
  var raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'casca-site-'));
  fs.cpSync(REPOSITORIO, raiz, { recursive: true, filter: function (o) { var b = path.basename(o); return b !== '.git' && b !== 'node_modules'; } });
  fs.rmSync(path.join(raiz, 'blocos', 'indice.js'), { force: true });
  // A bateria nunca fala com o login de verdade: na cópia, o endereço fica vazio, e cada teste que precisa de login
  // põe o imitado no lugar (abrir, mais abaixo).
  fs.writeFileSync(path.join(raiz, 'config', 'login.js'), "var ENDERECO_DO_LOGIN = '';\n");
  fs.cpSync(path.join(REPOSITORIO, 'testes', 'bloco-exemplo'), path.join(raiz, 'blocos', 'exemplo'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'blocos', 'exemplo', 'servidor.sha256'), crypto.createHash('sha256').update(SERVIDOR_EXEMPLO).digest('hex') + '\n');
  // O bloco da Operação (T46) fala com um servidor imitado: na cópia, o resumo é o do endereço inventado. O arquivo do
  // repositório, com o resumo do servidor de verdade, não muda.
  fs.writeFileSync(path.join(raiz, 'blocos', 'operacao', 'servidor.sha256'), crypto.createHash('sha256').update(SERVIDOR_OPERACAO).digest('hex') + '\n');
  // Um segundo bloco, só do celular e sem envio, para o exemplo abrir com contexto (FRONTEIRA §5.4; T38). É a forma do
  // checklist da Segurança aberto pelo diário da Operação, sem o que é de cada um.
  var outro = path.join(raiz, 'blocos', 'outro'); fs.mkdirSync(outro, { recursive: true });
  fs.writeFileSync(path.join(outro, 'bloco.json'), JSON.stringify({ nome: 'Outro', dono: 'App Compel (só na bateria)', especie: 'celular', quemVe: ['ELETRICISTA'],
    servidor: 'OUTRO', versao: '1', entrada: 'index.html', arquivos: ['index.html', 'tela.js'], cache: 'outro-bloco-',
    // O acesso rápido (T43): um formulário de todos, um só do inspetor, e o sistema completo só para o inspetor.
    atalhos: [{ id: 'epi', nome: 'Checklist EPI/EPC', icone: '🦺', perfis: ['*'] }, { id: 'sqp', nome: 'Inspeção SQP', perfis: ['inspetor'] }],
    completo: ['INSPETOR'] }));
  fs.writeFileSync(path.join(outro, 'index.html'), fs.readFileSync(path.join(raiz, 'blocos', 'exemplo', 'index.html'), 'utf8')
    .replace('<title>Exemplo', '<title>Outro').replace('<script src="envio.js"></script>\n', ''));
  fs.writeFileSync(path.join(outro, 'tela.js'), "'use strict';\nCasca.iniciar('outro').then(function (r) {\n  window.INICIO_DO_BLOCO = r;\n" +
    "  document.getElementById('corpo').innerHTML = '<p id=\"pronto\">Outro</p><button type=\"button\" class=\"btn fantasma\" id=\"voltar\">Voltar</button><div id=\"ajuda\"></div>';\n" +
    "  Casca.ajuda(document.getElementById('ajuda'), 'A tela do outro bloco (só na bateria).');\n" +
    "  document.getElementById('voltar').addEventListener('click', function () { Casca.voltar(); });\n});\n");
  // Um terceiro bloco, das duas espécies e com acesso rápido (T45): o cartão de baixo dele é o sistema do Google.
  var terceiro = path.join(raiz, 'blocos', 'terceiro'); fs.mkdirSync(terceiro, { recursive: true });
  fs.writeFileSync(path.join(terceiro, 'bloco.json'), JSON.stringify({ nome: 'Terceiro', dono: 'App Compel (só na bateria)', especie: 'ambas', quemVe: ['SUPERVISOR'],
    servidor: 'TERCEIRO', versao: '1', entrada: 'index.html', arquivos: ['index.html', 'tela.js'], cache: 'terceiro-bloco-',
    atalhos: [{ id: 'diario', nome: 'Diário da equipe', perfis: ['*'] }], completo: ['SUPERVISOR'] }));
  fs.copyFileSync(path.join(outro, 'index.html'), path.join(terceiro, 'index.html'));
  fs.writeFileSync(path.join(terceiro, 'tela.js'), fs.readFileSync(path.join(outro, 'tela.js'), 'utf8').replace("Casca.iniciar('outro')", "Casca.iniciar('terceiro')"));
  // Uma página vazia do mesmo site, para a bateria preparar o celular antes de o app abrir (T26).
  fs.writeFileSync(path.join(raiz, 'vazio.html'), '<!doctype html><title>vazio</title>');
  var r = require(path.join(REPOSITORIO, 'conferencia', 'indice.js')).montar(raiz);
  if (r.erro) throw new Error('o índice da bateria não montou: ' + JSON.stringify(r.erro));
  return raiz;
}
var RAIZ = prepararSite();

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
    pessoas: {}, sessoes: {}, pedidos: [], fora: false, hoje: '2026-10-21', cortadas: {}, senhaMudou: {}, aceitos: {}, termo: null,
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
      // As respostas das cartas nº 14 e nº 15 do Núcleo (22/10/2026), com as duas marcas sempre escritas, uma o
      // contrário da outra, como o login de verdade manda: sessão cortada → pedirCpf; senha mudada em outro celular
      // → entrarDeNovo, também no aceite; termo pendente → a forma do api_abrir do Portal, um por vez, com `quantos`.
      case 'token':
      case 'avisos':
      case 'aceitarTermo':
        if (!p || L.cortadas[corpo.sessao]) return { ok: false, pedirCpf: true, entrarDeNovo: false, erro: 'Este celular foi desligado. Entre com o CPF.' };
        if (L.senhaMudou[corpo.sessao]) return { ok: false, entrarDeNovo: true, pedirCpf: false, erro: 'Sua senha mudou. Entre de novo com a senha nova.' };
        var termos = (L.termos || (L.termo ? [L.termo] : [])).filter(function (t) { return !L.aceitos[p.cpf + '|' + t.id]; });
        if (corpo.acao === 'avisos') { var resp = { ok: true, comunicacoes: L.comunicacoes || [] }; if (L.avisosDaPessoa !== undefined) resp.avisosDaPessoa = L.avisosDaPessoa; return resp; }
        if (corpo.acao === 'aceitarTermo') {
          var t = termos.filter(function (u) { return u.id === corpo.id && u.versao === corpo.versao; })[0];
          if (!t) return { ok: false, erro: 'Termo desconhecido.' };
          L.aceitos[p.cpf + '|' + t.id] = true; return { ok: true };
        }
        if (p.temporaria) return { ok: false, precisaTrocar: true, erro: 'Troque a senha temporária antes de abrir os sistemas.' };
        if (termos.length) { var u = termos[0]; return { ok: false, precisaAceitarTermo: true, id: u.id, versao: u.versao, titulo: u.titulo, texto: u.texto, link: u.link, quantos: termos.length, erro: 'Há termo para aceitar.' }; }
        return { ok: true, token: 'tok-' + Math.random().toString(36).slice(2) };
      // As duas ações combinadas com o Núcleo nas cartas nº 18 e 19 (25/10/2026): o "lido" só para o que é marcável, e o
      // relato com o CPF tirado da sessão (o corpo nunca traz CPF).
      case 'marcarAvisoLido':
      case 'enviarRelato':
        if (!p || L.cortadas[corpo.sessao]) return { ok: false, pedirCpf: true, entrarDeNovo: false, erro: 'Este celular foi desligado. Entre com o CPF.' };
        if (corpo.acao === 'marcarAvisoLido') {
          var av = (L.avisosDaPessoa || []).filter(function (x) { return x.id === corpo.id; })[0];
          if (!av || !av.marcavel) return { ok: false, erro: 'Este aviso não se marca como lido.' };
          L.avisosDaPessoa = L.avisosDaPessoa.filter(function (x) { return x.id !== corpo.id; }); return { ok: true };
        }
        if (L.recusarRelato) return { ok: false, erro: L.recusarRelato };
        return { ok: true, id: 'R-7' };
    }
    return { ok: false, erro: 'ação desconhecida' };
  };
  return L;
}

/* ---------- o site do app, servido da cópia ----------
   Todo servidor aberto fica na lista e é fechado no fim, mesmo o de um teste que falhou no meio: um servidor esquecido
   aberto segura o processo, e a publicação ficaria esperando em vez de dizer que falhou (visto em 21/10/2026). */
var SERVIDORES = [];
function servir() {
  var tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  var srv = http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]); if (rel.endsWith('/')) rel += 'index.html';
    var arq = path.join(RAIZ, rel);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(arq).pipe(res);
  });
  SERVIDORES.push(srv);
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
      var corpo = JSON.parse(r.request().postData() || '{}'), resposta = L.atender(corpo);
      // O relato gravado e a resposta perdida no caminho (casca 1.10): o login atende, e o app não recebe nada.
      if (L.cortarRelato && corpo.acao === 'enviarRelato') return r.abort('failed');
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(resposta) });
    });
    await ctx.route('https://modulo.teste.invalid/**', function (r) { r.fulfill({ contentType: 'text/html', body: '<p>módulo</p>' }); });
  }
  if (op.servidor) await rotearServidores(ctx, op.servidor);
  var page = await ctx.newPage();
  if (op.relogio) await page.clock.install({ time: new Date(op.relogio) });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#corpo .cartao');
  return { ctx: ctx, page: page };
}
/* O servidor imitado do bloco de exemplo: anota cada pedido, e pode demorar para responder. O outro endereço é o de
   uma "Nova implantação" feita por engano: se algum pedido chegar lá, a trava do resumo falhou. */
function novoServidor() { return { pedidos: [], noOutro: [], demora: 0 }; }
async function rotearServidores(ctx, S) {
  await ctx.route(SERVIDOR_EXEMPLO + '*', function (r) {
    var corpo = JSON.parse(r.request().postData() || '{}');
    S.pedidos.push(corpo);
    var resposta = S.responder ? S.responder(corpo) : { ok: true };
    setTimeout(function () { r.fulfill({ contentType: 'application/json', body: JSON.stringify(resposta) }).catch(function () { }); }, S.demora);
  });
  await ctx.route(SERVIDOR_OPERACAO + '*', function (r) {
    var corpo = JSON.parse(r.request().postData() || '{}');
    (S.operacao = S.operacao || []).push(corpo);
    var resposta = S.responderOperacao ? S.responderOperacao(corpo) : { ok: true };
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(resposta) }).catch(function () { });
  });
  await ctx.route(SERVIDOR_OUTRO + '*', function (r) { S.noOutro.push(r.request().postData()); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
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
/* O código PRODUCAO, e não OPERACAO, de propósito (27/10/2026): desde que a Operação é um bloco de verdade no repositório,
   um módulo OPERACAO aqui mudaria o Início de todo teste (o acesso rápido dela). O bloco é provado no T46. */
var MODULOS_DA_ANA = [
  { modulo: 'TREINAMENTO', nome: 'Treinamentos', url: 'https://modulo.teste.invalid/treino', perfil: 'ALUNO', liberado: true },
  { modulo: 'PRODUCAO', nome: 'Operação', url: 'https://modulo.teste.invalid/operacao', perfil: 'ENCARREGADO', liberado: true },
  { modulo: 'FINANCEIRO', nome: 'Financeiro', url: 'https://modulo.teste.invalid/fin', perfil: 'CONSULTA', liberado: false, motivo: 'Complete seu cadastro para liberar' },
  { modulo: 'GESTAO_A_VISTA', nome: 'Gestão à Vista', url: '', perfil: 'CONSULTA', liberado: true },
  // A célula com uma quebra de linha no meio (carta nº 11 do Núcleo): o trim do Núcleo não a tira.
  { modulo: 'BENEFICIOS', nome: 'Benefícios', url: 'https://modulo.teste.invalid/bene\nficios', perfil: 'CONSULTA', liberado: true }
];
var MODULO_EXEMPLO = { modulo: 'EXEMPLO', nome: 'Exemplo', url: SERVIDOR_EXEMPLO, perfil: 'ELETRICISTA', liberado: true };
function anaComExemplo(url) {
  return loginComAna({ modulos: MODULOS_DA_ANA.concat([Object.assign({}, MODULO_EXEMPLO, { url: url || SERVIDOR_EXEMPLO })]) });
}
/* Entra, abre o bloco pelo cartão do Início e espera a tela dele. */
async function entrarNoExemplo(a, x) {
  await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
  await a.page.click('#modulos .n-modulo[data-i="5"]');
  await a.page.waitForURL(/\/blocos\/exemplo\/index\.html$/);
  await a.page.waitForSelector('#anotar');
}
async function anotar(a, txt) {
  await a.page.fill('#texto', txt); await a.page.click('#anotar');
  await a.page.waitForFunction(function () { return document.getElementById('resultado').textContent; });
  return a.page.textContent('#resultado');
}
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
    afirmar(nomes.join('|') === 'Treinamentos|Operação|Financeiro|Gestão à Vista|Benefícios', 'a ordem dos módulos tem de ser a do login, e veio ' + nomes.join('|'));
    afirmar(await a.page.isDisabled('#modulos .n-modulo[data-i="2"]'), 'o módulo não liberado devia estar apagado');
    afirmar((await texto(a.page, '#modulos .n-modulo[data-i="2"]')).indexOf('Complete seu cadastro') >= 0, 'o motivo do módulo não liberado não apareceu');
    afirmar((await texto(a.page, '#modulos .n-modulo[data-i="3"]')).indexOf('Em breve') >= 0, 'o módulo sem endereço devia dizer "Em breve"');
    afirmar(await a.page.isDisabled('#modulos .n-modulo[data-i="4"]'), 'o endereço com quebra de linha não pode abrir');
    afirmar((await texto(a.page, '#modulos .n-modulo[data-i="4"]')).indexOf('com defeito na planilha') >= 0, 'o cartão devia dizer que a célula está com defeito');
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
      await a.page.click('[data-aba="envio"]'); await a.page.waitForSelector('.app-envio'); await conferir('Envio');
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
    await a.page.click('[data-aba="envio"]'); await conferir('Envio');
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
    afirmar(dentro.cartoes === 5, 'os sistemas deviam ser os cartões .n-modulo do Portal');
    await a.ctx.close();
  },
  T19_nenhum_texto_no_vermelho_da_marca: async function () {
    // O #ED1C24 é o vermelho da marca e reprova como cor de texto (4,38:1 sobre branco; carta nº 12 do Núcleo,
    // 21/10/2026). Texto vermelho é o --vermelho-forte, #B2101F. Este teste olha a cor de todo texto visível.
    var x = loginComAna(); x.L.comunicacoes = [{ id: 'a', titulo: 'Um aviso', data: '2026-10-21', categoria: 'Segurança', link: 'https://modulo.teste.invalid/aviso' }];
    var a = await abrir(x.L, { relogio: '2026-10-21T10:00:00-03:00' }), achados = [];
    var conferir = async function (nome) {
      var r = await a.page.evaluate(function () {
        var ruins = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          var n = w.currentNode, el = n.parentElement;
          if (!n.textContent.trim() || !el || !el.getClientRects().length) continue;
          if (getComputedStyle(el).color === 'rgb(237, 28, 36)') ruins.push(n.textContent.trim().slice(0, 40));
        }
        return ruins;
      });
      r.forEach(function (t) { achados.push(nome + ': "' + t + '"'); });
    };
    await a.page.fill('#cpf', '123'); await a.page.click('[data-acao="entrarCpf"]'); await a.page.waitForSelector('#erro');
    await a.page.click('[data-acao="ajuda"]'); await conferir('Entrar (com erro e ajuda)');
    await a.page.click('[data-acao="irPrimeiro"]'); await conferir('Primeiro acesso');
    await a.page.click('[data-acao="irEntrar"]');
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-acao="ajuda"]'); await conferir('Início');
    await a.page.click('[data-aba="avisos"]'); await a.page.waitForSelector('#listaAvisos'); await conferir('Avisos');
    await a.page.click('[data-aba="envio"]'); await a.page.waitForSelector('.app-envio'); await conferir('Envio');
    await a.page.click('[data-aba="perfil"]'); await conferir('Perfil');
    afirmar(!achados.length, 'texto no vermelho da marca (#ED1C24): ' + achados.join('; '));
    await a.ctx.close();
  },
  /* ---------- os blocos (21/10/2026): o bloco de exemplo, só na cópia do site da bateria ---------- */
  T20_o_bloco_abre_pelo_inicio_e_recebe_a_pessoa_sem_cpf: async function () {
    var x = anaComExemplo(), a = await abrir(x.L, { servidor: novoServidor() });
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    afirmar((await texto(a.page, '#modulos .n-modulo[data-i="5"]')).indexOf('funciona sem sinal') >= 0, 'o cartão do bloco do celular devia dizer que funciona sem sinal');
    await a.page.click('#modulos .n-modulo[data-i="5"]');
    await a.page.waitForURL(/\/blocos\/exemplo\/index\.html$/); await esperarTexto(a.page, 'Olá, Ana');
    var p = await a.page.evaluate(function () { return window.PESSOA_DO_BLOCO; }), j = JSON.stringify(p);
    afirmar(Object.keys(p).sort().join(',') === 'bases,funcao,fuso,lotacao,matricula,nome,nomeCompleto', 'o bloco recebeu campos a mais ou a menos: ' + Object.keys(p).join(','));
    afirmar(p.matricula === '99901' && p.nome === 'Ana Teste', 'o bloco devia receber o nome e a matrícula');
    // O celular da bateria está no fuso do Rio, e a Ana é de Dourados: o bloco tem de receber o da base, e não o do celular.
    afirmar(p.fuso === 'America/Campo_Grande', 'o bloco devia receber o fuso da base da pessoa, e recebeu ' + p.fuso);
    afirmar(j.indexOf(x.cpf) < 0 && j.indexOf('sess-') < 0 && !/"base"/.test(j), 'o bloco recebeu o CPF, a sessão ou um campo "base"');
    afirmar(!x.L.pedidos.some(function (q) { return q.acao === 'token'; }), 'a tela do celular abre sem pedir token');
    await a.page.click('#voltar'); await esperarTexto(a.page, 'Seus sistemas');
    await a.ctx.close();
  },
  T21_o_bloco_sem_a_entrada_de_hoje_volta_para_entrar: async function () {
    var a = await abrir(anaComExemplo().L);
    await a.page.goto(base + '/blocos/exemplo/index.html');
    await a.page.waitForURL(function (u) { return !/\/blocos\//.test(u.pathname); });
    await esperarTexto(a.page, 'Entrar');
    afirmar((await texto(a.page, '#codigo')) === 'APP-01', 'sem entrada, a tela do bloco devia levar à entrada da casca');
    await a.ctx.close();
  },
  T22_guarda_sem_sinal_e_envia_quando_o_sinal_volta: async function () {
    var S = novoServidor(), x = anaComExemplo(), a = await abrir(x.L, { servidor: S });
    await entrarNoExemplo(a, x);
    await a.ctx.setOffline(true);
    var r = await anotar(a, 'poste 12 conferido');
    afirmar(/quando houver sinal/.test(r), 'sem sinal, o bloco devia dizer que guardou: ' + r);
    afirmar(S.pedidos.length === 0, 'sem sinal, nada podia ter ido ao servidor');
    await a.ctx.setOffline(false);
    await a.page.waitForFunction(function () { return true; });
    for (var i = 0; i < 50 && !S.pedidos.length; i++) await a.page.waitForTimeout(100);
    afirmar(S.pedidos.length === 1, 'o sinal voltou com a tela do bloco aberta e o registro devia ter subido uma vez; subiram ' + S.pedidos.length);
    var q = S.pedidos[0];
    afirmar(q.app === 'exemplo' && q.versao === '1', 'o envio devia levar o app e a versão do bloco, e levou ' + q.app + ' ' + q.versao);
    afirmar(q.relogio && typeof q.fuso === 'number', 'o envio devia levar o relógio e o fuso do celular');
    afirmar(q.registro.carimbo.feitoPor.matricula === '99901' && q.registro.carimbo.emNomeDe.matricula === '99901' && q.registro.carimbo.noCelularDeOutro === false, 'o registro devia levar quem fez e em nome de quem');
    afirmar(JSON.stringify(q).indexOf(x.cpf) < 0, 'o CPF foi no envio do bloco');
    await a.page.click('#voltar'); await esperarTexto(a.page, 'Seus sistemas');
    await a.page.click('[data-aba="envio"]'); await esperarTexto(a.page, 'nada esperando');
    afirmar((await texto(a.page, '#codigo')) === 'APP-08', 'o código da tela de Envio');
    await a.ctx.close();
  },
  T23_o_endereco_que_nao_bate_e_recusado_e_avisado_uma_vez: async function () {
    // O login devolve outro endereço para o módulo: uma "Nova implantação" por engano (carta nº 6 da Operação).
    var S = novoServidor(), x = anaComExemplo(SERVIDOR_OUTRO), a = await abrir(x.L, { servidor: S });
    await entrarNoExemplo(a, x);
    await anotar(a, 'primeiro'); await anotar(a, 'segundo');
    await a.page.click('#voltar'); await esperarTexto(a.page, 'Seus sistemas');
    await a.page.waitForTimeout(500);
    afirmar(S.pedidos.length === 0 && S.noOutro.length === 0, 'com o endereço que não bate, nada podia sair (exemplo: ' + S.pedidos.length + ', outro: ' + S.noOutro.length + ')');
    await a.page.click('[data-aba="envio"]'); await esperarTexto(a.page, '2 esperando');
    var avisos = await a.page.$$eval('.app-endereco', function (l) { return l.map(function (e) { return e.textContent; }); });
    afirmar(avisos.length === 1 && avisos[0] === 'O endereço do servidor de Exemplo mudou. Avise a administração.', 'o aviso do endereço devia aparecer uma vez, com a frase combinada; veio ' + JSON.stringify(avisos));
    afirmar((await texto(a.page, '#bolinhaEnvio')) === '2', 'a aba Envio devia mostrar 2 esperando');
    afirmar(await a.page.isDisabled('[data-acao="enviarBloco"][data-bloco="exemplo"]'), 'com o endereço recusado, o "Enviar agora" devia ficar apagado');
    await a.ctx.close();
  },
  T24_a_trava_unica_nao_manda_o_mesmo_registro_duas_vezes: async function () {
    var S = novoServidor(), x = anaComExemplo(), a = await abrir(x.L, { servidor: S });
    await entrarNoExemplo(a, x);
    await a.ctx.setOffline(true); await anotar(a, 'um'); await anotar(a, 'dois');
    await a.page.click('#voltar').catch(function () { });
    await a.ctx.setOffline(false);
    await a.page.goto(base + '/index.html'); await esperarTexto(a.page, 'Seus sistemas');
    // O app, ao abrir com sinal, já tenta mandar. Duas tentativas a mais ao mesmo tempo, com o servidor lento: só uma
    // pode ter a trava, e cada registro chega uma vez.
    S.demora = 600;
    var r = await a.page.evaluate(function () { return Promise.all([cascaEnviar('exemplo', 'teste A'), cascaEnviar('exemplo', 'teste B')]); });
    for (var i = 0; i < 50 && S.pedidos.length < 2; i++) await a.page.waitForTimeout(100);
    await a.page.waitForTimeout(800);
    var ids = S.pedidos.map(function (q) { return q.registro.id; });
    afirmar(ids.length === 2 && ids[0] !== ids[1], 'cada registro devia chegar uma vez só; chegaram ' + JSON.stringify(ids));
    afirmar(r.some(function (y) { return y && y.ocupado; }), 'uma das tentativas devia ter achado a trava ocupada: ' + JSON.stringify(r));
    await a.ctx.close();
  },
  T25_o_segundo_plano_envia_com_o_service_worker: async function () {
    var proprio = await servir(), endereco = 'http://127.0.0.1:' + proprio.address().port;
    var S = novoServidor(), x = anaComExemplo();
    var ctx = await navegador.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.route('**/config/login.js', function (r) { r.fulfill({ contentType: 'text/javascript', body: "var ENDERECO_DO_LOGIN = '" + LOGIN + "';" }); });
    await ctx.route(LOGIN + '*', function (r) { r.fulfill({ contentType: 'application/json', body: JSON.stringify(x.L.atender(JSON.parse(r.request().postData() || '{}'))) }); });
    await rotearServidores(ctx, S);
    var page = await ctx.newPage(), a = { ctx: ctx, page: page };
    await page.goto(endereco + '/index.html');
    await page.evaluate(function () { return navigator.serviceWorker.ready; });
    await page.reload(); await page.waitForSelector('#corpo .cartao');
    await entrarNoExemplo(a, x);
    // A tela do bloco ficou guardada no cache dele, com a versão do bloco no nome.
    var guardados = await page.evaluate(function () {
      return caches.has('exemplo-bloco-1').then(function (tem) {
        return tem ? caches.open('exemplo-bloco-1').then(function (c) { return c.keys(); }).then(function (k) { return k.map(function (r) { return new URL(r.url).pathname; }); }) : [];
      });
    });
    afirmar(['/blocos/exemplo/index.html', '/blocos/exemplo/tela.js', '/blocos/exemplo/envio.js'].every(function (f) { return guardados.indexOf(f) >= 0; }),
      'os três arquivos do bloco deviam estar guardados em exemplo-bloco-1; estão: ' + guardados.join(', '));
    // Sem sinal na tela: o registro fica, e a casca pede ao Android que acorde o app.
    await ctx.setOffline(true);
    await anotar(a, 'pelo segundo plano');
    afirmar(S.pedidos.length === 0, 'sem sinal na tela, nada podia ter saído');
    // O sinal volta com o app FECHADO: nenhuma tela aberta pode mandar, e só o segundo plano pode. O Chromium acorda o
    // service worker na etiqueta do bloco, como o Android faria (a sessão do DevTools vai numa página em branco, que
    // não é do app).
    await page.close();
    var vazia = await ctx.newPage();
    await ctx.setOffline(false);
    var cdp = await ctx.newCDPSession(vazia), reg = null;
    cdp.on('ServiceWorker.workerRegistrationUpdated', function (ev) { (ev.registrations || []).forEach(function (r) { if (!r.isDeleted) reg = r.registrationId; }); });
    await cdp.send('ServiceWorker.enable');
    for (var i = 0; i < 30 && !reg; i++) await vazia.waitForTimeout(100);
    afirmar(reg, 'o Chromium não mostrou o registro do service worker');
    await cdp.send('ServiceWorker.dispatchSyncEvent', { origin: endereco, registrationId: reg, tag: 'enviar-exemplo', lastChance: false });
    for (i = 0; i < 80 && !S.pedidos.length; i++) await vazia.waitForTimeout(100);
    afirmar(S.pedidos.length === 1 && S.pedidos[0].enviadoPor === 'segundo plano', 'o segundo plano devia ter mandado o registro; pedidos: ' + JSON.stringify(S.pedidos.map(function (q) { return q.enviadoPor; })));
    await vazia.waitForTimeout(300);
    page = await ctx.newPage(); a.page = page;
    await page.goto(endereco + '/index.html'); await esperarTexto(page, 'Seus sistemas');
    var acordadas = await page.evaluate(function () { return cascaLer('acordadas:exemplo'); });
    afirmar(acordadas && acordadas.length === 1 && /1 enviado/.test(acordadas[0].resultado), 'a vez em que o app acordou devia ficar anotada: ' + JSON.stringify(acordadas));
    // E a tela do bloco abre sem rede nenhuma: o site fora do ar de verdade (ver T16).
    proprio.closeAllConnections(); await new Promise(function (ok) { proprio.close(ok); });
    await page.goto(endereco + '/blocos/exemplo/index.html'); await page.waitForSelector('#anotar');
    await ctx.close();
  },
  T26_a_casca_nao_apaga_o_que_nao_e_dela: async function () {
    var proprio = await servir(), endereco = 'http://127.0.0.1:' + proprio.address().port;
    var ctx = await navegador.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow' });
    var page = await ctx.newPage();
    // Antes de o app abrir: o cache de um app que não é bloco deste, uma versão velha do bloco de exemplo, e um banco
    // de outro bloco com um registro esperando.
    await page.goto(endereco + '/vazio.html');
    await page.evaluate(function () {
      return Promise.all([caches.open('outro-app-1'), caches.open('exemplo-bloco-0'), new Promise(function (ok) {
        var r = indexedDB.open('operacao-campo', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('diarios', { keyPath: 'id' }); };
        r.onsuccess = function () { var t = r.result.transaction('diarios', 'readwrite'); t.objectStore('diarios').put({ id: 'd1', estado: 'encerrado' }); t.oncomplete = function () { r.result.close(); ok(); }; };
      })]);
    });
    await page.goto(endereco + '/index.html');
    await page.evaluate(function () { return navigator.serviceWorker.ready; });
    await page.waitForTimeout(500);
    var r = await page.evaluate(function () {
      return Promise.all([caches.keys(), new Promise(function (ok) {
        var q = indexedDB.open('operacao-campo');
        q.onsuccess = function () { var g = q.result.transaction('diarios').objectStore('diarios').get('d1'); g.onsuccess = function () { ok(g.result); q.result.close(); }; };
      })]);
    });
    var nomes = r[0];
    afirmar(nomes.indexOf('outro-app-1') >= 0, 'a casca apagou um cache que não é dela nem de bloco nenhum: ' + nomes.join(', '));
    afirmar(nomes.indexOf('exemplo-bloco-0') < 0 && nomes.indexOf('exemplo-bloco-1') >= 0, 'a versão velha do bloco devia sair só depois da nova guardada: ' + nomes.join(', '));
    afirmar(r[1] && r[1].estado === 'encerrado', 'o banco de outro bloco perdeu o registro que esperava');
    proprio.closeAllConnections(); await new Promise(function (ok) { proprio.close(ok); });
    await ctx.close();
  },
  /* ---------- o login de verdade (carta nº 14 do Núcleo, 22/10/2026) ---------- */
  T27_sessao_cortada_no_token_volta_a_pedir_o_cpf: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    Object.keys(x.L.sessoes).forEach(function (s) { x.L.cortadas[s] = true; });
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'Entre com o CPF');
    afirmar((await texto(a.page, '#codigo')) === 'APP-01', 'com a sessão cortada, o app devia voltar à entrada');
    afirmar(await a.page.isVisible('#cpf'), 'a entrada devia pedir o CPF, e não o nome');
    var abertas = a.ctx.pages().length;
    afirmar(abertas === 1, 'a janela aberta no toque devia ser fechada; há ' + abertas);
    await a.ctx.close();
  },
  T28_o_termo_pendente_se_aceita_no_app: async function () {
    var x = loginComAna();
    x.L.termo = { id: 'TERMO-1', versao: '3', titulo: 'Código de Ética', texto: 'Linha um.\nLinha dois.', link: 'https://modulo.teste.invalid/etica' };
    var a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'Código de Ética');
    afirmar((await texto(a.page, '#codigo')) === 'APP-09', 'o termo pendente devia abrir a tela do termo');
    afirmar(a.ctx.pages().length === 1, 'com o termo pendente, nenhuma janela de sistema podia ficar aberta');
    afirmar(!(await a.page.$('#quantosTermos')), 'com um termo só, não há aviso de quantos');
    await a.page.click('[data-acao="ajuda"]');
    afirmar(((await a.page.textContent('#textoAjuda').catch(function () { return ''; })) || '').length > 40, 'a tela do termo não tem ajuda');
    for (var largura of [360, 412]) {
      await a.page.setViewportSize({ width: largura, height: 800 });
      var passa = await a.page.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
      afirmar(passa <= 0, 'a tela do termo passa ' + passa + ' px da largura de ' + largura);
    }
    await a.page.click('[data-acao="aceitarTermo"]');
    await esperarTexto(a.page, 'Termo aceito');
    var aceite = x.L.pedidos.filter(function (q) { return q.acao === 'aceitarTermo'; }).pop();
    afirmar(aceite && aceite.id === 'TERMO-1' && aceite.versao === '3' && aceite.sessao && !aceite.cpf, 'o aceite devia levar a sessão, o id e a versão, sem CPF: ' + JSON.stringify(aceite));
    var aguardar = a.ctx.waitForEvent('page');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    var janela = await aguardar;
    await janela.waitForURL(/modulo\.teste\.invalid\/treino\?t=tok-/);
    await a.ctx.close();
  },
  T29_senha_mudada_em_outro_celular_entra_pelo_nome: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    Object.keys(x.L.sessoes).forEach(function (s) { x.L.senhaMudou[s] = true; });
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'Sua senha mudou');
    afirmar(await a.page.isVisible('[data-acao="entrarEscolhida"]'), 'com a senha mudada, a entrada devia ser pelo nome');
    afirmar((await texto(a.page)).indexOf('senha temporária') >= 0, 'quem não trocou a senha (o reset) precisa saber da temporária no e-mail');
    afirmar((await texto(a.page)).indexOf('Senha de Ana') >= 0, 'a pessoa escolhida devia ser a Ana');
    await a.ctx.close();
  },
  T30_dois_termos_um_de_cada_vez: async function () {
    var x = loginComAna();
    x.L.termos = [{ id: 'TERMO-1', versao: '3', titulo: 'Código de Ética', texto: 'Um.' }, { id: 'TERMO-2', versao: '1', titulo: 'Uso do celular', texto: 'Dois.' }];
    var a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'Código de Ética');
    var aviso = await a.page.$('#quantosTermos');
    afirmar(aviso && (await aviso.textContent()).indexOf('Há 2 termos') >= 0, 'com dois termos, a tela devia dizer que há 2');
    await a.page.click('[data-acao="aceitarTermo"]');
    await esperarTexto(a.page, 'Falta mais 1 termo');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'Uso do celular');
    afirmar(!(await a.page.$('#quantosTermos')), 'no último termo, não há aviso de quantos');
    await a.page.click('[data-acao="aceitarTermo"]');
    await esperarTexto(a.page, 'Toque de novo no sistema que você queria abrir');
    afirmar(x.L.pedidos.filter(function (q) { return q.acao === 'aceitarTermo'; }).map(function (q) { return q.id + '/' + q.versao; }).join(' ') === 'TERMO-1/3 TERMO-2/1', 'os dois aceites, cada um com a sua versão');
    await a.ctx.close();
  },
  T31_senha_mudada_no_aceite_do_termo: async function () {
    var x = loginComAna();
    x.L.termo = { id: 'TERMO-1', versao: '3', titulo: 'Código de Ética', texto: 'Um.' };
    var a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'Código de Ética');
    Object.keys(x.L.sessoes).forEach(function (s) { x.L.senhaMudou[s] = true; });
    await a.page.click('[data-acao="aceitarTermo"]');
    await esperarTexto(a.page, 'Sua senha mudou');
    afirmar((await texto(a.page, '#codigo')) === 'APP-01', 'com a senha mudada no aceite, o app devia voltar à entrada');
    afirmar(await a.page.isVisible('[data-acao="entrarEscolhida"]'), 'e a entrada devia ser pelo nome, com a senha nova');
    await a.ctx.close();
  },
  T32_aviso_sem_arte_e_proporcao_com_decimal: async function () {
    var x = loginComAna({ fuso: 'America/Sao_Paulo' });
    x.L.comunicacoes = [
      { id: 'a', titulo: 'Aviso sem arte', data: '2026-10-21', categoria: 'Segurança', arte: '', proporcao: '' },
      { id: 'b', titulo: 'Aviso largo', data: '2026-10-20', arte: 'https://modulo.teste.invalid/arte.png', proporcao: '1.91:1' }
    ];
    var a = await abrir(x.L, { relogio: '2026-10-21T10:00:00-03:00' });
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    await a.page.click('[data-aba="avisos"]'); await a.page.waitForSelector('#listaAvisos');
    var itens = await a.page.$$eval('#listaAvisos .aviso-item', function (cs) { return cs.map(function (c) { var i = c.querySelector('img'); return { titulo: c.querySelector('.app-titulo').textContent, img: !!i, prop: i ? i.style.aspectRatio : '' }; }); });
    afirmar(itens.length === 2 && itens[0].titulo === 'Aviso sem arte', 'o aviso com arte vazia devia aparecer, com o título: ' + JSON.stringify(itens));
    afirmar(!itens[0].img, 'o aviso com arte vazia não pode desenhar uma imagem quebrada');
    afirmar(itens[1].img && itens[1].prop.replace(/\s/g, '') === '1.91/1', 'a proporção com decimal devia valer; veio ' + itens[1].prop);
    await a.ctx.close();
  },
  T33_troca_pedida_pela_administracao_com_o_dia_aberto: async function () {
    var x = loginComAna(), a = await abrir(x.L);
    await entrarCpf(a.page, x.cpf, 'senha-da-ana'); await esperarTexto(a.page, 'Olá, Ana');
    // A administração marca TROCAR_SENHA = SIM na CENTRAL, sem trocar a senha, com a entrada do dia já aberta: é o
    // único caminho do precisaTrocar até o app (carta nº 16 do Núcleo, 22/10/2026).
    var p = x.L.pessoas[x.cpf]; p.temporaria = true;
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    await esperarTexto(a.page, 'A administração pediu');
    afirmar((await texto(a.page, '#codigo')) === 'APP-01', 'com a troca pedida pela administração, o app devia voltar à entrada');
    afirmar(await a.page.isVisible('[data-acao="entrarEscolhida"]'), 'a entrada devia ser pelo nome, com a senha de sempre');
    afirmar(a.ctx.pages().length === 1, 'a janela aberta no toque devia ser fechada');
    await a.page.fill('#senha', 'senha-da-ana'); await a.page.click('[data-acao="entrarEscolhida"]');
    await esperarTexto(a.page, 'Escolha uma senha sua');
    afirmar((await texto(a.page, '#codigo')) === 'APP-03', 'a entrada devia levar à troca');
    await a.page.fill('#senha', 'nova-da-ana'); await a.page.fill('#senha2', 'nova-da-ana');
    await a.page.click('[data-acao="trocarSenha"]');
    await esperarTexto(a.page, 'Olá, Ana');
    afirmar(p.senha === 'nova-da-ana' && !p.temporaria, 'a senha nova devia ir ao login');
    var aguardar = a.ctx.waitForEvent('page');
    await a.page.click('#modulos .n-modulo[data-i="0"]');
    var janela = await aguardar; await janela.waitForURL(/modulo\.teste\.invalid\/treino\?t=tok-/);
    await a.ctx.close();
  },
  /* A sessão do bloco pelo token do Núcleo (Casca.sessaoNova; cartas nº 8 a 10 da Operação e nº 1 do Módulo Segurança,
     22 a 24/10/2026). */
  T34_sessao_nova_sem_o_token_nem_a_sessao_na_tela: async function () {
    var S = novoServidor(), x = anaComExemplo(), a = await abrir(x.L, { servidor: S });
    S.responder = function (c) {
      return c.acao === 'sessaoDoNucleo' ? { ok: true, sessao: 'sb-1', valeAte: Date.now() + 30 * 864e5, matricula: '099901', nome: 'Ana Teste', perfil: 'ELETRICISTA' } : { ok: true };
    };
    await entrarNoExemplo(a, x);
    afirmar(!(await a.page.evaluate(function () { return Casca.temSessao(); })).tem, 'antes do sessaoNova, não havia sessão');
    // O `extra` não troca o pedido: ação, token e sessão são da casca.
    var r = await a.page.evaluate(function () { return Casca.sessaoNova({ aparelho: 'chave-do-ligar', acao: 'outra', token: 'falso', sessao: 'falsa' }); });
    var q = S.pedidos.filter(function (p) { return p.acao === 'sessaoDoNucleo'; });
    afirmar(q.length === 1 && S.pedidos.length === 1, 'devia ir um pedido só, o sessaoDoNucleo; foram ' + JSON.stringify(S.pedidos.map(function (p) { return p.acao; })));
    afirmar(/^tok-/.test(q[0].token) && q[0].aparelho === 'chave-do-ligar' && q[0].sessao === undefined, 'o pedido devia levar o token do login e o aparelho de quem chamou: ' + JSON.stringify(q[0]));
    afirmar(q[0].app === 'exemplo' && q[0].versao === '1', 'o pedido devia levar o app e a versão do bloco');
    afirmar(JSON.stringify(q[0]).indexOf(x.cpf) < 0 && JSON.stringify(q[0]).indexOf('sess-') < 0, 'o CPF ou a sessão do aparelho foram ao servidor do bloco');
    afirmar(r.ok === true && r.nome === 'Ana Teste' && r.perfil === 'ELETRICISTA', 'a tela devia receber a resposta do servidor: ' + JSON.stringify(r));
    afirmar(r.sessao === undefined && JSON.stringify(r).indexOf('tok-') < 0 && JSON.stringify(r).indexOf('sb-1') < 0, 'a tela não pode receber a sessão nem o token: ' + JSON.stringify(r));
    afirmar((await a.page.evaluate(function () { return Casca.temSessao(); })).tem, 'depois, a sessão devia estar guardada');
    await anotar(a, 'com a sessão nova');
    var reg = S.pedidos.filter(function (p) { return p.acao === 'registro'; });
    afirmar(reg.length === 1 && reg[0].sessao === 'sb-1', 'o registro devia subir com a sessão que o servidor deu: ' + JSON.stringify(reg.map(function (p) { return p.sessao; })));
    // A sessão que já venceu não conta como sessão: o bloco tem de saber que precisa de outra.
    S.responder = function () { return { ok: true, sessao: 'sb-velha', valeAte: Date.now() - 1000 }; };
    await a.page.evaluate(function () { return Casca.sessaoNova(); });
    var t = await a.page.evaluate(function () { return Casca.temSessao(); });
    afirmar(t.tem === false && t.venceu === true, 'a sessão vencida devia aparecer como vencida: ' + JSON.stringify(t));
    await a.ctx.close();
  },
  T35_sessao_nova_com_o_token_recusado_pede_outro_uma_vez: async function () {
    var S = novoServidor(), x = anaComExemplo(), a = await abrir(x.L, { servidor: S }), vezes = 0;
    S.responder = function () { return ++vezes === 1 ? { ok: false, tokenRecusado: true, erro: 'O token já foi usado.' } : { ok: true, sessao: 'sb-2', valeAte: Date.now() + 864e5 }; };
    await entrarNoExemplo(a, x);
    var r = await a.page.evaluate(function () { return Casca.sessaoNova(); });
    var q = S.pedidos.filter(function (p) { return p.acao === 'sessaoDoNucleo'; }), tokens = x.L.pedidos.filter(function (p) { return p.acao === 'token'; });
    afirmar(r.ok === true && q.length === 2 && tokens.length === 2 && q[0].token !== q[1].token, 'com o token recusado, a casca devia pedir outro e tentar de novo: ' + JSON.stringify(r) + ' ' + q.length + ' ' + tokens.length);
    S.responder = function () { return { ok: false, tokenRecusado: true, erro: 'O token já foi usado.' }; };
    r = await a.page.evaluate(function () { return Casca.sessaoNova(); });
    q = S.pedidos.filter(function (p) { return p.acao === 'sessaoDoNucleo'; });
    afirmar(r.ok === false && r.tokenRecusado === true && r.erro === 'O token já foi usado.', 'recusado de novo, a tela devia receber a marca e a frase do servidor: ' + JSON.stringify(r));
    afirmar(q.length === 4, 'só uma segunda tentativa, e não um laço; foram ' + (q.length - 2));
    await a.ctx.close();
  },
  T36_sessao_nova_de_outra_pessoa_ou_recusada_nao_guarda: async function () {
    var S = novoServidor(), x = anaComExemplo(), a = await abrir(x.L, { servidor: S });
    S.responder = function () { return { ok: true, sessao: 'sb-de-outra', valeAte: Date.now() + 864e5, mat: '12345' }; };
    await entrarNoExemplo(a, x);
    var r = await a.page.evaluate(function () { return Casca.sessaoNova(); });
    afirmar(r.ok === false && r.outraPessoa === true, 'a resposta com outra matrícula devia ser recusada: ' + JSON.stringify(r));
    afirmar(!(await a.page.evaluate(function () { return Casca.temSessao(); })).tem, 'a sessão de outra pessoa não podia ser guardada');
    S.responder = function () { return { ok: false, foraDaBase: true, erro: 'A matrícula não é do campo desta base.', sessao: 'nao-devia-passar' }; };
    r = await a.page.evaluate(function () { return Casca.sessaoNova(); });
    afirmar(r.ok === false && r.foraDaBase === true && r.erro === 'A matrícula não é do campo desta base.' && r.sessao === undefined, 'a recusa devia chegar com a marca e a frase, e sem sessão: ' + JSON.stringify(r));
    afirmar(!(await a.page.evaluate(function () { return Casca.temSessao(); })).tem, 'a recusa não guarda sessão');
    await a.ctx.close();
  },
  T37_sessao_nova_confere_o_endereco_e_o_termo_antes_do_token: async function () {
    var S = novoServidor(), x = anaComExemplo(SERVIDOR_OUTRO), a = await abrir(x.L, { servidor: S });
    await entrarNoExemplo(a, x);
    var r = await a.page.evaluate(function () { return Casca.sessaoNova(); });
    afirmar(r.ok === false && r.enderecoMudou === true, 'com o endereço que não bate, o sessaoNova devia recusar: ' + JSON.stringify(r));
    afirmar(!x.L.pedidos.some(function (p) { return p.acao === 'token'; }), 'com o endereço errado, nenhum token devia ser pedido');
    afirmar(S.pedidos.length === 0 && S.noOutro.length === 0, 'com o endereço errado, nada podia sair');
    await a.ctx.close();
    var S2 = novoServidor(), x2 = anaComExemplo(), b = await abrir(x2.L, { servidor: S2 });
    await entrarNoExemplo(b, x2);
    x2.L.termo = { id: 'T-1', versao: '3', titulo: 'Código de Ética', texto: 'Texto do termo.' };
    r = await b.page.evaluate(function () { return Casca.sessaoNova(); });
    afirmar(r.ok === false && r.termo === true && /termo/.test(r.erro), 'com termo pendente, o sessaoNova devia mandar aceitar no Início: ' + JSON.stringify(r));
    afirmar(S2.pedidos.length === 0, 'com termo pendente, nada devia ir ao servidor do bloco');
    await b.ctx.close();
  },
  /* Abrir a tela de outro bloco com contexto (FRONTEIRA §5.4; cartas nº 1 do Módulo Segurança, do PESSOAS e da Linha ao
     App, 23/10/2026). */
  T38_abrir_outro_bloco_com_contexto_e_voltar_para_quem_chamou: async function () {
    var x = anaComExemplo(), a = await abrir(x.L, { servidor: novoServidor() });
    await entrarNoExemplo(a, x);
    var ruins = await a.page.evaluate(function () {
      return [Casca.abrirBloco('outro', { equipe: [{ nome: 'José', cpf: '1' }] }), Casca.abrirBloco('outro', { obs: '123.456.789-10' }),
              Casca.abrirBloco('outro', { tokenDoNucleo: 'x' }), Casca.abrirBloco('nao-existe', {})];
    });
    afirmar(ruins.every(function (r) { return r.erro && !r.ok; }), 'contexto com CPF ou token, e bloco que não existe, deviam ser recusados: ' + JSON.stringify(ruins));
    afirmar(/\/blocos\/exemplo\/index\.html$/.test(a.page.url()), 'com o contexto recusado, nenhuma tela podia abrir');
    var ctx = { porta: 'operacao', base: 'DOU', prefixo: 'CPL-DOU-B210', placa: 'ABC1D23', assessor: 'Maria',
                equipe: [{ matricula: '1234', nome: 'José Ação Conceição', funcao: 'ELETRICISTA' }] };
    await a.page.evaluate(function (c) { return Casca.abrirBloco('outro', c); }, ctx);
    await a.page.waitForURL(/\/blocos\/outro\/index\.html#de=exemplo&ctx=/); await a.page.waitForSelector('#pronto');
    var ini = await a.page.evaluate(function () { return window.INICIO_DO_BLOCO; });
    afirmar(ini.de === 'exemplo' && JSON.stringify(ini.contexto) === JSON.stringify(ctx), 'o outro bloco devia receber o contexto inteiro, com os acentos, e quem chamou: ' + JSON.stringify(ini));
    afirmar(ini.pessoa && ini.pessoa.matricula === '99901', 'o outro bloco recebe a pessoa do dia como qualquer bloco');
    // Um link escrito à mão, com CPF no contexto: chega nulo, e não pela metade.
    await a.page.goto(base + '/vazio.html');
    await a.page.goto(base + '/blocos/outro/index.html#de=exemplo&ctx=' + Buffer.from(JSON.stringify({ porta: 'x', cpf: x.cpf })).toString('base64url'));
    await a.page.waitForSelector('#pronto');
    ini = await a.page.evaluate(function () { return window.INICIO_DO_BLOCO; });
    afirmar(ini.contexto === null, 'o contexto com CPF devia chegar nulo: ' + JSON.stringify(ini.contexto));
    await a.page.click('#voltar');
    await a.page.waitForURL(/\/blocos\/exemplo\/index\.html$/); await a.page.waitForSelector('#anotar');
    // Sem quem chamou, o voltar é o de sempre: o Início.
    await a.page.goto(base + '/vazio.html'); await a.page.goto(base + '/blocos/outro/index.html'); await a.page.waitForSelector('#pronto');
    afirmar((await a.page.evaluate(function () { return window.INICIO_DO_BLOCO; })).de === null, 'aberto pelo endereço, sem quem chamou');
    await a.page.click('#voltar'); await esperarTexto(a.page, 'Seus sistemas');
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
  },
  /* Os avisos da pessoa (cartas nº 18 e 19 com o Núcleo, 25/10/2026): só aparecem quando o login os manda, o "lido"
     só onde vier marcavel, e o aviso marcado sai da tela. Sem o campo, nada muda e o "!" não aparece. */
  T40_os_avisos_da_pessoa_e_o_marcar_como_lido: async function () {
    var x = loginComAna(), a = await abrir(x.L), p = a.page;
    await entrarCpf(p, formatado(x.cpf), 'senha-da-ana');
    await esperarTexto(p, 'Olá, Ana');
    await p.click('[data-aba="avisos"]'); await esperarTexto(p, 'Nenhum aviso');
    afirmar(!(await p.$('#avisosPessoais')), 'sem o campo do Núcleo, não podia haver aviso da pessoa');
    afirmar(await p.$eval('#botaoRelato', function (b) { return b.classList.contains('oculto'); }), 'sem o campo do Núcleo, o "!" não podia aparecer');
    x.L.avisosDaPessoa = [
      { id: 'FIN#0042', texto: 'O problema que você relatou foi corrigido.', origem: 'Relato', criadoEm: '2026-10-21', valeAte: '2026-10-24', marcavel: true },
      { id: 'PEND-1', texto: 'Há um curso para fazer.', origem: 'Pendência', marcavel: false },
      { id: 'SEM-TEXTO', origem: 'Relato', marcavel: true }
    ];
    // Os avisos são buscados ao abrir o Início; o app reaberto busca de novo, já com o campo do Núcleo.
    await p.reload(); await esperarTexto(p, 'Há 1 aviso novo');
    afirmar((await texto(p, '#bolinha')) === '1', 'a bolinha devia contar só o aviso marcável');
    await p.click('[data-aba="avisos"]'); await p.waitForSelector('#avisosPessoais');
    var itens = await p.$$eval('#avisosPessoais .app-pessoal', function (l) { return l.map(function (d) { return d.textContent; }); });
    afirmar(itens.length === 2, 'devia mostrar os 2 avisos com texto, e mostrou ' + itens.length);
    var botoes = await p.$$eval('[data-acao="marcarLido"]', function (l) { return l.map(function (b) { return b.getAttribute('data-id'); }); });
    afirmar(botoes.join() === 'FIN#0042', 'o "Marcar como lido" só no marcável, e veio em: ' + botoes.join());
    await p.click('[data-acao="marcarLido"]');
    await p.waitForFunction(function () { return !document.querySelector('[data-acao="marcarLido"]'); });
    var pedido = x.L.pedidos.filter(function (q) { return q.acao === 'marcarAvisoLido'; }).pop();
    afirmar(pedido && pedido.id === 'FIN#0042' && pedido.sessao && !pedido.cpf, 'o pedido do lido devia levar a sessão e o id, sem CPF');
    afirmar((await texto(p, '#avisosPessoais')).indexOf('curso') >= 0, 'o aviso que não se marca devia continuar');
    await a.ctx.close();
  },
  /* O "!" (casca 1.9): acende com o campo do Núcleo, abre o relato a partir da tela em que a pessoa estava, pede uma
     frase, leva o print reduzido em JPEG e o contexto sem CPF, e sem sinal não deixa enviar. */
  T41_o_relato_do_ponto_de_exclamacao: async function () {
    var x = loginComAna(), a = await abrir(x.L), p = a.page;
    x.L.avisosDaPessoa = [];
    await entrarCpf(p, formatado(x.cpf), 'senha-da-ana');
    await esperarTexto(p, 'Olá, Ana');
    await p.waitForFunction(function () { return !document.getElementById('botaoRelato').classList.contains('oculto'); });
    await p.click('[data-aba="perfil"]'); await esperarTexto(p, 'Matrícula');
    await p.click('#botaoRelato'); await p.waitForSelector('#relatoTexto');
    afirmar((await texto(p, '#codigo')) === 'APP-10', 'o código da tela do relato');
    afirmar(await p.isDisabled('[data-acao="enviarRelato"]'), 'sem texto, o envio devia estar apagado');
    afirmar((await p.getAttribute('[data-tipo="ERRO"]', 'aria-pressed')) === 'true' && (await p.getAttribute('[data-tipo="SUGESTAO"]', 'aria-pressed')) === 'false',
      '"Deu erro" devia nascer marcado');
    await p.fill('#relatoTexto', 'curto');
    afirmar(await p.isDisabled('[data-acao="enviarRelato"]'), 'com menos de uma frase, o envio devia continuar apagado');
    await p.fill('#relatoTexto', 'O cartão da Segurança não abriu.');
    afirmar(!(await p.isDisabled('[data-acao="enviarRelato"]')), 'com uma frase, o envio devia acender');
    var escolha = p.waitForEvent('filechooser');
    await p.click('[data-acao="anexarPrint"]');
    await (await escolha).setFiles(path.join(REPOSITORIO, 'icone-512.png'));
    await p.waitForSelector('#printAnexado');
    afirmar((await p.inputValue('#relatoTexto')) === 'O cartão da Segurança não abriu.', 'o texto se perdeu ao anexar o print');
    await a.ctx.setOffline(true);
    await p.evaluate(function () { window.dispatchEvent(new Event('offline')); });
    await p.waitForSelector('#relatoSemSinal');
    afirmar(await p.isDisabled('[data-acao="enviarRelato"]'), 'sem sinal, o envio devia ficar apagado');
    await a.ctx.setOffline(false);
    await p.evaluate(function () { window.dispatchEvent(new Event('online')); });
    await p.waitForFunction(function () { var b = document.querySelector('[data-acao="enviarRelato"]'); return b && !b.disabled; });
    await p.click('[data-acao="enviarRelato"]');
    await esperarTexto(p, 'nº R-7');
    var r = x.L.pedidos.filter(function (q) { return q.acao === 'enviarRelato'; }).pop(), txt = JSON.stringify(r);
    afirmar(r.texto === 'O cartão da Segurança não abriu.' && r.sessao, 'o relato devia levar o texto e a sessão');
    afirmar(r.tipo === 'ERRO', 'sem mexer no seletor, o relato devia ir como ERRO, e foi ' + r.tipo);
    afirmar(/^[A-Za-z0-9_-]{8,40}$/.test(r.chave || ''), 'o relato devia levar a chave contra repetição, no formato do Núcleo: ' + r.chave);
    afirmar(r.contexto && r.contexto.tela === 'APP-07', 'a tela do contexto devia ser a de onde a pessoa veio (APP-07), e veio ' + (r.contexto && r.contexto.tela));
    afirmar(r.contexto.versaoApp && r.contexto.fuso === 'America/Campo_Grande' && /^\d{4}-\d{2}-\d{2}T/.test(r.contexto.hora) && Array.isArray(r.contexto.erros), 'o contexto devia ter versão, fuso, hora e erros');
    afirmar(/^data:image\/jpeg;base64,/.test(r.foto || '') && r.foto.length < 2000000, 'o print devia ir reduzido, em JPEG e abaixo de 2 MB');
    afirmar(txt.indexOf(x.cpf) < 0 && txt.indexOf(formatado(x.cpf)) < 0, 'o relato não pode levar CPF');
    afirmar((await texto(p, '#codigo')) === 'APP-07', 'depois de enviar, devia voltar à tela de onde veio');
    await a.ctx.close();
  },
  /* Erro ou sugestão (casca 1.10, pedido do Dalton de 27/10/2026, 15h33): "Tenho uma sugestão" troca a pergunta, o
     texto escrito fica, e o pedido leva tipo SUGESTAO. E, com sinal, a resposta que não volta não pode dizer "não foi":
     o login pode ter gravado, e quem lê "não foi" toca de novo e duplica o relato (carta nº 2 do Núcleo ao App). */
  T42_erro_ou_sugestao_e_a_resposta_que_nao_volta: async function () {
    var x = loginComAna(), a = await abrir(x.L), p = a.page;
    x.L.avisosDaPessoa = [];
    await entrarCpf(p, formatado(x.cpf), 'senha-da-ana');
    await esperarTexto(p, 'Olá, Ana');
    await p.waitForFunction(function () { return !document.getElementById('botaoRelato').classList.contains('oculto'); });
    await p.click('#botaoRelato'); await p.waitForSelector('#relatoTexto');
    afirmar((await texto(p, 'label[for="relatoTexto"]')) === 'O que aconteceu?', 'no erro, a pergunta devia ser "O que aconteceu?"');
    await p.fill('#relatoTexto', 'Podia mostrar a placa em letra maior.');
    await p.click('[data-tipo="SUGESTAO"]');
    await p.waitForFunction(function () { var l = document.querySelector('label[for="relatoTexto"]'); return l && l.textContent === 'O que poderia melhorar?'; });
    afirmar((await p.getAttribute('[data-tipo="SUGESTAO"]', 'aria-pressed')) === 'true', 'a sugestão devia ficar marcada');
    afirmar((await p.inputValue('#relatoTexto')) === 'Podia mostrar a placa em letra maior.', 'o texto se perdeu ao trocar para sugestão');
    afirmar((await texto(p, '[data-acao="enviarRelato"]')) === 'Enviar a sugestão', 'o botão devia dizer "Enviar a sugestão"');
    x.L.cortarRelato = true;
    await p.click('[data-acao="enviarRelato"]');
    await esperarTexto(p, 'pode ter ido');
    afirmar((await texto(p, 'body')).indexOf('não foi') < 0, 'com sinal e sem resposta, o app não pode dizer que o relato não foi');
    afirmar((await texto(p, '#codigo')) === 'APP-10', 'sem resposta, devia ficar na tela do relato');
    x.L.cortarRelato = false;
    await p.click('[data-acao="enviarRelato"]');
    await esperarTexto(p, 'Sugestão enviada (nº R-7)');
    var os2 = x.L.pedidos.filter(function (q) { return q.acao === 'enviarRelato'; }), r = os2[os2.length - 1];
    // A resposta perdida e o segundo toque: o mesmo relato, com a mesma chave, para o Núcleo devolver o mesmo número.
    afirmar(os2.length === 2 && os2[0].chave && os2[0].chave === os2[1].chave, 'os dois toques do mesmo relato deviam levar a mesma chave: ' + JSON.stringify(os2.map(function (q) { return q.chave; })));
    afirmar(r.tipo === 'SUGESTAO' && r.texto === 'Podia mostrar a placa em letra maior.', 'a sugestão devia ir com tipo SUGESTAO, e foi ' + r.tipo);
    afirmar((await texto(p, 'body')).indexOf('Quando for avaliada') >= 0, 'a sugestão é avaliada, e não corrigida');
    await a.ctx.close();
  },
  /* O Início em duas partes (casca 1.11, decisão do Dalton de 27/10/2026, 20h07): em cima o acesso rápido, pelo perfil da
     pessoa em cada módulo, abrindo o bloco direto no formulário; embaixo os sistemas completos, os soltos antes e os
     outros pelo grupo da MODULOS. Quem só tem acesso rápido não vê a parte de baixo. */
  T43_acesso_rapido_e_sistemas_completos_por_perfil: async function () {
    var OUTRO = { modulo: 'OUTRO', nome: 'Segurança', url: SERVIDOR_OUTRO, perfil: 'ELETRICISTA', liberado: true, grupo: 'Gestão de Segurança' };
    var mods = [
      { modulo: 'TREINAMENTO', nome: 'Treinamentos', url: 'https://modulo.teste.invalid/treino', perfil: 'ALUNO', liberado: true, grupo: 'Gestão de DP/RH' },
      { modulo: 'PRODUCAO', nome: 'Operação', url: 'https://modulo.teste.invalid/operacao', perfil: 'ENCARREGADO', liberado: true },
      OUTRO,
      { modulo: 'BENEFICIOS', nome: 'Benefícios', url: 'https://modulo.teste.invalid/bene', perfil: 'CONSULTA', liberado: true, grupo: 'Gestão de DP/RH' }];
    var x = loginComAna({ modulos: mods }), a = await abrir(x.L), p = a.page;
    await entrarCpf(p, formatado(x.cpf), 'senha-da-ana'); await esperarTexto(p, 'Olá, Ana');
    var nomes = await p.$$eval('#atalhos .app-atalho .app-atalho-nome', function (bs) { return bs.map(function (b) { return b.textContent; }); });
    afirmar(nomes.join('|') === 'Checklist EPI/EPC', 'o eletricista devia ver só o checklist de todos, e viu ' + nomes.join('|'));
    var partes = await p.$$eval('#modulos .app-grupo, #modulos .n-modulo .n-nome', function (es) { return es.map(function (e) { return e.textContent; }); });
    afirmar(partes.join('|') === 'Operação|Gestão de DP/RH|Treinamentos|Benefícios', 'os completos: os soltos primeiro, depois cada grupo com os dele, sem a Segurança do eletricista; veio ' + partes.join('|'));
    afirmar((await texto(p)).indexOf('Sistemas completos') >= 0, 'com acesso rápido, a parte de baixo se chama Sistemas completos');
    await p.click('#atalhos [data-atalho="epi"]');
    await p.waitForURL(/\/blocos\/outro\/index\.html#ctx=/); await p.waitForSelector('#pronto');
    var r = await p.evaluate(function () { return window.INICIO_DO_BLOCO; });
    afirmar(r.contexto && r.contexto.abrir === 'epi' && r.de === null, 'o bloco devia abrir no formulário pedido: ' + JSON.stringify(r && { contexto: r.contexto, de: r.de }));
    await p.click('#voltar'); await esperarTexto(p, 'Acesso rápido');
    afirmar((await texto(p, '#codigo')) === 'APP-05', 'o voltar do bloco devia trazer ao Início');
    await a.ctx.close();
    // O inspetor vê o formulário dele e o sistema completo; quem só tem a Segurança, sem ser inspetor, não vê parte de baixo.
    // Dois perfis na mesma célula (carta nº 1 do Núcleo de 28/10): o app separa pela vírgula.
    var y = loginComAna({ modulos: [Object.assign({}, OUTRO, { perfil: 'ELETRICISTA, Inspetor' })] }), b = await abrir(y.L);
    await entrarCpf(b.page, formatado(y.cpf), 'senha-da-ana'); await esperarTexto(b.page, 'Olá, Ana');
    nomes = await b.page.$$eval('#atalhos .app-atalho-nome', function (bs) { return bs.map(function (e) { return e.textContent; }); });
    afirmar(nomes.join('|') === 'Checklist EPI/EPC|Inspeção SQP', 'o inspetor devia ver os dois formulários, e viu ' + nomes.join('|'));
    afirmar((await b.page.$$('#modulos .n-modulo')).length === 1, 'o inspetor devia ver o sistema completo da Segurança');
    await b.ctx.close();
    var z = loginComAna({ modulos: [OUTRO] }), c = await abrir(z.L);
    await entrarCpf(c.page, formatado(z.cpf), 'senha-da-ana'); await esperarTexto(c.page, 'Acesso rápido');
    afirmar(!(await c.page.$('#modulos')) && !(await c.page.$('#semModulos')), 'quem só tem acesso rápido não vê a parte de baixo, nem a frase de "nenhum sistema"');
    // Módulo travado não dá atalho: o formulário não teria para onde mandar.
    await c.ctx.close();
    var w = loginComAna({ modulos: [Object.assign({}, OUTRO, { liberado: false, motivo: 'Complete o cadastro' }), mods[1]] }), d = await abrir(w.L);
    await entrarCpf(d.page, formatado(w.cpf), 'senha-da-ana'); await esperarTexto(d.page, 'Olá, Ana');
    afirmar(!(await d.page.$('#atalhos')), 'o módulo travado não pode dar atalho');
    await d.ctx.close();
  },
  /* O bloco das duas espécies com acesso rápido (casca 1.11): o atalho abre a tela do celular, e o cartão de baixo abre o
     sistema do Google, com o token, numa janela. O cartão não diz "funciona sem sinal", porque o sistema precisa. */
  T45_o_cartao_completo_abre_o_sistema: async function () {
    var M = { modulo: 'TERCEIRO', nome: 'Operação', url: 'https://modulo.teste.invalid/terceiro', perfil: 'SUPERVISOR', liberado: true };
    var x = loginComAna({ modulos: [M] }), a = await abrir(x.L), p = a.page;
    await entrarCpf(p, formatado(x.cpf), 'senha-da-ana'); await esperarTexto(p, 'Acesso rápido');
    afirmar((await texto(p, '#modulos')).indexOf('funciona sem sinal') < 0, 'o cartão do sistema completo não funciona sem sinal');
    var aguardar = a.ctx.waitForEvent('page');
    await p.click('#modulos .n-modulo[data-i="0"]');
    var janela = await aguardar;
    await janela.waitForURL(/modulo\.teste\.invalid\/terceiro\?t=tok-/);
    afirmar(/\/index\.html$|\/$/.test(p.url()) && !/blocos/.test(p.url()), 'o app não podia ir para a tela do celular: ' + p.url());
    await janela.close();
    await p.click('#atalhos [data-atalho="diario"]');
    await p.waitForURL(/\/blocos\/terceiro\/index\.html#ctx=/); await p.waitForSelector('#pronto');
    await a.ctx.close();
  },
  /* A tela do bloco fala com o servidor dela pelo Casca.postar (casca 1.11): o endereço do login, conferido pelo resumo,
     com o app e a versão do bloco. Com o endereço trocado, nada sai. */
  T44_o_postar_da_tela_do_bloco: async function () {
    var S = novoServidor(), x = anaComExemplo(), a = await abrir(x.L, { servidor: S });
    S.responder = function (c) { return c.acao === 'ligar' ? { ok: true, token: 'chave-1' } : { ok: true }; };
    await entrarNoExemplo(a, x);
    var r = await a.page.evaluate(function () { return Casca.postar({ acao: 'ligar', codigo: '123456' }); });
    var q = S.pedidos.filter(function (c) { return c.acao === 'ligar'; });
    afirmar(r.ok === true && r.token === 'chave-1', 'a tela devia receber a resposta do servidor: ' + JSON.stringify(r));
    afirmar(q.length === 1 && q[0].codigo === '123456' && q[0].app === 'exemplo' && q[0].versao === '1' && q[0].relogio && q[0].fuso !== undefined,
      'o pedido devia levar o app, a versão, o relógio e o fuso: ' + JSON.stringify(q[0]));
    afirmar(JSON.stringify(q[0]).indexOf(x.cpf) < 0 && JSON.stringify(q[0]).indexOf('sess-') < 0 && q[0].sessao === undefined, 'o postar não leva CPF nem sessão');
    await a.ctx.close();
    var T = novoServidor(), y = anaComExemplo(SERVIDOR_OUTRO), b = await abrir(y.L, { servidor: T });
    await entrarNoExemplo(b, y);
    var e = await b.page.evaluate(function () { return Casca.postar({ acao: 'ligar', codigo: '123456' }).then(function () { return 'foi'; }, function (x) { return x; }); });
    afirmar(e && e.servidorRecusado && e.msg && T.noOutro.length === 0 && T.pedidos.length === 0, 'com o endereço que não bate, nada podia sair: ' + JSON.stringify(e) + ' / ' + T.noOutro.length);
    await b.ctx.close();
  },
  /* O app de campo da Operação dentro do App Compel (27/10/2026, decisão do Dalton às 20h07): o encarregado toca no acesso
     rápido, liga o celular à equipe só com o código (o endereço é o do login, conferido pelo resumo), entra na equipe
     com o token do Núcleo (sessaoDoNucleo, com a chave do ligar), e o diário encerrado sobe pela fila da casca com a
     sessão dele. Sem sinal, no dia seguinte, a tela abre direto. */
  T46_o_bloco_da_operacao_na_casca: async function () {
    var S = novoServidor(), OP = { modulo: 'OPERACAO', nome: 'Operação', url: SERVIDOR_OPERACAO, perfil: 'ENCARREGADO', liberado: true };
    S.responderOperacao = function (c) {
      if (c.acao === 'ligar') return { ok: true, token: 'chave-eq', aparelho: 'Celular 7', prefixo: 'CPL-DOU-B210', login: true, base: 'DOU', nome: 'Equipe B210', mat: '' };
      if (c.acao === 'sessaoDoNucleo') return { ok: true, sessao: 'sop-1', valeAte: Date.now() + 30 * 864e5, mat: '99901', nome: 'Ana Teste', funcoes: ['ENCARREGADO'], prefixos: ['CPL-DOU-B210'], via: 'NUCLEO' };
      if (c.acao === 'pacote') return { ok: false, erro: 'Sem pacote na bateria.' };
      if (c.acao === 'lancamento') return { ok: true };
      return { ok: true };
    };
    var x = loginComAna({ modulos: [OP] }), a = await abrir(x.L, { servidor: S }), p = a.page;
    await entrarCpf(p, formatado(x.cpf), 'senha-da-ana'); await esperarTexto(p, 'Acesso rápido');
    afirmar(!(await p.$('#modulos')), 'o encarregado não vê o sistema completo da Operação');
    await p.click('#atalhos [data-atalho="diario"]');
    await p.waitForURL(/\/blocos\/operacao\/index\.html#ctx=/);
    await p.waitForSelector('#ligCodigo');
    afirmar(!(await p.$('#ligUrl')), 'o endereço do servidor não se digita: vem do login');
    await p.fill('#ligCodigo', '123456'); await p.click('[data-acao="ligar"]');
    // "Ana Teste · 99901" só aparece na aba Hoje, depois de entrar (a tela de Entrar também diz o nome e a equipe).
    await p.waitForFunction(function () { return /Ana Teste · 99901/.test(document.getElementById('corpo').textContent); }, null, { timeout: 15000 });
    var lig = S.operacao.filter(function (c) { return c.acao === 'ligar'; }), ses = S.operacao.filter(function (c) { return c.acao === 'sessaoDoNucleo'; });
    afirmar(lig.length === 1 && lig[0].codigo === '123456' && lig[0].app === 'campo' && lig[0].versao === '7v.1-app1', 'o ligar devia ir ao servidor da Operação com o código, o app "campo" e a versão do bloco: ' + JSON.stringify(lig[0]));
    afirmar(ses.length === 1 && ses[0].aparelho === 'chave-eq' && /^tok-/.test(ses[0].token), 'a entrada devia ser o sessaoDoNucleo com a chave do ligar e o token do Núcleo: ' + JSON.stringify(ses[0]));
    afirmar(JSON.stringify(S.operacao).indexOf(x.cpf) < 0, 'nenhum pedido à Operação pode levar o CPF');
    afirmar((await p.evaluate(function () { return Casca.temSessao(); })).tem, 'a sessão da Operação devia ficar guardada na casca');
    // Um diário encerrado (plantão, sem foto) sobe pela fila da casca, com a sessão de quem o encerrou.
    await p.evaluate(function () {
      return guardarDiario({ id: 'd-teste-1', dia: hojeLocal(), estado: 'encerrado', encerradoEm: new Date().toISOString(), fotos: {}, arquivos: {},
        form: { prefixo: 'CPL-DOU-B210', matEnc: '99901', nomeEnc: 'Ana Teste', tipoDia: 'PLANTAO', pessoas: [], codigos: [] } });
    });
    // A tela manda sozinha ao ligar (enviar('celular ligado')); a trava da casca responde "ocupado" a quem chega junto.
    var r = { ocupado: true };
    for (var k = 0; k < 20 && r && r.ocupado; k++) { r = await p.evaluate(function () { return Casca.pedirEnvio(); }); if (r && r.ocupado) await new Promise(function (ok) { setTimeout(ok, 250); }); }
    var lanc = S.operacao.filter(function (c) { return c.acao === 'lancamento'; });
    // Subir pelo pedido do teste ou pelo envio que a tela já fazia sozinha dá no mesmo: uma vez, e não duas.
    afirmar(r && !r.ocupado && !r.erro && lanc.length === 1, 'o diário devia subir uma vez: ' + JSON.stringify(r) + ' / ' + lanc.length);
    afirmar(lanc[0].sessao === 'sop-1' && lanc[0].token === 'chave-eq' && lanc[0].app === 'campo' && lanc[0].pacote.prefixo === 'CPL-DOU-B210', 'o lançamento devia levar a sessão da casca e a chave do celular: ' + JSON.stringify({ s: lanc[0].sessao, t: lanc[0].token, app: lanc[0].app }));
    var estado = await p.evaluate(function () { return lerDiario('d-teste-1').then(function (d) { return d.estado; }); });
    afirmar(estado === 'enviado', 'o diário devia ficar como enviado, e ficou ' + estado);
    // O voltar leva ao Início do app.
    await p.click('#voltarApp'); await esperarTexto(p, 'Acesso rápido');
    // Sem sinal, a tela abre direto, com a pessoa que já entrou nesta equipe, e nada vai ao servidor. O "sem sinal" aqui é o
    // que o celular diz à página (navigator.onLine), que é o que a tela consulta; a cópia guardada pelo service worker é
    // provada no T16 e no T21.
    var antes = S.operacao.length;
    await a.ctx.addInitScript(function () { Object.defineProperty(Navigator.prototype, 'onLine', { get: function () { return false; } }); });
    await p.click('#atalhos [data-atalho="diario"]');
    await p.waitForFunction(function () { var c = document.getElementById('corpo'); return !!c && /Ana Teste · 99901/.test(c.textContent); }, null, { timeout: 15000 });
    afirmar(!(await p.$('#ligCodigo')) && !(await p.$('[data-acao="entrar"]')), 'sem sinal, quem já entrou não devia ver Ligar nem Entrar');
    afirmar(S.operacao.length === antes, 'sem sinal, nada podia ir ao servidor');
    await a.ctx.close();
  },
  /* O botão de ver a senha (pedido do Dalton, 26/10/2026). Todo campo de senha das telas de entrada tem o seu botão, o
     botão mostra e esconde com o rótulo acompanhando, e a senha não fica à vista quando a tela é refeita. */
  T39_ver_a_senha_e_ela_nao_fica_a_vista: async function () {
    var x = loginComAna(), a = await abrir(x.L), p = a.page;
    async function todoCampoTemBotao(tela) {
      var faltam = await p.$$eval('input[type="password"]', function (cs) {
        return cs.filter(function (c) { var b = document.getElementById('ver_' + c.id); return !b || b.type !== 'button' || b.parentNode !== c.parentNode; })
          .map(function (c) { return c.id; });
      });
      var quantos = await p.$$eval('input[type="password"]', function (cs) { return cs.length; });
      afirmar(quantos > 0, 'a tela ' + tela + ' devia ter campo de senha');
      afirmar(!faltam.length, 'campo de senha sem o botão ao lado na tela ' + tela + ': ' + faltam.join(', '));
    }
    async function estado(id) {
      return p.evaluate(function (id) { var c = document.getElementById(id), b = document.getElementById('ver_' + id);
        return { tipo: c.type, valor: c.value, olho: b.getAttribute('data-a-vista'), nome: b.getAttribute('aria-label'),
          cortado: b.querySelectorAll('svg path').length === 2, texto: b.textContent.trim() }; }, id);
    }
    await p.waitForSelector('#senha');
    await todoCampoTemBotao('de entrada');
    var e0 = await estado('senha');
    afirmar(e0.tipo === 'password' && e0.olho === 'nao' && !e0.cortado && e0.nome === 'Mostrar senha', 'a tela devia abrir com a senha escondida e o olho aberto');
    afirmar(e0.texto === '', 'o botão é só o ícone do olho, sem palavra escrita (decisão do Dalton, 26/10), e abriu com "' + e0.texto + '"');
    await p.fill('#senha', 'segredo-123');
    await p.click('#ver_senha');
    var e = await estado('senha');
    afirmar(e.tipo === 'text' && e.valor === 'segredo-123', 'o toque devia mostrar a senha sem apagá-la (tipo ' + e.tipo + ')');
    afirmar(e.olho === 'sim' && e.cortado && e.nome === 'Esconder senha', 'o olho devia ficar cortado e o nome dizer Esconder, e veio ' + e.olho + ' / ' + e.cortado + ' / ' + e.nome);
    afirmar(e.texto === '', 'o botão é só o ícone do olho, sem palavra escrita (decisão do Dalton, 26/10), e veio "' + e.texto + '"');
    await p.click('#ver_senha');
    e = await estado('senha');
    afirmar(e.tipo === 'password' && e.olho === 'nao' && !e.cortado && e.nome === 'Mostrar senha', 'o segundo toque devia esconder de novo, com o olho aberto');
    // Mostrada e a tela refeita (a ajuda redesenha): volta escondida.
    await p.click('#ver_senha');
    await p.click('[data-acao="ajuda"]');
    e = await estado('senha');
    afirmar(e.tipo === 'password' && e.olho === 'nao', 'a senha ficou à vista depois de a tela ser refeita');
    // Outra tela, com senha e confirmação: cada uma tem o seu botão, e um não mexe no outro.
    await p.click('[data-acao="irPrimeiro"]');
    await p.waitForSelector('#senha2');
    await todoCampoTemBotao('do primeiro acesso');
    await p.fill('#senha2', 'outra-456');
    await p.click('#ver_senha2');
    afirmar((await estado('senha2')).tipo === 'text' && (await estado('senha')).tipo === 'password', 'o botão da confirmação devia mostrar só a confirmação');
    // Voltando para a entrada, nada fica à vista.
    await p.click('[data-acao="irEntrar"]');
    await p.waitForSelector('#senha');
    afirmar((await estado('senha')).tipo === 'password', 'a senha apareceu à vista ao voltar para a entrada');
    await a.ctx.close();
  }
};

/* OS TESTES QUE ESPERAM UM CONSERTO DE OUTRA FRENTE. Rodam sempre, e a falha deles não para a publicação; mas se um
   deles PASSAR, a bateria falha, para ele sair desta lista e passar a valer. Assim a espera não vira esquecimento.
   - T19 espera o Núcleo pôr o texto vermelho da folha em --vermelho-forte. A folha de 81.150 bytes (carta nº 13 do
     Núcleo; trocada no app em 22/10/2026) ainda pinta com o #ED1C24 o .aviso.erro, o .link-texto e o
     .btn.secundario, entre outros: a mudança é visual e espera o Dalton (revisão diária de 21/10). Medido em
     22/10/2026: falha nos mesmos sete lugares da cópia de 18/10. */
var ESPERANDO = { T19_nenhum_texto_no_vermelho_da_marca: 'o texto vermelho da folha do Núcleo em --vermelho-forte' };

(async function () {
  var so = process.argv.indexOf('--so') >= 0 ? process.argv[process.argv.indexOf('--so') + 1] : null;
  site = await servir(); base = 'http://127.0.0.1:' + site.address().port;
  navegador = await pw.chromium.launch();
  var falhas = 0, nomes = Object.keys(TESTES).filter(function (n) { return !so || n.indexOf(so) === 0; });
  for (var n of nomes) {
    var t0 = Date.now();
    try {
      // Um teste que trava falha em 2 minutos, em vez de segurar a bateria.
      await Promise.race([TESTES[n](), new Promise(function (_, falha) { setTimeout(function () { falha(new Error('passou de 2 minutos')); }, 120000).unref(); })]);
      if (ESPERANDO[n]) { falhas++; console.log('  FALHA ' + n + ': passou, e está na lista de espera (' + ESPERANDO[n] + '). Tire da lista ESPERANDO.'); }
      else console.log('  ok    ' + n + ' (' + (Date.now() - t0) + ' ms)');
    } catch (e) {
      var msg = (e && e.message || String(e)).split('\n')[0];
      if (ESPERANDO[n]) console.log('  espera ' + n + ' (' + ESPERANDO[n] + '): ' + msg.slice(0, 160));
      else { falhas++; console.log('  FALHA ' + n + ': ' + msg); }
    }
  }
  await navegador.close();
  SERVIDORES.forEach(function (x) { try { x.closeAllConnections(); x.close(); } catch (e) { } });
  fs.rmSync(RAIZ, { recursive: true, force: true });
  console.log(falhas ? '\n' + falhas + ' de ' + nomes.length + ' falharam.' : '\nTodos os ' + nomes.length + ' passaram.');
  process.exitCode = falhas ? 1 : 0;
})();
