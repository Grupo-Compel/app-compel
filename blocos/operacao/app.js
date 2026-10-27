/* app.js — app do encarregado (Operação, etapa 5a e 5b, 13/10/2026).

   NO APP COMPEL DESDE 27/10/2026 (blocos/operacao/; decisão do Dalton às 20h07: "eu não posso ter que abrir o
   módulo inteiro, o encarregado... você precisa integrar"). É o app.js do campo/ 7v.1, mudado só onde o app de campo
   e a casca faziam a mesma coisa de dois jeitos:
   - QUEM ENTRA é quem entrou no App Compel (CPF e a senha do Portal, na casca). A matrícula e a senha de números do
     campo saem: a sessão no servidor da Operação nasce do token do Núcleo, pelo Casca.sessaoNova (o sessaoDoNucleo da
     7s.3), com a chave do "ligar" como aparelho. Sem sinal, entra quem já entrou nesta equipe neste celular;
   - O CELULAR CONTINUA LIGADO À EQUIPE pelo código de 6 números do supervisor (OPE-31), mas o endereço do servidor não
     vem mais no link: vem do login, e a casca confere pelo resumo deste bloco;
   - A FILA, O SEGUNDO PLANO E O SERVICE WORKER são os da casca (ver o fila.js);
   - O VOLTAR leva ao Início do App Compel; a troca de pessoa no celular da equipe é a da casca (Perfil);
   - O ACESSO RÁPIDO "Diário da equipe" do Início abre direto na aba Hoje.
   O resto — as abas, o diário, as regras que chegam no pacote, o book, a APR — é o da Operação, como estava. As quatro
   telas do celular: Hoje (OPE-14), Diário (OPE-15), Encerrar (OPE-16) e
   Envio (OPE-17), com o visual do protótipo 3.4.

   O QUE ESTE ARQUIVO NÃO TEM, DE PROPÓSITO (o repositório é público):
   - nenhuma regra do lançamento: elas chegam no pacote do dia, como texto das
     próprias funções do servidor, e rodam aqui sem sinal (27_AppCampo.gs,
     regrasDoApp). Uma cópia aqui seria a mesma regra em dois lugares, e só um
     aprende (02_LICOES, família 2);
   - nenhum dado da Compel nem endereço do servidor: o endereço chega no link
     do supervisor, e os dados no pacote, e ficam só no celular.

   SEM LOGIN (Dalton, 13/10/2026: "Podemos fazer o app sem login, para
   facilitar"): o celular é ligado UMA vez, com o código de 6 números que o
   supervisor gera na tela "Aparelhos do campo" (OPE-31). Depois disso, a chave
   fica guardada aqui. Quem assina o dia é a foto do rosto, tirada ao encerrar
   ("tirar apenas uma foto da facial para registrar que é o encarregado").

   5b (13/10/2026, noite): O DIA EM HORÁRIOS E A EXECUÇÃO. Os horários do PS
   saem dos toques do dia (saí, iniciei o serviço, parada, almoço, cheguei), e
   cada obra leva a execução (pendência, desligamento, equipamento). As folhas
   do dia encerram juntas, com uma foto do rosto. */

// ---------------------------------------------------------------- estado
var E = {
  cfg: null,            // { url, token, aparelho, mat, nome, base, ligadoEm, desligado }
  aba: 'hoje',
  dia: '',              // o dia que a aba Hoje mostra
  pacotes: {},          // dia -> pacote baixado
  diarios: [],          // a cópia da lista do banco, relida a cada desenho
  aberto: null,         // o diário aberto na aba Diário
  baixando: false, enviando: false, ultimoEnvio: null, aviso: null, versaoNova: false,
  ligar: null,          // { codigo, url } vindos do link
  dias: {},             // 'aaaa-mm-dd|PREFIXO' -> o dia em horários da equipe (5b)
  equipe: '',           // a equipe escolhida, quando o encarregado tem mais de uma
  modoHoje: {},         // dia -> 'obra' | 'emergencia', o que a aba Hoje mostra (5b.1)
  toque: null,          // o registro do dia escolhido e ainda não confirmado (5b.1)
  fechados: {},         // os blocos que o encarregado fechou na tela (5b.1)
  pessoa: null,         // quem entrou no celular da equipe (5d): { mat, nome, funcoes, prefixos, sessao, valeAte }
  pessoas: {},          // as pessoas que já entraram neste celular: mat -> { nome, funcoes, prefixos, sessao, valeAte, verif, erros }
  entrar: { modo: 'entrar' },  // a tela de entrar (5d)
  substitutos: {},      // 'dia|mat': a pessoa disse que é o encarregado da equipe hoje (5d)
  docs: {}              // 2f: id do projeto -> 'ok' | 'baixando' | 'erro:motivo' (o PDF guardado no celular)
};
var REGRAS = {};        // geradoEm do pacote -> as funções de regra do servidor | { erro }

/* Rótulos e textos de tela (não são regras: a regra é o que o servidor confere). */
var NOME_DO_ESTADO = { rascunho: 'Rascunho', encerrado: 'Encerrado, esperando envio', enviado: 'Enviado', recusado: 'Recusado pelo servidor', jaLancado: 'Já lançado por outro' };
var NOME_DO_TIPO_DIA = { PRODUCAO: 'Produção', PLANTAO: 'Plantão sem acionamento', HH: 'À disposição (homem-hora)' };
/* O texto do papel para o da lista (o mesmo da tela "Lançar PS em papel", Script.html). */
var STATUS_DO_PAPEL = { 'CONCLUÍDO': 'Executado', 'PARCIAL': 'Parcial', 'CANCELADO': 'Cancelado', 'RESSALVA': 'Ressalva' };
/* A atividade como a programação escreve, para a da lista: só a sugestão inicial. */
var ATIVIDADE_DO_PAPEL = { 'Obra': 'Obra', 'Manutenção': 'Manutenção Programada', 'Emergencial': 'Manutenção Emergencial', 'Poda': 'Poda' };
var CODIGO_DA_ABA = { hoje: 'OPE-14', diario: 'OPE-15', encerrar: 'OPE-16', envio: 'OPE-17' };

/* Foto do PS: legível para conferir o papel, e leve para subir com sinal fraco
   (conceito 22.3: 150 a 200 KB bastam). O rosto é só para reconhecer quem é. */
var LADOS_FOTO_PS = [1600, 1280], TETO_FOTO_PS = 200 * 1024;
var LADOS_FOTO_ROSTO = [640, 480], TETO_FOTO_ROSTO = 90 * 1024;
/* Enviado há mais de 7 dias sai do celular (o diário e as fotos): o servidor já tem. */
var DIAS_GUARDANDO_ENVIADOS = 7;

function $(id) { return document.getElementById(id); }
function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function dois(n) { return (n < 10 ? '0' : '') + n; }
function isoDe(dt) { return dt.getFullYear() + '-' + dois(dt.getMonth() + 1) + '-' + dois(dt.getDate()); }
function hojeLocal() { return isoDe(new Date()); }
function isoMaisDias(iso, n) { var p = iso.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2] + n, 12); return isoDe(dt); }
function brDe(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }
function horaAgora() { var d = new Date(); return dois(d.getHours()) + ':' + dois(d.getMinutes()); }
function horaDeIso(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes()); }
function novoId() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = crypto.getRandomValues(new Uint8Array(16)), h = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
function minutos(t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; }
function semZeros(m) { return String(m || '').replace(/\D/g, '').replace(/^0+/, ''); }

// ---------------------------------------------------------------- o pacote e as regras
function pacoteDe(dia) { return E.pacotes[dia] || null; }

/* As regras do servidor, do texto que veio no pacote. Compiladas uma vez por pacote. */
function regrasDe(pac) {
  if (!pac || !pac.regras) return null;
  var k = pac.geradoEm + '|' + pac.dia;
  if (!REGRAS[k]) {
    /* As da 5b e as da 5c só existem no pacote do servidor da 5b e da 5c: o pacote antigo abre, e o app pede para baixar de novo. */
    var opc = ['validarDiaDoApp', 'horariosDoDiaApp', 'alvoDoDiarioApp', 'faixaDaEsperaCOD', 'validarBookDoApp', 'estadoDoBookApp', 'etiquetasDoLugarApp', 'casaEquipamentoApp', 'ehEmergenciaApp',
      /* 5e: a APR (e o catálogo dos modelos, que é dado e não função) */
      'modelosDaAprApp', 'modeloSugeridoDaAprApp', 'estadoDaAprApp', 'validarAprDoApp',
      /* 5f: a folha cancelada no deslocamento não pede APR (7.6) */
      'aprPedidaNaFolhaCancelada'];
    try { REGRAS[k] = new Function(pac.regras + '\nreturn { validarLancamentoPS: validarLancamentoPS, chaveDoLancamentoPS: chaveDoLancamentoPS,' +
      opc.map(function (n) { return ' ' + n + ': typeof ' + n + ' === "function" ? ' + n + ' : null'; }).join(',') +
      ', MODELOS_APR: typeof MODELOS_APR === "object" ? MODELOS_APR : null };')(); }
    catch (e) { REGRAS[k] = { erro: 'As regras do pacote não abriram neste celular (' + e.message + '). Baixe o pacote de novo.' }; }
  }
  return REGRAS[k];
}

/* O contexto que o servidor monta (23_LancarPS.gs, gravarLancamentoPSComo), com o que o pacote traz. */
function contextoDe(pac) {
  var equipes = {}, codigos = {};
  (pac.equipes || []).forEach(function (e) { equipes[e.p] = { matricula: e.mat, encarregado: e.enc, tipologia: e.t, supervisor: e.s }; });
  /* A folha do encarregado em outra equipe (substituindo alguém) também vale: está na formação. */
  (pac.folhas || []).forEach(function (f) { if (f.p && !equipes[f.p]) equipes[f.p] = { matricula: f.mat, encarregado: f.enc }; });
  Object.keys(pac.codigos || {}).forEach(function (n) { codigos[n] = {}; pac.codigos[n].forEach(function (it) { codigos[n][it[0]] = 1; }); });
  var hoje = hojeLocal();
  return { hoje: pac.hoje > hoje ? pac.hoje : hoje, equipes: equipes, contratos: pac.contratos || [], codigos: codigos };
}

/* Descrição de um código: a do baremo do contrato; senão, a do verso. */
var MAPAS_DE_CODIGO = {};
function mapaDoContrato(pac, contrato) {
  var nome = String(contrato || '').split('_')[0], k = (pac.geradoEm || '') + '|' + nome;
  if (!MAPAS_DE_CODIGO[k]) { var m = null; if (pac.codigos && pac.codigos[nome]) { m = {}; pac.codigos[nome].forEach(function (it) { if (!m[it[0]]) m[it[0]] = it[1]; }); } MAPAS_DE_CODIGO[k] = m; }
  return MAPAS_DE_CODIGO[k];
}
function itensDoVerso(pac) {
  var out = [];
  Object.keys(pac.catalogo || {}).forEach(function (lado) { (pac.catalogo[lado].colunas || []).forEach(function (col) { col.forEach(function (it) { out.push({ lado: lado, grupo: it[0], cod: String(it[1]).toUpperCase(), desc: it[2], un: it[3] }); }); }); });
  return out;
}
function descricaoDoCodigo(pac, contrato, cod) {
  cod = String(cod || '').toUpperCase().trim();
  if (!cod) return { texto: '', fora: false };
  var m = mapaDoContrato(pac, contrato);
  if (m) return m[cod] ? { texto: m[cod], fora: false } : { texto: 'não está no baremo deste contrato', fora: true };
  var v = itensDoVerso(pac).filter(function (i) { return i.cod === cod; })[0];
  return { texto: v ? v.desc : '', fora: false };
}

function impedidoNoPacote(pac, mat) {
  var m = semZeros(mat);
  return m && pac ? (pac.impedidos || []).filter(function (p) { return semZeros(p.mat) === m; })[0] || null : null;
}

// ---------------------------------------------------------------- banco e servidor
function recarregarDiarios() { return listarDiarios().then(function (l) { E.diarios = l; if (E.aberto) E.aberto = l.filter(function (d) { return d.id === E.aberto.id; })[0] || null; return l; }); }

function carregarPacotesGuardados() {
  var dias = [hojeLocal(), isoMaisDias(hojeLocal(), -1)];
  E.diarios.forEach(function (d) { if (dias.indexOf(d.dia) < 0) dias.push(d.dia); });
  return Promise.all(dias.map(function (dia) { return lerConfig('pacote:' + dia).then(function (p) { if (p) E.pacotes[dia] = p; }); }));
}

function marcarDesligado(msg) {
  if (!E.cfg) return Promise.resolve();
  E.cfg.desligado = true; E.cfg.motivoDesligado = msg || '';
  return gravarConfig('servidor', E.cfg);
}

function baixarPacote(dia, quieto) {
  if (!E.cfg || E.cfg.desligado || E.baixando) return Promise.resolve();
  E.baixando = true; if (!quieto) desenhar();
  return postar(E.cfg.url, { acao: 'pacote', token: E.cfg.token, dia: dia }, 60000).then(function (r) {
    E.baixando = false;
    if (r.ok) { E.pacotes[dia] = r; E.aviso = null; return gravarConfig('pacote:' + dia, r).then(function () { baixarProjetos(r); }); }
    if (r.desligado) return marcarDesligado(r.erro);
    if (!quieto) E.aviso = { tipo: 'erro', texto: r.erro || 'O servidor não mandou o pacote.' };
  }, function (e) {
    E.baixando = false;
    if (!quieto) E.aviso = { tipo: 'atencao', texto: 'Não consegui baixar o pacote: ' + (e && e.msg || 'sem sinal') };
  }).then(desenhar);
}

/* O pedido ao Android é o da casca, na etiqueta deste bloco (bloco.json): o service worker é um só para o app inteiro. */
function pedirEnvioEmSegundoPlano() {
  if (typeof cascaPedirSegundoPlano === 'function') cascaPedirSegundoPlano('enviar-diarios');
}

function enviar(motivo) {
  if (!E.cfg || E.cfg.desligado || E.enviando) return Promise.resolve();
  E.enviando = true; desenhar();
  /* O envio é o da casca (Casca.pedirEnvio): ela confere o endereço, põe a trava e chama a fila deste bloco. */
  return Casca.pedirEnvio().then(function (r) {
    E.enviando = false; E.ultimoEnvio = { quando: new Date().toISOString(), r: r || {} };
    if (r && r.pendentes) pedirEnvioEmSegundoPlano();
    return lerConfig('servidor').then(function (c) { if (c) E.cfg = c; });
  }, function (e) {
    E.enviando = false; E.ultimoEnvio = { quando: new Date().toISOString(), r: { erro: e && (e.msg || e.message) || String(e) } };
  }).then(recarregarDiarios).then(desenhar);
}

// ---------------------------------------------------------------- fotos
function carregarImagem(arquivo) {
  if (self.createImageBitmap) return createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(arquivo); });
  return new Promise(function (ok, falha) { var img = new Image(); img.onload = function () { ok(img); }; img.onerror = falha; img.src = URL.createObjectURL(arquivo); });
}
function paraBlob(canvas, q) { return new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', q); }); }

/* A marca d'água vai GRAVADA na imagem (conceito 21.2): o book é impresso, e
   texto ao lado da foto se perde. */
function marcaDagua(ctx, w, h, linhas) {
  var fonte = Math.max(13, Math.round(w / 42)), alto = Math.round(fonte * 1.35 * linhas.length + fonte * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, h - alto, w, alto);
  ctx.fillStyle = '#fff'; ctx.font = '600 ' + fonte + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
  linhas.forEach(function (t, i) { ctx.fillText(t, Math.round(fonte * 0.6), h - alto + Math.round(fonte * 0.4) + i * Math.round(fonte * 1.35)); });
}

/* Reduz até caber no teto, tentando lado e qualidade (a mesma escada do app de teste). */
function processarFoto(arquivo, lados, teto, linhas) {
  return carregarImagem(arquivo).then(function (img) {
    var w0 = img.width, h0 = img.height, tentativas = [];
    lados.forEach(function (lado) { [0.72, 0.6, 0.5, 0.4].forEach(function (q) { tentativas.push([lado, q]); }); });
    var i = 0;
    function tenta() {
      var lado = tentativas[i][0], q = tentativas[i][1], f = Math.min(1, lado / Math.max(w0, h0));
      var c = document.createElement('canvas');
      c.width = Math.round(w0 * f); c.height = Math.round(h0 * f);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      marcaDagua(ctx, c.width, c.height, linhas);
      return paraBlob(c, q).then(function (b) {
        i++;
        if (b.size <= teto || i >= tentativas.length) return { blob: b, largura: c.width, altura: c.height };
        return tenta();
      });
    }
    return tenta().then(function (r) { if (img.close) img.close(); return r; });
  });
}

var URLS_DE_FOTO = {};
function urlDaFoto(id) {
  if (!id) return Promise.resolve('');
  if (URLS_DE_FOTO[id]) return Promise.resolve(URLS_DE_FOTO[id]);
  return lerFoto(id).then(function (f) { if (!f || !f.blob) return ''; URLS_DE_FOTO[id] = URL.createObjectURL(f.blob); return URLS_DE_FOTO[id]; });
}
/* Depois de desenhar: as <img data-foto-id> recebem a imagem do banco. */
function mostrarFotos() {
  Array.prototype.forEach.call(document.querySelectorAll('img[data-foto-id]'), function (img) {
    urlDaFoto(img.getAttribute('data-foto-id')).then(function (u) { if (u) img.src = u; });
  });
}

// ---------------------------------------------------------------- o dia da equipe (5b)
/*
 * O DIA EM HORÁRIOS (5b, 13/10/2026): um toque a cada mudança do dia (saí da
 * base, iniciei o serviço, parada, almoço, cheguei à base), como no protótipo
 * 3.4 (OPE-15). Cada toque fecha o registro anterior naquela hora e abre o
 * próximo; o celular guarda o início de cada um e a chegada. É um dia por
 * equipe, guardado à parte das folhas: a equipe que faz duas obras registra o
 * dia uma vez, e cada folha tira dele os horários dela (as regras são as do
 * servidor, horariosDoDiaApp e validarDiaDoApp, que chegam no pacote).
 *
 * A HORA DO TOQUE E A HORA INFORMADA: o toque vem com a hora de agora, que o
 * encarregado pode trocar (esqueceu de marcar na hora); o momento do toque fica
 * guardado junto (tocadoEm), para a conferência (conceito, 11, proposta 2).
 */
function chaveDoDia(dia, prefixo) { return dia + '|' + String(prefixo || '').toUpperCase(); }
function diaDaEquipe(dia, prefixo) {
  var k = chaveDoDia(dia, prefixo);
  if (!E.dias[k]) E.dias[k] = { chave: k, dia: dia, prefixo: String(prefixo || '').toUpperCase(), blocos: [], chegada: '', kmSaida: '', kmChegada: '' };
  return E.dias[k];
}
function guardarDia(r) { r.mudadoEm = new Date().toISOString(); return gravarConfig('dia:' + r.chave, r); }
function carregarDias() {
  return noBanco('config', 'readonly', function (s) { return s.getAll(); }).then(function (l) {
    (l || []).forEach(function (c) { if (/^dia:/.test(c.chave) && c.valor && c.valor.chave) E.dias[c.valor.chave] = c.valor; });
  });
}
/* O que vai com o diário: só o que as regras olham. */
function retratoDoDia(r) {
  /* 6e (15/10/2026): vão também o momento do toque da chegada e quando a hora foi corrigida. O Dalton quer
     comparar a hora informada com a hora em que o botão foi tocado ("se ele está burlando os horários"). */
  /* 6f: e a posição do GPS na saída e na chegada à base. */
  return { blocos: r.blocos.map(function (b, i) { var x = { t: b.t, ini: b.ini, obra: b.obra || '', motivo: b.motivo || '', obs: b.obs || '', tocadoEm: b.tocadoEm || '', corrigidoEm: b.corrigidoEm || '' }; if (i === 0 && b.gps) x.gps = b.gps; return x; }),
           chegada: r.chegada || '', kmSaida: r.kmSaida || '', kmChegada: r.kmChegada || '', chegadaTocadaEm: r.chegadaTocadaEm || '', chegadaCorrigidaEm: r.chegadaCorrigidaEm || '',
           chegadaGps: r.chegadaGps || null };
}
function diariosDoDia(dia, prefixo) {
  var p = String(prefixo || '').toUpperCase();
  return E.diarios.filter(function (d) { return d.dia === dia && String(d.form.prefixo || '').toUpperCase() === p; });
}
/* Encerrado ou enviado algum diário do dia, os horários não mudam mais: os outros diários do dia já levaram esse dia. */
function diaTravado(dia, prefixo) { return diariosDoDia(dia, prefixo).some(function (d) { return ['encerrado', 'enviado', 'jaLancado'].indexOf(d.estado) >= 0; }); }

/* O dia que as abas Diário e Encerrar mostram: o do diário aberto, ou o da equipe do encarregado no dia escolhido. */
function diaAtual() {
  if (E.aberto) return { dia: E.aberto.dia, prefixo: String(E.aberto.form.prefixo || '').toUpperCase() };
  var pac = pacoteDe(E.dia), eqs = equipesDoDia(pac);
  if (!eqs.length) return null;
  return { dia: E.dia, prefixo: eqs.indexOf(E.equipe) >= 0 ? E.equipe : eqs[0] };
}
function equipesDoDia(pac) {
  var out = [];
  if (!pac) return out;
  (pac.equipes || []).forEach(function (e) { if (out.indexOf(e.p) < 0) out.push(e.p); });
  (pac.folhas || []).forEach(function (f) { if (f.p && out.indexOf(f.p) < 0) out.push(f.p); });
  return out;
}
function nomeDoRegistro(t) { return { DESLOC: 'Deslocamento', SERVICO: 'Serviço', PARADA: 'Parada', ALMOCO: 'Almoço' }[t] || t; }
function duracao(m) { m = Math.round(m || 0); return m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min'; }

/* A folha que um serviço aponta (a mesma conta do servidor, alvoDoDiarioApp). */
function alvoDoDiario(d, R) { return R && R.alvoDoDiarioApp ? R.alvoDoDiarioApp(d.form.tipoDia === 'PLANTAO' ? '' : d.form.obra, d.id) : ''; }
/* As obras do dia para o toque: as folhas da programação e as folhas sem programação da equipe. */
function obrasDoDia(dia, prefixo) {
  var pac = pacoteDe(dia), R = regrasDe(pac), out = [], vistos = {};
  if (!R || !R.alvoDoDiarioApp) return out;
  (pac.folhas || []).forEach(function (f) {
    if (String(f.p).toUpperCase() !== prefixo || !f.obra) return;
    var a = R.alvoDoDiarioApp(f.obra, ''); if (vistos[a]) return; vistos[a] = 1;
    out.push([a, 'obra ' + f.obra + (f.municipio ? ' · ' + f.municipio : '')]);
  });
  diariosDoDia(dia, prefixo).forEach(function (d) {
    var a = alvoDoDiario(d, R); if (!a || vistos[a]) return; vistos[a] = 1;
    out.push([a, d.extra ? nomeDoAtendimento(d) : 'obra ' + d.form.obra]);
  });
  return out;
}
function rotuloDoAlvo(dia, prefixo, alvo) {
  var o = obrasDoDia(dia, prefixo).filter(function (x) { return x[0] === alvo; })[0];
  return o ? o[1] : alvo ? (alvo.charAt(0) === '#' ? 'atendimento sem NR' : 'obra ' + alvo) : '';
}
/*
 * A EMERGÊNCIA NÃO É OBRA (Dalton, 15/10/2026: "no app, quando é uma emergência, vários campos sinalizam a
 * palavra obra"). A folha sem programação é um atendimento: o número que ela leva é a NR da ocorrência, e
 * os textos falam em atendimento e local. A folha da programação continua falando em obra. No dia que só
 * tem atendimento, os toques também; no dia com os dois, "obra ou atendimento".
 */
function comNR(n) { return /^NR/i.test(String(n)) ? String(n) : 'NR ' + n; }
function nomeDoAtendimento(d) { return d.form.tipoDia === 'PLANTAO' ? 'plantão' : d.form.obra ? 'atendimento ' + comNR(d.form.obra) : 'atendimento sem NR'; }
function oQueTemNoDia(dia, prefixo) {
  var pac = pacoteDe(dia), p = String(prefixo || '').toUpperCase();
  var obra = ((pac && pac.folhas) || []).some(function (f) { return String(f.p).toUpperCase() === p && f.obra; });
  var atend = diariosDoDia(dia, p).some(function (d) { return d.extra; });
  return { obra: obra || !atend, atend: atend };
}
function palavraDoAlvo(dia, prefixo) { var q = oQueTemNoDia(dia, prefixo); return q.obra && q.atend ? 'obra ou atendimento' : q.atend ? 'atendimento' : 'obra'; }

/* Os horários do dia nos campos do diário (expediente, almoço, km e as atividades da obra dele). */
function aplicarDia(d) {
  if (!d || d.estado !== 'rascunho') return;
  var pac = pacoteDe(d.dia), R = regrasDe(pac);
  if (!R || !R.horariosDoDiaApp) return;
  var r = diaDaEquipe(d.dia, d.form.prefixo), h = R.horariosDoDiaApp(retratoDoDia(r)), x = d.form;
  /* 5d: o diário em rascunho é de quem está no celular agora (o substituto que pegou o celular continua a folha). */
  if (E.cfg && E.cfg.login && E.pessoa) { x.matEnc = E.pessoa.mat; x.nomeEnc = E.pessoa.nome; }
  x.expIni = h.expIni; x.expFim = h.expFim; x.almIni = h.almIni; x.almFim = h.almFim;
  x.kmSaida = r.kmSaida || ''; x.kmChegada = r.kmChegada || '';
  var o = x.tipoDia === 'PRODUCAO' ? h.porObra[alvoDoDiario(d, R)] : null;
  x.ini = o ? o.ini : ''; x.fim = o ? o.fim : '';
  garantirExecucao(d);
}
function execucaoNova(f) {
  return { pendencia: '', pendenciaDesc: '', comDesligamento: !!(f && /^s/i.test(String(f.desligar || ''))), odm: '', horaLiberacao: '', operadorLiberacao: '',
           horaEntrega: '', operadorEntrega: '', areaSombra: '', equipamento: '', equipamentoTipo: '', fichaI: {}, fichaR: {} };
}
/* O diário da 5a não tinha a execução: ela nasce com o desligamento da folha do pacote. */
function garantirExecucao(d) {
  if (d.form.execucao) return;
  d.form.execucao = execucaoNova(folhaDoPacote(pacoteDe(d.dia), d.codigo) || d.folha);
}

/* Um toque no dia. */
function tocar(tipo) {
  var info = diaAtual();
  if (!info) return;
  var r = diaDaEquipe(info.dia, info.prefixo), pac = pacoteDe(info.dia), L = (pac && pac.listas) || {};
  if (diaTravado(info.dia, info.prefixo)) return;
  var hora = ($('tqHora') || {}).value || '', km = String(($('tqKm') || {}).value || '').replace(/\D/g, ''), obra = ($('tqObra') || {}).value || '';
  var motivo = ($('tqMotivo') || {}).value || '', obs = String(($('tqObs') || {}).value || '').trim(), ult = r.blocos[r.blocos.length - 1];
  E.valToque = { t: tipo, hora: hora, km: km, obra: $('tqObra') ? obra : undefined, motivo: motivo, obs: obs };
  var erro = function (t) { E.aviso = { tipo: 'erro', texto: t }; desenhar(); var c = $('f-dia'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); };
  if (minutos(hora) === null) return erro('A hora do registro (HH:MM).');
  if (ult && minutos(hora) <= minutos(ult.ini)) return erro('A hora tem de ser depois de ' + ult.ini + ', o último registro.');
  if (tipo === 'CHEGADA') {
    if (!r.blocos.length) return erro('Registre antes a saída da base ("Saí · deslocando").');
    if (!km) return erro('O km do hodômetro na chegada à base.');
    r.chegada = hora; r.kmChegada = km; r.chegadaTocadaEm = new Date().toISOString(); r.chegadaGps = null;
    gpsDoToque(r, 'chegada');
  } else {
    if (!r.blocos.length && tipo !== 'DESLOC') return erro('O dia começa com "Saí · deslocando", na saída da base.');
    if (!r.blocos.length && !km) return erro('O km do hodômetro na saída da base.');
    if (tipo === 'SERVICO' && !obra) return erro('De qual obra é o serviço.');
    if (tipo === 'SERVICO') { var trava = travaDaApr(info, obra); if (trava) return erro(trava); }
    if (tipo === 'PARADA' && !motivo) return erro('O motivo da parada.');
    if (tipo === 'PARADA' && motivo === L.motivoOutro && !obs) return erro('Descreva o motivo da parada.');
    if (!r.blocos.length) r.kmSaida = km;
    r.blocos.push({ t: tipo, ini: hora, obra: tipo === 'ALMOCO' ? '' : obra, motivo: tipo === 'PARADA' ? motivo : '', obs: tipo === 'PARADA' ? obs : '', tocadoEm: new Date().toISOString() });
    if (r.blocos.length === 1) gpsDoToque(r, 0);
  }
  E.aviso = null; E.toque = null; E.valToque = null;
  return guardarDia(r).then(desenhar);
}
/*
 * 5f: A TRAVA DA APR (Dalton, 19/10/2026, resposta 7.2: '"Iniciei o serviço" sem a APR concluída trava, por um
 * parâmetro da base'). Até a 5f o toque só avisava (o toque é a hora que aconteceu, e a conferência mostrava a APR feita
 * depois). Com o APR_TRAVA_O_SERVICO da base em SIM, o "Iniciei o serviço" numa obra só entra com a APR de uma folha
 * dela concluída, e sem impedimento: a APR com impedimento diz "não comece a atividade", e o toque seria o contrário
 * dela. O servidor não confere o toque (ele chega depois, com o dia inteiro): a trava é do celular.
 * → o texto do erro, ou '' quando pode tocar.
 */
function travaDaApr(info, alvo) {
  var pac = pacoteDe(info.dia), L = (pac && pac.listas) || {}, R = regrasDe(pac);
  if (!L.aprTrava || !L.aprPadrao || !R || !alvo) return '';
  var ds = E.diarios.filter(function (d) { return d.dia === info.dia && d.estado === 'rascunho' && String(d.form.prefixo || '').toUpperCase() === String(info.prefixo || '').toUpperCase() && alvoDoDiario(d, R) === alvo; });
  if (!ds.length) return 'Antes de "Iniciei o serviço", abra a folha desta obra (aba Hoje) e faça a APR. Nesta base, o serviço só começa com a APR concluída.';
  var feitas = ds.filter(function (d) { return d.apr && d.apr.feitaEm; });
  if (!feitas.length) return 'A APR de ' + nomeDaFolha(ds[0]) + ' ainda não foi concluída. Nesta base, o serviço só começa com a APR concluída (aba Diário).';
  var e = R.estadoDaAprApp ? R.estadoDaAprApp(feitas[0].apr, L.aprPadrao, 'inicio') : null;
  if (e && e.impedidos.length) return 'A APR de ' + nomeDaFolha(feitas[0]) + ' tem impedimento (' + e.impedidos.map(function (x) { return x.grupo; }).join('; ') + '): não comece a atividade. Fale com o supervisor.';
  return '';
}
/*
 * O GPS NA SAÍDA E NA CHEGADA À BASE (6f; Dalton, 15/10/2026, 18:42: "pode fazer"). Só esses dois toques, uma
 * leitura cada, como a da foto (a regra 22.3 é não seguir a equipe o dia todo). A leitura não segura o toque:
 * o registro grava na hora e a posição chega depois (até 8 s), no mesmo registro, se ele ainda existir.
 * Sem permissão ou sem sinal de GPS, fica "sem GPS", e a conferência mostra assim.
 */
function gpsDoToque(r, qual) {
  var alvo = qual === 'chegada' ? null : r.blocos[qual], quando = new Date().toISOString();
  return lerPosicao().then(function (pos) {
    var g = pos ? { lat: pos.lat, lon: pos.lon, precisao: pos.precisao, em: quando } : { semGps: true, em: quando };
    if (qual === 'chegada') { if (!r.chegada) return; r.chegadaGps = g; }
    else { if (r.blocos[qual] !== alvo) return; alvo.gps = g; }
    return guardarDia(r);
  }).catch(function () { /* sem GPS não é erro: o toque já está gravado */ });
}
function desfazerToque() {
  var info = diaAtual(); if (!info || diaTravado(info.dia, info.prefixo)) return;
  var r = diaDaEquipe(info.dia, info.prefixo);
  if (r.chegada) { r.chegada = ''; r.kmChegada = ''; r.chegadaTocadaEm = ''; r.chegadaCorrigidaEm = ''; r.chegadaGps = null; }
  else { r.blocos.pop(); if (!r.blocos.length) r.kmSaida = ''; }
  return guardarDia(r).then(desenhar);
}
/* Corrigir a hora de um registro (ou da chegada): entre o anterior e o seguinte. */
function corrigirHora(i, valor) {
  var info = diaAtual(); if (!info || diaTravado(info.dia, info.prefixo)) return;
  var r = diaDaEquipe(info.dia, info.prefixo), m = minutos(valor);
  /* A mesma hora de antes não é correção: o campo redesenhado depois de uma hora recusada pode avisar
     "mudou" com o valor antigo, e isso apagava o aviso da recusa (visto na bateria em 13/10/2026). */
  if (valor === (i === 'chegada' ? r.chegada : (r.blocos[i] || {}).ini)) return;
  var antes = i === 'chegada' ? r.blocos[r.blocos.length - 1] : r.blocos[i - 1], depois = i === 'chegada' ? null : (r.blocos[i + 1] || (r.chegada ? { ini: r.chegada } : null));
  if (m === null || (antes && m <= minutos(antes.ini)) || (depois && m >= minutos(depois.ini))) {
    E.aviso = { tipo: 'erro', texto: 'A hora tem de ficar entre ' + (antes ? antes.ini : 'o começo do dia') + ' e ' + (depois ? depois.ini : 'o fim do dia') + '.' };
    return desenhar();
  }
  if (i === 'chegada') { r.chegada = valor; r.chegadaCorrigidaEm = new Date().toISOString(); } else { r.blocos[i].ini = valor; r.blocos[i].corrigidoEm = new Date().toISOString(); }
  E.aviso = null;
  return guardarDia(r).then(desenhar);
}

function cartaoDoDia(info) {
  var r = diaDaEquipe(info.dia, info.prefixo), pac = pacoteDe(info.dia), R = regrasDe(pac), L = (pac && pac.listas) || {};
  var trav = diaTravado(info.dia, info.prefixo), eqs = equipesDoDia(pac), ult = r.blocos[r.blocos.length - 1];
  var h = '<div class="cartao" id="f-dia"><div class="etiqueta">O dia da equipe · ' + esc(info.prefixo) + ' · ' + esc(brDe(info.dia).slice(0, 5)) + '</div>' +
    (eqs.length > 1 && !E.aberto ? '<select id="tqEquipe" aria-label="Equipe">' + opcoes(eqs, info.prefixo) + '</select>' : '');
  if (!R || !R.horariosDoDiaApp) return h + '<div class="aviso atencao">O pacote deste dia é de uma versão antiga do sistema: baixe de novo (aba Hoje).</div></div>';
  var hs = R.horariosDoDiaApp(retratoDoDia(r));
  h += r.blocos.length ? '<ul class="lista registros">' + r.blocos.map(function (b, i) {
    var dur = hs.registros[i] ? hs.registros[i].minutos : 0;
    return '<li class="reg reg-' + b.t.toLowerCase() + '"><input type="time" data-bl="' + i + '" value="' + esc(b.ini) + '"' + (trav ? ' disabled' : '') + ' aria-label="Hora do registro ' + (i + 1) + '">' +
      '<span><b>' + esc(nomeDoRegistro(b.t)) + '</b>' + (b.obra ? ' · ' + esc(rotuloDoAlvo(info.dia, info.prefixo, b.obra)) : '') + (b.motivo ? ' · ' + esc(b.motivo) + (b.obs ? ': ' + esc(b.obs) : '') : '') +
      '<small>' + (i + 1 < r.blocos.length || r.chegada ? duracao(dur) : 'em andamento') + '</small></span></li>';
  }).join('') + (r.chegada ? '<li class="reg reg-chegada"><input type="time" data-chegada="1" value="' + esc(r.chegada) + '"' + (trav ? ' disabled' : '') + ' aria-label="Hora da chegada"><span><b>Chegada à base</b><small>km ' + esc(r.kmSaida) + ' → ' + esc(r.kmChegada) + '</small></span></li>' : '') + '</ul>'
    : '<p class="media">Nada registrado ainda. Ao sair da base, toque em <b>Saí da base · deslocando</b>.</p>';
  if (trav) return h + '<div class="ajuda">O dia já foi encerrado: os horários não mudam mais.</div></div>';
  if (!r.chegada) h += painelDoToque(info, r, L, R);
  if (r.blocos.length) h += '<button type="button" class="btn medio fantasma" data-acao="desfazerToque">' + (r.chegada ? 'Desfazer a chegada' : 'Desfazer o último registro') + '</button>';
  if (r.chegada) h += '<div class="aviso ok" style="margin-top:8px">Dia registrado: ' + esc(hs.expIni) + ' às ' + esc(hs.expFim) + ' · serviço ' + esc(duracao(hs.minutos.SERVICO)) +
    (hs.minutos.PARADA ? ' · paradas ' + esc(duracao(hs.minutos.PARADA)) : '') + '. Agora é encerrar (aba Encerrar).</div>';
  return h + '</div>';
}

/*
 * O PRÓXIMO REGISTRO (5b.1, pedido do Dalton no teste de 13/10/2026, 18:01: "deixar
 * mais óbvio, dependendo do que eu marcar, qual que é o próximo"). Os botões de
 * cima são o passo mais provável depois do registro em andamento; os de baixo, os
 * outros que as regras aceitam. O que não faz sentido some: sair da base de novo
 * quando já está deslocando, o segundo almoço (o servidor recusa), a chegada sem
 * ter saído. Tocar escolhe; os campos daquele registro aparecem, e "Confirmar"
 * grava. Os campos de antes (hora, km, obra, motivo, todos de uma vez) não diziam
 * qual valia para qual botão.
 */
var PROXIMOS_REGISTROS = {
  '':      [['DESLOC'], []],
  DESLOC:  [['SERVICO', 'CHEGADA'], ['PARADA', 'ALMOCO']],
  SERVICO: [['PARADA', 'ALMOCO', 'DESLOC'], ['SERVICO', 'CHEGADA']],
  PARADA:  [['SERVICO', 'DESLOC'], ['ALMOCO', 'PARADA', 'CHEGADA']],
  ALMOCO:  [['SERVICO', 'DESLOC'], ['PARADA', 'CHEGADA']]
};
function nomeDoToque(tipo, ult, r) {
  var u = ult ? ult.t : '';
  if (tipo === 'DESLOC') return r.blocos.length ? 'Saí · deslocando' : 'Saí da base · deslocando';
  var q = oQueTemNoDia(r.dia, r.prefixo), soAtend = q.atend && !q.obra;
  if (tipo === 'SERVICO') return u === 'DESLOC' ? (soAtend ? 'Cheguei ao local · iniciei o atendimento' : q.atend ? 'Cheguei · iniciei o serviço' : 'Cheguei na obra · iniciei o serviço') :
    u === 'SERVICO' ? (soAtend ? 'Outro atendimento' : q.atend ? 'Serviço em outra obra ou atendimento' : 'Serviço em outra obra') : u ? 'Voltei ao serviço' : 'Iniciei o serviço';
  if (tipo === 'PARADA') return u === 'PARADA' ? 'Outra parada' : 'Parada';
  if (tipo === 'ALMOCO') return 'Almoço';
  return 'Cheguei à base';
}
function painelDoToque(info, r, L, R) {
  var ult = r.blocos[r.blocos.length - 1], prox = PROXIMOS_REGISTROS[ult ? ult.t : ''] || PROXIMOS_REGISTROS[''];
  var jaAlmocou = r.blocos.some(function (b) { return b.t === 'ALMOCO'; });
  var vale = function (t) { return !(t === 'ALMOCO' && jaAlmocou); };
  var esc1 = E.toque && (prox[0].concat(prox[1]).indexOf(E.toque) >= 0) ? E.toque : '';
  var botao = function (t, classe) { return '<button type="button" class="btn medio ' + classe + (esc1 === t ? ' escolhido' : '') + '" data-toque="' + t + '">' + esc(nomeDoToque(t, ult, r)) + '</button>'; };
  var h = '<div class="toque">';
  if (ult) h += '<div class="agora">Agora: <b>' + esc(nomeDoRegistro(ult.t)) + '</b> desde ' + esc(ult.ini) + (ult.obra ? ' · ' + esc(rotuloDoAlvo(info.dia, info.prefixo, ult.obra)) : '') + (ult.motivo ? ' · ' + esc(ult.motivo) : '') +
    '<small>Saiu da base às ' + esc(r.blocos[0].ini) + ' com o km <b>' + esc(r.kmSaida) + '</b>.</small></div>';
  h += '<div class="etiqueta" style="margin-top:10px">' + (ult ? 'Qual é o próximo registro?' : 'Ao sair da base') + '</div>' +
    '<div class="toques">' + prox[0].filter(vale).map(function (t) { return botao(t, ''); }).join('') + '</div>';
  var outros = prox[1].filter(vale);
  if (outros.length) h += '<div class="ajuda" style="margin-top:8px">Outro registro:</div><div class="toques outros">' + outros.map(function (t) { return botao(t, 'fantasma'); }).join('') + '</div>';
  if (esc1) h += formularioDoToque(esc1, info, r, L, R, ult);
  else h += '<div class="ajuda" style="margin-top:8px">Cada registro fecha o anterior nessa hora. A hora de cada um pode ser corrigida na lista acima até encerrar o dia.</div>';
  return h + '</div>';
}
function formularioDoToque(t, info, r, L, R, ult) {
  var obras = obrasDoDia(info.dia, info.prefixo), obraPadrao = ult && ult.obra ? ult.obra : E.aberto ? alvoDoDiario(E.aberto, R) : (obras[0] || [''])[0];
  /* O que já foi digitado volta depois de uma recusa (o desenho novo não pode apagar a hora trocada). */
  var v = E.valToque && E.valToque.t === t ? E.valToque : {};
  var h = '<div class="formToque" id="formToque"><div class="etiqueta">' + esc(nomeDoToque(t, ult, r)) + '</div>' +
    '<label for="tqHora">Hora</label><input id="tqHora" type="time" value="' + esc(v.hora || horaAgora()) + '"><div class="ajuda">É a hora de agora. Esqueceu de marcar na hora? Troque antes de confirmar.</div>';
  if (t === 'DESLOC' && !r.blocos.length) h += '<label for="tqKm">Km do hodômetro na saída da base</label><input id="tqKm" inputmode="numeric" maxlength="7" autocomplete="off" value="' + esc(v.km || '') + '">';
  if (t === 'CHEGADA') h += '<label for="tqKm">Km do hodômetro na chegada à base</label><input id="tqKm" inputmode="numeric" maxlength="7" autocomplete="off" value="' + esc(v.km || '') + '"><div class="ajuda">Na saída, o hodômetro marcava <b>' + esc(r.kmSaida) + '</b>.</div>';
  if (t === 'SERVICO' || t === 'DESLOC' || t === 'PARADA') {
    if (obras.length) h += '<label for="tqObra">' + (t === 'DESLOC' ? 'Indo para qual ' : 'Em qual ') + esc(palavraDoAlvo(info.dia, info.prefixo)) + '</label><select id="tqObra">' +
      (t === 'DESLOC' ? '<option value=""' + (v.obra === '' ? ' selected' : '') + '>Para a base, ou outro lugar</option>' : '') + opcoes(obras, v.obra !== undefined ? v.obra : obraPadrao) + '</select>';
    else if (t === 'SERVICO') h += '<div class="aviso atencao">Nenhuma folha aberta para esta equipe no dia. Abra a folha na aba Hoje: <b>Obra</b> ou <b>Emergência</b>.<button type="button" class="btn medio secundario" data-aba-ir="hoje">Ir para Hoje</button></div>';
  }
  /* 5e: "Iniciei o serviço" sem a APR da folha concluída: aviso. 5f: com a trava da base (APR_TRAVA_O_SERVICO), o aviso
     diz que o toque não vai entrar; quem recusa é o travaDaApr, no Confirmar. */
  var Lt = (pacoteDe(info.dia) || {}).listas || {};
  if (t === 'SERVICO' && Lt.aprPadrao) {
    var semApr = E.diarios.filter(function (d) { return d.dia === info.dia && d.estado === 'rascunho' && String(d.form.prefixo || '').toUpperCase() === String(info.prefixo || '').toUpperCase() && !(d.apr && d.apr.feitaEm); });
    if (semApr.length) h += '<div class="aviso atencao" id="avisoSemApr">A APR ainda não foi concluída em: ' + esc(semApr.map(nomeDaFolha).join(', ')) + '. A APR é feita <b>antes</b> de começar o serviço (aba Diário).' +
      (Lt.aprTrava ? ' Nesta base, o serviço só começa com a APR concluída.' : '') + '</div>';
  }
  if (t === 'PARADA') h += '<label for="tqMotivo">Motivo da parada</label><select id="tqMotivo">' + opcoes(L.paradas || [], v.motivo || '', 'Escolha') + '</select>' +
    '<input id="tqObs" placeholder="Descreva (obrigatório se for &quot;Outro&quot;)" autocomplete="off" style="margin-top:6px" value="' + esc(v.obs || '') + '">';
  return h + '<div class="duas"><div><button type="button" class="btn medio fantasma" data-acao="cancelarToque">Cancelar</button></div>' +
    '<div><button type="button" class="btn medio" data-acao="confirmarToque">Confirmar</button></div></div></div>';
}

// ---------------------------------------------------------------- o diário
function folhaDoPacote(pac, codigo) { return pac && codigo ? (pac.folhas || []).filter(function (f) { return f.codigo === codigo; })[0] || null : null; }
function diarioDaFolha(dia, codigo) {
  return E.diarios.filter(function (d) { return d.dia === dia && d.codigo === codigo && d.estado !== 'jaLancado'; })
    .sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; })[0] || null;
}
function processoPadrao(atividade, verso) {
  if (verso === 'LV') return 'LINHA VIVA';
  if (atividade === 'Poda') return 'PODA';
  if (/^Manutenção/.test(atividade)) return 'MANUTENÇÃO';
  return 'OBRA';
}

/*
 * Um diário novo para uma folha (ou em branco, para a emergência). O que é do
 * dia da equipe e não da obra (placa, DDS e quem foi) vem do outro diário da
 * mesma equipe no mesmo dia: a equipe que faz duas obras não preenche duas
 * vezes. Os horários e o km vêm do dia em horários (5b).
 */
function novoDiario(pac, f) {
  var prefixo = f ? f.p : ((pac.equipes || [])[0] || {}).p || '';
  var atividade = f ? (ATIVIDADE_DO_PAPEL[f.atividade] || 'Obra') : 'Obra';
  var x = {
    prefixo: prefixo, matEnc: quem().mat, nomeEnc: quem().nome, tipoDia: 'PRODUCAO', placa: f ? f.placa || '' : '', motorista: '',
    expIni: '', expFim: '', almIni: '', almFim: '', kmSaida: '', kmChegada: '',
    pessoas: f ? (f.pessoas || []).filter(function (p) { return semZeros(p.mat) !== semZeros(quem().mat); }).map(function (p) { return { mat: p.mat, nome: p.nome, estado: '', sugerido: true }; }) : [],
    dds: '', ddsHora: '', ddsQuem: '', contrato: (f && f.contrato) || pac.contratoPadrao || '',
    obra: f ? f.obra || '' : '', municipio: f ? f.municipio || '' : '', alim: f ? f.alm || '' : '', ponto: f ? f.ponto || '' : '',
    atividade: atividade, processo: processoPadrao(atividade, f && f.verso), processoMudado: false, status: '', ini: '', fim: '',
    codigos: [{ cod: '', qtd: '', adc: '' }], hhExtra: '', hhAdc: '0,3', observacoes: '', execucao: execucaoNova(f)
  };
  var irmao = E.diarios.filter(function (d) { return d.dia === pac.dia && d.form && d.form.prefixo === prefixo; })
    .sort(function (a, b) { return a.mudadoEm < b.mudadoEm ? 1 : -1; })[0];
  var ddsLista = null;
  if (irmao) {
    var y = irmao.form;
    /* 7v: quem dirigiu é do dia da equipe, como a placa: a segunda folha do dia já vem com ele. */
    ['placa', 'motorista', 'dds', 'ddsHora', 'ddsQuem'].forEach(function (k) { if (y[k]) x[k] = y[k]; });
    /* 7t.4: a lista do DDS é do dia da equipe, como o DDS: a segunda folha usa a mesma foto (como o rosto). */
    if (y.dds === 'EM_CAMPO' && irmao.ddsLista) ddsLista = irmao.ddsLista;
    var porMat = {};
    y.pessoas.forEach(function (p) { porMat[semZeros(p.mat)] = p; });
    x.pessoas.forEach(function (p) { var q = porMat[semZeros(p.mat)]; if (q) { p.estado = q.estado; delete porMat[semZeros(p.mat)]; } });
    Object.keys(porMat).forEach(function (m) { var q = porMat[m]; if (q.estado === 'foi') x.pessoas.push({ mat: q.mat, nome: q.nome, estado: 'foi', sugerido: false }); });
  }
  return {
    id: novoId(), dia: pac.dia, codigo: f ? f.codigo : '', extra: !f, estado: 'rascunho', criadoEm: new Date().toISOString(),
    folha: f ? { codigo: f.codigo, p: f.p, obra: f.obra, municipio: f.municipio, verso: f.verso, hi: f.hi, hf: f.hf, servico: f.servico, desligar: f.desligar, om: f.om } : null,
    form: x, fotos: { FRENTE: null, VERSO: null }, rosto: null, ddsLista: ddsLista, arquivos: {}, tentativas: 0
  };
}

var relogioSalvar = null;
function salvarDepois() {
  clearTimeout(relogioSalvar);
  relogioSalvar = setTimeout(salvarAgora, 400);
}
function salvarAgora() {
  clearTimeout(relogioSalvar); relogioSalvar = null;
  var d = E.aberto;
  /* Só o rascunho se grava daqui: o encerrado é do envio (que pode estar no segundo plano). */
  if (!d || d.estado !== 'rascunho') return Promise.resolve();
  return guardarDiario(d);
}

/* Os campos que saem do dia em horários: o erro deles se corrige nos toques, e não no diário. */
var CAMPOS_DO_DIA = ['expIni', 'expFim', 'almIni', 'almFim', 'ini', 'fim', 'kmSaida', 'kmChegada', 'dia'];

/*
 * As pendências que impedem encerrar: as regras do servidor (do pacote: o PS,
 * o dia em horários e a execução) e o que só o celular sabe (quem ficou sem
 * marcar, as fotos do papel, a folha já lançada). avisos: o que não impede
 * (impedido marcado "Foi": o papel manda, e o DP confere, como no PS em papel).
 */
function conferirDiario(d) {
  var out = { erros: [], avisos: [], v: null };
  var pac = pacoteDe(d.dia);
  if (!pac) { out.erros.push({ campo: '', msg: 'O pacote de ' + brDe(d.dia) + ' não está no celular: conecte no Wi-Fi e baixe (aba Hoje).' }); return out; }
  var R = regrasDe(pac);
  if (!R || R.erro) { out.erros.push({ campo: '', msg: R ? R.erro : 'O pacote não trouxe as regras: baixe de novo.' }); return out; }
  if (!R.validarDiaDoApp) { out.erros.push({ campo: '', msg: 'O pacote deste dia é de uma versão antiga do sistema: baixe de novo (aba Hoje).' }); return out; }
  aplicarDia(d);
  var p = pacoteDoDiario(d), val = R.validarLancamentoPS(p, contextoDe(pac)), vistos = {};
  out.v = val.v;
  var junta = function (e) {
    var dia = CAMPOS_DO_DIA.indexOf(e.campo) >= 0, k = (dia ? 'dia' : e.campo) + '|' + e.msg;
    if (vistos[k]) return; vistos[k] = 1;
    out.erros.push({ campo: dia ? 'dia' : e.campo, msg: e.msg, doDia: dia });
  };
  /* Primeiro o dia: o erro de horário do PS quase sempre é falta de toque, e o do dia diz qual. */
  R.validarDiaDoApp(retratoDoDia(diaDaEquipe(d.dia, d.form.prefixo)), p).forEach(junta);
  /* 5c: o book, com o que os dias anteriores deixaram na obra. */
  /* O servidor ainda sem o book (instalado antes da 5c) não manda essas regras: o app não cobra o book que
     o servidor não conhece, senão o encarregado não conseguiria encerrar (14/10/2026: o app no GitHub vai
     na frente da instalação). */
  if (R.validarBookDoApp) R.validarBookDoApp(retratoDoBook(d), p, anteriorDoDiario(d), (pac.listas || {}).obsPorEstrutura).forEach(junta);
  /* 5e: a APR, com a regra do servidor (o servidor de antes da 5e não manda: o app não cobra). */
  /* 5f: com o dia, a folha cancelada no deslocamento não pede APR (7.6). */
  if (R.validarAprDoApp) R.validarAprDoApp(d.apr || null, p, (pac.listas || {}).aprPadrao || '', retratoDoDia(diaDaEquipe(d.dia, d.form.prefixo))).forEach(junta);
  val.erros.forEach(function (e) { if (CAMPOS_DO_DIA.indexOf(e.campo) < 0 || !out.erros.some(function (x) { return x.doDia; })) junta(e); });
  var x = d.form;
  var semMarcar = x.pessoas.filter(function (q) { return q.estado !== 'foi' && q.estado !== 'faltou'; });
  if (semMarcar.length) junta({ campo: 'pessoas', msg: 'Componentes: marque Foi ou Faltou em ' + semMarcar.map(function (q) { return q.nome || q.mat; }).join(', ') + '.' });
  if (!d.fotos || !d.fotos.FRENTE || !d.fotos.VERSO) junta({ campo: 'fotos', msg: 'Fotos do PS: a frente e o verso do papel.' });
  /* 7t.4: o DDS em campo pede a foto da lista de presença, que a base revisa na conferência. Só quando o servidor
     a conhece (o pacote diz): o app no GitHub vai na frente da instalação, e não pode cobrar o que o servidor recusa. */
  if (x.dds === 'EM_CAMPO' && pedeFotoDaListaDDS(pac) && !d.ddsLista) junta({ campo: 'ddsLista', msg: 'DDS em campo: a foto da lista de presença, com quem participou.' });
  if (val.v && val.v.prefixo) {
    var chave = R.chaveDoLancamentoPS(val.v.dia, val.v.prefixo, val.v.obra);
    var ja = (pac.lancados || []).filter(function (l) { return l.chave === chave && l.situacao !== 'DESFEITO'; })[0];
    if (ja && !(d.resposta && d.resposta.chave === chave)) junta({ campo: 'obra', msg: 'Esta folha já foi lançada no sistema em ' + ja.quando + ' por ' + (ja.por || '?') + '. Se precisa corrigir, fale com o supervisor.' });
    var gemeo = E.diarios.filter(function (o) {
      if (o.id === d.id || ['encerrado', 'enviado'].indexOf(o.estado) < 0 || o.dia !== d.dia) return false;
      return R.chaveDoLancamentoPS(o.dia, String(o.form.prefixo || '').toUpperCase(), o.form.tipoDia === 'PLANTAO' ? '' : String(o.form.obra || '').toUpperCase().replace(/\s+/g, '')) === chave;
    })[0];
    if (gemeo) junta({ campo: 'obra', msg: 'Já há outro diário encerrado neste celular para a mesma equipe e obra no dia.' });
  }
  x.pessoas.forEach(function (q) {
    var imp = q.estado === 'foi' ? impedidoNoPacote(pac, q.mat) : null;
    if (imp) out.avisos.push((q.nome || q.mat) + ' está impedido de ir a campo neste dia (' + imp.motivo + '). Se foi mesmo, encerre: o DP confere.');
  });
  /* 7u: a placa retida pela Segurança é aviso, e não trava: o dia já aconteceu, e quem libera é o superior. */
  var placaRet = ((pac && pac.placas) || []).filter(function (q) { return q.retida && q.placa === String(x.placa || '').toUpperCase().replace(/[\s-]+/g, ''); })[0];
  if (placaRet) out.avisos.push('A placa ' + placaRet.placa + ' está ' + placaRet.retida + '. Se a equipe saiu com ela, avise a supervisão.');
  var impEnc = impedidoNoPacote(pac, x.matEnc);
  if (impEnc) out.avisos.push('Você aparece como impedido de ir a campo neste dia (' + impEnc.motivo + '). Se trabalhou, encerre e avise o supervisor.');
  return out;
}

// ---------------------------------------------------------------- desenho
function desenhar() {
  var corpo = $('corpo'), rolagem = corpo.scrollTop;
  $('abas').classList.toggle('oculto', !E.cfg || !!E.ligar);
  Array.prototype.forEach.call(document.querySelectorAll('#abas button'), function (b) { b.classList.toggle('ativo', b.getAttribute('data-aba') === E.aba); });
  var pend = E.diarios.filter(function (d) { return d.estado === 'encerrado'; }).length;
  $('rotEnvio').textContent = pend ? 'Envio (' + pend + ')' : 'Envio';
  var h;
  if (!E.cfg || E.ligar) { $('codTela').textContent = 'LIGAR'; h = telaLigar(); }
  else if (precisaEntrar() && !E.cfg.desligado) { $('codTela').textContent = 'ENTRAR'; $('abas').classList.add('oculto'); h = telaEntrar(); }
  else {
    $('codTela').textContent = CODIGO_DA_ABA[E.aba];
    h = (E.versaoNova ? '<div class="aviso ok">Versão nova do app instalada. <button type="button" class="btn medio" data-acao="recarregar">Abrir a versão nova</button></div>' : '') +
        (E.cfg.desligado ? '<div class="aviso erro"><b>Este celular foi desligado do sistema</b> (cortado na tela do supervisor, ou trocado por outro). Os diários continuam guardados aqui. Peça um código novo ao supervisor e toque em "Ligar de novo".<button type="button" class="btn medio" data-acao="religar">Ligar de novo</button></div>' : '') +
        (E.aviso ? '<div class="aviso ' + E.aviso.tipo + '">' + esc(E.aviso.texto) + '</div>' : '') +
        ({ hoje: telaHoje, diario: telaDiario, encerrar: telaEncerrar, envio: telaEnvio }[E.aba])();
  }
  corpo.innerHTML = h;
  corpo.scrollTop = rolagem;
  mostrarFotos();
}

function irPara(aba, campo) {
  E.aba = aba; E.aviso = null;
  /* Primeiro grava o que foi digitado, depois relê: a releitura não pode trazer a versão de antes. */
  return salvarAgora().then(recarregarDiarios).then(function () {
    desenhar();
    var alvo = campo ? $('f-' + campo) : null;
    if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ block: 'center' });
    else $('corpo').scrollTop = 0;
  });
}

// ---- Ligar
/*
 * O ENDEREÇO DO SERVIDOR NÃO VEM MAIS NO LINK (27/10/2026, no App Compel). No campo/, ele chegava no "s=" do link do
 * WhatsApp, e o app o conferia pelo resumo (5e.2 e 5e.3), porque um link falso levaria as senhas e os diários. Aqui
 * ele vem do login, com a senha conferida, e a casca confere o mesmo resumo antes de qualquer pedido (servidor.sha256
 * deste bloco). Não há endereço para digitar nem para recusar: só o código de 6 números do supervisor.
 */
function telaLigar() {
  var l = E.ligar || { codigo: '' };
  /* No App Compel o endereço do servidor não vem no link: é o do login, conferido pela casca. Só o código. */
  var h = '<div class="cartao"><div class="etiqueta">Ligar este celular à equipe</div>' +
    '<p>O supervisor gera um código de 6 números na tela <b>Aparelhos do campo</b>. Digite o código aqui e toque em Ligar. Só uma vez, com sinal: depois, a Operação abre direto, com ou sem sinal.</p>' +
    (E.cfg && !E.cfg.desligado ? '<div class="aviso atencao">Este celular já está ligado ' + (E.cfg.login ? 'na equipe ' + esc(E.cfg.prefixo) : 'para ' + esc(E.cfg.nome)) + '. Ligar com outro código troca o celular de dono.</div>' : '') +
    '<label for="ligCodigo">Código (6 números)</label><input id="ligCodigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" value="' + esc(l.codigo) + '">' +
    '<div id="ligErro"></div>' +
    '<button type="button" class="btn" data-acao="ligar">Ligar este celular</button>' +
    (E.cfg ? '<button type="button" class="btn fantasma" data-acao="cancelarLigar">Voltar</button>' : '<button type="button" class="btn fantasma" data-acao="voltarApp">Voltar ao app</button>') + '</div>' +
    '<footer>Compel · Campo · versão ' + esc(VERSAO_CAMPO) + '</footer>';
  return h;
}

function resumoDoAparelho() {
  var ua = navigator.userAgent || '', m = ua.match(/\(([^)]+)\)/);
  return (m ? m[1] : ua).slice(0, 80);
}

function ligar() {
  var codigo = String(($('ligCodigo') || {}).value || '').replace(/\D/g, '');
  var erro = function (t) { $('ligErro').innerHTML = '<div class="aviso erro">' + esc(t) + '</div>'; };
  if (!/^\d{6}$/.test(codigo)) return erro('O código tem 6 números.');
  if (!navigator.onLine) return erro('Sem sinal: ligar o celular precisa de sinal (o Wi-Fi da base).');
  $('ligErro').innerHTML = '<div class="aviso">Ligando…</div>';
  postar('', { acao: 'ligar', codigo: codigo, aparelho: resumoDoAparelho() }, 45000).then(function (r) {
    if (!r.ok) return erro(r.erro || 'O servidor recusou o código.');
    E.cfg = { url: '', token: r.token, aparelho: r.aparelho, mat: r.mat, nome: r.nome, base: r.base, ligadoEm: new Date().toISOString(), desligado: false,
              /* 5d: o celular da equipe pede a pessoa; o servidor de antes não manda "login" e o app segue sem. */
              prefixo: r.prefixo || '', login: !!r.login };
    if (E.cfg.login) { E.pessoa = null; gravarConfig('pessoa', null); }
    return gravarConfig('servidor', E.cfg).then(function () {
      E.ligar = null; E.aba = 'hoje'; E.dia = hojeLocal();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
      /* Ligado à equipe: quem está no app entra nela agora, com o token do Núcleo (a sessão é por aparelho). */
      return entrarPeloApp().then(function () { if (E.pessoa || !E.cfg.login) return baixarPacote(E.dia).then(function () { return enviar('celular ligado'); }); });
    });
  }, function (e) { erro(e && e.servidorRecusado ? TEXTO_SERVIDOR_RECUSADO : (e && e.msg) || 'Não consegui falar com o servidor.'); });
}

// ---- Entrar (5d): a pessoa no celular da equipe
/*
 * O CELULAR É DA EQUIPE, E A PESSOA ENTRA (5d, 14/10/2026; 29_AcessoCampo.gs): a
 * matrícula e uma senha de 4 a 6 números, que ela cria no primeiro acesso com o
 * código que o supervisor gerou. O encarregado, o eletricista e, adiante, o
 * inspetor entram no mesmo celular; o diário fica no nome de quem entrou e na
 * equipe do celular.
 *
 * SEM SINAL: a primeira entrada de cada pessoa neste celular precisa de sinal;
 * depois, o celular confere a senha com um verificador guardado (PBKDF2, nunca a
 * senha), e cinco erros seguidos aqui pedem a entrada com sinal. A sessão que o
 * servidor deu (30 dias) fica guardada por pessoa: o diário encerrado sobe com a
 * sessão de quem o encerrou, mesmo que outra pessoa esteja usando o celular.
 *
 * O servidor de antes da 5d não liga o celular pela equipe: aí não há login, e o
 * app segue como na 5a (o dono do celular é o encarregado).
 */
function quem() {
  if (E.cfg && E.cfg.login) return E.pessoa || { mat: '', nome: '' };
  return { mat: E.cfg ? E.cfg.mat : '', nome: E.cfg ? E.cfg.nome : '' };
}
function precisaEntrar() { return !!(E.cfg && E.cfg.login && !E.pessoa && !E.ligar); }
/* QUEM ENTRA É QUEM ESTÁ NO APP COMPEL (27/10/2026). A casca já conferiu o CPF e a senha do Portal hoje; o que falta é
   a sessão desta pessoa no servidor da Operação, que nasce do token do Núcleo (Casca.sessaoNova, o sessaoDoNucleo da
   7s.3) e fica com a casca, pela matrícula. O que a Operação devolve (nome, funções, prefixos) fica aqui, por pessoa,
   para a tela abrir sem sinal amanhã. Sem sinal, entra quem já entrou nesta equipe neste celular. */
function matDoApp() { return semZeros(E.daCasca && E.daCasca.matricula); }
function pessoaGuardadaDoApp() { var m = matDoApp(); return m && E.pessoas[m] ? E.pessoas[m] : null; }
function telaEntrar() {
  var erro = E.entrar.erro ? '<div class="aviso erro" id="erroEntrar">' + esc(E.entrar.erro) + '</div>' : '';
  var nome = E.daCasca ? E.daCasca.nome : '';
  return '<div class="cartao"><div class="etiqueta">Celular da equipe ' + esc(E.cfg.prefixo) + '</div>' +
    '<p>Entrar na equipe como <b>' + esc(nome) + '</b>' + (matDoApp() ? ' (matrícula ' + esc(matDoApp()) + ')' : '') + '.</p>' +
    '<p class="media">A primeira entrada de cada pessoa nesta equipe precisa de sinal (o Wi-Fi da base). Se não for você, volte ao app e troque de pessoa no Perfil.</p>' + erro +
    '<button type="button" class="btn" data-acao="entrar"' + (E.entrando ? ' disabled' : '') + '>' + (E.entrando ? 'Entrando…' : 'Entrar') + '</button>' +
    '<button type="button" class="btn fantasma" data-acao="voltarApp">Voltar ao app</button></div>' +
    '<footer>Compel · Campo · versão ' + esc(VERSAO_CAMPO) + '</footer>';
}
function erroDeEntrada(t) { E.entrar.erro = t; E.entrando = false; desenhar(); }
/* A sessão nova no servidor da Operação. Chamada no toque de Entrar, ao ligar o celular, e ao abrir com sinal quando a
   sessão não existe, venceu, ou foi recusada num envio. Cada chamada gasta um token do Núcleo. */
function entrarPeloApp() {
  if (!E.cfg || !E.cfg.login) return Promise.resolve();
  if (!navigator.onLine) { if (!pessoaGuardadaDoApp()) erroDeEntrada('Sem sinal: a primeira entrada nesta equipe precisa de sinal (o Wi-Fi da base).'); return Promise.resolve(); }
  E.entrando = true; E.entrar.erro = ''; desenhar();
  return Casca.sessaoNova({ aparelho: E.cfg.token }).then(function (r) {
    E.entrando = false;
    if (r.desligado) return marcarDesligado(r.erro).then(desenhar);
    if (!r.ok) {
      // Quem já entrou nesta equipe continua trabalhando sem a sessão nova: o diário espera na fila.
      if (pessoaGuardadaDoApp()) { E.aviso = { tipo: 'atencao', texto: 'A sua entrada na Operação não foi renovada: ' + (r.erro || 'tente de novo com sinal') + ' Os diários ficam guardados até lá.' }; return desenhar(); }
      return erroDeEntrada(r.erro || 'O servidor da Operação não abriu a sua entrada.');
    }
    var mat = matDoApp();
    E.pessoas[mat] = { mat: mat, nome: r.nome || (E.daCasca && E.daCasca.nome) || '', funcoes: r.funcoes || [], prefixos: r.prefixos || [] };
    E.pessoa = { mat: mat, nome: E.pessoas[mat].nome, funcoes: E.pessoas[mat].funcoes, prefixos: E.pessoas[mat].prefixos };
    E.entrar = { modo: 'entrar' };
    // A sessão nova vale para os diários que a anterior não conseguiu subir.
    var recusados = E.diarios.filter(function (d) { return d.sessaoRecusada && semZeros(d.form && d.form.matEnc) === mat; });
    return Promise.all([gravarConfig('pessoas', E.pessoas), gravarConfig('pessoa', E.pessoa)].concat(recusados.map(function (d) { d.sessaoRecusada = false; return guardarDiario(d); })))
      .then(depoisDeEntrar);
  }, function (e) { E.entrando = false; erroDeEntrada((e && (e.msg || e.message)) || 'Não consegui falar com o servidor da Operação.'); });
}
function entrar() { return entrarPeloApp(); }
function depoisDeEntrar() {
  E.aba = 'hoje'; desenhar();
  /* O que estava na fila esperando a entrada desta pessoa sobe agora. */
  if (navigator.onLine) enviar('entrou ' + E.pessoa.mat);
}
/* Voltar ao App Compel. A troca de pessoa no celular da equipe é a da casca (Perfil); a sessão de quem sai continua
   guardada lá, para os diários que essa pessoa encerrou subirem. O que foi digitado é gravado antes de sair. */
function voltarAoApp() { return salvarAgora().then(function () { Casca.voltar(); }); }
/* O encarregado da equipe na formação, ou quem disse que está no lugar dele hoje (o João faltou). */
function ehEncarregadoDaEquipe(dia) {
  if (!E.cfg || !E.cfg.login) return true;
  var pac = pacoteDe(dia), enc = pac && pac.encarregadoDaEquipe;
  return !enc || semZeros(enc.mat) === semZeros(quem().mat);
}
function ehSubstituto(dia) { return !ehEncarregadoDaEquipe(dia) && !!E.substitutos[dia + '|' + semZeros(quem().mat)]; }
function podeLancar(dia) { return ehEncarregadoDaEquipe(dia) || ehSubstituto(dia); }
function cartaoDaFuncao(dia) {
  var pac = pacoteDe(dia), enc = pac && pac.encarregadoDaEquipe;
  return '<div class="cartao" id="f-funcao"><div class="etiqueta">O diário da equipe ' + esc(E.cfg.prefixo) + '</div>' +
    '<p>O encarregado da equipe no mês é <b>' + esc(enc ? enc.nome : '?') + '</b>. O diário (o PS) é ele quem lança.</p>' +
    '<p class="media">Se ele não veio hoje e é você quem está à frente da equipe, toque abaixo: o diário vai no seu nome, marcado como <b>substituto</b>, e o supervisor confere.</p>' +
    '<button type="button" class="btn" data-acao="souSubstituto">Sou o encarregado da equipe hoje</button>' +
    '<div class="aviso" style="margin-top:10px">Eletricista e inspetor: os checklists de EPI e luvas chegam numa próxima versão do app.</div></div>';
}

// ---- Hoje (OPE-14)
// ---------------------------------------------------------------- 2f: o projeto da obra no celular
/*
 * O PROJETO DA OBRA, PARA VER SEM SINAL (2f, 16/10/2026; Dalton, 15/10: "o projeto no celular"). O pacote do dia
 * diz qual é o projeto de cada obra das folhas; depois do pacote, o app pede cada PDF ao servidor, um de cada vez,
 * e guarda no banco do celular. Na obra, "Ver o projeto" abre do que está guardado, com o leitor de PDF que vem
 * junto com o app (pdfjs/, a mesma versão 3.11.174 da tela do sistema), e não da internet.
 */
var LEITOR_PDF_APP = './pdfjs/pdf.min.js', TRABALHADOR_PDF_APP = './pdfjs/pdf.worker.min.js';
/* O desenho é grande (folha A1): no zoom alto, o canvas passaria do que o celular aguenta. 6000 px de largura é o teto. */
var LARGURA_MAXIMA_DO_PROJETO_PX = 6000;

function projetoDaObra(pac, obra) { return pac && pac.projetos && obra ? pac.projetos[obra] || null : null; }
function projetosDosPacotes() {
  var ids = {};
  Object.keys(E.pacotes).forEach(function (dia) { var pr = (E.pacotes[dia] || {}).projetos || {}; Object.keys(pr).forEach(function (o) { ids[pr[o].id] = pr[o]; }); });
  return ids;
}
/* Ao abrir o app: quais projetos já estão guardados; e os que nenhum pacote cita mais saem do celular. */
function conferirProjetosGuardados() {
  var ids = projetosDosPacotes();
  return lerConfig('projetos').then(function (lista) {
    lista = lista || [];
    var fica = lista.filter(function (id) { return ids[id]; }), sai = lista.filter(function (id) { return !ids[id]; });
    fica.forEach(function (id) { E.docs[id] = 'ok'; });
    return Promise.all(sai.map(function (id) { return gravarConfig('doc:' + id, null); })).then(function () { return sai.length ? gravarConfig('projetos', fica) : null; });
  }).catch(function () { /* sem a lista, o app só baixa de novo */ });
}
function baixarProjetos(pac, avisarErro) {
  if (!pac || !pac.projetos || !E.cfg || E.cfg.desligado || E.baixandoProjetos) return Promise.resolve();
  var falta = Object.keys(pac.projetos).map(function (o) { return pac.projetos[o]; }).filter(function (p) { return E.docs[p.id] !== 'ok'; });
  if (!falta.length) return Promise.resolve();
  E.baixandoProjetos = true;
  var um = function (k) {
    if (k >= falta.length) { E.baixandoProjetos = false; desenhar(); return Promise.resolve(); }
    var p = falta[k];
    E.docs[p.id] = 'baixando'; desenhar();
    return postar(E.cfg.url, { acao: 'documento', token: E.cfg.token, id: p.id }, 120000).then(function (r) {
      if (!r || !r.ok || !r.dados) { E.docs[p.id] = 'erro:' + ((r && r.erro) || 'o servidor não mandou o projeto'); return; }
      return gravarConfig('doc:' + p.id, { id: p.id, obra: r.obra, nome: r.nome, kb: r.kb, dados: r.dados, em: new Date().toISOString() })
        .then(function () { return lerConfig('projetos'); })
        .then(function (l) { l = l || []; if (l.indexOf(p.id) < 0) l.push(p.id); E.docs[p.id] = 'ok'; return gravarConfig('projetos', l); });
    }, function (e) { E.docs[p.id] = 'erro:' + (avisarErro ? 'não consegui baixar (' + (e && e.msg || 'sem sinal') + ')' : 'ainda não baixado (sem sinal)'); })
      .then(function () { return um(k + 1); });
  };
  return um(0);
}
function botaoDoProjeto(pac, obra) {
  var p = projetoDaObra(pac, obra);
  if (!p) return '';
  var st = E.docs[p.id];
  if (st === 'ok') return '<button type="button" class="btn medio secundario projeto" data-projeto="' + esc(p.id) + '">Ver o projeto</button>';
  if (st === 'baixando') return '<div class="ajuda projeto">Baixando o projeto da obra (' + esc(p.kb) + ' KB)…</div>';
  return '<div class="ajuda projeto">' + esc(st && st.indexOf('erro:') === 0 ? 'Projeto: ' + st.slice(5) : 'O projeto da obra ainda não está no celular') + '. ' +
    '<button type="button" class="link" data-baixar-projeto="' + esc(p.id) + '">Baixar agora</button></div>';
}

function carregarLeitorPdfApp() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function (ok, falha) {
    var sc = document.createElement('script');
    sc.src = LEITOR_PDF_APP;
    sc.onload = function () { if (!window.pdfjsLib) return falha(new Error('o leitor de PDF não abriu')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = TRABALHADOR_PDF_APP; ok(window.pdfjsLib); };
    sc.onerror = function () { falha(new Error('o leitor de PDF não está guardado no celular: abra o app uma vez com sinal')); };
    document.head.appendChild(sc);
  });
}
var visor = null;   // { doc, bytes, zoom, pdf, url, erro }
function abrirProjeto(id) {
  return lerConfig('doc:' + id).then(function (doc) {
    if (!doc) { delete E.docs[id]; return desenhar(); }
    var bin = atob(doc.dados), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    visor = { doc: doc, bytes: u8, zoom: 1, pdf: null, erro: '', url: URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })) };
    desenharVisor();
    return carregarLeitorPdfApp().then(function (lib) { return lib.getDocument({ data: u8.slice() }).promise; }).then(function (pdf) {
      if (!visor || visor.doc.id !== id) return;
      visor.pdf = pdf; return renderizarVisor();
    }).catch(function (e) { if (visor) { visor.erro = e && e.message || String(e); desenharVisor(); } });
  });
}
function desenharVisor() {
  var el = $('visorProjeto');
  if (!visor) { if (el) el.parentNode.removeChild(el); return; }
  if (!el) { el = document.createElement('div'); el.id = 'visorProjeto'; el.setAttribute('role', 'dialog'); document.body.appendChild(el); el.addEventListener('click', cliqueNoVisor); }
  var V = visor;
  el.innerHTML = '<div class="visor-barra"><b>' + esc(V.doc.nome || 'Projeto') + '</b>' +
    '<button type="button" data-visor="menos" aria-label="Diminuir">−</button><span class="visor-zoom">' + Math.round(V.zoom * 100) + '%</span><button type="button" data-visor="mais" aria-label="Aumentar">+</button>' +
    '<button type="button" data-visor="fechar">Fechar</button></div>' +
    '<div class="visor-paginas" id="visorPaginas">' + (V.erro ? '<div class="aviso erro">Não consegui abrir o projeto aqui: ' + esc(V.erro) + '.</div>' : V.pdf ? '' : '<div class="ajuda">Abrindo o projeto…</div>') + '</div>' +
    '<div class="visor-pe"><a href="' + V.url + '" download="' + esc((V.doc.nome || 'projeto').replace(/\.pdf$/i, '') + '.pdf') + '">Abrir em outro app de PDF</a> <span class="fraco">· guardado no celular, abre sem sinal</span></div>';
}
function renderizarVisor() {
  var V = visor;
  if (!V || !V.pdf) return Promise.resolve();
  desenharVisor();
  var caixa = $('visorPaginas'), largura = Math.max(200, (caixa.clientWidth || window.innerWidth) - 8), dpr = window.devicePixelRatio || 1;
  var cadeia = Promise.resolve();
  for (var n = 1; n <= V.pdf.numPages; n++) (function (k) {
    cadeia = cadeia.then(function () { return V.pdf.getPage(k); }).then(function (pg) {
      if (visor !== V) return;
      var v1 = pg.getViewport({ scale: 1 }), esc1 = largura * V.zoom / v1.width;
      var px = Math.min(LARGURA_MAXIMA_DO_PROJETO_PX, Math.floor(v1.width * esc1 * dpr));
      var vp = pg.getViewport({ scale: px / v1.width });
      var cv = document.createElement('canvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      cv.style.width = Math.floor(vp.width / dpr) + 'px'; cv.style.height = Math.floor(vp.height / dpr) + 'px';
      cv.setAttribute('data-pagina', k);
      caixa.appendChild(cv);
      return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    });
  })(n);
  return cadeia.catch(function (e) { V.erro = e && e.message || String(e); desenharVisor(); });
}
function cliqueNoVisor(ev) {
  var b = ev.target.closest ? ev.target.closest('[data-visor]') : null;
  if (!b || !visor) return;
  var o = b.getAttribute('data-visor');
  if (o === 'fechar') { URL.revokeObjectURL(visor.url); visor = null; return desenharVisor(); }
  visor.zoom = Math.max(0.5, Math.min(4, visor.zoom * (o === 'mais' ? 1.5 : 1 / 1.5)));
  renderizarVisor();
}

function telaHoje() {
  var dia = E.dia, pac = pacoteDe(dia), hoje = hojeLocal();
  var h = '<div class="cartao"><div class="etiqueta">' + (E.cfg.login ? 'Celular da equipe ' + esc(E.cfg.prefixo) : 'Encarregado') + '</div><b>' + esc(quem().nome) + '</b> <span class="fraco">· ' + esc(quem().mat) + ' · ' + esc(pac && pac.base ? pac.base.nome : E.cfg.base) + '</span>' +
    (E.cfg.login ? ' <button type="button" class="link" data-acao="voltarApp">Voltar ao app</button>' : '') +
    '<div class="dias" style="margin-top:10px">' + [[hoje, 'Hoje'], [isoMaisDias(hoje, -1), 'Ontem']].map(function (x) {
      return '<button type="button" class="btn medio ' + (dia === x[0] ? '' : 'fantasma') + '" data-dia="' + x[0] + '">' + x[1] + ' · ' + brDe(x[0]).slice(0, 5) + '</button>'; }).join('') + '</div>' +
    '<div class="ajuda">' + (pac ? 'Pacote do dia baixado em ' + esc(pac.geradoEm) + '.' : 'O pacote deste dia ainda não está no celular.') + '</div>' +
    '<button type="button" class="btn secundario medio" data-acao="baixar"' + (E.baixando || E.cfg.desligado ? ' disabled' : '') + '>' + (E.baixando ? 'Baixando…' : pac ? 'Baixar de novo' : 'Baixar o pacote do dia') + '</button></div>';
  if (!pac) return h + '<div class="aviso atencao">Sem o pacote, o app não sabe as folhas, a equipe nem os códigos do dia. Conecte no Wi-Fi da base (ou com sinal) e toque em "Baixar o pacote do dia". Depois, funciona sem sinal.</div>';
  (pac.avisos || []).forEach(function (a) { h += '<div class="aviso atencao">' + esc(a) + '</div>'; });
  /* 5b: onde o dia da equipe está agora, e o atalho para registrar. */
  var info = diaAtual();
  if (info && info.dia === dia) {
    var rd = diaDaEquipe(info.dia, info.prefixo), ub = rd.blocos[rd.blocos.length - 1];
    h += '<div class="cartao"><div class="etiqueta">O dia da equipe · ' + esc(info.prefixo) + '</div><div>' +
      (rd.chegada ? 'Chegou à base às <b>' + esc(rd.chegada) + '</b>.' : ub ? '<b>' + esc(nomeDoRegistro(ub.t)) + '</b> desde ' + esc(ub.ini) + (ub.obra ? ' · ' + esc(rotuloDoAlvo(info.dia, info.prefixo, ub.obra)) : '') + '.' : 'Ainda não saiu da base.') +
      '</div><button type="button" class="btn medio" data-aba-ir="diario">Registrar no dia</button></div>';
  }
  /*
   * OBRA OU EMERGÊNCIA (5b.1, pedido do Dalton no teste de 13/10/2026, 18:01): o
   * encarregado sem programação no dia ia direto ao Diário e não conseguia lançar
   * nada, porque a "folha sem programação" ficava escondida no pé da tela. Agora a
   * primeira pergunta é o que a equipe fez: obra (com o número de folhas
   * programadas) ou emergência (com o número de folhas abertas).
   */
  if (!podeLancar(dia)) return h + cartaoDaFuncao(dia);
  var folhas = (pac.folhas || []).slice().sort(function (a, b) { return String(a.hi || '99') < String(b.hi || '99') ? -1 : 1; });
  var extras = E.diarios.filter(function (d) { return d.dia === dia && d.extra; });
  var modo = E.modoHoje[dia] || (extras.length && !folhas.length ? 'emergencia' : folhas.length ? 'obra' : '');
  h += '<div class="cartao"><div class="etiqueta">O que a equipe faz em ' + esc(brDe(dia).slice(0, 5)) + '?</div><div class="escolha">' +
    [['obra', 'Obra', folhas.length, folhas.length === 1 ? 'programada' : 'programadas'], ['emergencia', 'Emergência', extras.length, extras.length === 1 ? 'folha aberta' : 'folhas abertas']].map(function (o) {
      return '<button type="button" class="' + (modo === o[0] ? 'ativo' : '') + '" data-modo="' + o[0] + '"><b>' + o[1] + '</b><span class="num">' + o[2] + '</span><small>' + o[3] + '</small></button>';
    }).join('') + '</div>' + (modo ? '' : '<div class="ajuda">Toque em <b>Obra</b> ou em <b>Emergência</b>.</div>') + '</div>';
  if (modo === 'obra') h += cartoesDeObra(dia, pac, folhas);
  if (modo === 'emergencia') h += cartoesDeEmergencia(dia, extras);
  return h;
}

function cartoesDeObra(dia, pac, folhas) {
  var R = regrasDe(pac), chaves = {}, h = '';
  (pac.lancados || []).forEach(function (l) { chaves[l.chave] = l; });
  if (!folhas.length) return '<div class="cartao"><div class="aviso atencao">Você não tem obra programada para ' + esc(dia === hojeLocal() ? 'hoje' : brDe(dia)) + '.</div>' +
    '<button type="button" class="btn medio secundario" data-modo="emergencia">Já atendi uma emergência</button>' +
    '<button type="button" class="btn medio" data-modo="emergencia">Estou indo atender uma emergência</button></div>';
  h += '<div class="etiqueta" style="margin:6px 2px 0">Folhas de ' + esc(brDe(dia)) + ' · ' + folhas.length + (folhas.length === 1 ? ' obra programada' : ' obras programadas') + '</div>';
  folhas.forEach(function (f) {
    var d = diarioDaFolha(dia, f.codigo), ja = R && !R.erro ? chaves[R.chaveDoLancamentoPS(dia, f.p, f.obra)] : null;
    var chip = d ? '<span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>' : ja ? '<span class="chip jaLancado">Já lançada no sistema</span>' : '';
    h += '<div class="cartao folha">' + (f.hi ? '<div class="horario">' + esc(f.hi) + (f.hf ? ' às ' + esc(f.hf) : '') + '</div>' : '') +
      '<div class="linha1"><b>' + esc(f.p) + '</b> · obra <b>' + esc(f.obra || '—') + '</b> ' + chip + '</div>' +
      '<div class="media">' + esc(f.municipio || '') + '</div>' +
      (f.servico ? '<div class="fraco">' + esc(String(f.servico).slice(0, 140)) + '</div>' : '') +
      '<div class="fraco">Folha ' + esc(f.codigo) + '</div>' + botaoDoProjeto(pac, f.obra) +
      (ja && !d ? '<div class="ajuda">Lançada em ' + esc(ja.quando) + ' por ' + esc(ja.por || '?') + '.</div>' :
        '<button type="button" class="btn medio' + (d ? ' secundario' : '') + '" data-abrir-folha="' + esc(f.codigo) + '">' + (d ? (d.estado === 'rascunho' ? 'Continuar o diário' : 'Ver o diário') : 'Começar o diário') + '</button>') + '</div>';
  });
  return h;
}

/* A folha de emergência é a folha sem programação: serve também ao plantão e ao homem-hora. */
function cartoesDeEmergencia(dia, extras) {
  var h = '<div class="cartao"><div class="etiqueta">Atendimento emergencial</div>' +
    '<button type="button" class="btn" data-acao="extra">Abrir uma folha de atendimento emergencial</button>' +
    '<div class="ajuda">Uma folha por atendimento. Serve também para o plantão sem acionamento e o homem-hora (à disposição do cliente).</div></div>';
  extras.forEach(function (d) {
    h += '<div class="cartao folha"><div class="linha1"><b>' + esc(d.form.prefixo || 'Sem equipe') + '</b> · ' + (d.form.obra ? '<b>' + esc(comNR(d.form.obra)) + '</b>' : d.form.tipoDia === 'PLANTAO' ? 'plantão' : 'sem NR') +
      ' <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span></div><div class="fraco">Folha sem programação' + (d.form.municipio ? ' · ' + esc(d.form.municipio) : '') + '</div>' +
      '<button type="button" class="btn medio secundario" data-abrir-diario="' + esc(d.id) + '">' + (d.estado === 'rascunho' ? 'Continuar o diário' : 'Ver o diário') + '</button></div>';
  });
  return h;
}

function abrirFolha(codigo) {
  var pac = pacoteDe(E.dia), f = folhaDoPacote(pac, codigo);
  if (!f) return;
  var d = diarioDaFolha(E.dia, codigo);
  if (d) { E.aberto = d; return gravarConfig('aberto', d.id).then(function () { irPara(d.estado === 'rascunho' ? 'diario' : 'encerrar'); }); }
  d = novoDiario(pac, f);
  E.aberto = d;
  return guardarDiario(d).then(function () { return gravarConfig('aberto', d.id); }).then(function () { irPara('diario'); });
}
function abrirDiario(id) {
  return lerDiario(id).then(function (d) {
    if (!d) return;
    E.aberto = d;
    return gravarConfig('aberto', d.id).then(function () { irPara(d.estado === 'rascunho' ? 'diario' : 'encerrar'); });
  });
}
function novaFolhaExtra() {
  var pac = pacoteDe(E.dia);
  if (!pac) return;
  var d = novoDiario(pac, null);
  /* Aberta pelo menu da emergência: já nasce como manutenção emergencial (o encarregado troca se for outra). */
  d.form.atividade = ATIVIDADE_DO_PAPEL.Emergencial; d.form.processo = processoPadrao(d.form.atividade);
  E.modoHoje[E.dia] = 'emergencia';
  E.aberto = d;
  return guardarDiario(d).then(function () { return gravarConfig('aberto', d.id); }).then(function () { irPara('diario'); });
}

// ---- Diário (OPE-15)
function opcoes(lista, atual, vazio) {
  return (vazio !== undefined ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(function (x) {
    var v = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x;
    return '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');
}
function seg(nome, lista, atual, classe) {
  return '<div class="seg ' + (classe || '') + '">' + lista.map(function (t) { return '<button type="button" data-' + nome + '="' + t[0] + '" data-v="' + t[0] + '" class="' + (atual === t[0] ? 'ativo' : '') + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>';
}
/* AS HORAS UMA EMBAIXO DA OUTRA: em duas colunas, o campo de hora com o botão
   "agora" não cabia na tela do celular (390 px, visto na bateria em 13/10/2026). */
function campoHora(campo, rotulo, x, dica) {
  return '<div id="f-' + campo + '"><label for="i-' + campo + '">' + esc(rotulo) + '</label><div class="hora"><input id="i-' + campo + '" type="time" data-f="' + campo + '" value="' + esc(x[campo]) + '">' +
    '<button type="button" class="btn fantasma" data-agora="' + campo + '">agora</button></div>' + (dica ? '<div class="ajuda">' + dica + '</div>' : '') + '</div>';
}
/*
 * A PLACA SÓ ENTRE AS DA BASE (6e, 15/10/2026; Dalton: "apareça apenas as placas de lá"). A lista vem no
 * pacote, da planilha de frota. "Outra placa" abre o campo de digitar (carro emprestado de outra base; a
 * conferência avisa). Pacote sem a lista (frota não ligada, ou pacote antigo): o campo de digitar de antes.
 */
var OUTRA_PLACA = '__OUTRA__';
function campoDaPlaca(x, pac) {
  var placas = (pac && pac.placas) || [], digitar = campoTexto('placa', 'Placa da viatura', x, ' maxlength="8" style="text-transform:uppercase"');
  if (!placas.length) return digitar;
  var v = String(x.placa || '').toUpperCase().replace(/[\s-]+/g, ''), fora = x.placaOutra || (v && !placas.some(function (p) { return p.placa === v; }));
  return '<div id="f-placaSel"><label for="i-placaSel">Placa da viatura</label><select id="i-placaSel" data-placa="1"><option value="">Escolha a placa</option>' +
    placas.map(function (p) { return '<option value="' + esc(p.placa) + '"' + (!fora && p.placa === v ? ' selected' : '') + '>' + esc(p.placa) + (p.tipo ? ' · ' + esc(p.tipo) : '') + (p.parado ? ' (parado)' : '') + (p.retida ? ' (RETIDO)' : '') + '</option>'; }).join('') +
    '<option value="' + OUTRA_PLACA + '"' + (fora ? ' selected' : '') + '>Outra placa (de outra base)</option></select>' +
    /* 7u (24/10/2026): o veículo retido pela Segurança (item crítico do checklist) só sai depois que um superior libera. */
    (!fora && placas.some(function (p) { return p.placa === v && p.retida; }) ? '<div class="erro-campo" id="avisoRetida">Esta placa está ' + esc(placas.filter(function (p) { return p.placa === v; })[0].retida) + '. Só saia com o veículo depois que um superior liberar no módulo Segurança.</div>' : '') + '</div>' +
    (fora ? campoTexto('placa', 'Qual placa', x, ' maxlength="8" style="text-transform:uppercase" placeholder="ABC1D23"') : '<div id="f-placa"></div>');
}
function campoTexto(campo, rotulo, x, extra, dica) {
  return '<div id="f-' + campo + '"><label for="i-' + campo + '">' + esc(rotulo) + '</label><input id="i-' + campo + '" data-f="' + campo + '" value="' + esc(x[campo]) + '" autocomplete="off"' + (extra || '') + '>' + (dica ? '<div class="ajuda">' + dica + '</div>' : '') + '</div>';
}
function horasHH(x) {
  var ini = minutos(x.expIni), fim = minutos(x.expFim), ai = minutos(x.almIni), af = minutos(x.almFim);
  if (ini === null || fim === null || fim <= ini) return '—';
  var m = fim - ini - (ai !== null && af !== null && af > ai ? af - ai : 0);
  return (Math.round(m / 60 * 100) / 100).toLocaleString('pt-BR') + ' h';
}

/* As folhas do dia da equipe, para abrir (a programação e as sem programação). */
function listaDeFolhas(info) {
  var pac = pacoteDe(info.dia), h = '';
  (pac ? pac.folhas || [] : []).filter(function (f) { return String(f.p).toUpperCase() === info.prefixo; }).forEach(function (f) {
    var d = diarioDaFolha(info.dia, f.codigo);
    h += '<li><a href="#" data-abrir-folha="' + esc(f.codigo) + '"><b>obra ' + esc(f.obra || '—') + '</b> · ' + esc(f.municipio || '') + '</a> ' +
      (d ? '<span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>' : '<span class="chip">não começada</span>') + '</li>';
  });
  diariosDoDia(info.dia, info.prefixo).filter(function (d) { return d.extra; }).forEach(function (d) {
    h += '<li><a href="#" data-abrir-diario="' + esc(d.id) + '"><b>' + esc(d.form.obra ? 'obra ' + d.form.obra : d.form.tipoDia === 'PLANTAO' ? 'plantão' : 'sem obra') + '</b> · sem programação</a> <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span></li>';
  });
  return h ? '<div class="cartao"><div class="etiqueta">As folhas do dia</div><ul class="lista">' + h + '</ul></div>' : '';
}

function telaDiario() {
  var d = E.aberto, info = diaAtual();
  if (!info) return '<div class="cartao">Sem o pacote do dia, não há equipe nem folhas. Baixe o pacote na aba <b>Hoje</b>.</div>';
  if (!podeLancar(info.dia)) return cartaoDaFuncao(info.dia);
  var h = cartaoDoDia(info);
  if (!d) {
    var lf = listaDeFolhas(info);
    return h + (lf ? lf + '<div class="ajuda" style="text-align:center">Toque numa folha para preencher o PS dela.</div>' :
      '<div class="cartao"><div class="aviso atencao">Nenhuma folha aberta neste dia. Na aba Hoje, escolha <b>Obra</b> (a programação) ou <b>Emergência</b> (a folha sem programação).</div><button type="button" class="btn medio" data-aba-ir="hoje">Ir para Hoje</button></div>');
  }
  if (d.estado !== 'rascunho') return h + '<div class="cartao">Este diário está <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>. Veja na aba <b>Encerrar</b>.<button type="button" class="btn medio secundario" data-aba-ir="encerrar">Ir para Encerrar</button></div>' + listaDeFolhas(info);
  var pac = pacoteDe(d.dia);
  if (!pac) return h + '<div class="aviso atencao">O pacote de ' + esc(brDe(d.dia)) + ' não está no celular. Baixe na aba Hoje.</div>';
  aplicarDia(d);
  var x = d.form, L = pac.listas || {}, f = d.folha, prod = x.tipoDia === 'PRODUCAO', hh = x.tipoDia === 'HH', plantao = x.tipoDia === 'PLANTAO';
  if (d.errosServidor && d.errosServidor.length) h += '<div class="aviso erro"><b>O servidor recusou este diário:</b><ul>' + d.errosServidor.map(function (e) { return '<li>' + esc(e.msg) + '</li>'; }).join('') + '</ul></div>';

  /* As seções numeradas, com a borda e o cabeçalho fortes (5b.1, pedido do Dalton em 13/10/2026: no branco
     sobre branco não se via onde uma parte acabava e a outra começava). */
  var n = 0, cab = function (t) { return '<div class="etiqueta"><span class="n">' + (++n) + '</span>' + t + '</div>'; };
  /* 1. a folha */
  h += '<div class="cartao secao">' + cab(f ? 'Folha da obra ' + esc(f.obra || '—') : 'Folha de atendimento emergencial (sem programação)') + '<div class="fraco" style="margin-bottom:4px">' + (f ? esc(f.codigo) + ' · ' : '') + esc(brDe(d.dia)) + '</div>' +
    '<div><b>' + esc(quem().nome) + '</b> <span class="fraco">· encarregado' + (ehSubstituto(d.dia) ? ' substituto' : '') + ' · ' + esc(quem().mat) + '</span></div>' +
    (f ? botaoDoProjeto(pac, f.obra) : '') +
    '<div id="f-prefixo">' + (f ? '<div class="media">Equipe <b>' + esc(x.prefixo) + '</b></div>' :
      '<label for="i-prefixo">Equipe (prefixo)</label><select id="i-prefixo" data-f="prefixo" data-redesenha="1">' + opcoes((pac.equipes || []).map(function (e) { return [e.p, e.p + (e.t ? ' · ' + e.t : '')]; }), x.prefixo, 'Escolha a equipe') + '</select>') + '</div>' +
    campoDaPlaca(x, pac) +
    '<div id="f-tipoDia"><label>Como foi o dia</label>' + seg('tipo', [['PRODUCAO', 'Produção'], ['PLANTAO', 'Plantão'], ['HH', 'Homem-hora']], x.tipoDia) +
    '<div class="ajuda">' + esc(plantao ? 'Plantão sem acionamento: a equipe ficou de prontidão e não foi acionada.' : hh ? 'À disposição do cliente: grava as horas do expediente, sem o almoço.' : 'Produção: os serviços do verso do PS.') + '</div></div></div>';

  /* 1b. a APR (5e): antes de começar o serviço, uma por folha, em todo tipo de dia (Dalton, 17/10/2026: "toda
     atividade possui APR"; na 5e era só a produção). A base sem APR no sistema não manda o padrão. */
  if (x.tipoDia && (L.aprPadrao || '')) h += cartaoDaApr(d, pac, cab);

  /* 2. os horários, que saem do dia */
  h += '<div class="cartao secao">' + cab('Horários desta folha') + '<dl class="resumo">' +
    '<dt>Expediente</dt><dd>' + esc(x.expIni && x.expFim ? x.expIni + ' às ' + x.expFim : '—') + '</dd>' +
    '<dt>Almoço</dt><dd>' + esc(x.almIni ? x.almIni + ' às ' + x.almFim : 'sem almoço') + '</dd>' +
    (prod ? '<dt>Atividades</dt><dd>' + esc(x.ini ? x.ini + ' às ' + x.fim : '— (falta "Iniciei o serviço" ' + (f ? 'nesta obra' : 'neste atendimento') + ')') + '</dd>' : '') +
    '<dt>Km</dt><dd>' + esc(x.kmSaida ? x.kmSaida + (x.kmChegada ? ' → ' + x.kmChegada : '') : '—') + '</dd></dl>' +
    '<div class="ajuda">Saem do dia em horários, lá em cima: para mudar, corrija os registros do dia.</div></div>';

  /* 3. componentes */
  var naLista = {}; x.pessoas.forEach(function (p) { naLista[semZeros(p.mat)] = 1; }); naLista[semZeros(quem().mat)] = 1;
  var paraAdd = (pac.pessoasDaBase || []).filter(function (p) { return !naLista[semZeros(p.mat)]; });
  h += '<div class="cartao secao" id="f-pessoas">' + cab('Componentes da equipe') + '<div class="ajuda" style="margin:-2px 0 6px">Marque cada um: <b>Foi</b> ou <b>Faltou</b>.</div>' +
    (x.pessoas.length ? x.pessoas.map(function (p, i) {
      var imp = impedidoNoPacote(pac, p.mat);
      return '<div class="pessoa"><div><b>' + esc(p.nome || '?') + '</b><small>' + esc(p.mat) + (p.sugerido ? '' : ' · adicionado · <a href="#" data-tirar-p="' + i + '">tirar</a>') + '</small>' +
        (imp ? '<div class="erro-campo">Impedido neste dia: ' + esc(imp.motivo) + '</div>' : '') + '</div>' +
        seg('foi', [['foi', 'Foi'], ['faltou', 'Faltou']], p.estado, 'foi').replace(/data-foi="/g, 'data-i="' + i + '" data-foi="') + '</div>';
    }).join('') : '<p class="media">Nenhum sugerido. Adicione quem foi.</p>') +
    '<label for="addPessoa">Adicionar quem foi</label><select id="addPessoa">' + opcoes(paraAdd.map(function (p) { return [p.mat, p.nome + ' · ' + p.mat]; }), '', paraAdd.length ? 'Escolha na lista da base…' : 'Ninguém mais na lista da base') + '</select>' +
    '<div class="duas" style="margin-top:6px"><div><input id="addMat" inputmode="numeric" maxlength="8" placeholder="ou a matrícula" autocomplete="off"></div><div><button type="button" class="btn medio secundario" style="margin-top:0" data-acao="addPessoa">Adicionar</button></div></div>' +
    /* 7v (25/10/2026): quem dirigiu (a Dirigida conta os dias como motorista). Só quando o servidor conhece o campo. */
    (pedeMotorista(pac) ? campoDoMotorista(x, pac) : '') + '</div>';

  /* 4. DDS */
  h += '<div class="cartao secao" id="f-dds">' + cab('DDS de hoje') + seg('dds', [['NA_BASE', 'Na base'], ['EM_CAMPO', 'Em campo'], ['NAO_HOUVE', 'Não houve']], x.dds) +
    (x.dds === 'EM_CAMPO' ? campoHora('ddsHora', 'Hora do DDS', x) + campoTexto('ddsQuem', 'Quem conduziu', x) : '') +
    /* 7t.4 (24/10/2026): a foto da lista de presença do DDS em campo (Dalton, 24/10, 13:03). */
    (x.dds === 'EM_CAMPO' && pedeFotoDaListaDDS(pacoteDe(d.dia)) ? '<div id="f-ddsLista" class="fotos" style="margin-top:10px"><label class="foto' + (d.ddsLista ? ' ok' : '') + '">' +
      (d.ddsLista ? '<img alt="" data-foto-id="' + esc(d.ddsLista) + '"><span>Lista do DDS ✓ · tocar para trocar</span>' : '<b>📷 Lista de presença do DDS</b><span>com quem participou · obrigatória</span>') +
      '<input type="file" accept="image/*" capture="environment" data-foto-dds="1"></label></div><div id="estadoFotoDds" class="ajuda">A base confere na foto quem participou.</div>' : '') + '</div>';

  /* 5. a obra */
  if (!plantao) {
    h += '<div class="cartao secao">' + cab(f ? 'A obra' : 'O atendimento') +
      (f ? '<div id="f-obra" class="media">Documento (projeto / NR): <b>' + esc(x.obra || '—') + '</b></div>' : campoTexto('obra', 'Número da NR (a ocorrência da Energisa)' + (hh ? ' — opcional no homem-hora' : ''), x, ' style="text-transform:uppercase"')) +
      campoTexto('municipio', 'Município', x, ' style="text-transform:uppercase"') +
      '<div class="duas"><div>' + campoTexto('alim', 'Alimentador', x, ' maxlength="8" style="text-transform:uppercase"') + '</div><div>' + campoTexto('ponto', 'Ponto elétrico', x, ' maxlength="16" style="text-transform:uppercase"') + '</div></div>' +
      '<div class="duas"><div id="f-atividade"><label for="i-atividade">Atividade</label><select id="i-atividade" data-f="atividade">' + opcoes(L.atividades || [], x.atividade) + '</select></div>' +
      '<div id="f-processo"><label for="i-processo">Processo</label><select id="i-processo" data-f="processo">' + opcoes(L.processos || [], x.processo) + '</select></div></div>';
    if (prod) h += '<div id="f-status"><label for="i-status">Status (como está no papel)</label><select id="i-status" data-f="status" data-redesenha="1">' +
        opcoes((L.status || []).map(function (s) { return [s, STATUS_DO_PAPEL[s] || s]; }), x.status, 'Escolha') + '</select></div>';
    h += '</div>';
  }

  /* 6. a execução (5b): o que só quem estava lá sabe */
  if (prod) h += cartaoDaExecucao(d, pac, cab);
  /* 7. o book da obra (5c): na produção que não foi cancelada (o cancelado não tem o que fotografar). */
  if (prod && x.status !== 'CANCELADO') h += cartaoDoBook(d, pac, cab);

  /* 7. contrato e códigos */
  /* O CONTRATO SÓ NA EMERGÊNCIA (5b.1, Dalton em 13/10/2026: para o encarregado, a tipologia do contrato
     é irrelevante; a obra da carteira já tem o dela). A folha da programação traz o contrato e ele não
     aparece; na folha sem programação, o encarregado escolhe (pode ser de outro contrato da base). */
  var contratoVisivel = !f || !x.contrato || (pac.contratos || []).indexOf(x.contrato) < 0;
  h += '<div class="cartao secao">' + cab(prod ? 'Os serviços do verso' : 'O código do dia') +
    (contratoVisivel ? '<div id="f-contrato"><label for="i-contrato">Contrato da ' + (f ? 'obra' : 'emergência') + '</label><select id="i-contrato" data-f="contrato" data-redesenha="1">' + opcoes(pac.contratos || [], x.contrato, 'Escolha') + '</select></div>' : '<div id="f-contrato"></div>');
  if (prod) {
    var mapa = mapaDoContrato(pac, x.contrato);
    h += '<div id="f-codigos" style="margin-top:8px">' + x.codigos.map(function (c, i) {
      var dsc = descricaoDoCodigo(pac, x.contrato, c.cod);
      return '<div class="codigo"><div><label>Código</label><input data-c="' + i + '" data-cf="cod" list="listaCod" value="' + esc(c.cod) + '" autocomplete="off" style="text-transform:uppercase"></div>' +
        '<div><label>Qtd.</label><input data-c="' + i + '" data-cf="qtd" inputmode="decimal" value="' + esc(c.qtd) + '"></div>' +
        '<div><label>Adic.</label><select data-c="' + i + '" data-cf="adc">' + opcoes([['', '—'], ['0,3', '+30%']], c.adc) + '</select></div>' +
        '<button type="button" class="tirar" data-tirar-cod="' + i + '" aria-label="Tirar o código ' + (i + 1) + '">×</button>' +
        '<div class="desc' + (dsc.fora ? ' erro-campo' : '') + '" id="desc-' + i + '">' + esc(dsc.texto) + '</div></div>';
    }).join('') + '</div>' +
      (mapa ? '<datalist id="listaCod">' + Object.keys(mapa).slice(0, 2000).map(function (k) { return '<option value="' + esc(k) + '">' + esc(mapa[k]) + '</option>'; }).join('') + '</datalist>' : '') +
      '<div class="duas"><div><button type="button" class="btn medio secundario" data-acao="addCod">+ Código</button></div>' +
      (x.status === 'CANCELADO' ? '<div><button type="button" class="btn medio secundario" data-acao="codCancelado">Usar o ' + esc(L.cancelado) + '</button></div>' : '<div></div>') + '</div>' +
      '<details style="margin-top:10px"><summary>Procurar no verso do PS</summary><input id="buscaVerso" placeholder="parte do nome ou do código" autocomplete="off" style="margin-top:8px"><ul class="lista" id="listaVerso">' + itensDaBusca(pac, '', f && f.verso) + '</ul></details>';
  } else if (plantao) {
    h += '<p class="media">Grava o <b>' + esc(L.plantao) + '</b> (sem acionamento), quantidade 1.</p>';
  } else {
    h += '<p class="media">Grava o <b>' + esc(L.hh) + '</b> com as horas do expediente, sem o almoço: <b id="horasHH">' + esc(horasHH(x)) + '</b>.</p>' +
      '<div class="duas"><div>' + campoTexto('hhExtra', 'Destas, horas com adicional', x, ' inputmode="decimal"', 'Só se o papel separar.') + '</div><div>' + campoTexto('hhAdc', 'Adicional', x, ' inputmode="decimal"', '0,3 é 30%.') + '</div></div>';
  }
  h += '</div>';

  /* 8. observações e fotos do papel */
  h += '<div class="cartao secao">' + cab('Observações e as fotos do PS <span class="obrig">obrigatórias</span>') + '<div id="f-observacoes"><textarea data-f="observacoes" maxlength="500" placeholder="Observações (opcional)">' + esc(x.observacoes) + '</textarea></div>' +
    '<div id="f-fotos" class="fotos" style="margin-top:10px">' + ['FRENTE', 'VERSO'].map(function (l) {
      var id = d.fotos && d.fotos[l];
      return '<label class="foto' + (id ? ' ok' : '') + '">' + (id ? '<img alt="" data-foto-id="' + esc(id) + '"><span>' + (l === 'FRENTE' ? 'Frente' : 'Verso') + ' ✓ · tocar para trocar</span>' : '<b>📷 ' + (l === 'FRENTE' ? 'Frente' : 'Verso') + ' do PS</b><span>tocar para fotografar</span>') +
        '<input type="file" accept="image/*" capture="environment" data-foto="' + l + '"></label>';
    }).join('') + '</div><div id="estadoFoto" class="ajuda"></div></div>';
  h += '<button type="button" class="btn" data-aba-ir="encerrar">Conferir e encerrar o dia</button>';
  return h;
}

// ---------------------------------------------------------------- 5e: a APR da folha
/*
 * A APR NO CELULAR (5e, 16/10/2026; Dalton, 16/10, 19:16): uma por folha (uma obra ou um atendimento, num lugar),
 * antes de começar o serviço, e o papel continua (a foto dele vai no book, em Geral). O modelo vem da base (MS: o de
 * Mato Grosso do Sul; MT e RO: o da atividade, que o encarregado pode trocar). As perguntas e a regra vêm no pacote
 * (MODELOS_APR e estadoDaAprApp, 36_APR.gs): o celular confere sem sinal, como o servidor.
 */
function aprDo(d) {
  if (!d.apr) {
    var pac = pacoteDe(d.dia), R = regrasDe(pac), L = (pac && pac.listas) || {}, eq = ((pac && pac.equipes) || []).filter(function (e) { return e.p === d.form.prefixo; })[0];
    d.apr = { modelo: R && R.modeloSugeridoDaAprApp ? R.modeloSugeridoDaAprApp(L.aprPadrao || '', d.form.atividade, eq && eq.t) : '', descricao: '', cod: '',
              respostas: {}, marcados: {}, impedimento: {}, motivo: {}, riscos: [], epis: [], obs: '' };
  }
  ['respostas', 'marcados', 'impedimento', 'motivo'].forEach(function (k) { d.apr[k] = d.apr[k] || {}; });
  return d.apr;
}
/*
 * 5g: A NOVA APR NA MESMA FOLHA (Dalton, 19/10/2026, resposta 7.3: "um botão para gerar nova APR, mesmo na mesma
 * obra"). A atividade mudou, ou o local, ou o serviço parou e recomeça: a APR que estava vai para a lista das anteriores
 * da folha (d.aprs), e uma nova começa, com o mesmo modelo. Só com a atual concluída e completa até o término: a
 * atividade dela acabou, e o que é do fim (término, reavaliação) é dela. Com a trava da APR (5f), o "Iniciei o
 * serviço" seguinte espera a nova.
 */
function aprsAnteriores(d) { return d.aprs || []; }
function novaApr(d) {
  var pac = pacoteDe(d.dia), R = regrasDe(pac), L = (pac && pac.listas) || {}, a = aprDo(d);
  var e = R && R.estadoDaAprApp ? R.estadoDaAprApp(a, L.aprPadrao || '', 'fim') : null;
  if (!a.feitaEm || !e || !e.pronta) {
    E.aviso = { tipo: 'erro', texto: 'Nova APR: antes, conclua esta' + (e && e.faltas.length ? ' (falta ' + e.faltas.join('; ') + ')' : '') + '.' };
    return desenhar();
  }
  d.aprs = aprsAnteriores(d).concat([a]);
  d.apr = { modelo: a.modelo, descricao: '', cod: '', respostas: {}, marcados: {}, impedimento: {}, motivo: {}, riscos: [], epis: [], obs: '' };
  E.aviso = { tipo: 'ok', texto: 'APR ' + d.aprs.length + ' guardada. Faça a APR ' + (d.aprs.length + 1) + ' antes de começar a nova atividade.' };
  return salvarAgora().then(desenhar);
}
function concluirApr(d) {
  var pac = pacoteDe(d.dia), R = regrasDe(pac), e = R && R.estadoDaAprApp ? R.estadoDaAprApp(aprDo(d), (pac.listas || {}).aprPadrao || '', 'inicio') : null;
  if (!e) return;
  if (!e.pronta) { E.aviso = { tipo: 'erro', texto: 'APR: falta ' + e.faltas.join('; ') + '.' }; return desenhar(); }
  if (!d.apr.feitaEm) d.apr.feitaEm = new Date().toISOString();
  E.aviso = e.impedidos.length ? { tipo: 'erro', texto: 'APR concluída COM IMPEDIMENTO: não comece a atividade. Fale com o supervisor.' } : { tipo: 'ok', texto: 'APR concluída às ' + horaAgora() + '. Pode começar o serviço.' };
  return salvarAgora().then(desenhar);
}
function cartaoDaApr(d, pac, cab) {
  var R = regrasDe(pac), L = pac.listas || {}, padrao = L.aprPadrao || '';
  if (!R || !R.estadoDaAprApp || !R.modelosDaAprApp) return '';
  var a = aprDo(d), modelos = R.modelosDaAprApp(padrao), M = (R.MODELOS_APR || {})[a.modelo];
  var est = R.estadoDaAprApp(a, padrao, 'inicio'), estFim = R.estadoDaAprApp(a, padrao, 'fim');
  var sn = function (chave, valores) {
    return '<div class="seg apr-sn">' + valores.map(function (v) { return '<button type="button" data-apr-r="' + chave + '" data-v="' + v[0] + '" class="' + (a.respostas[chave] === v[0] ? 'ativo' : '') + '">' + v[1] + '</button>'; }).join('') + '</div>';
  };
  var SNNA = [['S', 'Sim'], ['N', 'Não'], ['NA', 'N/A']], SN = [['S', 'Sim'], ['N', 'Não']];
  var pessoas = [quem().nome + ' (encarregado)'].concat(d.form.pessoas.filter(function (p) { return p.estado === 'foi'; }).map(function (p) { return p.nome || p.mat; }));
  /* 5f (7.6): a folha cancelada antes de "Iniciei o serviço" não pede a APR; ela continua aberta para quem quiser fazer. */
  var pedida = !R.aprPedidaNaFolhaCancelada || R.aprPedidaNaFolhaCancelada({ tipoDia: d.form.tipoDia, status: d.form.status, obra: d.form.obra, id: d.id }, retratoDoDia(diaDaEquipe(d.dia, d.form.prefixo)));
  var ant = aprsAnteriores(d), num = ant.length ? ' ' + (ant.length + 1) : '';
  var h = '<div class="cartao secao" id="f-apr">' + cab('APR' + num + ' · antes de começar a atividade ' + (a.feitaEm ? '<span class="sit ok">✓ concluída às ' + esc(horaDeIso(a.feitaEm).slice(-5)) + '</span>' : pedida ? '<span class="obrig">obrigatória</span>' : '<span class="sit vazio">não pedida</span>')) +
    (pedida ? '' : '<div class="aviso" id="aprNaoPedida">A folha foi cancelada antes de "Iniciei o serviço" (no deslocamento): a APR não é pedida para encerrar.</div>') +
    /* 5g: as APRs anteriores desta folha, só para ver. */
    (ant.length ? '<div class="ajuda" id="aprsAnteriores">' + ant.map(function (x, i) {
      return 'APR ' + (i + 1) + ': concluída às ' + esc(horaDeIso(x.feitaEm).slice(-5)) + (x.descricao ? ' · ' + esc(x.descricao) : ''); }).join('<br>') + '</div>' : '') +
    (modelos.length > 1 ? '<label for="i-aprModelo">Modelo</label><select id="i-aprModelo" data-apr-modelo="1">' + opcoes(modelos.map(function (m) { return [m, (R.MODELOS_APR[m] || {}).nome || m]; }), a.modelo) + '</select>'
      : '<div class="media">' + esc(M ? M.nome : '') + '</div>') +
    '<div class="ajuda">Uma APR por obra e local. O papel continua: fotografe a APR em papel no book (Geral). Supervisor da atividade: <b>' + esc(quem().nome) + '</b>.</div>' +
    '<div class="ajuda">Participantes: ' + esc(pessoas.join(', ')) + ' (os que foram, em Componentes).</div>' +
    '<label for="i-aprDescricao">Descrição do trabalho</label><input id="i-aprDescricao" data-apr="descricao" value="' + esc(a.descricao) + '" maxlength="300" autocomplete="off">' +
    (M && M.tipo === 'SNNA' ? '<label for="i-aprCod">Operador do COD</label><input id="i-aprCod" data-apr="cod" value="' + esc(a.cod) + '" maxlength="80" autocomplete="off">' : '');
  if (!M) return h + '<div class="aviso atencao">Escolha o modelo da APR.</div></div>';
  if (M.tipo === 'SNNA') {
    M.blocos.forEach(function (b) {
      h += '<div class="apr-bloco"><div class="apr-titulo">' + esc(b.titulo) + (b.noFim ? ' <span class="fraco">(responda antes de encerrar)</span>' : '') + '</div>' +
        b.perguntas.map(function (q, i) { return '<div class="apr-q"><div>' + esc(q) + '</div>' + sn(b.id + '.' + i, SNNA) + '</div>'; }).join('') + '</div>';
      if (b.id === 'energ') {
        var marca = function (lista, nome, outro) {
          return '<div class="apr-marcas">' + lista.map(function (r, i) { var on = (a[nome] || []).indexOf(i) >= 0; return '<button type="button" class="' + (on ? 'ativo' : '') + '" data-apr-lista="' + nome + '" data-i="' + i + '">' + (on ? '☑ ' : '☐ ') + esc(r) + '</button>'; }).join('') + '</div>' +
            ((a[nome] || []).indexOf(lista.length - 1) >= 0 ? '<input data-apr="' + outro + '" value="' + esc(a[outro] || '') + '" placeholder="Qual?" maxlength="120">' : '');
        };
        h += '<div class="apr-bloco"><div class="apr-titulo">Quais os riscos identificados?</div>' + marca(M.riscos, 'riscos', 'riscoOutro') + '</div>' +
          '<div class="apr-bloco"><div class="apr-titulo">Quais os EPIs necessários?</div>' + marca(M.epis, 'epis', 'epiOutro') + '</div>' +
          '<div class="apr-bloco"><div class="apr-q"><div>' + esc(M.adicionais) + '</div>' + sn('adicionais', SNNA) + '</div>' +
          (a.respostas.adicionais === 'S' ? '<input data-apr="adicionaisQuais" value="' + esc(a.adicionaisQuais || '') + '" placeholder="Quais?" maxlength="300">' : '') + '</div>';
      }
      if (b.id === 'termino') h += '<div class="apr-bloco"><div class="apr-q"><div>' + esc(M.reavaliacao) + '</div>' + sn('reavaliacao', SNNA) + '</div></div>';
    });
  } else {
    M.grupos.forEach(function (g) {
      var ativo = g.obrigatorio || !!a.marcados['g' + g.n], imp = a.impedimento['g' + g.n];
      var corpoG = (g.obrigatorio ? '' : '<button type="button" class="btn medio ' + (ativo ? '' : 'secundario') + '" data-apr-m="g' + g.n + '">' + (ativo ? '☑ Este risco existe na atividade' : '☐ Este risco existe na atividade?') + '</button>');
      if (ativo) {
        g.itens.forEach(function (it, k) {
          var vale = !it.marcavel || !!a.marcados['g' + g.n + '.' + k];
          corpoG += '<div class="apr-item">' + (it.marcavel ? '<button type="button" class="apr-marca' + (vale ? ' ativo' : '') + '" data-apr-m="g' + g.n + '.' + k + '">' + (vale ? '☑ ' : '☐ ') + esc(it.nome) + '</button>' : '<div class="apr-titulo">' + esc(it.nome) + '</div>') +
            (vale ? it.medidas.map(function (q, j) { return '<div class="apr-q"><div>' + esc(q) + '</div>' + sn('g' + g.n + '.' + k + '.' + j, SN) + '</div>'; }).join('') : '') + '</div>';
        });
        if (g.impedimento) corpoG += '<div class="apr-q apr-imp"><div><b>Existe algum impedimento para executar a atividade?</b></div><div class="seg apr-sn">' + SN.map(function (v) {
            return '<button type="button" data-apr-imp="g' + g.n + '" data-v="' + v[0] + '" class="' + (imp === v[0] ? 'ativo' : '') + '">' + v[1] + '</button>'; }).join('') + '</div>' +
          (imp === 'S' ? '<input data-apr-mot="g' + g.n + '" value="' + esc(a.motivo['g' + g.n] || '') + '" placeholder="O motivo do impedimento (obrigatório)" maxlength="500">' : '') + '</div>';
      }
      var faltaG = est.faltas.filter(function (f) { return f.indexOf(g.n + ' · ') === 0; }).length;
      h += blocoDoDiario(d, 'apr-g' + g.n, g.n + ' · ' + esc(g.risco) + (g.obrigatorio ? '' : ' <span class="fraco">(se tiver)</span>'), !ativo ? null : faltaG ? '' : (imp === 'S' ? 'impedimento' : 'ok'), corpoG);
    });
  }
  h += '<label for="i-aprObs">Observações</label><textarea id="i-aprObs" data-apr="obs" maxlength="500">' + esc(a.obs || '') + '</textarea>';
  if (est.impedidos.length) h += '<div class="aviso erro">IMPEDIMENTO: ' + esc(est.impedidos.map(function (x) { return x.grupo; }).join('; ')) + '. Não comece a atividade: fale com o supervisor.</div>';
  h += (est.faltas.length ? '<div class="ajuda">Falta: ' + esc(est.faltas.join('; ')) + '.</div>' : '') +
    (a.feitaEm ? (estFim.faltas.length && !est.faltas.length ? '<div class="ajuda">Antes de encerrar: ' + esc(estFim.faltas.join('; ')) + '.</div>' : '') +
      '<button type="button" class="btn medio secundario" data-acao="novaApr" style="margin-top:8px">Nova APR (outra atividade ou outro local)</button>'
      : '<button type="button" class="btn" data-acao="concluirApr">Concluir a APR</button>') + '</div>';
  return h;
}

/* A execução da obra (conceito, 15.3): pendência, desligamento com o COD, equipamento com a ficha. */
function cartaoDaExecucao(d, pac, cab) {
  var x = d.form.execucao, L = pac.listas || {}, R = regrasDe(pac);
  var sx = function (campo, lista) { return '<div class="seg">' + lista.map(function (v) { return '<button type="button" data-xs="' + campo + '" data-v="' + esc(v) + '" class="' + (x[campo] === v ? 'ativo' : '') + '">' + esc(v) + '</button>'; }).join('') + '</div>'; };
  var tx = function (campo, rotulo, extra) { return '<div id="f-' + campo + '"><label for="x-' + campo + '">' + esc(rotulo) + '</label><input id="x-' + campo + '" data-x="' + campo + '" value="' + esc(x[campo]) + '" autocomplete="off"' + (extra || '') + '></div>'; };
  /*
   * OS BLOCOS QUE ABREM E FECHAM (5b.1, pedido do Dalton em 13/10/2026): a
   * pendência, o desligamento e o equipamento, cada um com o que falta no título.
   * Começam abertos; o que o encarregado fecha fica fechado (E.fechados), porque
   * cada toque redesenha a tela.
   */
  var bloco = function (chave, titulo, situacao, corpo) {
    var k = d.id + '|' + chave;
    return '<details class="bloco" data-bloco="' + esc(k) + '"' + (E.fechados[k] ? '' : ' open') + '><summary><span>' + titulo + '</span>' +
      '<span class="sit ' + (situacao ? 'ok' : 'falta') + '">' + (situacao ? '✓ ' + esc(situacao) : 'falta') + '</span></summary><div class="dentro">' + corpo + '</div></details>';
  };
  var h = '<div class="cartao secao" id="f-execucao">' + cab(d.folha ? 'A execução da obra' : 'A execução do atendimento');
  h += '<div id="f-pendencia">' + bloco('pendencia', d.folha ? 'Ficou pendência na obra?' : 'Ficou pendência no local?', x.pendencia === 'Não' ? 'não' : x.pendencia === 'Sim' && String(x.pendenciaDesc || '').trim() ? 'sim' : '',
    sx('pendencia', ['Sim', 'Não']) + (x.pendencia === 'Sim' ? '<textarea data-x="pendenciaDesc" maxlength="300" placeholder="O que ficou pendente" style="margin-top:6px">' + esc(x.pendenciaDesc) + '</textarea>' : '')) + '</div>';
  if (x.comDesligamento) {
    var r = diaDaEquipe(d.dia, d.form.prefixo), espera = 0;
    if (R && R.horariosDoDiaApp) espera = R.horariosDoDiaApp(retratoDoDia(r)).esperaCOD[alvoDoDiario(d, R)] || 0;
    var codOk = ['odm', 'horaLiberacao', 'operadorLiberacao', 'horaEntrega', 'operadorEntrega', 'areaSombra'].every(function (c) { return String(x[c] || '').trim(); });
    h += bloco('cod', 'Desligamento · COD' + (d.folha && d.folha.om ? ' <span class="fraco">(programado: ' + esc(d.folha.om) + ')</span>' : ''), codOk ? 'preenchido' : '',
      tx('odm', 'Número da ODM') +
      '<div class="duas"><div>' + tx('horaLiberacao', 'Hora da liberação', ' type="time"') + '</div><div>' + tx('operadorLiberacao', 'Operador da liberação') + '</div></div>' +
      '<div class="duas"><div>' + tx('horaEntrega', 'Hora da entrega', ' type="time"') + '</div><div>' + tx('operadorEntrega', 'Operador da entrega') + '</div></div>' +
      '<div class="ajuda">Espera do operador: <b>' + esc(R && R.faixaDaEsperaCOD ? R.faixaDaEsperaCOD(espera) : '—') + '</b>' + (espera ? ' (' + espera + ' min)' : '') + '. Sai sozinha da parada "' + esc(L.motivoCOD || 'COD') + '" nesta obra.</div>' +
      '<div id="f-areaSombra"><label>Área de sombra?</label>' + sx('areaSombra', ['Sim', 'Não']) + '</div>');
  }
  var eq = x.equipamento, temI = eq && eq !== 'Nenhum' && eq !== 'Retirado', temR = eq && eq !== 'Nenhum' && eq !== 'Instalado';
  var fichaOk = function (k) { return (L.fichaObrigatoria || []).every(function (c) { return String((x[k] || {})[c] || '').trim(); }); };
  var eqOk = eq === 'Nenhum' ? 'nenhum' : eq && x.equipamentoTipo && (!temI || fichaOk('fichaI')) && (!temR || fichaOk('fichaR')) ? String(eq).toLowerCase() : '';
  var corpoEq = sx('equipamento', L.equipamento || []) +
    (eq && eq !== 'Nenhum' ? '<label>Qual equipamento?</label><select data-x="equipamentoTipo" data-redesenha="1">' + opcoes(L.equipamentos || [], x.equipamentoTipo, 'Escolha') + '</select>' : '');
  [['I', 'Instalado', 'fichaI', temI], ['R', 'Retirado', 'fichaR', temR]].forEach(function (l) {
    if (!l[3]) return;
    var fx = x[l[2]] || {};
    corpoEq += bloco(l[2], 'Ficha do ' + l[1].toLowerCase(), fichaOk(l[2]) ? 'patrimônio e série' : '', '<div class="duas">' + (L.ficha || []).map(function (c) {
      var obr = (L.fichaObrigatoria || []).indexOf(c) >= 0;
      return '<div><label>' + esc(c) + (obr ? '' : ' <span class="fraco">(se tiver)</span>') + '</label><input data-ficha="' + l[2] + '|' + esc(c) + '" value="' + esc(fx[c] || '') + '" autocomplete="off"></div>';
    }).join('') + '</div>');
  });
  h += '<div id="f-equipamento">' + bloco('equipamento', 'Equipamento instalado ou retirado', eqOk, corpoEq) + '</div>';
  return h + '</div>';
}

// ---------------------------------------------------------------- o book da obra (5c)
/*
 * O BOOK POR ESTRUTURA (conceito, 14, 20 e 21; protótipo 3.4): cada foto diz de
 * qual estrutura é (FP01… da viabilidade; EQ01… para o equipamento fora de uma
 * FP; "Geral" para APR, sinalização, DITAIS e croqui) e o que mostra (a etiqueta
 * do book e o item dela). Cada estrutura tem a observação do encarregado. As
 * etiquetas, o mínimo de fotos e o que impede encerrar são as regras do
 * servidor (28_BookCampo.gs), que chegam no pacote; o que os dias anteriores
 * já fotografaram também (o book soma os dias e as equipes).
 *
 * O GPS É LIDO NA HORA DA FOTO, e só nela (conceito, 22.3: não gastar bateria),
 * com prazo curto: sem posição, a foto sai assim mesmo, sem a coordenada.
 */
function bookDo(d) { d.book = d.book || { estruturas: {}, fotos: {}, extras: [], sel: '' }; d.book.extras = d.book.extras || []; d.book.trocadas = d.book.trocadas || []; return d.book; }
/* 6d (15/10/2026): a foto trocada não se perde. O Dalton pediu o histórico das fotos ("quando houver mais de uma
   foto quero escolher qual vai para o book"): a anterior fica guardada e sobe junto, como histórico, sem entrar no
   diário. Até a 5g o celular guardava só as 3 últimas de cada item.
   5g (20/10/2026, resposta 1.5: "guardar todas as fotos, e na hora do book a pessoa marca qual quer, ou todas"): todas
   ficam. O espaço não é o limite que parecia: cada foto tem até ~200 KB, e o diário sai do celular depois de enviado. */
function guardarTrocada(b, chave, antiga) {
  if (antiga) b.trocadas.push({ id: antiga, chave: chave });
  return b.trocadas.filter(function (t) { return t.chave === chave; }).length;
}
function anteriorDoDiario(d) { var f = folhaDoPacote(pacoteDe(d.dia), d.codigo); return (f && f.book) || { previstas: [], lugares: {}, geral: {} }; }
/* 6f: a folha de manutenção emergencial tem o book de emergência (o defeito e a rede normalizada, sem a
   observação por estrutura); a regra vem do servidor, no pacote. */
function emergenciaDoDiario(d, R) { return !!(R && R.ehEmergenciaApp && R.ehEmergenciaApp(d.form)); }
function estadoDoBook(d, R) {
  /* 5f: a observação por estrutura é um parâmetro da base (1.2), que vem no pacote. */
  var e = R.estadoDoBookApp(retratoDoBook(d), anteriorDoDiario(d), emergenciaDoDiario(d, R), ((pacoteDe(d.dia) || {}).listas || {}).obsPorEstrutura), b = bookDo(d), tem = {};
  e.lugares.forEach(function (l) { tem[l.id] = 1; });
  /* A estrutura acrescentada hoje e ainda sem foto também aparece. */
  b.extras.forEach(function (id) { if (!tem[id]) e.lugares.push({ id: id, prevista: false, eq: /^EQ/.test(id), hoje: false, fotos: 0, fotosHoje: 0, obs: '', itens: {}, fora: !/^EQ/.test(id) && e.previstas > 0, faltas: ['sem foto'], pronta: false }); });
  return e;
}
/* O próximo número na numeração da obra: FP07 depois de FP06; EQ01, EQ02… para o equipamento. */
function proximoLugar(e, tipo, anterior) {
  var ids = e.lugares.map(function (l) { return l.id; });
  if (tipo === 'EQ') { for (var k = 1; k < 100; k++) { var q = 'EQ' + (k < 10 ? '0' : '') + k; if (ids.indexOf(q) < 0) return q; } }
  var num = String(anterior.numeracao || ''), fmt = function (k) { var d2 = (k < 10 ? '0' : '') + k; return /^01/.test(num) ? d2 : /^F\.P/.test(num) ? 'F.P' + k : 'FP' + d2; };
  for (var n = 1; n < 500; n++) if (ids.indexOf(fmt(n)) < 0) return fmt(n);
  return '';
}
function cartaoDoBook(d, pac, cab) {
  var R = regrasDe(pac), x = d.form.execucao || {}, b = bookDo(d), anterior = anteriorDoDiario(d);
  var titulo = d.folha ? 'Book da obra' : 'Book do atendimento';
  if (!R || !R.estadoDoBookApp) return '<div class="cartao secao" id="f-book">' + cab(titulo) + '<div class="aviso">O book no celular chega quando o sistema for atualizado. Por enquanto, as fotos do book seguem como hoje.</div></div>';
  var e = estadoDoBook(d, R), L = pac.listas || {}, geral = L.geral || 'Geral';
  if (!b.sel) b.sel = (e.lugares[0] || {}).id || geral;
  var h = '<div class="cartao secao" id="f-book">' + cab(titulo + (e.previstas ? ' <span class="obrig">' + e.prontas + ' de ' + e.previstas + ' prontas</span>' : '')) +
    '<div class="ajuda" style="margin-top:-4px">' + (emergenciaDoDiario(d, R) ? 'No atendimento, fotografe em <b>Geral</b> a APR, a sinalização, o <b>defeito encontrado</b> e a <b>rede normalizada</b>; e a <b>estrutura</b> (+ estrutura) ou o <b>equipamento</b> (+ equipamento) em que trabalhou.' :
      'Escolha a estrutura e fotografe cada item. Verde: pronta. Amarela: falta foto ou a observação. Branca: sem foto.' + (e.previstas ? ' Soma os outros dias.' : '')) +
    ' Tirar de novo não apaga a anterior: no fechamento, escolhe-se qual vai para o book, ou todas.</div><div class="lugares">';
  h += e.lugares.map(function (l) {
    var cls = l.pronta ? 'pronta' : (l.fotos || l.obs) ? 'parcial' : '';
    return '<button type="button" class="lugar ' + cls + (b.sel === l.id ? ' sel' : '') + '" data-lugar="' + esc(l.id) + '">' + esc(l.id) + (l.fora ? '*' : '') + '</button>';
  }).join('') + '<button type="button" class="lugar geral' + (b.sel === geral ? ' sel' : '') + '" data-lugar="' + esc(geral) + '">' + esc(geral) + '</button></div>' +
    '<div class="duas"><div><button type="button" class="btn medio fantasma" data-acao="addLugar" data-novo="FP">+ estrutura' + (e.previstas ? ' fora da viabilidade' : '') + '</button></div>' +
    '<div><button type="button" class="btn medio fantasma" data-acao="addLugar" data-novo="EQ">+ equipamento (EQ)</button></div></div>';
  var emerg = emergenciaDoDiario(d, R), sel = b.sel, l = e.lugares.filter(function (y) { return y.id === sel; })[0], etqs = R.etiquetasDoLugarApp(sel, x, emerg);
  h += '<div class="lugarSel"><div class="etiqueta">' + (sel === geral ? (emerg ? 'Geral: segurança, o defeito e a rede normalizada' : 'Geral: segurança e croqui') : 'Estrutura ' + esc(sel) + (l && l.fora ? ' · fora da viabilidade' : '') + (l && l.eq ? ' · equipamento' : '')) + '</div>';
  if (!etqs.length) h += '<div class="aviso atencao">' + (/^EQ/.test(sel) ? 'O ponto EQ é do equipamento: declare na execução (seção 6) o equipamento instalado ou retirado e qual é.' : 'Nada a fotografar aqui.') + '</div>';
  var ant = sel === geral ? (anterior.geral || {}) : ((anterior.lugares || {})[sel] || {}).itens || {};
  etqs.forEach(function (it) {
    var nHoje = it.fotos.filter(function (f) { return b.fotos[sel + '|' + it.id + '|' + f]; }).length, nAnt = it.fotos.filter(function (f) { return (ant[it.id] || []).indexOf(f) >= 0; }).length;
    var exigida = it.onde === 'dia' && (it.quando === 'sempre' || (it.quando === 'deslig' && x.comDesligamento) || (it.quando === 'emergencia' && emerg)) || /^equip/.test(it.quando);
    var feitos = it.fotos.filter(function (f) { return b.fotos[sel + '|' + it.id + '|' + f] || (ant[it.id] || []).indexOf(f) >= 0; }).length;
    /* "se tiver": a etiqueta da estrutura só é cobrada quando a estrutura tem (uma foto dela já basta para cobrar o resto). */
    var situ = feitos >= it.min ? (nHoje ? feitos + ' de ' + it.fotos.length : 'outro dia') : (!exigida && !feitos ? null : '');
    h += blocoDoDiario(d, 'bk|' + sel + '|' + it.id, esc(it.id) + (exigida ? ' <span class="fraco">(exigida)</span>' : ''), situ,
      '<div class="fotos">' + it.fotos.map(function (f) {
        var k = sel + '|' + it.id + '|' + f, id = b.fotos[k], antes = (ant[it.id] || []).indexOf(f) >= 0;
        /* 5g: quantas anteriores deste item estão guardadas (no fechamento, escolhe-se qual vai, ou todas). */
        var guardadas = b.trocadas.filter(function (t) { return t.chave === k; }).length;
        return '<label class="foto' + (id ? ' ok' : antes ? ' antes' : '') + '">' + (id ? '<img alt="" data-foto-id="' + esc(id) + '"><span>' + esc(f) + ' ✓' +
          (guardadas ? ' · +' + guardadas + ' guardada' + (guardadas > 1 ? 's' : '') : '') + '</span>' :
          '<b>📷 ' + esc(f) + '</b><span>' + (antes ? 'já fotografada em outro dia · tocar para outra' : 'tocar para fotografar') + '</span>') +
          '<input type="file" accept="image/*" capture="environment" data-book="' + esc(k) + '"></label>';
      }).join('') + '</div>' + (it.min < it.fotos.length ? '<div class="ajuda">Mínimo: ' + it.min + ' de ' + it.fotos.length + '.</div>' : ''));
  });
  /* A foto que não cabe mais aqui (o equipamento declarado mudou): o encarregado tira. */
  Object.keys(b.fotos).filter(function (k) { return k.split('|')[0] === sel && b.fotos[k] && !etqs.some(function (it) { return k.split('|')[1] === it.id; }); }).forEach(function (k) {
    h += '<div class="aviso atencao">A foto ' + esc(k.split('|').slice(1).join(' · ')) + ' não cabe mais aqui (o equipamento declarado na execução mudou).<button type="button" class="btn medio secundario" data-acao="tirarFotoBook" data-chave="' + esc(k) + '">Tirar esta foto</button></div>';
  });
  if (sel !== geral) {
    var obsAnt = ((anterior.lugares || {})[sel] || {}).obs || '';
    var obsCobrada = ((pacoteDe(d.dia) || {}).listas || {}).obsPorEstrutura !== false && !emerg;
    h += '<label for="bkObs">Observação da estrutura ' + esc(sel) + (obsCobrada ? '' : ' <span class="fraco">(se tiver)</span>') + '</label><textarea id="bkObs" data-bkobs="' + esc(sel) + '" maxlength="600" placeholder="Ex.: POSTE EXISTENTE DT 11/300 · + 01 S2 · − 03 S1 (+ instalado, − retirado, * reaplicado)">' + esc((b.estruturas[sel] || {}).obs || '') + '</textarea>' +
      (obsAnt ? '<div class="ajuda">De outro dia: ' + esc(obsAnt) + '</div>' : '');
  }
  return h + '<div id="estadoFotoBook" class="ajuda"></div></div></div>';
}
/* Um bloco que abre e fecha, com o que falta no título (o mesmo da execução, 5b.1). */
function blocoDoDiario(d, chave, titulo, situacao, corpo) {
  var k = d.id + '|' + chave;
  return '<details class="bloco" data-bloco="' + esc(k) + '"' + (E.fechados[k] ? '' : ' open') + '><summary><span>' + titulo + '</span>' +
    (situacao === null ? '<span class="sit vazio">se tiver</span>' : '<span class="sit ' + (situacao ? 'ok' : 'falta') + '">' + (situacao ? '✓ ' + esc(situacao) : 'falta') + '</span>') +
    '</summary><div class="dentro">' + corpo + '</div></details>';
}

/* A posição na hora da foto, ou nada em 8 segundos (sem sinal o GPS funciona, mas pode demorar). */
function lerPosicao() {
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
/* A coordenada UTM da marca d'água, como nos books da Energisa ("21K 734210 7536120"). WGS84, fórmula padrão. */
function utmDe(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '';
  var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), rad = Math.PI / 180;
  var zona = Math.floor((lon + 180) / 6) + 1, lon0 = ((zona - 1) * 6 - 180 + 3) * rad, fi = lat * rad, la = lon * rad;
  var N = a / Math.sqrt(1 - e2 * Math.sin(fi) * Math.sin(fi)), T = Math.tan(fi) * Math.tan(fi), C = ep2 * Math.cos(fi) * Math.cos(fi), A = Math.cos(fi) * (la - lon0);
  var M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * fi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * fi) +
    (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * fi) - (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * fi));
  var x = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
  var y = k0 * (M + N * Math.tan(fi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
  if (lat < 0) y += 10000000;
  var letra = 'CDEFGHJKLMNPQRSTUVWX'.charAt(Math.min(19, Math.max(0, Math.floor((lat + 80) / 8))));
  return zona + letra + ' ' + Math.round(x) + ' ' + Math.round(y);
}
function trocarFotoDoBook(d, chave, arquivo) {
  if (!arquivo) return;
  var c = chave.split('|'), lugar = c[0], etq = c[1], item = c.slice(2).join('|'), b = bookDo(d);
  var aviso = function (t) { var el = $('estadoFotoBook'); if (el) el.textContent = t; };
  aviso('lendo a posição e preparando a foto…');
  var tirada = new Date();
  lerPosicao().then(function (pos) {
    var linhas = [tirada.toLocaleString('pt-BR') + (pos ? '   ·   ' + utmDe(pos.lat, pos.lon) : ''),
      [d.folha ? 'Obra ' + (d.form.obra || '—') : comNR(d.form.obra || '—'), lugar === 'Geral' ? 'GERAL' : lugar.replace(/^(FP|EQ)(\d)/, '$1 $2')].join('   ·   '),
      etq + ' · ' + item, [d.form.prefixo, 'Enc. ' + quem().nome].filter(Boolean).join('   ·   ')];
    return processarFoto(arquivo, LADOS_FOTO_PS, TETO_FOTO_PS, linhas).then(function (r) {
      var id = novoId(), antiga = b.fotos[chave];
      return guardarFoto({ id: id, blob: r.blob, tipo: 'BOOK', diario: d.id, criadoEm: tirada.toISOString(),
        meta: { lugar: lugar, etiqueta: etq, item: item, lat: pos ? pos.lat : null, lon: pos ? pos.lon : null, precisao: pos ? pos.precisao : null, tiradaEm: tirada.toISOString() } }).then(function () {
        b.fotos[chave] = id;
        if (d.arquivos) delete d.arquivos['BOOK|' + chave];
        guardarTrocada(b, chave, antiga);
        return guardarDiario(d);
      });
    });
  }).then(desenhar).catch(function (e) { aviso('Não consegui preparar a foto: ' + (e && e.message || e)); });
}
function tirarFotoDoBook(d, chave) {
  var b = bookDo(d), id = b.fotos[chave];
  delete b.fotos[chave];
  if (d.arquivos) delete d.arquivos['BOOK|' + chave];
  return guardarDiario(d).then(function () { return apagarFoto(id); }).then(desenhar);
}
/* "12 fotos: FP01, FP02, EQ01 e Geral" (o resumo antes de assinar). */
function resumoDoBook(d) {
  var r = retratoDoBook(d), lugares = [];
  r.fotos.forEach(function (f) { if (lugares.indexOf(f.lugar) < 0) lugares.push(f.lugar); });
  return r.fotos.length ? r.fotos.length + (r.fotos.length === 1 ? ' foto: ' : ' fotos: ') + lugares.join(', ') : 'sem fotos';
}
/* As fotos do book de um diário (para apagar junto com ele). */
function idsDoBook(d) {
  var f = (d.book || {}).fotos || {};
  return Object.keys(f).map(function (k) { return f[k]; }).concat(((d.book || {}).trocadas || []).map(function (t) { return t.id; })).filter(Boolean);
}

function itensDaBusca(pac, termo, verso) {
  termo = String(termo || '').trim().toUpperCase();
  var itens = itensDoVerso(pac).filter(function (i) { return !verso || i.lado === verso; });
  if (termo) itens = itens.filter(function (i) { return i.cod.indexOf(termo) >= 0 || i.desc.toUpperCase().indexOf(termo) >= 0 || i.grupo.toUpperCase().indexOf(termo) >= 0; });
  var mostra = itens.slice(0, 40);
  return mostra.map(function (i) { return '<li><a href="#" data-verso-cod="' + esc(i.cod) + '"><b>' + esc(i.cod) + '</b> · ' + esc(i.desc) + (i.un ? ' (' + esc(i.un) + ')' : '') + '</a> <span class="fraco">' + esc(i.grupo) + '</span></li>'; }).join('') +
    (itens.length > mostra.length ? '<li class="fraco">… e mais ' + (itens.length - mostra.length) + '. Digite para filtrar.</li>' : '') + (itens.length ? '' : '<li class="fraco">Nada encontrado.</li>');
}

// ---- Encerrar (OPE-16)
/* O nome curto de uma folha nas listas. */
function nomeDaFolha(d) { return d.extra ? nomeDoAtendimento(d) : d.form.tipoDia === 'PLANTAO' ? 'plantão' : 'obra ' + (d.form.obra || '—'); }

/*
 * ENCERRA-SE O DIA, E NÃO A FOLHA (5b): os horários das folhas saem do mesmo
 * dia, então as folhas do dia encerram juntas, com uma foto do rosto só.
 */
function telaEncerrar() {
  /* 5d: só o encarregado da equipe (ou quem está no lugar dele hoje) encerra o dia. */
  var info0 = diaAtual();
  if (info0 && !podeLancar(info0.dia)) return cartaoDaFuncao(info0.dia);
  var info = diaAtual();
  if (!info) return '<div class="cartao">Sem o pacote do dia, não há o que encerrar. Baixe o pacote na aba <b>Hoje</b>.</div>';
  var doDia = diariosDoDia(info.dia, info.prefixo), rasc = doDia.filter(function (d) { return d.estado === 'rascunho'; });
  var pac = pacoteDe(info.dia), R = regrasDe(pac), r = diaDaEquipe(info.dia, info.prefixo);
  var h = '<div class="cartao"><div class="etiqueta">O dia da equipe · ' + esc(info.prefixo) + ' · ' + esc(brDe(info.dia)) + '</div>';
  if (R && R.horariosDoDiaApp && r.blocos.length) {
    var hs = R.horariosDoDiaApp(retratoDoDia(r));
    h += '<dl class="resumo"><dt>Expediente</dt><dd>' + esc(hs.expIni) + ' às ' + esc(hs.expFim || '…') + '</dd><dt>Serviço</dt><dd>' + esc(duracao(hs.minutos.SERVICO)) + '</dd>' +
      '<dt>Deslocamento</dt><dd>' + esc(duracao(hs.minutos.DESLOC)) + '</dd>' + (hs.minutos.PARADA ? '<dt>Paradas</dt><dd>' + esc(duracao(hs.minutos.PARADA)) + '</dd>' : '') +
      '<dt>Km</dt><dd>' + esc(r.kmSaida + (r.kmChegada ? ' → ' + r.kmChegada : '')) + '</dd></dl>';
  } else h += '<p class="media">Nada registrado no dia ainda (aba Diário).</p>';
  h += '</div>';

  if (rasc.length) {
    var gerais = [], porFolha = [], avisos = [], visto = {};
    rasc.forEach(function (d) {
      var c = conferirDiario(d), proprios = [];
      c.erros.forEach(function (e) { if (e.doDia || e.campo === '') { if (!visto[e.msg]) { visto[e.msg] = 1; gerais.push(e); } } else proprios.push(e); });
      if (proprios.length) porFolha.push({ d: d, erros: proprios });
      c.avisos.forEach(function (a) { if (avisos.indexOf(a) < 0) avisos.push(a); });
    });
    /* A folha da programação que ninguém começou: se a equipe não foi, tudo bem; se foi, falta o PS dela. */
    (pac ? pac.folhas || [] : []).filter(function (f) { return String(f.p).toUpperCase() === info.prefixo && !diarioDaFolha(info.dia, f.codigo); }).forEach(function (f) {
      avisos.push('A folha da obra ' + (f.obra || '?') + ' não foi começada. Se a equipe não foi a essa obra, pode encerrar; se foi, preencha o PS dela antes.');
    });
    var n = gerais.length + porFolha.reduce(function (s, x) { return s + x.erros.length; }, 0);
    if (n) {
      h += '<div class="aviso erro"><b>' + n + ' pendência(s) antes de encerrar.</b> Toque numa para ir até ela.' +
        (gerais.length ? '<div style="margin-top:6px"><b>O dia</b></div><ul>' + gerais.map(function (e) { return '<li><a href="#" data-ir="dia">' + esc(e.msg) + '</a></li>'; }).join('') + '</ul>' : '') +
        porFolha.map(function (x) {
          return '<div style="margin-top:6px"><b>' + esc(nomeDaFolha(x.d)) + '</b></div><ul>' + x.erros.map(function (e) {
            return '<li><a href="#" data-ir="' + esc(e.campo) + '" data-diario="' + esc(x.d.id) + '">' + esc(e.msg) + '</a></li>'; }).join('') + '</ul>';
        }).join('') + '</div>';
    }
    avisos.forEach(function (a) { h += '<div class="aviso atencao">' + esc(a) + '</div>'; });
    if (!n) {
      h += '<div class="cartao"><div class="etiqueta">Confira antes de assinar</div>' + rasc.map(function (d) {
        var c = conferirDiario(d), v = c.v || {}, x = d.form, foram = x.pessoas.filter(function (p) { return p.estado === 'foi'; }), faltaram = x.pessoas.filter(function (p) { return p.estado === 'faltou'; });
        return '<div class="folha-resumo"><b>' + esc(nomeDaFolha(d)) + '</b><dl class="resumo">' +
          '<dt>Dia</dt><dd>' + esc(NOME_DO_TIPO_DIA[x.tipoDia]) + '</dd><dt>Placa</dt><dd>' + esc(v.placa) + '</dd>' +
          '<dt>Expediente</dt><dd>' + esc(v.expIni + ' às ' + v.expFim) + (v.almIni ? ' · almoço ' + esc(v.almIni + '–' + v.almFim) : '') + '</dd>' +
          '<dt>Foram</dt><dd>' + (foram.length + 1) + ' (com você)</dd>' + (faltaram.length ? '<dt>Faltaram</dt><dd>' + esc(faltaram.map(function (p) { return p.nome || p.mat; }).join(', ')) + '</dd>' : '') +
          (x.tipoDia === 'PRODUCAO' ? '<dt>Atividades</dt><dd>' + esc(v.ini ? v.ini + ' às ' + v.fim : '—') + '</dd><dt>Pendência</dt><dd>' + esc(x.execucao.pendencia) + '</dd>' +
            '<dt>Book</dt><dd>' + esc(resumoDoBook(d)) + '</dd>' : '') +
          '<dt>Códigos</dt><dd>' + esc((v.codigos || []).map(function (k) { return k.cod + ' × ' + String(k.qtd).replace('.', ',') + (k.adc ? ' (+' + Math.round(k.adc * 100) + '%)' : ''); }).join('; ')) + '</dd></dl></div>';
      }).join('') + '</div>' +
        '<div class="cartao"><div class="etiqueta">Assinar com a foto do rosto</div><p class="media">A foto do seu rosto é a assinatura do dia: mostra que foi você quem encerrou. Ela vai para uma pasta separada e não aparece no book.' +
        (rasc.length > 1 ? ' Encerra as ' + rasc.length + ' folhas do dia de uma vez.' : '') + '</p>' +
        '<label class="btn" style="position:relative">Encerrar o dia e assinar com a foto do rosto<input type="file" accept="image/*" capture="user" data-rosto="1" style="position:absolute;inset:0;opacity:0"></label><div id="estadoRosto" class="ajuda"></div></div>';
    }
    h += '<button type="button" class="btn fantasma" data-aba-ir="diario">Voltar ao diário</button>';
  } else if (!doDia.length) h += '<div class="cartao media">Nenhuma folha começada neste dia. Comece pela aba Diário.</div>';

  var outros = doDia.filter(function (d) { return d.estado !== 'rascunho'; });
  var encerrados = outros.filter(function (d) { return d.estado === 'encerrado'; });
  outros.forEach(function (d) {
    var rr = d.resposta || {};
    h += '<div class="cartao"><div class="linha1"><b>' + esc(nomeDaFolha(d)) + '</b> <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span></div>';
    if (d.rosto && d.estado !== 'jaLancado') h += '<div class="fotos" style="margin-top:6px"><div class="foto ok"><img alt="" data-foto-id="' + esc(d.rosto) + '"></div><div class="media">Encerrado em ' + esc(horaDeIso(d.encerradoEm)) + '.' + (d.enviadoEm ? '<br>Enviado em ' + esc(horaDeIso(d.enviadoEm)) + '.' : '') + '</div></div>';
    if (d.estado === 'encerrado') h += (d.ultimoErro ? '<div class="aviso atencao">Última tentativa: ' + esc(d.ultimoErro) + '</div>' : '<div class="ajuda">Na fila para enviar. ' + (navigator.onLine ? 'Com sinal: sai sozinho.' : 'Sem sinal agora: sai sozinho quando o sinal voltar, mesmo com o app fechado (no Android).') + '</div>');
    else if (d.estado === 'enviado') h += '<div class="aviso ok"><b>Recebido pelo sistema.</b>' + (rr.duplicado ? ' (Já tinha chegado antes; nada foi gravado duas vezes.)' : '') + (rr.situacao ? ' Situação: ' + esc(rr.situacao) + '.' : '') + '</div>' +
      (rr.avisos && rr.avisos.length ? '<div class="aviso atencao"><ul>' + rr.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>' : '');
    else if (d.estado === 'recusado') h += '<div class="aviso erro"><b>O servidor recusou.</b><ul>' + (rr.erros || []).map(function (e) { return '<li>' + esc(e.msg) + '</li>'; }).join('') + '</ul></div>' +
      '<button type="button" class="btn" data-acao="corrigir" data-diario="' + esc(d.id) + '">Corrigir e encerrar de novo</button>';
    else if (d.estado === 'jaLancado') h += '<div class="aviso erro">' + esc(d.ultimoErro || 'Esta folha já tinha sido lançada.') + '</div>' +
      '<button type="button" class="btn fantasma" data-acao="apagar" data-diario="' + esc(d.id) + '">Tirar este diário do celular</button>';
    h += '</div>';
  });
  if (encerrados.length) h += '<button type="button" class="btn" data-acao="enviar"' + (E.enviando ? ' disabled' : '') + '>' + (E.enviando ? 'Enviando…' : 'Enviar agora') + '</button>' +
    '<button type="button" class="btn fantasma" data-acao="corrigir" data-diario="' + esc(encerrados.map(function (d) { return d.id; }).join(',')) + '">Corrigir antes de enviar</button>';
  h += '<button type="button" class="btn fantasma" data-aba-ir="hoje">Voltar às folhas</button>';
  return h;
}

/* Encerra as folhas em rascunho do dia, com uma foto do rosto só. */
function encerrarODia(arquivo) {
  var info = diaAtual();
  if (!info || !arquivo) return;
  var rasc = diariosDoDia(info.dia, info.prefixo).filter(function (d) { return d.estado === 'rascunho'; });
  if (!rasc.length || rasc.some(function (d) { return conferirDiario(d).erros.length; })) { desenhar(); return; }
  $('estadoRosto').textContent = 'preparando a foto…';
  var r = diaDaEquipe(info.dia, info.prefixo), retrato = retratoDoDia(r), quando = new Date().toISOString();
  var linhas = [new Date().toLocaleString('pt-BR'), quem().nome + ' · ' + quem().mat, 'encerrou ' + info.prefixo + ' · ' + brDe(info.dia)];
  processarFoto(arquivo, LADOS_FOTO_ROSTO, TETO_FOTO_ROSTO, linhas).then(function (ft) {
    var id = novoId();
    return guardarFoto({ id: id, blob: ft.blob, tipo: 'ROSTO', diario: rasc[0].id, criadoEm: quando }).then(function () {
      return Promise.all(rasc.map(function (d) {
        aplicarDia(d);
        d.rosto = id; d.estado = 'encerrado'; d.encerradoEm = quando; d.tentativas = 0; d.ultimoErro = ''; d.errosServidor = [];
        d.diaEnviado = retrato;
        if (d.arquivos) delete d.arquivos.ROSTO;
        return guardarDiario(d);
      }));
    });
  }).then(function () {
    pedirEnvioEmSegundoPlano();
    return recarregarDiarios().then(desenhar).then(function () { if (navigator.onLine) return enviar('encerrou'); });
  }).catch(function (e) { $('estadoRosto').textContent = 'Não consegui preparar a foto: ' + (e && e.message || e); });
}

/*
 * Volta diários a rascunho. DENTRO DA TRAVA DO ENVIO: se o segundo plano
 * estiver mandando um deles agora, corrigir no meio faria o servidor gravar uma
 * versão e o celular mostrar outra. A foto do rosto é descartada: encerrar de
 * novo pede outra.
 */
function corrigir(ids) {
  if (!ids.length) return;
  var faz = function () {
    return Promise.all(ids.map(function (id) { return lerDiario(id); })).then(function (l) {
      var mudou = l.filter(function (d) { return d && ['encerrado', 'recusado'].indexOf(d.estado) >= 0; });
      var rostos = {};
      return Promise.all(mudou.map(function (d) {
        if (d.rosto) rostos[d.rosto] = 1;
        d.errosServidor = d.estado === 'recusado' && d.resposta ? d.resposta.erros || [] : [];
        d.estado = 'rascunho'; d.rosto = null; d.encerradoEm = null; d.ultimoErro = ''; d.diaEnviado = null;
        if (d.arquivos) delete d.arquivos.ROSTO;
        return guardarDiario(d);
      })).then(function () {
        /* A foto do rosto é uma só para as folhas do dia: a que outra folha (não reaberta) ainda usa, fica. */
        var reabertos = mudou.map(function (d) { return d.id; });
        return Promise.all(Object.keys(rostos).filter(function (id) {
          return !E.diarios.some(function (o) { return reabertos.indexOf(o.id) < 0 && o.rosto === id; });
        }).map(apagarFoto));
      }).then(function () { return mudou.length ? mudou[0].id : ''; });
    });
  };
  var p = navigator.locks && navigator.locks.request
    ? navigator.locks.request('operacao-campo-enviar', { ifAvailable: true }, function (trava) { return trava && !enviandoAgora ? faz() : 'ocupado'; })
    : (enviandoAgora ? Promise.resolve('ocupado') : faz());
  return p.then(function (r) {
    if (r === 'ocupado') { E.aviso = { tipo: 'atencao', texto: 'O app está enviando agora. Espere terminar e tente de novo.' }; return recarregarDiarios().then(desenhar); }
    E.aviso = null;
    if (!r) return irPara('encerrar');
    return lerDiario(r).then(function (d) { E.aberto = d; return gravarConfig('aberto', r); }).then(function () { return irPara('diario'); });
  });
}

function apagarDiarioDoCelular(id) {
  return lerDiario(id).then(function (d) {
    if (!d || !confirm('Tirar este diário do celular? As fotos dele também saem.')) return;
    /* A foto do rosto é uma só para as folhas do dia: fica se outra folha a usa. */
    var emUso = E.diarios.some(function (o) { return o.id !== d.id && o.rosto && o.rosto === d.rosto; });
    /* 7t.4: a lista do DDS também é uma só para as folhas do dia. */
    var ddsEmUso = E.diarios.some(function (o) { return o.id !== d.id && o.ddsLista && o.ddsLista === d.ddsLista; });
    return Promise.all([apagarFoto(d.fotos && d.fotos.FRENTE), apagarFoto(d.fotos && d.fotos.VERSO), emUso ? null : apagarFoto(d.rosto), ddsEmUso ? null : apagarFoto(d.ddsLista)].concat(idsDoBook(d).map(apagarFoto))).then(function () { return apagarDiario(d.id); })
      .then(function () { if (E.aberto && E.aberto.id === d.id) { E.aberto = null; return gravarConfig('aberto', null); } }).then(function () { return irPara('encerrar'); });
  });
}

// ---- Envio (OPE-17)
function telaEnvio() {
  var todos = E.diarios.slice().sort(function (a, b) { return (a.encerradoEm || a.criadoEm) < (b.encerradoEm || b.criadoEm) ? 1 : -1; });
  var pend = todos.filter(function (d) { return d.estado === 'encerrado'; });
  var u = E.ultimoEnvio, ur = u ? u.r : null;
  var h = '<div class="cartao"><div class="etiqueta">Fila de envio</div>' +
    '<div class="grande">' + pend.length + '</div><div class="ajuda" style="text-align:center">diário(s) esperando envio</div>' +
    (ur ? '<div class="aviso ' + (ur.erro || ur.recusados ? 'atencao' : 'ok') + '" style="margin-top:8px">Às ' + esc(horaDeIso(u.quando).slice(6)) + ': ' +
      esc(ur.ocupado ? 'o envio já estava em andamento.' : ur.erro ? ur.erro : (ur.enviados || 0) + ' enviado(s)' + (ur.recusados ? ', ' + ur.recusados + ' recusado(s)' : '') + '.') + '</div>' : '') +
    '<button type="button" class="btn" data-acao="enviar"' + (E.enviando || E.cfg.desligado ? ' disabled' : '') + '>' + (E.enviando ? 'Enviando…' : 'Enviar agora') + '</button></div>';
  h += '<div class="cartao"><div class="etiqueta">Diários neste celular</div>' + (todos.length ? '<ul class="lista">' + todos.map(function (d) {
    return '<li><a href="#" data-abrir-diario="' + esc(d.id) + '"><b>' + esc(d.form.prefixo || '—') + '</b> · ' + esc(d.form.tipoDia === 'PLANTAO' ? 'plantão' : d.form.obra || 'sem obra') + ' · ' + esc(brDe(d.dia)) + '</a> <span class="chip ' + d.estado + '">' + esc(NOME_DO_ESTADO[d.estado]) + '</span>' +
      (d.estado === 'encerrado' && d.ultimoErro ? '<div class="ajuda">' + esc(d.ultimoErro) + (d.tentativas ? ' (' + d.tentativas + ' tentativa(s))' : '') + '</div>' : '') + '</li>';
  }).join('') + '</ul>' : '<p class="media">Nenhum ainda.</p>') + '<div class="ajuda">Os enviados saem do celular depois de ' + DIAS_GUARDANDO_ENVIADOS + ' dias.</div></div>';
  h += '<div class="cartao"><div class="etiqueta">Este celular</div><dl class="resumo">' +
    '<dt>' + (E.cfg.login ? 'Celular da equipe' : 'Encarregado') + '</dt><dd>' + esc(E.cfg.login ? E.cfg.prefixo : E.cfg.nome + ' · ' + E.cfg.mat) + '</dd>' +
    (E.cfg.login && E.pessoa ? '<dt>Quem entrou</dt><dd>' + esc(E.pessoa.nome) + ' · ' + esc(E.pessoa.mat) + '</dd>' : '') + '<dt>Base</dt><dd>' + esc(E.cfg.base) + '</dd>' +
    '<dt>Celular</dt><dd>' + esc(E.cfg.aparelho) + (E.cfg.desligado ? ' · <b>desligado</b>' : '') + '</dd><dt>Ligado em</dt><dd>' + esc(horaDeIso(E.cfg.ligadoEm)) + '</dd>' +
    '<dt>Versão</dt><dd>' + esc(VERSAO_CAMPO) + '</dd><dt>Sem sinal</dt><dd>' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'funciona (cópia guardada)' : 'ainda não: abra uma vez com sinal') + '</dd>' +
    '<dt>Segundo plano</dt><dd>' + (('serviceWorker' in navigator) && ('SyncManager' in window) ? 'envia sozinho quando o sinal volta' : 'este navegador não envia fechado: abra o app com sinal') + '</dd>' +
    '<dt>Guardado</dt><dd id="estadoGuardado">…</dd></dl>' +
    '<div id="testeServidor"></div><button type="button" class="btn medio secundario" data-acao="testar">Testar o servidor</button>' +
    '<button type="button" class="btn medio fantasma" data-acao="religar">Ligar com outro código</button></div>' +
    '<div class="cartao"><div class="etiqueta">Quando o Android acordou o app</div><ul class="lista" id="segundoPlano"><li class="fraco">…</li></ul></div>';
  setTimeout(preencherEnvio, 0);
  return h;
}
function preencherEnvio() {
  (typeof cascaLer === 'function' ? cascaLer('acordadas:operacao') : lerConfig('segundoPlano')).then(function (l) {
    var el = $('segundoPlano'); if (!el) return;
    el.innerHTML = (l && l.length) ? l.slice().reverse().map(function (x) { return '<li><b>' + esc(horaDeIso(x.quando)) + '</b> · ' + esc(x.resultado) + '</li>'; }).join('') : '<li class="fraco">Ainda não.</li>';
  }).catch(function () { });
  var el = $('estadoGuardado');
  if (!el) return;
  if (!navigator.storage || !navigator.storage.persisted) { el.textContent = 'o navegador não informa'; return; }
  navigator.storage.persisted().then(function (p) {
    el.innerHTML = p ? 'protegido (o Android não apaga para liberar espaço)' : 'pode ser apagado se faltar espaço · <a href="#" data-acao="proteger">proteger</a>';
  });
}
function testarServidor() {
  var el = $('testeServidor');
  el.innerHTML = '<div class="aviso">Testando…</div>';
  var t0 = Date.now();
  postar(E.cfg.url, { acao: 'testar', token: E.cfg.token }, 30000).then(function (r) {
    var s = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' s';
    if (r.ok) { el.innerHTML = '<div class="aviso ok">O servidor respondeu em ' + s + ': celular ' + esc(r.aparelho) + ', de ' + esc(r.nome) + '.</div>'; if (E.cfg.desligado) { E.cfg.desligado = false; gravarConfig('servidor', E.cfg).then(desenhar); } }
    else if (r.desligado) marcarDesligado(r.erro).then(desenhar);
    else el.innerHTML = '<div class="aviso erro">' + esc(r.erro) + '</div>';
  }, function (e) { el.innerHTML = '<div class="aviso atencao">' + esc(e && e.msg || 'Sem resposta.') + '</div>'; });
}

// ---------------------------------------------------------------- eventos
var corpo = $('corpo');

corpo.addEventListener('input', function (ev) {
  var t = ev.target, d = E.aberto;
  if (t.id === 'buscaVerso') { var pac = pacoteDe(d.dia); $('listaVerso').innerHTML = itensDaBusca(pac, t.value, d.folha && d.folha.verso); return; }
  if (!d || d.estado !== 'rascunho') return;
  var f = t.getAttribute('data-f'), c = t.getAttribute('data-c'), xf = t.getAttribute('data-x'), fi = t.getAttribute('data-ficha');
  if (f) {
    d.form[f] = t.value;
    if (f === 'processo') d.form.processoMudado = true;
    /* 7v.1: quem escolheu na lista escolheu; um motorista pela função acrescentado depois não troca a escolha. */
    if (f === 'motorista') d.form.motoristaTrocar = true;
    if (f === 'atividade' && !d.form.processoMudado) { d.form.processo = processoPadrao(t.value, d.folha && d.folha.verso); var sp = $('i-processo'); if (sp) sp.value = d.form.processo; }
    if ($('horasHH')) $('horasHH').textContent = horasHH(d.form);
    salvarDepois();
  } else if (c !== null) {
    d.form.codigos[+c][t.getAttribute('data-cf')] = t.value;
    if (t.getAttribute('data-cf') === 'cod') { var ds = descricaoDoCodigo(pacoteDe(d.dia), d.form.contrato, t.value), el = $('desc-' + c); if (el) { el.textContent = ds.texto; el.className = 'desc' + (ds.fora ? ' erro-campo' : ''); } }
    salvarDepois();
  } else if (xf) {
    garantirExecucao(d); d.form.execucao[xf] = t.value; salvarDepois();
  } else if (t.hasAttribute('data-apr')) {
    aprDo(d)[t.getAttribute('data-apr')] = t.value; salvarDepois();
  } else if (t.hasAttribute('data-apr-mot')) {
    aprDo(d).motivo[t.getAttribute('data-apr-mot')] = t.value; salvarDepois();
  } else if (t.hasAttribute('data-bkobs')) {
    var bo = bookDo(d), lg = t.getAttribute('data-bkobs');
    bo.estruturas[lg] = bo.estruturas[lg] || {}; bo.estruturas[lg].obs = t.value; salvarDepois();
  } else if (fi) {
    garantirExecucao(d);
    var k = fi.split('|'), ficha = d.form.execucao[k[0]] = d.form.execucao[k[0]] || {};
    ficha[k[1]] = t.value; salvarDepois();
  }
});

corpo.addEventListener('change', function (ev) {
  var t = ev.target, d = E.aberto;
  if (t.getAttribute('data-rosto')) { encerrarODia(t.files && t.files[0]); return; }
  if (t.hasAttribute('data-bl')) { corrigirHora(+t.getAttribute('data-bl'), t.value); return; }
  if (t.hasAttribute('data-chegada')) { corrigirHora('chegada', t.value); return; }
  if (t.id === 'tqEquipe') { E.equipe = t.value; desenhar(); return; }
  if (t.hasAttribute('data-placa') && d && d.estado === 'rascunho') {
    if (t.value === OUTRA_PLACA) { d.form.placa = ''; d.form.placaOutra = true; } else { d.form.placa = t.value; d.form.placaOutra = false; }
    salvarAgora().then(desenhar).then(function () { var i = $('i-placa'); if (d.form.placaOutra && i) i.focus(); });
    return;
  }
  if (t.getAttribute('data-foto') && d && d.estado === 'rascunho') { trocarFotoDoPS(d, t.getAttribute('data-foto'), t.files && t.files[0]); return; }
  if (t.getAttribute('data-foto-dds') && d && d.estado === 'rascunho') { trocarFotoDaListaDDS(d, t.files && t.files[0]); return; }
  if (t.getAttribute('data-book') && d && d.estado === 'rascunho') { trocarFotoDoBook(d, t.getAttribute('data-book'), t.files && t.files[0]); return; }
  if (t.hasAttribute('data-apr-modelo') && d && d.estado === 'rascunho') {
    /* Trocar o modelo começa a APR de novo: as respostas de um modelo não valem no outro. */
    var mv = t.value, av = aprDo(d);
    if (mv !== av.modelo) d.apr = { modelo: mv, descricao: av.descricao, cod: av.cod, respostas: {}, marcados: {}, impedimento: {}, motivo: {}, riscos: [], epis: [], obs: av.obs };
    salvarAgora().then(desenhar);
    return;
  }
  if (t.getAttribute('data-redesenha') && d && d.estado === 'rascunho') {
    if (t.hasAttribute('data-x')) { garantirExecucao(d); d.form.execucao[t.getAttribute('data-x')] = t.value; }
    else d.form[t.getAttribute('data-f')] = t.value;
    salvarAgora().then(desenhar);
  }
});

/* O bloco que o encarregado fecha fica fechado no próximo desenho ("toggle" não sobe: escuta na captura). */
corpo.addEventListener('toggle', function (ev) {
  var k = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-bloco');
  if (!k) return;
  if (ev.target.open) delete E.fechados[k]; else E.fechados[k] = true;
}, true);

function trocarFotoDoPS(d, lado, arquivo) {
  if (!arquivo) return;
  $('estadoFoto').textContent = 'preparando a foto…';
  var x = d.form, linhas = [new Date().toLocaleString('pt-BR'), 'PS ' + (lado === 'FRENTE' ? 'FRENTE' : 'VERSO') + ' · ' + brDe(d.dia), [x.prefixo, x.obra, quem().nome].filter(Boolean).join('   ·   ')];
  processarFoto(arquivo, LADOS_FOTO_PS, TETO_FOTO_PS, linhas).then(function (r) {
    var id = novoId(), antiga = d.fotos[lado];
    return guardarFoto({ id: id, blob: r.blob, tipo: 'PS_' + lado, diario: d.id, criadoEm: new Date().toISOString() }).then(function () {
      d.fotos[lado] = id;
      /* Foto nova é arquivo novo no servidor: a que já tinha subido não vale mais. */
      if (d.arquivos) delete d.arquivos['PS_' + lado];
      return guardarDiario(d).then(function () { return apagarFoto(antiga); });
    });
  }).then(desenhar).catch(function (e) { $('estadoFoto').textContent = 'Não consegui preparar a foto: ' + (e && e.message || e); });
}

/* 7t.4: o servidor conhece a foto da lista do DDS (o pacote do dia diz). */
function pedeFotoDaListaDDS(pac) { return !!(pac && pac.listas && pac.listas.fotoDaListaDDS); }
/* 7v: o servidor diz no pacote que conhece quem dirigiu; o app no GitHub vai na frente da instalação. */
function pedeMotorista(pac) { return !!(pac && pac.listas && pac.listas.motorista); }
/* 7v.1 (Dalton, 25/10/2026: "deixe aparecer o botão quando ninguém for um motorista"): com UM só da equipe com função de
   motorista no BI (o servidor manda as matrículas no pacote), quem dirigiu já vem posto, com "Foi outra pessoa" para a
   exceção. Com nenhum, ou com mais de um, o encarregado escolhe. */
function motoristaPelaFuncaoApp(x, pac) {
  var mots = {}, achados = [];
  (((pac || {}).listas || {}).motoristasPelaFuncao || []).forEach(function (m) { mots[semZeros(m)] = 1; });
  [semZeros(quem().mat)].concat(x.pessoas.filter(function (p) { return p.estado === 'foi'; }).map(function (p) { return semZeros(p.mat); }))
    .forEach(function (m) { if (m && mots[m] && achados.indexOf(m) < 0) achados.push(m); });
  return achados.length === 1 ? achados[0] : '';
}
/* Quem dirigiu: o encarregado e quem está "Foi". Quem saiu da lista ou faltou sai das opções, e a escolha dele cai. */
function campoDoMotorista(x, pac) {
  var auto = x.motoristaTrocar ? '' : motoristaPelaFuncaoApp(x, pac);
  if (auto) {
    x.motorista = x.motoristaAuto = auto;
    var p = auto === semZeros(quem().mat) ? { nome: (quem().nome || 'Encarregado') + ' (encarregado)' } : x.pessoas.filter(function (q) { return semZeros(q.mat) === auto; })[0] || {};
    return '<div id="f-motorista" style="margin-top:10px"><label>Quem dirigiu hoje</label><div class="media" id="motoristaAuto"><b>' + esc(p.nome || auto) + '</b> · motorista pela função' +
      ' · <a href="#" data-acao="motoristaOutro">Foi outra pessoa</a></div></div>';
  }
  var ops = [[semZeros(quem().mat), (quem().nome || 'Encarregado') + ' (encarregado)']]
    .concat(x.pessoas.filter(function (p) { return p.estado === 'foi'; }).map(function (p) { return [semZeros(p.mat), p.nome || p.mat]; }));
  if (x.motorista && !ops.some(function (o) { return o[0] === semZeros(x.motorista); })) x.motorista = '';
  /* O que o app pôs sozinho sai quando deixa de valer (entrou um segundo motorista): a escolha volta ao encarregado,
     sem um nome já marcado que pareça escolhido. */
  if (!x.motoristaTrocar && x.motoristaAuto && x.motorista === x.motoristaAuto) x.motorista = '';
  x.motoristaAuto = '';
  return '<div id="f-motorista" style="margin-top:10px"><label for="i-motorista">Quem dirigiu hoje <span class="obrig">obrigatório</span></label><select id="i-motorista" data-f="motorista">' +
    opcoes(ops, semZeros(x.motorista), 'Escolha o motorista') + '</select></div>';
}

/* 7t.4: a foto da lista de presença do DDS em campo. É do dia da equipe: as outras folhas do dia que ainda são rascunho,
   com o DDS em campo, passam a usar a mesma foto. A antiga só sai do celular quando nenhuma folha a usa mais. */
function trocarFotoDaListaDDS(d, arquivo) {
  if (!arquivo) return;
  $('estadoFotoDds').textContent = 'preparando a foto…';
  var x = d.form, linhas = [new Date().toLocaleString('pt-BR'), 'DDS · LISTA DE PRESENÇA · ' + brDe(d.dia), [x.prefixo, quem().nome].filter(Boolean).join('   ·   ')];
  processarFoto(arquivo, LADOS_FOTO_PS, TETO_FOTO_PS, linhas).then(function (r) {
    var id = novoId(), antiga = d.ddsLista;
    return guardarFoto({ id: id, blob: r.blob, tipo: 'DDS_LISTA', diario: d.id, criadoEm: new Date().toISOString() }).then(function () {
      var irmaos = E.diarios.filter(function (o) { return o.id !== d.id && o.dia === d.dia && o.estado === 'rascunho' && o.form && o.form.prefixo === x.prefixo && o.form.dds === 'EM_CAMPO' && o.ddsLista === antiga; });
      var muda = function (o) { o.ddsLista = id; if (o.arquivos) delete o.arquivos.DDS_LISTA; return guardarDiario(o); };
      return Promise.all([muda(d)].concat(irmaos.map(muda))).then(function () {
        var emUso = antiga && E.diarios.some(function (o) { return o.ddsLista === antiga && o.id !== d.id && irmaos.indexOf(o) < 0; });
        return emUso ? null : apagarFoto(antiga);
      });
    });
  }).then(desenhar).catch(function (e) { $('estadoFotoDds').textContent = 'Não consegui preparar a foto: ' + (e && e.message || e); });
}

/* Ir até uma pendência: abre o diário dela (se for de uma folha) e rola até o campo. */
function irAtePendencia(campo, idDiario) {
  if (!idDiario || (E.aberto && E.aberto.id === idDiario)) return irPara('diario', campo);
  return lerDiario(idDiario).then(function (d) { E.aberto = d; return gravarConfig('aberto', idDiario); }).then(function () { return irPara('diario', campo); });
}

corpo.addEventListener('click', function (ev) {
  var t = ev.target.closest ? ev.target.closest('button, a') : null;
  if (!t) return;
  var a = function (n) { return t.getAttribute(n); }, d = E.aberto;
  if (t.tagName === 'A') ev.preventDefault();
  if (a('data-dia')) { E.dia = a('data-dia'); E.aviso = null; desenhar(); if (!pacoteDe(E.dia) && navigator.onLine) baixarPacote(E.dia); return; }
  if (a('data-modo')) { E.modoHoje[E.dia] = a('data-modo'); return desenhar(); }
  if (a('data-abrir-folha')) return abrirFolha(a('data-abrir-folha'));
  if (a('data-projeto')) return abrirProjeto(a('data-projeto'));
  if (a('data-baixar-projeto')) return baixarProjetos(pacoteDe(E.dia), true);
  if (a('data-abrir-diario')) return abrirDiario(a('data-abrir-diario'));
  if (a('data-aba-ir')) return irPara(a('data-aba-ir'));
  if (t.hasAttribute('data-ir')) return irAtePendencia(a('data-ir'), a('data-diario'));
  if (a('data-toque')) { if (E.toque !== a('data-toque')) E.valToque = null; E.toque = a('data-toque'); E.aviso = null; desenhar(); var ft = $('formToque'); if (ft && ft.scrollIntoView) ft.scrollIntoView({ block: 'nearest' }); return; }
  if (a('data-agora') && d && d.estado === 'rascunho') { d.form[a('data-agora')] = horaAgora(); var i = $('i-' + a('data-agora')); if (i) i.value = d.form[a('data-agora')]; salvarDepois(); return; }
  if (d && d.estado === 'rascunho') {
    var x = d.form;
    if (a('data-tipo')) { x.tipoDia = a('data-tipo'); return salvarAgora().then(desenhar); }
    if (a('data-dds')) { x.dds = a('data-dds'); return salvarAgora().then(desenhar); }
    if (a('data-foi')) { x.pessoas[+a('data-i')].estado = a('data-foi'); return salvarAgora().then(desenhar); }
    if (a('data-tirar-p')) { x.pessoas.splice(+a('data-tirar-p'), 1); return salvarAgora().then(desenhar); }
    if (a('data-tirar-cod')) { x.codigos.splice(+a('data-tirar-cod'), 1); if (!x.codigos.length) x.codigos.push({ cod: '', qtd: '', adc: '' }); return salvarAgora().then(desenhar); }
    if (a('data-xs')) { garantirExecucao(d); x.execucao[a('data-xs')] = a('data-v'); return salvarAgora().then(desenhar); }
    if (a('data-lugar')) { bookDo(d).sel = a('data-lugar'); return salvarAgora().then(desenhar); }
    /* 5e: a APR */
    if (a('data-apr-r')) { var ar = aprDo(d); ar.respostas[a('data-apr-r')] = a('data-v'); return salvarAgora().then(desenhar); }
    if (a('data-apr-m')) { var am = aprDo(d), km = a('data-apr-m'); if (am.marcados[km]) delete am.marcados[km]; else am.marcados[km] = true; return salvarAgora().then(desenhar); }
    if (a('data-apr-imp')) { var ai = aprDo(d); ai.impedimento[a('data-apr-imp')] = a('data-v'); return salvarAgora().then(desenhar); }
    if (a('data-apr-lista')) { var al = aprDo(d), nl = a('data-apr-lista'), il = +a('data-i'), ls = al[nl] = al[nl] || [], pl = ls.indexOf(il); if (pl >= 0) ls.splice(pl, 1); else ls.push(il); return salvarAgora().then(desenhar); }
    if (a('data-verso-cod')) {
      var vazio = x.codigos.filter(function (c) { return !c.cod && !c.qtd; })[0];
      if (vazio) vazio.cod = a('data-verso-cod'); else x.codigos.push({ cod: a('data-verso-cod'), qtd: '', adc: '' });
      return salvarAgora().then(desenhar);
    }
  }
  var acao = a('data-acao');
  if (!acao) return;
  if (acao === 'ligar') return ligar();
  if (acao === 'entrar') return entrar();
  if (acao === 'voltarApp') return voltarAoApp();
  if (acao === 'souSubstituto') { E.substitutos[E.dia + '|' + semZeros(quem().mat)] = new Date().toISOString(); return gravarConfig('substitutos', E.substitutos).then(desenhar); }
  if (acao === 'cancelarLigar') { E.ligar = null; return desenhar(); }
  if (acao === 'religar') { E.ligar = { codigo: '' }; return desenhar(); }
  if (acao === 'recarregar') return location.reload();
  if (acao === 'baixar') return baixarPacote(E.dia);
  if (acao === 'extra') return novaFolhaExtra();
  if (acao === 'enviar') return enviar('botão');
  if (acao === 'testar') return testarServidor();
  if (acao === 'corrigir') return corrigir(String(a('data-diario') || '').split(',').filter(Boolean));
  if (acao === 'apagar') return apagarDiarioDoCelular(a('data-diario'));
  if (acao === 'desfazerToque') return desfazerToque();
  if (acao === 'confirmarToque') return E.toque ? tocar(E.toque) : null;
  if (acao === 'cancelarToque') { E.toque = null; E.valToque = null; E.aviso = null; return desenhar(); }
  if (acao === 'proteger') { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(preencherEnvio); return; }
  if (d && d.estado === 'rascunho') {
    var y = d.form;
    if (acao === 'addLugar') {
      var R2 = regrasDe(pacoteDe(d.dia)), bb = bookDo(d), novo = R2 && R2.estadoDoBookApp ? proximoLugar(estadoDoBook(d, R2), a('data-novo'), anteriorDoDiario(d)) : '';
      if (!novo) return;
      bb.extras.push(novo); bb.sel = novo; return salvarAgora().then(desenhar);
    }
    if (acao === 'tirarFotoBook') return tirarFotoDoBook(d, a('data-chave'));
    if (acao === 'concluirApr') return concluirApr(d);
    if (acao === 'novaApr') return novaApr(d);
    if (acao === 'motoristaOutro') { y.motoristaTrocar = true; y.motorista = ''; return salvarAgora().then(desenhar); }
    if (acao === 'addCod') { y.codigos.push({ cod: '', qtd: '', adc: '' }); return salvarAgora().then(desenhar); }
    if (acao === 'codCancelado') { var L = pacoteDe(d.dia).listas; y.codigos = [{ cod: L.cancelado, qtd: '1', adc: '' }]; return salvarAgora().then(desenhar); }
    if (acao === 'addPessoa') {
      var pac = pacoteDe(d.dia), mat = semZeros($('addPessoa').value || $('addMat').value);
      if (!mat) return;
      if (mat === semZeros(quem().mat) || y.pessoas.some(function (p) { return semZeros(p.mat) === mat; })) { $('addMat').value = ''; return; }
      var p = (pac.pessoasDaBase || []).filter(function (q) { return semZeros(q.mat) === mat; })[0];
      y.pessoas.push({ mat: p ? p.mat : mat, nome: p ? p.nome : '', estado: 'foi', sugerido: false });
      return salvarAgora().then(desenhar);
    }
  }
});

$('voltarApp').addEventListener('click', function () { voltarAoApp(); });
$('abas').addEventListener('click', function (ev) {
  var b = ev.target.closest('button');
  if (b) irPara(b.getAttribute('data-aba'));
});

function desenharSinal() {
  var on = navigator.onLine, c = $('chipSinal');
  c.textContent = on ? 'Com sinal' : 'Sem sinal';
  c.className = 'sinal ' + (on ? 'on' : 'off');
}
window.addEventListener('online', function () { desenharSinal(); enviar('o sinal voltou'); if (E.cfg && !pacoteDe(E.dia)) baixarPacote(E.dia, true); });
window.addEventListener('offline', function () { desenharSinal(); if (E.aba === 'encerrar' || E.aba === 'envio') desenhar(); });
/* Ao sair do app, o que foi digitado não pode esperar os 400 ms. */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') salvarAgora();
  else if (E.cfg && E.aba !== 'diario') recarregarDiarios().then(desenhar);
});

// ---------------------------------------------------------------- início
/* O código do supervisor pode chegar no contexto do App Compel ({ codigo }), quando a tela "Aparelhos do campo" passar
   a gerar o link do app; até lá, ele é digitado na tela de Ligar. O contexto é conferido pela casca (sem CPF, token
   nem senha), e é só sugestão: quem decide é o servidor da Operação. */
function ligarDoContexto(ctx) {
  return ctx && /^\d{6}$/.test(String(ctx.codigo || '')) ? { codigo: String(ctx.codigo) } : null;
}

/* Enviados há mais de 7 dias, pacotes velhos e o dia em horários deles saem: o celular do campo tem pouco espaço.
   A foto do rosto é uma só para as folhas do dia (5b): só sai quando nenhuma folha que fica a usa. */
function limparVelhos() {
  var limite = new Date(Date.now() - DIAS_GUARDANDO_ENVIADOS * 86400000).toISOString();
  var velhos = E.diarios.filter(function (d) { return (d.estado === 'enviado' || d.estado === 'jaLancado') && (d.enviadoEm || d.mudadoEm) < limite; });
  var ficam = E.diarios.filter(function (d) { return velhos.indexOf(d) < 0; });
  var emUso = function (id) { return ficam.some(function (d) { return d.rosto === id || (id && d.ddsLista === id); }); };
  return Promise.all(velhos.map(function (d) {
    return Promise.all([apagarFoto(d.fotos && d.fotos.FRENTE), apagarFoto(d.fotos && d.fotos.VERSO), emUso(d.rosto) ? null : apagarFoto(d.rosto), emUso(d.ddsLista) ? null : apagarFoto(d.ddsLista)].concat(idsDoBook(d).map(apagarFoto))).then(function () { return apagarDiario(d.id); });
  })).then(function () {
    var diaLimite = isoMaisDias(hojeLocal(), -3);
    return noBanco('config', 'readonly', function (s) { return s.getAllKeys(); }).then(function (chaves) {
      var usados = {}; ficam.forEach(function (d) { if (d.estado !== 'enviado' && d.estado !== 'jaLancado') usados[d.dia] = 1; });
      return Promise.all((chaves || []).filter(function (k) {
        var m = String(k).match(/^(?:pacote|dia):(\d{4}-\d{2}-\d{2})/);
        return m && m[1] < diaLimite && !usados[m[1]];
      }).map(function (k) { if (/^dia:/.test(k)) delete E.dias[k.slice(4)]; return noBanco('config', 'readwrite', function (s) { return s.delete(k); }); }));
    });
  }).then(recarregarDiarios).catch(function () { });
}

/* O service worker é o da casca, um só para o app inteiro: aqui só se escuta o aviso dele de que o segundo plano mexeu
   na fila, para a tela aberta reler. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function (ev) { if (ev.data && ev.data.fila) recarregarDiarios().then(function () { if (E.aba !== 'diario') desenhar(); }); });
}

/* O ARRANQUE ESPERA A CASCA (27/10/2026): o Casca.iniciar confere a entrada de hoje no App Compel (sem ela, leva de volta
   para entrar) e diz quem é a pessoa e o contexto de quem abriu (o acesso rápido do Início manda { abrir: 'diario' }). */
desenharSinal();
E.dia = hojeLocal();
Casca.iniciar('operacao').then(function (ini) {
  E.daCasca = ini.pessoa;
  E.ligar = ligarDoContexto(ini.contexto);
  if (ini.contexto && ini.contexto.abrir === 'diario') E.aba = 'hoje';
  return lerConfig('servidor');
}).then(function (c) {
  E.cfg = c;
  return Promise.all([lerConfig('pessoas'), lerConfig('substitutos')]).then(function (v) { E.pessoas = v[0] || {}; E.substitutos = v[1] || {}; });
}).then(function () {
  /* Quem está no celular é quem está no App Compel; se essa pessoa já entrou nesta equipe, a tela abre direto, mesmo
     sem sinal. */
  var g = pessoaGuardadaDoApp();
  E.pessoa = g ? { mat: g.mat, nome: g.nome, funcoes: g.funcoes, prefixos: g.prefixos } : null;
  return gravarConfig('pessoa', E.pessoa);
}).then(function () {
  return recarregarDiarios();
}).then(function () {
  return Promise.all([carregarPacotesGuardados(), carregarDias(), lerConfig('aberto').then(function (id) { E.aberto = id ? E.diarios.filter(function (d) { return d.id === id; })[0] || null : null; })]);
}).then(limparVelhos).then(conferirProjetosGuardados).then(function () {
  desenhar();
  if (!E.cfg || E.ligar) return;
  /* Com sinal, a sessão na Operação é renovada quando não existe, venceu, ou foi recusada num envio de um diário desta
     pessoa (sessaoRecusada, marcado pela fila). Sem sinal, nada: quem já entrou trabalha, e a fila espera. */
  var renovar = !navigator.onLine || !E.cfg.login ? Promise.resolve() : Casca.temSessao().then(function (s) {
    var recusada = E.diarios.some(function (d) { return d.estado === 'encerrado' && d.sessaoRecusada && semZeros(d.form && d.form.matEnc) === matDoApp(); });
    if (!s.tem || recusada) return entrarPeloApp();
  });
  return renovar.then(function () {
    if (E.cfg.login && !E.pessoa) return;
    /* Ao abrir: o pedido de envio em segundo plano é refeito (o Android pode ter descartado o anterior), e com sinal o
       pacote de hoje vem atualizado. */
    if (E.diarios.some(function (d) { return d.estado === 'encerrado'; })) pedirEnvioEmSegundoPlano();
    if (navigator.onLine) return baixarPacote(E.dia, !!pacoteDe(E.dia)).then(function () { return enviar('app aberto'); });
  });
}).catch(function (e) {
  $('corpo').innerHTML = '<div class="aviso erro">O app não conseguiu abrir o banco do celular: ' + esc(e && e.message || e) + '. Feche e abra de novo; se continuar, fale com o supervisor.</div>';
});
