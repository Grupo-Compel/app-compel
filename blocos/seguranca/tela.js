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
var S = { tela: 'inicio', pessoa: null, pacote: null, sessaoOk: false, msg: '', form: null, alvo: null, contexto: null, registros: [], lido: null, baseDia: '' };

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
  var abrir = telaDoAtalho(r.contexto);
  return segGravarConfig('ultimaMatricula', r.pessoa.matricula).then(carregarLocal).then(recuperarRascunho).then(function () {
    // O formulário pela metade vence o atalho: quem voltou da câmera continua onde estava.
    if (abrir && !S.recuperado && podeAbrir(abrir)) S.tela = abrir;
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
  return Promise.all([segConfig('pacote'), SEG_BANCO.listar('registros'), segConfig('sessao:' + S.pessoa.matricula), segConfig('baseDia:' + S.pessoa.matricula)]).then(function (v) {
    S.pacote = v[0] || null; S.registros = v[1] || [];
    /* A base escolhida vale só no dia em que foi escolhida: amanhã a pessoa pode estar em outra, e gravar na base de ontem
       em silêncio é o erro que o campo existe para evitar. */
    S.baseDia = v[3] && v[3].dia === hoje() && baseValida(v[3].base) ? v[3].base : '';
    if (!marcaValida(v[2])) S.sessaoOk = false;
    avisarAtalhos();
  });
}

/* ---------- o Acesso rápido do app (casca 1.11 e 1.12.1; App nº 7, 27/10/2026) ----------
   O Início do app mostra um botão por formulário declarado em `atalhos` no bloco.json; o toque abre esta tela com o
   contexto { abrir: '<id>' }, sem sinal. Só ids conhecidos passam: o contexto vem de um link, e um id inventado não pode
   virar uma tela que não existe. Os de quem inspeciona só abrem para quem inspeciona; sem o pacote ainda, vale o início.
   O bloco.json dá o padrão por perfil; depois do pacote, o bloco diz à casca quais a pessoa usa DE VERDADE pela função
   dela (Casca.atalhosDaPessoa): o teste de luvas só para quem faz luvas, o veicular só para quem dirige. */
var ATALHOS = ['inicio', 'epi', 'luvas', 'veicular', 'incidente', 'sqp', 'blitz', 'dds'];
function telaDoAtalho(c) { var a = c && typeof c === 'object' ? String(c.abrir || '') : ''; return ATALHOS.indexOf(a) >= 0 ? a : ''; }
function podeAbrir(t) {
  if (t === 'sqp' || t === 'blitz') return !!S.pacote && ehDe(INSPECIONA);
  if (t === 'dds') return !!S.pacote && ehDe(INSPECIONA.concat(['ENCARREGADO']));
  return true;
}
function atalhosDestaPessoa() {
  if (!S.pacote) return null;
  var e = S.pacote.exigencias || { epi: true, luvas: 'NAO', veicular: false }, l = ['inicio', 'incidente'];
  if (e.epi) l.push('epi');
  if (e.luvas === 'DIARIO' || e.luvas === 'SEMANAL') l.push('luvas');
  if (e.veicular) l.push('veicular');
  if (ehDe(INSPECIONA)) l.push('sqp', 'blitz');
  if (ehDe(INSPECIONA.concat(['ENCARREGADO']))) l.push('dds');
  return l;
}
function avisarAtalhos() {
  var l = atalhosDestaPessoa();
  if (!l || typeof Casca.atalhosDaPessoa !== 'function') return;
  var k = l.join(',');
  if (S._atalhosAvisados === k) return;
  S._atalhosAvisados = k;
  try { Casca.atalhosDaPessoa(l); } catch (e) { S._atalhosAvisados = ''; } /* casca sem a função: vale o padrão do bloco.json */
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
  /* A lista por matrícula do Treinamentos (01/11/2026) vence a função escrita: ela já casou a pessoa com a função. */
  var porMat = (p.exigePorMatricula || {})[String(matricula || '').replace(/^0+(?=\d)/, '')];
  if (!euMesmo && porMat) return porMat;
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
var TITULOS = { inicio: 'Segurança', epi: 'Checklist EPI/EPC', luvas: 'Teste de luvas', veicular: 'Checklist veicular', sqp: 'Inspeção SQP', blitz: 'Blitz de Segurança', dds: 'Presença no DDS', ddsAntigo: 'DDS no modelo antigo', meus: 'Meus dados', equipe: 'Equipe do dia', fila: 'O que falta enviar', incidente: 'Incidente rápido', relato: 'Relatar acidente ou quase acidente' };
var AJUDAS = {
  incidente: 'Para quem está em campo: onde foi, o que aconteceu e a foto. Toque em "Adicionar foto" e escolha entre tirar na hora ou pegar da galeria. Um carro que bateu numa cerca, um poste avariado, um material que caiu. Se alguém se machucou, use o relato de acidente, no início. Sem sinal, fica guardado e sobe sozinho.',
  inicio: 'Os checklists que a sua função pede hoje. Verde: feito. O que você faz aqui fica guardado no celular e sobe sozinho quando houver sinal; o número no topo diz quanto ainda espera para subir.',
  epi: 'Marque cada item: OK, com problema (foto e o que houve) ou faltando. O que estiver com problema ou faltando vira pedido para o almoxarifado. Se você avisou e ninguém corrigiu, isso conta a seu favor numa inspeção — salvo EPI: sem o EPI em condição, exerça o direito de recusa.',
  luvas: 'Adicione cada luva que você testou: o número e a classe. Para cada uma, infle no dispositivo e faça o teste visual contra a luz. Se uma reprovar, só ela sai de uso: tire a foto do defeito e avise o almoxarifado. As outras seguem valendo. As luvas do seu último teste aparecem no alto, é só tocar para testar de novo.',
  veicular: 'O km é opcional: digite o que o painel mostra. Se for menor que o último km que a Frota tem para a placa (descontados 50 km), a tela avisa para você conferir; se estiver certo, pode seguir. Item por item: aprovado ou reprovado. Alguns itens têm também "N/A" (não se aplica a este veículo, como o limpador de para-brisa de um caminhão sem ele). Reprovado pede foto. Se reprovar um item crítico (os marcados com !), o veículo fica RETIDO: a equipe não sai com ele até um superior liberar no sistema.',
  sqp: 'Quatro etapas, com Continuar e Voltar no pé da tela. 1) A equipe (a formação do mês dá o encarregado e a matrícula do responsável), o local, a placa (aparecem as que já saíram com o prefixo) e quem conduz, e as pessoas inspecionadas. 2) As irregularidades: escolha o desvio no catálogo, porque o nível vem da Política e não de você; cada uma com foto e os envolvidos, e o sistema cruza com os checklists do dia de cada um. Aqui também aparece o que ficou em aberto da Blitz anterior desta equipe, para conferir. 3) Fotos da inspeção, opcionais. 4) Revise e envie; "alterar" volta à etapa.',
  blitz: 'Quatro etapas, com Continuar e Voltar no pé da tela. 1) Escolha o que vai inspecionar (pessoa, veículo ou equipe) e diga quem ou qual. 2) Marque item por item, categoria por categoria: não conforme pede o motivo e a foto, e vira irregularidade com prazo de correção. 3) O que ficou em aberto da Blitz anterior: diga se foi resolvido, se continua, ou gere o vale de quem vai arcar com o prejuízo. 4) Revise e envie; "alterar" volta à etapa.',
  dds: 'Escolha a lista do DDS (a que foi impressa com todos da base), fotografe cada página assinada e confira o que ficou em amarelo. Presença só vale com a foto da lista — ela vai junto, como documento. Se o DDS foi feito com a folha antiga (a lista não saiu do sistema), use o botão "Informar no modelo antigo".',
  ddsAntigo: 'É o "Informe de Realização DDS_COMPEL" no celular: quem ministrou, horário, tema, tipo, participantes e as fotos da lista. A lista não foi emitida pelo sistema, então o informe vai para revisão: a Operação ou a Segurança confere a foto e dá a baixa, quem fizer primeiro.',
  meus: 'O que você fez neste mês, contado neste celular. Sem percentual: o número que vale para a Campanha é o do extrato.',
  equipe: 'Cada pessoa da equipe com o que a função dela pede. Toque no que falta para fazer por ela: o registro fica no nome dela, marcado "feito no celular do encarregado", e no fim pede a foto do SEU rosto.',
  fila: 'Tudo o que foi feito neste celular e ainda não subiu, e o que o servidor recusou (com o motivo). O que espera sobe sozinho quando houver sinal.',
  relato: 'Conte o que aconteceu com as suas palavras: o que foi, quando, onde, quem se machucou. Fotos ajudam. Funciona sem sinal: o relato sobe sozinho depois, e um técnico de segurança completa e investiga. Relatar quase acidente também conta: é ele que evita o próximo acidente.'
};
function desenhar() {
  var corpo = $('corpo'), t = S.tela;
  var esperando = S.registros.filter(function (r) { return r.estado === 'guardado'; }).length, recusados = S.registros.filter(function (r) { return r.estado === 'recusado'; }).length;
  /* Um "Voltar" só (desenho do App, 12/11/2026): a faixa da casca (1.13.1 em diante) já tem o dela e o bloco mandava outro
     logo abaixo. O destino sai daqui por Casca.barra. Casca anterior, sem a função, continua com o botão do bloco: sem
     ele a pessoa ficaria sem como voltar. */
  var temBarra = typeof Casca.barra === 'function';
  if (temBarra) Casca.barra({ voltar: voltarDaTela, rotulo: t === 'inicio' ? 'Início do app' : 'Voltar' });
  var topo = (temBarra ? '' : '<div class="seg-topo"><button type="button" class="btn fantasma auto" data-acao="' + (t === 'inicio' ? 'voltarApp' : 'inicio') + '">‹ ' + (t === 'inicio' ? 'Início do app' : 'Voltar') + '</button></div>') +
    '<div class="seg-titulo"><h1 class="seg-h1">' + h(S.alvo && t !== 'inicio' && t !== 'equipe' ? TITULOS[t] + ' · ' + S.alvo.nome : TITULOS[t]) + '</h1>' +
    '<span class="seg-fila' + (esperando ? ' espera' : '') + '" data-acao="fila">' + (esperando ? esperando + ' para enviar' : 'tudo enviado') + (recusados ? ' · ' + recusados + ' recusado(s)' : '') + '</span></div>';
  var avisos = '';
  if (S.recuperado && S.form) avisos += '<div class="aviso info">Continuando de onde você parou (o app foi fechado no meio).</div>';
  if (S.msg === 'semCasca') avisos += '<div class="aviso atencao">Tudo o que você fizer fica guardado neste celular. O envio ao servidor da Segurança espera uma atualização do app (a sessão do módulo).</div>';
  else if (S.msg) avisos += '<div class="aviso erro">' + h(S.msg) + '</div>';
  if (!S.pacote) avisos += '<div class="aviso info">' + (Casca.sinal() ? 'Baixando os dados da Segurança…' : 'Abra a Segurança com sinal uma vez para baixar os itens da sua função e o catálogo. Até lá, só o checklist de EPI/EPC.') + '</div>';
  var tela = ({ inicio: telaInicio, epi: telaEpi, luvas: telaLuvas, veicular: telaVeicular, sqp: telaSqp, blitz: telaBlitz, dds: telaDds, ddsAntigo: telaDdsAntigo, meus: telaMeus, equipe: telaEquipe, fila: telaFila, relato: telaRelato, incidente: telaIncidente })[t]();
  corpo.innerHTML = topo + avisos + tela + '<div id="ajuda"></div>';
  rodapeFixo(corpo);
  Casca.ajuda($('ajuda'), AJUDAS[t]);
  // Volta ao topo só quando a TELA muda: o redesenho de 20 em 20 s não pode jogar para cima quem está rolando a lista.
  if (S._ultimaTela !== t || S._ultimoAlvo !== S.alvo) window.scrollTo(0, 0);
  S._ultimaTela = t; S._ultimoAlvo = S.alvo;
  guardarRascunho();
}
/* O destino do "Voltar" da faixa: do início sai do bloco; de qualquer outra tela volta ao início (ou à equipe, quando se
   faz por outra pessoa). É o que o botão do corpo da tela fazia até a 0.6.6. */
function voltarDaTela() { return S.tela === 'inicio' ? Casca.voltar() : ir(S.alvo ? 'equipe' : 'inicio'); }
/* O botão de salvar e a frase "Faltam N" ficam presos no pé da tela, como no desenho do App (12/11/2026): com 41 itens
   de EPI, quem terminou lá embaixo não precisa rolar de volta para saber o que falta. Embrulha o que já foi desenhado,
   em vez de mudar as dez telas: o botão continua o mesmo, só ganha o rodapé em volta. A frase só vai junto quando é
   a irmã imediata do botão. */
function rodapeFixo(corpo) {
  var bs = corpo.querySelectorAll('button[data-acao^="salvar"]'), b = bs[bs.length - 1];
  if (!b || b.closest('.seg-rodape')) return;
  var r = document.createElement('div'); r.className = 'seg-rodape';
  var dep = b.nextElementSibling; b.parentNode.insertBefore(r, b); r.appendChild(b);
  if (dep && dep.tagName === 'P' && dep.classList.contains('seg-sub')) r.appendChild(dep);
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
  var html = '<p class="n-saudacao">Olá, ' + h(eu.nome.split(' ')[0]) + '.</p>' + seletorDeBase();
  /* Para todo mundo, e no alto (26/10/2026): o relato não depende da função nem do perfil, e quem precisa dele está com
     pressa. Escondido no fim da lista, ele pareceria coisa só do técnico. */
  html += '<button type="button" class="btn secundario seg-relatar" data-acao="abrir" data-tela="relato">⚠ Relatar acidente ou quase acidente</button>';
  html += '<button type="button" class="btn secundario" data-acao="abrir" data-tela="incidente">Incidente rápido: onde, o quê e a foto</button>';
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
/* A BASE DE HOJE (04/11/2026; pedido do Dalton: "um campo de base no início, para quem tem mais de uma no acesso; o que a
   pessoa seleciona já filtra os prefixos, e depois as placas aparecem só daquele estado, as pessoas inspecionadas só
   daquela base"). Antes o registro ia sempre para a primeira base do acesso, certa ou errada. A lista vem no pacote
   (basesDeTrabalho: id e UF). Com uma base só, não há o que escolher e ela vale sozinha. A base do contexto (a Operação
   abriu a tela com a equipe do dia) continua mandando. */
function basesDeTrabalho() { return (S.pacote && S.pacote.basesDeTrabalho) || []; }
function baseValida(b) { return !!b && basesDeTrabalho().some(function (x) { return x.id === b; }); }
function baseEscolhida() {
  if (S.contexto && S.contexto.base) return String(S.contexto.base).toUpperCase();
  var l = basesDeTrabalho();
  if (l.length === 1) return l[0].id;
  return baseValida(S.baseDia) ? S.baseDia : '';
}
function faltaEscolherBase() { return !(S.contexto && S.contexto.base) && basesDeTrabalho().length > 1 && !baseValida(S.baseDia); }
function ufDaBase(b) { var x = basesDeTrabalho().filter(function (y) { return y.id === b; })[0]; return x ? x.uf : ''; }
/* A Operação ainda grava algumas bases com a sigla dela (SGO, PPO, VHA; PADRAO_DAS_BASES §2, 17/10/2026). Se a conferência
   da formação pela sigla do Núcleo não achar ninguém, a lista inteira aparece, em vez de uma base inteira vazia e calada. */
var SIGLAS_DA_OPERACAO = { SG: ['SGO'], PP: ['PPO'], VIL: ['VHA'] };
function mesmaBase(x, b) { return x === b || (SIGLAS_DA_OPERACAO[b] || []).indexOf(x) >= 0; }
function seletorDeBase() {
  var l = basesDeTrabalho(); if (l.length < 2 || (S.contexto && S.contexto.base)) return '';
  var falta = faltaEscolherBase();
  return '<div class="cartao' + (falta ? ' seg-falta-base' : '') + '"><b>Base de hoje</b><p class="seg-sub">' + (falta ? 'Escolha a base em que você está hoje: ela define as placas, as equipes e a base onde a inspeção será gravada.' : 'As placas, as equipes e a gravação seguem esta base.') + '</p><div class="seg-chips">' +
    l.map(function (x) { return '<button type="button" class="chip' + (S.baseDia === x.id ? ' ativo' : '') + '" data-acao="escolherBase" data-v="' + h(x.id) + '">' + h(x.id) + (x.uf ? ' · ' + h(x.uf) : '') + '</button>'; }).join('') + '</div></div>';
}
function baseDoRegistro() { return baseEscolhida() || (S.contexto && S.contexto.base) || (S.pacote && S.pacote.pessoa.bases && S.pacote.pessoa.bases[0] !== '*' && S.pacote.pessoa.bases[0]) || (S.pessoa.bases && S.pessoa.bases[0] && (S.pessoa.bases[0].id || S.pessoa.bases[0])) || ''; }
function gravar(reg) {
  if (faltaEscolherBase()) { S.msg = 'Escolha a base de hoje no início antes de gravar.'; S.tela = 'inicio'; S.form = null; desenhar(); return Promise.resolve(false); }
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
/* A galeria (09/11/2026; Dalton: "habilitar o botão de buscar foto da galeria também"): sem o atributo capture o celular
   abre a galeria em vez da câmera. A foto da galeria não é do momento nem do lugar: vai sem GPS e com a linha "da galeria"
   no carimbo, para a engenharia não tomar a hora de agora como a hora do fato.
   12/11/2026 (Dalton: "apenas 1 botão que faz as duas coisas, como existe em outros lugares"): o botão único não leva o
   capture, e o próprio celular pergunta câmera ou galeria. Como a tela não sabe qual das duas a pessoa escolheu, decide pela
   data do arquivo: feito há menos de 5 minutos é foto de agora (com GPS e sem a marca); mais velho é "da galeria". Medido só
   em Chromium (12/11/2026); no Android e no iPhone a data do arquivo da câmera ainda não foi vista. */
var JANELA_FOTO_NA_HORA_MS = 5 * 60 * 1000;
var fotoDaGaleria = false, fotoEscolhaLivre = false;
function pedirFoto(onde, frente, galeria, escolhaLivre) {
  fotoPendente = onde; fotoDaGaleria = !!galeria; fotoEscolhaLivre = !!escolhaLivre;
  var i = $('arquivoFoto');
  if (galeria || escolhaLivre) i.removeAttribute('capture'); else i.setAttribute('capture', frente ? 'user' : 'environment');
  i.value = ''; i.click();
}
function fotoFeitaAgora(arquivo) { return !!(arquivo && arquivo.lastModified && Math.abs(Date.now() - arquivo.lastModified) < JANELA_FOTO_NA_HORA_MS); }
function aoEscolherFoto(arquivo) {
  var onde = fotoPendente, daGaleria = fotoDaGaleria; if (fotoEscolhaLivre) daGaleria = !fotoFeitaAgora(arquivo);
  fotoPendente = null; fotoDaGaleria = false; fotoEscolhaLivre = false;
  if (!arquivo || !onde) return;
  var idFoto = novoId('foto');
  Casca.foto(arquivo, { semGps: daGaleria, linhas: ['Segurança · ' + S.pessoa.nome + (daGaleria ? ' · da galeria' : ''), new Date().toLocaleString('pt-BR')] }).then(function (f) {
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
    html += '<div class="cartao seg-item' + (e === 'problema' || e === 'falta' ? ' seg-problema' : '') + '"><b>' + h(it) + '</b><div class="seg-tres">' +
      ['ok', 'problema', 'falta'].map(function (x) { return '<button type="button" class="chip' + (e === x ? ' ativo' : '') + '" data-acao="estadoItem" data-i="' + i + '" data-v="' + x + '">' + { ok: 'OK', problema: 'Com problema', falta: 'Faltando' }[x] + '</button>'; }).join('') + '</div>' +
      (e === 'problema' ? '<div class="campo"><input placeholder="O que houve" data-obs="' + i + '" value="' + h(f.obs[it] || '') + '"></div><button type="button" class="btn secundario auto' + (f.fotos[it] ? '' : ' seg-foto-obrig') + '" data-acao="fotoItem" data-i="' + i + '">' + (f.fotos[it] ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' : '') + '</div>';
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

/* ---------- luvas, uma por uma (0.6.8, 12/11/2026) ----------
   Decisão do Dalton: "se 1 der defeito, vai trocar só ela". A tela deixa de pedir esquerda/direita: cada luva testada é um
   item da rodada, com o número, a classe e o seu próprio resultado, e só a reprovada sai de uso. A rodada continua sendo UM
   registro (o servidor 0.9.16 grava uma linha por luva): a Campanha de Produtividade conta DIAS distintos por matrícula
   (conferido em 12/11/2026), e não linhas, então a conta de quem recebe pela meta não muda. Registro antigo (esquerda/
   direita) continua aceito pelo servidor, para o celular que ainda não atualizou. */
var MAX_LUVAS_NA_RODADA = 8, CODIGO_DE_LUVA = /^[A-Za-z0-9._\/-]{1,30}$/, CLASSES_DE_LUVA = ['0', '2', '3', '4'];
function matDoAlvoDeLuvas() { return String(S.alvo ? S.alvo.matricula : S.pessoa.matricula).trim().replace(/^0+(?=\d)/, ''); }
function luvaReprovada(x) { return x.inflagem === 'reprovado' || x.visual === 'reprovado'; }
/* As luvas do último teste anterior a hoje, que ainda não saíram de uso. O pacote traz as que o servidor viu; o que este
   celular gravou depois (ou ainda não mandou) vale mais, porque o servidor só atualiza o pacote de tempos em tempos. Sem
   pacote e sem registro local a lista é vazia e a pessoa digita: a sugestão ajuda, nunca é condição. */
function luvasSugeridas(mat) {
  var pac = (S.pacote && S.pacote.luvasDaPessoa) || {}, base = pac[mat], dia = base ? base.d : '', lista = base ? (base.l || []).map(function (x) { return { codigo: String(x.c), classe: String(x.k) }; }) : [];
  var mias = (S.registros || []).filter(function (r) { return r.tipo === 'luvas' && r.luvas && Array.isArray(r.luvas.itens) && r.carimbo && r.carimbo.emNomeDe && String(r.carimbo.emNomeDe.matricula).trim().replace(/^0+(?=\d)/, '') === mat && r.dia; });
  var retiradas = {};
  mias.forEach(function (r) { if (r.dia >= dia) r.luvas.itens.forEach(function (x) { if (luvaReprovada(x)) retiradas[String(x.codigo).toUpperCase()] = true; }); });
  var maisNovo = mias.filter(function (r) { return r.dia < hoje() && r.dia > dia; }).sort(function (x, y) { return x.dia < y.dia ? 1 : -1; })[0];
  if (maisNovo) lista = maisNovo.luvas.itens.map(function (x) { return { codigo: String(x.codigo), classe: String(x.classe) }; });
  return lista.filter(function (x) { return !retiradas[x.codigo.toUpperCase()]; });
}
function luvasDaRodada(f) { f.itens = Array.isArray(f.itens) ? f.itens : []; return f.itens; }
function faltaDasLuvas(f) {
  var it = luvasDaRodada(f), n = 0;
  if (!it.length) return 'Adicione ao menos uma luva.';
  it.forEach(function (x) { if (!x.inflagem || !x.visual || (luvaReprovada(x) && !x.foto)) n++; });
  if (n) return 'Falta resultado ou foto em ' + n + ' luva(s).';
  return (S.alvo && !f.rosto) ? 'Falta a foto do seu rosto.' : '';
}
function telaLuvas() {
  var f = S.form = S.form || { id: novoId('luv'), tipo: 'luvas', itens: [], novoCodigo: '', novaClasse: '' };
  var it = luvasDaRodada(f);
  var chips = function (i, campo, op) { return '<div class="seg-tres">' + op.map(function (x) { return '<button type="button" class="chip' + (it[i][campo] === x[0] ? ' ativo' : '') + '" data-acao="luvaCampo" data-i="' + i + '" data-c="' + campo + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; };
  var ja = {}; it.forEach(function (x) { ja[x.codigo.toUpperCase()] = true; });
  var sug = luvasSugeridas(matDoAlvoDeLuvas()).filter(function (x) { return !ja[x.codigo.toUpperCase()]; });
  var cheia = it.length >= MAX_LUVAS_NA_RODADA;
  var html = (sug.length && !cheia ? '<div class="cartao"><b>Luvas do último teste</b><p class="seg-sub">Toque para testar de novo. A que reprovou antes não aparece aqui.</p><div class="seg-chips">' +
      sug.map(function (x) { return '<button type="button" class="chip" data-acao="luvaSugerida" data-v="' + h(x.codigo) + '" data-k="' + h(x.classe) + '">' + h(x.codigo) + ' · classe ' + h(x.classe) + '</button>'; }).join('') + '</div></div>' : '');
  it.forEach(function (x, i) {
    var rep = luvaReprovada(x);
    html += '<div class="cartao seg-item' + (rep ? ' seg-problema' : '') + '"><b>Luva ' + h(x.codigo) + ' · classe ' + h(x.classe) + '</b> ' +
      '<button type="button" class="btn secundario" data-acao="luvaTirar" data-i="' + i + '" aria-label="Tirar a luva ' + h(x.codigo) + ' da lista">Tirar</button>' +
      '<p class="seg-sub">Inflagem</p>' + chips(i, 'inflagem', [['aprovado', 'Aprovada'], ['reprovado', 'Reprovada']]) +
      '<p class="seg-sub">Teste visual contra a luz</p>' + chips(i, 'visual', [['aprovado', 'Aprovado'], ['reprovado', 'Reprovado']]) +
      (rep ? '<div class="aviso erro">Só esta luva sai de uso. Tire a foto do defeito e avise o almoxarifado.</div><button type="button" class="btn secundario' + (x.foto ? '' : ' seg-foto-obrig') + '" data-acao="luvaFoto" data-i="' + i + '">' + (x.foto ? 'Foto tirada ✓' : 'Tirar foto do defeito') + '</button>' : '') + '</div>';
  });
  html += (cheia ? '<div class="aviso">Máximo de ' + MAX_LUVAS_NA_RODADA + ' luvas por vez. Salve e faça outra rodada, se tiver mais.</div>' :
    '<div class="cartao"><b>Adicionar uma luva</b><div class="campo"><label>Número da luva</label><input data-campo="novoCodigo" value="' + h(f.novoCodigo) + '" placeholder="ex.: 1234" autocapitalize="characters"></div>' +
    '<p class="seg-sub">Classe</p><div class="seg-tres">' + CLASSES_DE_LUVA.map(function (c) { return '<button type="button" class="chip' + (f.novaClasse === c ? ' ativo' : '') + '" data-acao="campo" data-c="novaClasse" data-v="' + c + '">' + c + '</button>'; }).join('') + '</div>' +
    '<button type="button" class="btn secundario" data-acao="luvaAdicionar">Adicionar à lista</button></div>');
  var falta1 = faltaDasLuvas(f);
  return html + rostoSePreciso(f) + '<button type="button" class="btn" data-acao="salvarLuvas"' + (falta1 ? ' disabled' : '') + '>Salvar teste</button>' + (falta1 ? '<p class="seg-sub">' + h(falta1) + '</p>' : '');
}

/* ---------- veicular ---------- */
/* O km como a pessoa digita (decisão do Dalton, 06/11/2026: "inserir o km como número e ponto"). A mesma regra do
   kmDigitado do servidor (20_Campo.gs, seg-0.9.4): "269.154" é milhar e vira 269154; "12.5" ou "12,5" é fração e vira
   12. Até 06/11 o bloco tirava tudo que não era algarismo, e "12.5" subia como 125. A regra fica nos dois lados porque
   o servidor no ar até a 0.9.3 grava o km como chega: o bloco não pode depender de qual servidor está instalado. O
   teclado passou de "numeric" para "decimal": em parte dos Android o teclado numérico não tem a tecla do ponto. */
function kmDoCampo(v) {
  var t = String(v === undefined || v === null ? '' : v).replace(/[\s ]/g, '');
  if (!t) return '';
  if (t.indexOf(',') >= 0) t = t.split(',')[0].replace(/\./g, '');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else if (/^\d+\.\d*$/.test(t)) t = t.split('.')[0];
  return t.replace(/\D/g, '');
}
/* O AVISO DE KM MENOR QUE O ÚLTIMO (Dalton, 07/11/2026: "se alguém digita um km menor, na tela, na hora, já fala que está
   errado"). O último km de cada placa vem no pacote (servidor 0.9.10, da aba ULTIMO_KM da Frota); sem o campo, sem a placa
   ou sem km digitado, não avisa nada. A margem de 50 km é da Frota (Frota nº 9, 06/11/2026): o posto e o painel divergem
   uns quilômetros. Só avisa para baixo: o último km pode ter semanas, e o carro anda. Nunca trava: o km continua opcional
   (Dalton, 06/11/2026) e o aviso diz "se estiver certo, pode seguir". */
var MARGEM_DO_KM = 50;
function milhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
/* Enquanto se digita, "269154" passa por "2", "26", "269"... e todos são menores que o último: avisar em cada tecla piscaria.
   Por isso, digitando, só avisa quando o número já tem tantos algarismos quanto o último; ao sair do campo, avisa sempre. */
function avisoDoKm(f, aoSair) {
  var u = S.pacote && S.pacote.ultimoKm && S.pacote.ultimoKm[soPlaca(f.placa)], k = kmDoCampo(f.km);
  if (!u || !u.km || k === '') return '';
  if (!aoSair && k.length < String(u.km).length) return '';
  var n = Number(k);
  if (!(n < u.km - MARGEM_DO_KM)) return '';
  return '<p class="aviso atencao" role="alert">O último km desta placa que a Frota tem é ' + milhar(u.km) + (u.dia ? ' (' + h(u.dia) + ')' : '') + '. Você digitou ' + milhar(n) + '. Confira o painel; se estiver certo, pode seguir.</p>';
}
function atualizarAvisoDoKm(aoSair) {
  var e = document.getElementById('segAvisoKm');
  if (e && S.form) e.innerHTML = avisoDoKm(S.form, aoSair);
}
function telaVeicular() {
  var f = S.form = S.form || { id: novoId('vei'), tipo: 'veicular', placa: (S.contexto && S.contexto.placa) || '', tipoV: '', km: '', estados: {}, fotos: {}, obs: {} };
  var tipos = S.pacote ? Object.keys(S.pacote.veiculos) : [], crit = (S.pacote ? S.pacote.criticosVeiculo : []).map(normalizar);
  /* O km é opcional (proposto pelo Frota, carta nº 1 ao Frota, §4; entregue em 26/10/2026): o servidor já tinha a coluna
     KM. Obrigatório, ele travaria o checklist de quem está com o painel apagado ou sem ver o hodômetro. */
  // O tipo do checklist vem da placa, quando ela está no cadastro da Frota; a pessoa pode trocar.
  var daFrota = placaDaFrota(f.placa);
  if (!f.tipoV && daFrota && daFrota.tipo && S.pacote && S.pacote.veiculos[daFrota.tipo]) f.tipoV = daFrota.tipo;
  var html = listaDePlacas() + '<div class="cartao"><div class="campo"><label>Placa</label><input data-campo="placa" list="segPlacas" value="' + h(f.placa) + '" placeholder="ABC1D23" autocapitalize="characters"></div>' + sobreAPlaca(f.placa) +
    '<div class="campo"><label>Km do hodômetro (se puder ver)</label><input data-campo="km" inputmode="decimal" value="' + h(f.km || '') + '"></div><div id="segAvisoKm">' + avisoDoKm(f, true) + '</div><b>Tipo do veículo</b><div class="seg-chips">' +
    tipos.map(function (t) { return '<button type="button" class="chip' + (f.tipoV === t ? ' ativo' : '') + '" data-acao="campo" data-c="tipoV" data-v="' + h(t) + '">' + h(t) + '</button>'; }).join('') + '</div></div>';
  if (!S.pacote) return html + '<div class="aviso atencao">Os itens de cada tipo de veículo chegam com o pacote. Abra com sinal uma vez.</div>';
  if (!f.tipoV) return html;
  var v = S.pacote.veiculos[f.tipoV], itens = v.itens.concat(v.lataria.map(function (x) { return 'Lataria ' + x; })).concat(v.iluminacao);
  var retidos = [], aceitaNa = v.na || [];
  html += '<div class="cartao"><button type="button" class="btn fantasma auto" data-acao="todosOk">Marcar o que falta como aprovado</button></div>';
  itens.forEach(function (it, i) {
    var e = f.estados[it] || '', ehCrit = crit.indexOf(normalizar(it)) >= 0;
    if (e === 'reprovado' && ehCrit) retidos.push(it);
    html += '<div class="cartao seg-item' + (e === 'reprovado' ? ' seg-problema' : '') + (e === 'reprovado' && ehCrit ? ' seg-critico' : '') + '"><b>' + (ehCrit ? '! ' : '') + h(it) + '</b><div class="seg-tres">' +
      /* "N/A" só nos itens que o catálogo (ACEITA_NA) aceita para este tipo de veículo; o servidor recusa nos outros.
         Conta como marcado, mas não reprova nem retém. */
      (aceitaNa.indexOf(it) >= 0 ? ['aprovado', 'reprovado', 'na'] : ['aprovado', 'reprovado']).map(function (x) { return '<button type="button" class="chip' + (e === x ? ' ativo' : '') + '" data-acao="estadoItem" data-i="' + i + '" data-v="' + x + '">' + { aprovado: 'Aprovado', reprovado: 'Reprovado', na: 'N/A' }[x] + '</button>'; }).join('') + '</div>' +
      (e === 'reprovado' ? '<div class="campo"><input placeholder="O que houve" data-obs="' + i + '" value="' + h(f.obs[it] || '') + '"></div><button type="button" class="btn secundario auto' + (f.fotos[it] ? '' : ' seg-foto-obrig') + '" data-acao="fotoItem" data-i="' + i + '">' + (f.fotos[it] ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' : '') + '</div>';
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
/* ---------- SQP e Blitz em etapas (bloco 0.6.9, 13/11/2026) ----------
   O desenho do App (12/11/2026, §6 e §7, decisão do Dalton): as duas inspeções em quatro etapas, com a barra no alto e
   "Voltar | Continuar" no pé. É só a forma: o registro que sobe é o mesmo de antes, campo por campo. As conferências que
   já existiam continuam no mesmo lugar (no Enviar) e ganham uma cópia no Continuar da etapa a que pertencem, para o
   inspetor saber do que falta antes de chegar ao fim. O Continuar só fica apagado pelo que se resolve com um toque
   (irregularidade aberta, item sem motivo ou sem foto): o que depende de texto digitado é conferido no toque, porque o
   texto não redesenha a tela e o botão ficaria apagado depois de a pessoa já ter digitado. A etapa fica no formulário,
   então volta junto com o rascunho se a câmera matar a página; rascunho de antes desta versão abre na etapa 1. */
var ETAPAS_SQP = ['Equipe e local', 'Irregularidades', 'Fotos da inspeção', 'Revisar e enviar'];
var ETAPAS_BLITZ = ['O que você vai inspecionar?', 'Itens', 'Blitz anterior em aberto', 'Revisar e enviar'];
function etapaDe(f) { f.etapa = Math.min(4, Math.max(1, Math.floor(+f.etapa) || 1)); return f.etapa; }
function barraDeEtapas(nomes, n) {
  return '<div class="seg-etapas" role="progressbar" aria-valuemin="1" aria-valuemax="' + nomes.length + '" aria-valuenow="' + n + '">' + nomes.map(function (x, i) { return '<span' + (i < n ? ' class="feita"' : '') + '></span>'; }).join('') + '</div>' +
    '<p class="seg-etapa">ETAPA ' + n + ' DE ' + nomes.length + '</p><h2 class="seg-h2 seg-h2-etapa">' + h(nomes[n - 1]) + '</h2>';
}
/* O que o app já sabe, sem campo para digitar. A data e a hora que valem são as do envio (o gravar põe o dia e o carimbo
   na hora de salvar); por isso a tela não mostra uma "hora de início" que ninguém grava. */
function quadroDoApp() {
  var b = baseEscolhida();
  return '<div class="seg-app"><small>Preenchido pelo app</small><dl>' +
    '<dt>Data</dt><dd>' + h(diaBr(hoje())) + ' · gravada no envio</dd>' +
    '<dt>Inspetor</dt><dd>' + h((S.pessoa && S.pessoa.nome) || '') + (S.pessoa && S.pessoa.matricula ? ' (' + h(S.pessoa.matricula) + ')' : '') + '</dd>' +
    '<dt>Base de hoje</dt><dd>' + (b ? h(b) : 'escolha no início') + '</dd></dl></div>';
}
function avisoDoAnterior(c, etapa) {
  var n = S.pacote && S.pacote.anteriores ? anterioresDa(c).length : 0;
  return n ? '<div class="aviso atencao">' + n + (n === 1 ? ' item em aberto' : ' itens em aberto') + ' da Blitz anterior desta equipe, pessoa ou placa. Você confere na etapa ' + etapa + '.</div>' : '';
}
function rodapeDeEtapas(n, total, trava, botaoFinal) {
  return '<div class="seg-rodape seg-rodape-etapas"><div class="seg-dois">' +
    (n > 1 ? '<button type="button" class="btn secundario" data-acao="etapaVoltar">Voltar</button>' : '<span></span>') +
    (n < total ? '<button type="button" class="btn" data-acao="etapaSeguir"' + (trava ? ' disabled' : '') + '>Continuar</button>' : botaoFinal) +
    '</div>' + (trava ? '<p class="seg-sub seg-falta">' + h(trava) + '</p>' : '') + '</div>';
}
function linhaDaRevisao(titulo, texto, etapa) {
  return '<div class="seg-revisar"><div><b>' + h(titulo) + '</b><span class="seg-sub">' + texto + '</span></div><button type="button" class="link-texto" data-acao="irEtapa" data-v="' + etapa + '">alterar</button></div>';
}
/* O que apaga o Continuar (resolve-se com um toque) e o que o toque confere (depende de texto). */
function travaDaEtapa(f) {
  var n = etapaDe(f);
  if (f.tipo === 'sqp' && n === 2 && f.nova) return 'Para continuar: acrescente ou cancele a irregularidade aberta.';
  if (f.tipo === 'blitz' && n === 2) {
    var nc = Object.keys(f.resp).filter(function (k) { return f.resp[k] === 'NC'; });
    if (!Object.keys(f.resp).length) return 'Marque ao menos um item.';
    if (nc.some(function (k) { return !f.motivo[k] || !f.fotos[k]; })) return 'Não conforme precisa do motivo e da foto.';
  }
  return '';
}
function conferirAoSeguir(f) {
  var n = etapaDe(f);
  if (f.tipo === 'sqp' && n === 2 && valeSemQuem(f, chavesDoSqp(f))) return 'Diga quem vai arcar com cada vale (a matrícula).';
  if (f.tipo === 'blitz' && n === 1 && !String(f.alvoId || '').trim()) return 'Diga quem ou o que foi inspecionado (matrícula, placa ou prefixo).';
  if (f.tipo === 'blitz' && n === 3 && valeSemQuem(f, chavesDaBlitz(f))) return 'Diga quem vai arcar com cada vale (a matrícula).';
  return '';
}
function telaSqp() {
  var f = S.form = S.form || { id: novoId('sqp'), tipo: 'sqp', etapa: 1, equipe: (S.contexto && S.contexto.prefixo) || '', local: '', placa: '', condutor: '', integrantesTxt: ((S.contexto && S.contexto.equipe) || []).map(function (p) { return p.matricula; }).join(', '), fotos: [], irr: [], busca: '', nova: null, anterior: {} };
  f.fotos = f.fotos || []; if (f.integrantesTxt === undefined) f.integrantesTxt = ''; /* rascunho guardado antes da 0.6.5 não tem estes campos */
  var n = etapaDe(f), html = barraDeEtapas(ETAPAS_SQP, n);
  if (n === 1) {
    html += seletorDeBase() + quadroDoApp() + listaDePlacas() + '<div class="cartao">' + campoDaEquipe(f, 'equipe', 'Equipe (prefixo)') + campoDoEncarregado(f, 'equipe') + responsavelDaEquipe(f) + '<div class="campo"><label>Local (endereço ou referência)</label><input data-campo="local" value="' + h(f.local) + '"></div><div class="campo"><label>Placa do veículo da equipe (se houver)</label><input data-campo="placa" list="segPlacas" value="' + h(f.placa) + '" autocapitalize="characters"></div>' + placasDaEquipe(f) + sobreAPlaca(f.placa) +
      campoCondutor(f, f.placa) + pessoasInspecionadas(f) + '</div>' + avisoDoAnterior(chavesDoSqp(f), 2);
  } else if (n === 2) {
    html += f.irr.map(function (x, i) {
      var d = desvio(x.desvio); return '<div class="cartao seg-item"><b>' + h(x.desvio) + ' · ' + h(d ? d.desvio : '') + '</b><span class="selo">' + h(d ? d.nivel : '') + '</span><p class="seg-sub">Envolvidos: ' + h(x.envolvidos.join(', ') || '—') + (x.solucionadaNaHora ? ' · solucionada na hora' : '') + '</p><button type="button" class="link-texto" data-acao="tirarIrr" data-i="' + i + '">Tirar</button></div>';
    }).join('');
    if (!f.irr.length && !f.nova) html += '<p class="seg-sub">Nenhuma irregularidade até agora. Sem irregularidade, é só continuar.</p>';
    if (!f.nova) html += '<button type="button" class="btn secundario" data-acao="novaIrr">+ Irregularidade</button>';
    else html += formIrregularidade(f);
    html += painelAnterior(f, chavesDoSqp(f));
  } else if (n === 3) {
    /* As fotos da inspeção nunca travam (Dalton, 09/11/2026: "mesmo não tendo irregularidade, mantenha o campo de fotos, mas
       sem ser obrigatório"). A foto de CADA irregularidade continua obrigatória, na etapa 2: é a prova do desvio. */
    html += blocoDeFotos(f, 'Fotos da inspeção', 'Opcional: o local, a equipe, o veículo. Vale também sem irregularidade.');
  } else {
    var antS = anteriorParaEnviar(f, chavesDoSqp(f)), pessoas = matsDoTexto(f.integrantesTxt), resp = matriculaDoResponsavel(f);
    html += '<div class="cartao">' +
      linhaDaRevisao('Equipe e local', h(f.equipe || 'sem equipe') + (f.local ? ' · ' + h(f.local) : '') + (soPlaca(f.placa) ? ' · placa ' + h(soPlaca(f.placa)) + (matsDoTexto(f.condutor)[0] ? ', conduz ' + h(matsDoTexto(f.condutor)[0]) : ', sem condutor') : '') +
        '<br>' + (resp ? 'Responsável ' + h(resp) : 'Sem responsável') + ' · ' + (pessoas.length ? pessoas.length + ' pessoa(s) inspecionada(s)' : 'ninguém indicado'), 1) +
      linhaDaRevisao('Irregularidades', (f.irr.length ? f.irr.map(function (x) { return h(x.desvio); }).join(', ') : 'nenhuma') + (antS.length ? '<br>' + antS.length + ' da Blitz anterior conferido(s)' : ''), 2) +
      linhaDaRevisao('Fotos da inspeção', f.fotos.length ? f.fotos.length + ' foto(s)' : 'nenhuma (opcional)', 3) + '</div>';
  }
  return html + rodapeDeEtapas(n, ETAPAS_SQP.length, travaDaEtapa(f),
    '<button type="button" class="btn" data-acao="salvarSqp">Enviar inspeção</button>');
}
function desvio(id) { return S.pacote && S.pacote.desvios.filter(function (d) { return d.id === id; })[0]; }
/* A busca do desvio pelas palavras de quem está em campo (26/10/2026): o código, o texto, a área e as palavras de busca
   de cada item (o PALAVRAS do catálogo, que o servidor completa com as palavras padrão). "cone sem fita" acha pelas duas
   palavras que importam; o desvio que acerta mais palavras vem primeiro. As palavras curtas ("sem", "de") não contam: com
   elas, qualquer desvio que diga "sem" apareceria. */
var DESVIO_NAO_PREVISTO = 'NP-01';
function buscarDesvios(busca) {
  var ps = normalizar(busca).split(/[^a-z0-9-]+/).filter(function (w) { return w.length > 3 || /^(ca|apr|cnh|epi|epc|dds|re|nr\d+)$/.test(w); });
  if (!ps.length) return [];
  return S.pacote.desvios.map(function (d) {
    var txt = normalizar(d.id + ' ' + d.desvio + ' ' + d.area + ' ' + (d.palavras || []).join(' '));
    return { d: d, n: ps.filter(function (w) { return txt.indexOf(w) >= 0; }).length };
  }).filter(function (x) { return x.n && x.d.id !== DESVIO_NAO_PREVISTO; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8).map(function (x) { return x.d; });
}
function oQueFaltaNaIrregularidade(n) {
  var f = [];
  if (!n.desvio) f.push('escolher o desvio');
  if (!n.foto) f.push('tirar a foto');
  if (n.desvio === DESVIO_NAO_PREVISTO && String(n.obs || '').trim().length < 5) f.push('escrever o que viu');
  return f;
}
function formIrregularidade(f) {
  var n = f.nova, q = normalizar(f.busca);
  var achados = !q ? [] : buscarDesvios(f.busca), temNaoPrevisto = !!desvio(DESVIO_NAO_PREVISTO), faltaAqui = oQueFaltaNaIrregularidade(n);
  var equipe = (S.contexto && S.contexto.equipe) || [];
  return '<div class="cartao"><div class="campo"><label>Desvio (procure por palavra: perneira, escada, cone…)</label><input data-campo="busca" value="' + h(f.busca) + '"></div>' +
    achados.map(function (d) { return '<button type="button" class="seg-opcao' + (n.desvio === d.id ? ' ativo' : '') + '" data-acao="escolherDesvio" data-v="' + h(d.id) + '"><b>' + h(d.id) + '</b> ' + h(d.desvio) + ' <span class="selo">' + h(d.nivel === 'sesmt' ? 'a classificar' : d.nivel) + '</span></button>'; }).join('') +
    /* Sem achar, a tela diz que não achou e oferece o "não previsto" da Política (7.2.8): registra agora e o SESMT
       classifica depois, em vez de o inspetor desistir ou escolher um parecido, que puniria pelo nível errado. */
    (q && !achados.length ? '<p class="seg-sub">Nada com "' + h(f.busca) + '" no catálogo. Tente outra palavra' + (temNaoPrevisto ? ', ou registre como desvio não previsto:' : '.') + '</p>' : '') +
    (q && temNaoPrevisto ? '<button type="button" class="seg-opcao' + (n.desvio === DESVIO_NAO_PREVISTO ? ' ativo' : '') + '" data-acao="escolherDesvio" data-v="' + DESVIO_NAO_PREVISTO + '"><b>Desvio não previsto</b> no catálogo: descreva o que viu, e o SESMT classifica <span class="selo">a classificar</span></button>' : '') +
    (n.desvio ? '<p><b>Escolhido:</b> ' + h(n.desvio === DESVIO_NAO_PREVISTO ? 'desvio não previsto' : n.desvio) + '</p>' : '') +
    '<div class="campo"><label>Matrículas dos envolvidos (separadas por vírgula)</label><input data-nova="envolvidosTxt" inputmode="numeric" value="' + h(n.envolvidosTxt || '') + '"></div>' +
    (equipe.length ? '<div class="seg-chips">' + equipe.map(function (p) { return '<button type="button" class="chip" data-acao="addEnvolvido" data-v="' + h(p.matricula) + '">' + h(p.nome) + '</button>'; }).join('') + '</div>' : '') +
    '<div class="campo"><label>O que viu' + (n.desvio === DESVIO_NAO_PREVISTO ? ' (obrigatório no desvio não previsto)' : '') + '</label><input data-nova="obs" value="' + h(n.obs || '') + '"></div>' +
    '<button type="button" class="chip' + (n.solucionadaNaHora ? ' ativo' : '') + '" data-acao="alternar" data-c="solucionadaNaHora">Solucionada na hora</button> ' +
    '<button type="button" class="btn secundario auto' + (n.foto ? '' : ' seg-foto-obrig') + '" data-acao="fotoNova">' + (n.foto ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' +
    '<div class="seg-tres"><button type="button" class="btn auto" data-acao="addIrr"' + (faltaAqui.length ? ' disabled' : '') + '>Acrescentar</button><button type="button" class="btn fantasma auto" data-acao="cancelarIrr">Cancelar</button></div>' +
    (faltaAqui.length ? '<p class="seg-sub seg-falta">Para acrescentar, falta ' + faltaAqui.join(' e ') + '.</p>' : '') + '</div>';
}

/* ---------- a Blitz anterior e o condutor (etapa 4b, 26/10/2026) ----------
   O pedido do Dalton (24/10, 16h38): "quando eu for fazer uma nova blitz naquela mesma equipe, eu preciso ver o
   resultado da blitz anterior". A equipe muda de dia para dia, o EPI é de cada pessoa e o material do caminhão é da
   placa: por isso o que ficou em aberto é achado por TRÊS CHAVES (o prefixo, a matrícula de quem está presente e a
   placa). A lista vem no pacote, e a conferência funciona sem sinal. */
function chaveDoPrefixo(t) { return normalizar(String(t || '').split(' - ')[0]).replace(/[^a-z0-9]/g, ''); }
function soPlaca(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
/* AS PLACAS DA FROTA (01/11/2026): a lista vem no pacote, só as do estado da pessoa quando o servidor sabe a UF da base.
   O campo continua aceitando qualquer placa digitada: carro novo ou alugado pode não estar no cadastro da Frota. */
function placasDoPacote() {
  var l = (S.pacote && S.pacote.placas) || [], uf = ufDaBase(baseEscolhida());
  /* A placa sem UF fica: o cadastro da Frota não sabe de onde ela é. */
  return uf ? l.filter(function (q) { return !q.uf || q.uf === uf; }) : l;
}
function placaDaFrota(p) { var x = soPlaca(p); return x ? placasDoPacote().filter(function (q) { return q.placa === x; })[0] : null; }
function listaDePlacas() {
  var l = placasDoPacote(); if (!l.length) return '';
  return '<datalist id="segPlacas">' + l.map(function (q) { return '<option value="' + h(q.placa) + '">' + h([q.tipo || q.modelo, q.base, q.parado ? 'parado' : ''].filter(String).join(' · ')) + '</option>'; }).join('') + '</datalist>';
}
function sobreAPlaca(p) {
  var x = soPlaca(p); if (x.length < 7 || !placasDoPacote().length) return '';
  var q = placaDaFrota(x);
  return q ? '<p class="seg-sub">' + h([q.tipo || q.modelo, q.modelo && q.tipo ? q.modelo : '', q.base, q.parado ? 'parado no cadastro da Frota' : ''].filter(String).join(' · ')) + '</p>'
    : '<p class="seg-sub">Esta placa não está no cadastro da Frota. Confira; se estiver certa, pode seguir.</p>';
}
function matsDoTexto(t) { return String(t || '').split(/[^0-9]+/).map(function (m) { return m.replace(/^0+(?=\d)/, ''); }).filter(String); }
/* "B203" acha "CPL-NAN-B203" pelo fim. Menos de três letras não compara: "B2" acharia meia base. */
function mesmoPrefixo(a, b) { if (a.length < 3 || b.length < 3) return false; return a.length >= b.length ? a.slice(-b.length) === b : b.slice(-a.length) === a; }
function diaBr(d) { var p = String(d || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(d || ''); }
function anterioresDa(c) {
  var b = baseEscolhida(), l = ((S.pacote && S.pacote.anteriores) || []).filter(function (a) { return !b || !a.b || mesmaBase(String(a.b).toUpperCase(), b); });
  var p = chaveDoPrefixo(c.prefixo), pl = soPlaca(c.placa), ms = c.mats || [];
  if (!p && !pl && !ms.length) return [];
  return l.filter(function (a) {
    var am = String(a.m || '').split(',').filter(String);
    return (p && a.p && mesmoPrefixo(p, a.p)) || (pl && a.pl === pl) || ms.some(function (m) { return am.indexOf(m) >= 0; });
  });
}
function painelAnterior(f, c) {
  if (!S.pacote || !S.pacote.anteriores) return '';
  var l = anterioresDa(c);
  if (!l.length) return chaveDoPrefixo(c.prefixo) || soPlaca(c.placa) || (c.mats || []).length ? '<p class="seg-sub">Nada em aberto da Blitz anterior para esta equipe, pessoa ou placa.</p>' : '';
  f.anterior = f.anterior || {};
  var ult = l.filter(function (a) { return a.p && mesmoPrefixo(chaveDoPrefixo(c.prefixo), a.p); })[0];
  var feitos = l.filter(function (a) { return f.anterior[a.r] && f.anterior[a.r].resultado; }).length;
  return '<h2 class="seg-h2">Em aberto da Blitz anterior (' + feitos + ' de ' + l.length + ' conferido(s))</h2>' +
    (ult ? '<p class="seg-sub">A última do prefixo foi em ' + diaBr(ult.d) + (ult.n ? ', por ' + h(ult.n) : '') + '.</p>' : '') + l.map(function (a) {
      var x = f.anterior[a.r] || {}, quem = String(a.m || '').split(',').filter(String);
      return '<div class="cartao seg-item seg-anterior"><b>' + h(a.i) + '</b><small class="seg-sub">' + diaBr(a.d) + ' · ' + h(a.o) + (a.pt ? ' · ' + h(a.pt) : '') + (a.pl ? ' · ' + h(a.pl) : '') +
        (quem.length ? ' · ' + h(quem.join(', ')) : '') + (a.li ? ' · prazo ' + diaBr(a.li) : '') + '</small><div class="seg-tres">' +
        [['resolvido', 'Resolvido'], ['continua', 'Continua'], ['vale', 'Gerar vale']].map(function (y) { return '<button type="button" class="chip' + (x.resultado === y[0] ? ' ativo' : '') + '" data-acao="anterior" data-r="' + h(a.r) + '" data-v="' + y[0] + '">' + y[1] + '</button>'; }).join('') + '</div>' +
        (x.resultado === 'vale' ? '<p class="seg-sub">Quem vai arcar com o vale?</p>' + (quem.length > 1 ? '<div class="seg-chips">' + quem.map(function (m) { return '<button type="button" class="chip' + (x.matricula === m ? ' ativo' : '') + '" data-acao="valeQuem" data-r="' + h(a.r) + '" data-v="' + h(m) + '">' + h(m) + '</button>'; }).join('') + '</div>' : '') +
          '<div class="campo"><input data-vale="' + h(a.r) + '" inputmode="numeric" placeholder="Matrícula" value="' + h(x.matricula || '') + '"></div>' : '') + '</div>';
    }).join('');
}
/* Só vai o que está na lista de AGORA: quem marcou itens da B203 e trocou o prefixo para B204 não manda a conferência da
   B203 junto. */
function anteriorParaEnviar(f, c) {
  var r = f.anterior || {}, vistos = anterioresDa(c).map(function (a) { return a.r; });
  return vistos.filter(function (k) { return r[k] && r[k].resultado; }).map(function (k) { return { ref: k, resultado: r[k].resultado, matricula: r[k].resultado === 'vale' ? matsDoTexto(r[k].matricula)[0] || '' : '' }; });
}
function valeSemQuem(f, c) { return anteriorParaEnviar(f, c).filter(function (x) { return x.resultado === 'vale' && !x.matricula; }).length; }
/* O condutor, só com a placa (carta nº 1 ao Frota, §5, pelo §7º do ACT do MS): a sugestão é quem fez o checklist
   veicular daquela placa hoje, e o inspetor confirma ou troca. */
function campoCondutor(f, placa) {
  var pl = soPlaca(placa); if (!pl) return '';
  var sug = ((S.pacote && S.pacote.veicularesHoje) || {})[pl] || [];
  return '<div class="campo"><label>Quem conduz o veículo (matrícula)</label><input data-campo="condutor" inputmode="numeric" value="' + h(f.condutor || '') + '"></div>' +
    (sug.length ? '<p class="seg-sub">Fez o checklist desta placa hoje:</p><div class="seg-chips">' + sug.map(function (x) { return '<button type="button" class="chip' + (String(f.condutor) === String(x.m) ? ' ativo' : '') + '" data-acao="campo" data-c="condutor" data-v="' + h(x.m) + '">' + h(x.n || x.m) + (x.h ? ' · ' + h(x.h) : '') + '</button>'; }).join('') + '</div>' : '');
}
/* A formação do mês da Operação (Dalton, no teste do celular, 25/10/2026, 18h: "digitando o nome, aparecem os prefixos
   dessa pessoa. É o mais prático na hora"). Vem no pacote, então funciona sem sinal. O campo do
   prefixo mostra os parecidos enquanto se digita, e o encarregado acha o prefixo pelo nome ou pela matrícula. Botões, e
   não a lista própria do navegador (datalist): a tela se redesenha a cada letra para mostrar a Blitz anterior, e o
   redesenho fecharia a lista do navegador debaixo do dedo. */
function formacao() {
  var l = (S.pacote && S.pacote.formacao) || [], b = baseEscolhida();
  if (!b) return l;
  var da = l.filter(function (x) { return mesmaBase(String(x.b || '').toUpperCase(), b); });
  return da.length ? da : l;
}
/* LISTA DE EQUIPES E DE TEMAS (07/11/2026; Dalton: "Equipe/prefixo pode ser lista suspensa com base na base que a pessoa tem
   ou selecionou"). A lista de equipes é a formação do mês da Operação, só da base escolhida: a "formacao()" acima devolve a
   lista inteira quando a base não tem ninguém (para o encarregado achar o prefixo pelo nome), e uma lista suspensa com
   as equipes de todas as bases seria pior que o campo livre. Por isso aqui a base sem formação, ou ainda não escolhida,
   mostra o campo de digitar como sempre. "Outra equipe" existe porque a formação do mês pode estar atrasada: equipe nova
   no campo não pode ficar sem registro. */
var VALOR_OUTRO = '__outro__';
function equipesDaBase() {
  var b = baseEscolhida(), vistos = {}, out = [];
  if (!b) return out;
  ((S.pacote && S.pacote.formacao) || []).forEach(function (x) {
    var k = chaveDoPrefixo(x.p);
    if (!k || vistos[k] || !mesmaBase(String(x.b || '').toUpperCase(), b)) return;
    vistos[k] = 1; out.push(x);
  });
  /* Equipe desativada na formação (ATIVO = NAO) sai da lista; "Outra equipe" cobre o resto. Se a Operação ainda não
     preencheu o ATIVO de nenhuma, vale a lista inteira, em vez de uma lista vazia. */
  var ativas = out.filter(function (x) { return x.a; });
  if (ativas.length) out = ativas;
  return out.sort(function (a, c) { return String(a.p).localeCompare(String(c.p)); });
}
/* Os temas de DDS mais repetidos nas 6.948 respostas da planilha antiga (lida em 07/11/2026; 6.049 temas diferentes,
   quase todos o mesmo assunto escrito de outro jeito: "Ditais", "DITAIS", "Ditais "). Esta é a primeira lista, já sem
   as variações de caixa e de espaço. Se o servidor mandar "temasDds" no pacote, a lista dele vale e esta fica de reserva. */
var TEMAS_DDS_PADRAO = ['DITAIS', 'Ginástica laboral', 'Direção defensiva', 'APR', 'APR digital', 'Parada de segurança', 'Check list',
  'Check list de EPI e EPC', 'Movimentação de carga', 'Organização e limpeza no local de trabalho', 'Segurança no trânsito',
  'Percepção de risco', 'Abertura e fechamento de chave', 'Trabalho em equipe', 'Trabalho em altura', 'Linha de vida',
  'Animais peçonhentos', 'Teste de luvas', 'Preenchimento correto da APR', 'Regras que salvam vidas', 'Comportamento seguro',
  'Stop Work', 'Aterramento temporário', 'Proteção das mãos', 'Sinalização', 'Automedicação', '5S', 'Parceiro Amigo',
  'Motivacional', 'Comunicação', 'Janeiro Branco', 'Outubro Rosa'];
function temasDoDds() { var t = S.pacote && S.pacote.temasDds; return t && t.length ? t : TEMAS_DDS_PADRAO; }
/* Uma lista suspensa que aceita o que não está nela: "Outro" troca a lista pelo campo de digitar, e "Escolher da lista"
   volta. O valor digitado fica igual ao de antes (texto no campo), então o servidor não muda. */
function campoDeLista(f, campo, rotulo, opcoes, vazio, outro) {
  var livre = !!(f._livre && f._livre[campo]) || (!!f[campo] && !opcoes.some(function (o) { return o.v === f[campo]; }));
  if (livre) return '<div class="campo"><label>' + h(rotulo) + '</label><input data-campo="' + campo + '" value="' + h(f[campo]) + '"></div>' +
    '<button type="button" class="link-texto" data-acao="voltarLista" data-c="' + campo + '">Escolher da lista</button>';
  return '<div class="campo"><label>' + h(rotulo) + '</label><select data-campo="' + campo + '" aria-label="' + h(rotulo) + '"><option value="">' + h(vazio) + '</option>' +
    opcoes.map(function (o) { return '<option value="' + h(o.v) + '"' + (o.v === f[campo] ? ' selected' : '') + '>' + h(o.t) + '</option>'; }).join('') +
    '<option value="' + VALOR_OUTRO + '">' + h(outro) + '</option></select></div>';
}
/* Os temas do DDS (12/11/2026; Dalton: "habilitar a pesquisa e a lista dos itens ficar em forma alfabética"): um <select>
   não tem busca e o datalist do navegador fecha quando a tela se redesenha; por isso a lista é de botões e a busca só
   esconde os que não casam, sem redesenhar (o cursor fica no campo). A ordem é a alfabética do português, sem diferença
   de acento ou caixa. "Outro assunto" continua escrevendo o texto livre, igual ao de antes. */
function emOrdemAlfabetica(opcoes) { return opcoes.slice().sort(function (a, b) { return String(a.t).localeCompare(String(b.t), 'pt-BR', { sensitivity: 'base' }); }); }
function campoDoTema(f) {
  var opcoes = emOrdemAlfabetica(temasDoDds().map(function (t) { return { v: t, t: t }; }));
  var livre = !!(f._livre && f._livre.tema) || (!!f.tema && !opcoes.some(function (o) { return o.v === f.tema; }));
  if (livre) return '<div class="campo"><label>Tema</label><input data-campo="tema" value="' + h(f.tema) + '"></div>' +
    '<button type="button" class="link-texto" data-acao="voltarLista" data-c="tema">Escolher da lista</button>';
  if (f.tema) return '<div class="campo"><label>Tema</label><span class="chip seg-ok">' + h(f.tema) + ' ✓</span> <button type="button" class="link-texto" data-acao="trocarTema">trocar</button></div>';
  return '<div class="campo"><label>Tema</label><input type="search" data-busca="tema" placeholder="Buscar tema" aria-label="Buscar tema" autocomplete="off"></div>' +
    '<div class="seg-chips" data-lista-tema="1">' + opcoes.map(function (o) { return '<button type="button" class="chip" data-acao="escolherTema" data-v="' + h(o.v) + '">' + h(o.t) + '</button>'; }).join('') + '</div>' +
    '<p class="seg-sub" data-sem-tema="1" style="display:none">Nenhum tema com essa busca. Use "Outro assunto".</p>' +
    '<button type="button" class="link-texto" data-acao="temaOutro">Outro assunto (digitar)</button>';
}
function filtrarTemas(texto) {
  var q = normalizar(texto), algum = false;
  Array.prototype.forEach.call(document.querySelectorAll('[data-lista-tema] [data-acao="escolherTema"]'), function (b) {
    var casa = !q || normalizar(b.textContent).indexOf(q) >= 0; b.style.display = casa ? '' : 'none'; if (casa) algum = true;
  });
  var aviso = document.querySelector('[data-sem-tema]'); if (aviso) aviso.style.display = algum ? 'none' : '';
}
function campoDaEquipe(f, campo, rotulo) {
  var l = equipesDaBase();
  if (!l.length) return '<div class="campo"><label>' + h(rotulo) + '</label><input data-campo="' + campo + '" value="' + h(f[campo]) + '"></div>';
  return campoDeLista(f, campo, rotulo, l.map(function (x) { return { v: x.p, t: x.p + (x.n ? ' · ' + x.n : '') }; }), 'Escolha a equipe', 'Outra equipe (digitar)');
}
function campoDoEncarregado(f, alvo) {
  if (!formacao().length) return '';
  var q = normalizar(f.encarregadoBusca), soNum = q.replace(/\D/g, '');
  var achados = q.length < 3 ? [] : formacao().filter(function (x) { return x.n && (normalizar(x.n).indexOf(q) >= 0 || (soNum.length >= 3 && x.m === soNum)); }).slice(0, 8);
  var k = chaveDoPrefixo(f[alvo]), atual = formacao().filter(function (x) { return k && chaveDoPrefixo(x.p) === k; })[0];
  var parecidos = atual || k.length < 2 ? [] : formacao().filter(function (x) { return chaveDoPrefixo(x.p).indexOf(k) >= 0; }).slice(0, 8);
  return (parecidos.length ? '<div class="seg-chips">' + parecidos.map(function (x) { return '<button type="button" class="chip" data-acao="campo" data-c="' + alvo + '" data-v="' + h(x.p) + '">' + h(x.p) + (x.n ? ' · ' + h(x.n) : '') + '</button>'; }).join('') + '</div>' : '') + '<div class="campo"><label>Ou procure pelo encarregado (nome ou matrícula)</label><input data-campo="encarregadoBusca" value="' + h(f.encarregadoBusca || '') + '"></div>' +
    (achados.length ? '<div class="seg-chips">' + achados.map(function (x) { return '<button type="button" class="chip" data-acao="campo" data-c="' + alvo + '" data-v="' + h(x.p) + '">' + h(x.p) + ' · ' + h(x.n) + '</button>'; }).join('') + '</div>'
      : q.length >= 3 ? '<p class="seg-sub">Nenhum encarregado com "' + h(f.encarregadoBusca) + '" na formação do mês.</p>' : '') +
    (atual ? '<p class="seg-sub">' + h(atual.b) + ' · ' + (atual.n ? 'encarregado ' + h(atual.n) + (atual.m ? ' (' + h(atual.m) + ')' : '') : 'sem encarregado na formação do mês') + (atual.t ? ' · ' + h(atual.t) : '') + '</p>' : '');
}
/* O RESPONSÁVEL DA EQUIPE e os INSPECIONADOS (09/11/2026; Dalton: "colocar também a matrícula do responsável da equipe e das
   pessoas inspecionadas"). O responsável é o encarregado da formação do mês, na base escolhida (o mesmo prefixo pode existir
   em duas bases). Sem formação ou sem o encarregado preenchido, a tela diz isso: o inspetor não fica achando que a
   matrícula foi gravada. */
function equipeDaFormacao(prefixo) {
  var k = chaveDoPrefixo(prefixo); if (!k) return null;
  var l = formacao().filter(function (x) { return chaveDoPrefixo(x.p) === k; }), b = baseEscolhida();
  return l.filter(function (x) { return b && mesmaBase(String(x.b || '').toUpperCase(), b); })[0] || l[0] || null;
}
/* O nome e a matrícula do responsável já aparecem na linha do encarregado (campoDoEncarregado). Aqui fica o que falta
   quando a formação do mês não tem a matrícula dele (a aba estava só com o cabeçalho em 09/11/2026): o inspetor digita, e a
   tela diz que a matrícula não veio da formação, em vez de gravar a inspeção sem responsável sem ninguém notar. */
function matriculaDoResponsavel(f) {
  var x = equipeDaFormacao(f.equipe);
  return (x && x.m) || String(f.responsavel || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}
function responsavelDaEquipe(f) {
  var x = equipeDaFormacao(f.equipe);
  if (x && x.m) return '';
  if (!String(f.equipe || '').trim()) return '';
  return '<div class="campo"><label>Matrícula do responsável da equipe</label><input data-campo="responsavel" inputmode="numeric" value="' + h(f.responsavel || '') + '"></div>' +
    '<p class="seg-sub">A formação do mês não tem a matrícula do encarregado desta equipe: digite a dele.</p>';
}
function pessoasInspecionadas(f) {
  var equipe = (S.contexto && S.contexto.equipe) || [], resp = equipeDaFormacao(f.equipe), ms = matsDoTexto(f.integrantesTxt);
  var chips = equipe.map(function (p) { return { m: String(p.matricula), n: p.nome }; });
  if (resp && resp.m && !chips.some(function (c) { return c.m === resp.m; })) chips.unshift({ m: resp.m, n: (resp.n || resp.m) + ' (responsável)' });
  return '<div class="campo"><label>Matrículas das pessoas inspecionadas (separadas por vírgula)</label><input data-campo="integrantesTxt" inputmode="numeric" value="' + h(f.integrantesTxt || '') + '"></div>' +
    (chips.length ? '<div class="seg-chips">' + chips.map(function (c) { return '<button type="button" class="chip' + (ms.indexOf(c.m) >= 0 ? ' ativo' : '') + '" data-acao="addIntegrante" data-v="' + h(c.m) + '">' + h(c.n) + '</button>'; }).join('') + '</div>' : '') +
    '<p class="seg-sub">' + (ms.length ? ms.length + ' pessoa(s) na inspeção.' : 'Ninguém indicado: a inspeção fica sem a lista de pessoas.') + '</p>';
}
/* AS PLACAS DESTE PREFIXO (09/11/2026; "marcando o prefixo, já aparecem as placas que saem com ele"). A lista vem do que
   o próprio módulo já gravou (placasDasEquipes no pacote): a Operação ainda não mandou o cadastro de prefixo e placa. Só
   sugere; a lista da base e o campo livre continuam valendo. */
function placasDaEquipe(f) {
  var k = chaveDoPrefixo(f.equipe); if (!k || !S.pacote) return '';
  var b = baseEscolhida(), l = ((S.pacote.placasDasEquipes) || []).filter(function (x) { return chaveDoPrefixo(x.p) === k && (!b || mesmaBase(String(x.b || '').toUpperCase(), b)); });
  var pls = []; l.forEach(function (x) { (x.pl || []).forEach(function (p) { if (pls.indexOf(p) < 0) pls.push(p); }); });
  if (!pls.length) return '<p class="seg-sub">Nenhuma placa registrada ainda para este prefixo: digite, ou escolha da lista da base.</p>';
  return '<p class="seg-sub">Já saíram com este prefixo:</p><div class="seg-chips">' + pls.map(function (p) { return '<button type="button" class="chip' + (soPlaca(f.placa) === p ? ' ativo' : '') + '" data-acao="campo" data-c="placa" data-v="' + h(p) + '">' + h(p) + '</button>'; }).join('') + '</div>';
}
/* Fotos de um formulário com um botão só, que deixa o celular perguntar câmera ou galeria (o incidente rápido e a SQP usam o mesmo bloco). */
function blocoDeFotos(f, titulo, dica) {
  f.fotos = f.fotos || [];
  return '<div class="cartao"><b>' + h(titulo) + ' (' + f.fotos.length + ' de ' + FOTOS_POR_RELATO + ')</b><p class="seg-sub">' + h(dica) + '</p>' +
    f.fotos.map(function (id, i) { return '<span class="chip seg-ok">Foto ' + (i + 1) + ' ✓ <button type="button" class="link-texto" data-acao="tirarFotoRelato" data-i="' + i + '">tirar</button></span>'; }).join(' ') +
    (f.fotos.length < FOTOS_POR_RELATO ? '<div class="seg-tres"><button type="button" class="btn secundario auto" data-acao="fotoAdicionar">Adicionar foto</button></div>' : '') + '</div>';
}
function chavesDoSqp(f) { return { prefixo: f.equipe, placa: f.placa, mats: matsDoTexto(f.integrantesTxt) }; }
function placaDaBlitz(f) { return f.alvoTipo === 'veiculo' ? f.alvoId : f.alvoTipo === 'equipe' ? f.placa : ''; }
function chavesDaBlitz(f) { return { prefixo: f.alvoTipo === 'equipe' ? f.alvoId : '', placa: placaDaBlitz(f), mats: f.alvoTipo === 'pessoa' ? matsDoTexto(f.alvoId) : f.alvoTipo === 'equipe' ? matsDoTexto(f.integrantesTxt) : [] }; }

/* ---------- Blitz ---------- */
/* Os três botões grandes com os ícones de traço da proposta (exceção pedida pelo Dalton em 12/11/2026: o resto do bloco
   segue com emoji). Desenho em 24x24, traço 2, ponta redonda, como o quadro do App manda. O botão continua sendo o mesmo
   "campo alvoTipo" de antes: só ganhou a forma. */
var ICONES_DA_BLITZ = {
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  veiculo: '<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.4.3 4 2 4.5 5"/>'
};
function telaBlitz() {
  var f = S.form = S.form || { id: novoId('blz'), tipo: 'blitz', etapa: 1, alvoTipo: 'pessoa', alvoId: '', placa: '', condutor: '', integrantesTxt: '', cat: '', resp: {}, motivo: {}, fotos: {}, anterior: {} };
  if (!S.pacote) return '<div class="aviso atencao">A Blitz precisa do pacote (itens e catálogo). Abra com sinal uma vez.</div>';
  var cats = Object.keys(S.pacote.blitz).filter(function (c) { return f.alvoTipo === 'equipe' || S.pacote.blitz[c][0].alvo === f.alvoTipo; });
  if (cats.indexOf(f.cat) < 0) f.cat = cats[0] || '';
  var n = etapaDe(f), html = barraDeEtapas(ETAPAS_BLITZ, n), equipe = (S.contexto && S.contexto.equipe) || [];
  var nc = Object.keys(f.resp).filter(function (k) { return f.resp[k] === 'NC'; });
  if (n === 1) {
    /* Na Blitz da equipe, a placa e quem estava presente. O Controle da Blitz de hoje não tem a placa em 1.071 das 1.111
       linhas de equipe (contado em 24/10/2026), mesmo com item do caminhão; sem ela, o material não volta à placa. */
    var daEquipe = f.alvoTipo !== 'equipe' ? '' : '<div class="campo"><label>Placa do veículo da equipe (se houver)</label><input data-campo="placa" list="segPlacas" value="' + h(f.placa) + '" autocapitalize="characters"></div>' + sobreAPlaca(f.placa) +
      '<div class="campo"><label>Matrículas de quem está presente (separadas por vírgula)</label><input data-campo="integrantesTxt" inputmode="numeric" value="' + h(f.integrantesTxt) + '"></div>' +
      (equipe.length ? '<div class="seg-chips">' + equipe.map(function (p) { return '<button type="button" class="chip" data-acao="addIntegrante" data-v="' + h(p.matricula) + '">' + h(p.nome) + '</button>'; }).join('') + '</div>' : '');
    html += quadroDoApp() + listaDePlacas() + '<div class="seg-alvos">' + [['pessoa', 'Pessoa'], ['veiculo', 'Veículo'], ['equipe', 'Equipe']].map(function (x) {
      return '<button type="button" class="seg-alvo' + (f.alvoTipo === x[0] ? ' ativo' : '') + '" data-acao="campo" data-c="alvoTipo" data-v="' + x[0] + '" aria-pressed="' + (f.alvoTipo === x[0]) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONES_DA_BLITZ[x[0]] + '</svg>' + x[1] + '</button>';
    }).join('') + '</div><div class="cartao">' +
      (f.alvoTipo === 'equipe' ? campoDaEquipe(f, 'alvoId', 'Prefixo da equipe') : '<div class="campo"><label>' + { pessoa: 'Matrícula', veiculo: 'Placa' }[f.alvoTipo] + '</label><input data-campo="alvoId"' + (f.alvoTipo === 'veiculo' ? ' list="segPlacas" autocapitalize="characters"' : ' inputmode="numeric"') + ' value="' + h(f.alvoId) + '"></div>') + (f.alvoTipo === 'veiculo' ? sobreAPlaca(f.alvoId) : '') + (f.alvoTipo === 'equipe' ? campoDoEncarregado(f, 'alvoId') : '') + daEquipe + campoCondutor(f, placaDaBlitz(f)) + '</div>' +
      avisoDoAnterior(chavesDaBlitz(f), 3);
  } else if (n === 2) {
    html += '<div class="seg-chips">' + cats.map(function (c) { var k = S.pacote.blitz[c].filter(function (it) { return f.resp[chaveBlitz(c, it.item)]; }).length; return '<button type="button" class="chip' + (f.cat === c ? ' ativo' : '') + '" data-acao="campo" data-c="cat" data-v="' + h(c) + '">' + h(c) + ' <b>' + k + '/' + S.pacote.blitz[c].length + '</b></button>'; }).join('') + '</div>';
    (S.pacote.blitz[f.cat] || []).forEach(function (it) {
      var k = chaveBlitz(f.cat, it.item), r = f.resp[k];
      html += '<div class="cartao seg-item' + (r === 'NC' ? ' seg-problema' : '') + '"><b>' + h(it.item) + '</b><div class="seg-tres">' + ['C', 'NC', 'NA'].map(function (x) { return '<button type="button" class="chip' + (r === x ? ' ativo' : '') + '" data-acao="blitzResp" data-k="' + h(k) + '" data-v="' + x + '">' + { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' }[x] + '</button>'; }).join('') + '</div>' +
        (r === 'NC' ? '<div class="seg-chips">' + S.pacote.motivosNaoConforme.map(function (m) { return '<button type="button" class="chip' + (f.motivo[k] === m ? ' ativo' : '') + '" data-acao="blitzMotivo" data-k="' + h(k) + '" data-v="' + h(m) + '">' + h(m) + '</button>'; }).join('') + '</div><button type="button" class="btn secundario auto' + (f.fotos[k] ? '' : ' seg-foto-obrig') + '" data-acao="blitzFoto" data-k="' + h(k) + '">' + (f.fotos[k] ? 'Foto tirada ✓' : 'Tirar foto') + '</button>' : '') + '</div>';
    });
  } else if (n === 3) {
    html += painelAnterior(f, chavesDaBlitz(f)) || '<p class="seg-sub">Nada em aberto da Blitz anterior para conferir.</p>';
  } else {
    var antB = anteriorParaEnviar(f, chavesDaBlitz(f)), placaB = soPlaca(placaDaBlitz(f)), cond = placaB ? matsDoTexto(f.condutor)[0] : '';
    var nomeNc = nc.map(function (k) { return h(k.split(SEP_BLITZ).join(' · ')); });
    html += '<div class="cartao">' +
      linhaDaRevisao('O que foi inspecionado', { pessoa: 'Pessoa', veiculo: 'Veículo', equipe: 'Equipe' }[f.alvoTipo] + ' · ' + h(f.alvoId || '—') + (placaB && f.alvoTipo === 'equipe' ? ' · placa ' + h(placaB) : '') + (placaB ? (cond ? ' · conduz ' + h(cond) : ' · sem condutor') : '') +
        (f.alvoTipo === 'equipe' ? '<br>' + (matsDoTexto(f.integrantesTxt).length ? matsDoTexto(f.integrantesTxt).length + ' pessoa(s) presente(s)' : 'ninguém indicado como presente') : ''), 1) +
      linhaDaRevisao('Itens', Object.keys(f.resp).length + ' marcado(s) · ' + nc.length + ' não conforme' + (nc.length ? '<br>' + nomeNc.join('<br>') : ''), 2) +
      linhaDaRevisao('Blitz anterior', antB.length ? antB.length + ' item(ns) conferido(s)' : 'nada conferido', 3) + '</div>';
  }
  return html + rodapeDeEtapas(n, ETAPAS_BLITZ.length, travaDaEtapa(f),
    '<button type="button" class="btn" data-acao="salvarBlitz"' + (!Object.keys(f.resp).length || nc.some(function (k) { return !f.motivo[k] || !f.fotos[k]; }) ? ' disabled' : '') + '>Enviar Blitz</button>');
}
/* ---------- DDS ---------- */
function telaDds() {
  /* Só o DDS NA BASE. O DDS em campo é da Operação: o diário marca a presença de toda a equipe e pede a foto da lista
     de presença, revisada na base (decisão 10.10 do Dalton, 24/10/2026, 13h03). Dois donos para a mesma presença
     dariam dois números para o mesmo dia — então, mesmo aberta pela porta da Operação, esta tela registra a base. */
  var f = S.form = S.form || { id: novoId('dds'), tipo: 'dds', onde: 'base', tema: '', lista: '', paginas: {}, conf: {}, manuais: {}, fotoLista: '' };
  var aviso = S.contexto ? '<div class="aviso info">Esta é a presença do DDS feito na base. O DDS em campo, com a equipe, é marcado no diário da Operação, com a foto da lista.</div>' : '';
  var listas = (S.pacote && S.pacote.listasDds) || [];
  /* O DDS feito com a folha antiga (a lista que o sistema não emitiu) não é recusado: vai pelo informe do modelo antigo,
     para revisão (decisão do Dalton, 07/11/2026). O botão fica nas duas saídas: com lista e sem lista. */
  var antigo = '<div class="cartao"><b>A lista não saiu do sistema?</b><p class="seg-sub">Se o DDS foi feito com a folha antiga, informe como no formulário de papel. O informe vai para revisão.</p><button type="button" class="btn secundario" data-acao="abrir" data-tela="ddsAntigo">Informar no modelo antigo</button></div>';
  if (!listas.length) return aviso + '<div class="aviso atencao">Nenhuma lista do DDS dos últimos 7 dias chegou a este celular. A lista é gerada no sistema (tela "Lista do DDS"), impressa, e chega ao celular no próximo sinal.</div>' +
    '<button type="button" class="btn secundario" data-acao="buscarPacote">Buscar as listas agora</button>' + antigo;
  var html = aviso + '<div class="cartao"><b>Qual lista?</b>' + listas.map(function (l) { return '<button type="button" class="seg-opcao' + (f.lista === l.id ? ' ativo' : '') + '" data-acao="campo" data-c="lista" data-v="' + h(l.id) + '">' + h(l.base) + ' · ' + h(l.cab.data) + ' · ' + l.pessoas.length + ' pessoas</button>'; }).join('') +
    campoDoTema(f) + '</div>';
  if (!f.lista) return html + antigo;
  var lista = listas.filter(function (l) { return l.id === f.lista; })[0], lays = FolhaLista.layout(lista.pessoas, lista.cab);
  html += '<div class="cartao"><b>Fotografe cada página assinada</b><p class="seg-sub">Toque na página: o celular pergunta se é para tirar a foto agora ou pegar da galeria.</p><div class="seg-tres">' + lays.map(function (l, i) { return '<button type="button" class="btn ' + (f.paginas[i + 1] ? 'secundario' : '') + ' auto" data-acao="fotoPagina" data-p="' + (i + 1) + '">Página ' + (i + 1) + (f.paginas[i + 1] ? ' ✓' : '') + '</button>'; }).join('') + '</div>' +
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
/* ---------- DDS no modelo antigo ----------
   O "Informe de Realização DDS_COMPEL" (SMS-FORM-086) que o Dalton mostrou em 07/11/2026. Não há presença por pessoa:
   o formulário antigo só tem a CONTAGEM de administrativos e operacionais, e inventar nomes seria pior que não ter. O
   servidor guarda o informe e abre a pendência de revisão (aba DDS_PENDENTES). */
function telaDdsAntigo() {
  var f = S.form = S.form || { id: novoId('dds'), tipo: 'ddsAntigo', ministrou: String(S.pessoa.matricula || ''), inicio: '', fim: '', tema: '', tipoDds: '', cliente: '', adm: '', oper: '', fotoLista: '', fotoLista2: '', fotos: [] };
  var sel = function (campo, op) { return '<div class="seg-tres">' + op.map(function (x) { return '<button type="button" class="chip' + (f[campo] === x[0] ? ' ativo' : '') + '" data-acao="campo" data-c="' + campo + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; };
  var foto = function (rotulo, ok, acao, extra) { return '<button type="button" class="btn ' + (ok ? 'secundario ' : '') + 'auto" data-acao="' + acao + '"' + (extra || '') + '>' + rotulo + (ok ? ' ✓' : '') + '</button>'; };
  var oQueFalta = faltaNoDdsAntigo(f);
  return '<div class="aviso atencao">A lista deste DDS não foi emitida pelo sistema. O informe fica guardado e vai para revisão: a Operação ou a Segurança confere a foto da lista e dá a baixa.</div>' +
    seletorDeBase() +
    '<div class="cartao"><div class="campo"><label>Matrícula de quem ministrou' + (f.cliente === 'sim' ? ' (a do TST que estava presente)' : '') + '</label><input data-campo="ministrou" inputmode="numeric" value="' + h(f.ministrou) + '"></div>' +
    '<div class="seg-dois"><div class="campo"><label>Início</label><input type="time" data-campo="inicio" value="' + h(f.inicio) + '"></div>' +
    '<div class="campo"><label>Fim</label><input type="time" data-campo="fim" value="' + h(f.fim) + '"></div></div>' +
    campoDoTema(f) + '</div>' +
    '<div class="cartao"><b>Tipo do DDS</b>' + sel('tipoDds', [['pratico', 'Prático'], ['teorico', 'Teórico']]) +
    '<b>Houve participação do cliente?</b>' + sel('cliente', [['sim', 'Sim'], ['nao', 'Não']]) + '</div>' +
    '<div class="cartao"><b>Participantes</b><div class="seg-dois"><div class="campo"><label>Administrativos</label><input data-campo="adm" inputmode="numeric" value="' + h(f.adm) + '" placeholder="0"></div>' +
    '<div class="campo"><label>Operacionais</label><input data-campo="oper" inputmode="numeric" value="' + h(f.oper) + '" placeholder="0"></div></div></div>' +
    '<div class="cartao"><b>Fotos</b><p class="seg-sub">A lista de presença (parte 1) e a foto 1 do DDS são obrigatórias.</p>' +
    foto('Lista de presença, parte 1', f.fotoLista, 'fotoCampo', ' data-c="fotoLista"') + foto('Lista, parte 2 (se houver)', f.fotoLista2, 'fotoCampo', ' data-c="fotoLista2"') +
    [0, 1, 2].map(function (i) { return foto('Foto ' + (i + 1) + ' do DDS', f.fotos[i], 'fotoDdsAntigo', ' data-i="' + i + '"'); }).join('') + '</div>' +
    '<button type="button" class="btn" data-acao="salvarDdsAntigo"' + (oQueFalta ? ' disabled' : '') + '>Enviar informe para revisão</button>' + (oQueFalta ? '<p class="seg-sub">Falta: ' + h(oQueFalta) + '.</p>' : '');
}
/* A mesma conferência do servidor (56_DdsAntigo.gs), para o botão só acender com o informe completo; a do servidor
   continua valendo, porque o celular pode estar desatualizado. */
function faltaNoDdsAntigo(f) {
  if (faltaEscolherBase()) return 'a base de hoje';
  if (!String(f.ministrou).replace(/\D/g, '')) return 'a matrícula de quem ministrou';
  var hh = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (!hh.test(f.inicio || '') || !hh.test(f.fim || '')) return 'o início e o fim';
  if (f.fim <= f.inicio) return 'o fim depois do início';
  if (String(f.tema || '').trim().length < 3) return 'o tema';
  if (!f.tipoDds) return 'o tipo (prático ou teórico)';
  if (!f.cliente) return 'a participação do cliente';
  var n = /^\d{1,4}$/;
  if (!n.test(String(f.adm).trim()) || !n.test(String(f.oper).trim())) return 'o número de participantes (zero vale)';
  if (+f.adm + +f.oper < 1) return 'pelo menos um participante';
  if (!f.fotoLista) return 'a foto da lista (parte 1)';
  if (!f.fotos[0]) return 'a foto 1 do DDS';
  return '';
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
    return Casca.foto(arquivo, { lados: [2000], teto: 450 * 1024, semGps: !fotoFeitaAgora(arquivo) }).then(function (ft) {
      var idF = novoId('lista');
      if (!f.fotoLista) f.fotoLista = idF;
      return segGuardarFoto({ id: idF, idRegistro: f.id, blob: ft.blob, meta: ft.meta });
    });
  }).then(desenhar, function (e) { S.lido = { erro: 'Não consegui ler a foto: ' + (e && e.message || e) }; desenhar(); });
}

/* ---------- relato de acidente ou quase acidente ----------
   O pedido (Dalton, 26/10/2026, 07h35): "uma tela simples para qualquer um, mesmo offline, e depois um TST ou engenheiro
   de segurança complementa e investiga". Por isso ela pergunta pouco e com as palavras do campo, e nada do que a
   investigação decide (classificação, tipologia, causa). Sem sinal, fica guardado e sobe sozinho, como os checklists.

   O aviso do alto vem primeiro de propósito: quem se machucou precisa de socorro e do supervisor agora, por telefone. O
   relato no celular não substitui isso, e pode demorar a subir se não houver sinal. */
var TIPOS_RELATO = [['lesao', 'Alguém se machucou'], ['quase', 'Quase acidente (ninguém se machucou)'], ['transito', 'Acidente de trânsito'], ['dano', 'Dano a veículo, equipamento ou instalação']];
var FOTOS_POR_RELATO = 6;
function agoraHHMM() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function oQueFaltaNoRelato(f) {
  var l = [];
  if (!f.tipoRelato) l.push('dizer o que aconteceu');
  if (!f.data) l.push('o dia');
  if ((f.tipoRelato === 'lesao' || f.tipoRelato === 'transito') && !f.ferido) l.push('dizer quem se machucou');
  if (f.ferido === 'outro' && !String(f.feridoMatricula || '').trim() && !String(f.feridoNome || '').trim()) l.push('a matrícula ou o nome de quem se machucou');
  if (String(f.descricao || '').trim().length < 10) l.push('contar o que aconteceu (uma frase, pelo menos)');
  return l;
}
function telaRelato() {
  var f = S.form = S.form || { id: novoId('rel'), tipo: 'relato', tipoRelato: '', data: hoje(), hora: agoraHHMM(), local: '', ferido: '', feridoMatricula: '', feridoNome: '', descricao: '', naHora: '', fotos: [] };
  var sel = function (campo, op) { return '<div class="seg-chips">' + op.map(function (x) { return '<button type="button" class="chip' + (f[campo] === x[0] ? ' ativo' : '') + '" data-acao="campo" data-c="' + campo + '" data-v="' + x[0] + '">' + h(x[1]) + '</button>'; }).join('') + '</div>'; };
  var html = '<div class="aviso atencao"><div><b>Se alguém se machucou:</b> primeiro o socorro, e avise o supervisor agora, por telefone. Este relato não substitui o aviso na hora.</div></div>';
  html += '<div class="cartao"><b>O que aconteceu?</b>' + sel('tipoRelato', TIPOS_RELATO) + '</div>';
  html += '<div class="cartao"><div class="seg-dois"><div class="campo"><label>Dia</label><input type="date" data-campo="data" max="' + h(hoje()) + '" value="' + h(f.data) + '"></div>' +
    '<div class="campo"><label>Hora (mais ou menos)</label><input type="time" data-campo="hora" value="' + h(f.hora) + '"></div></div>' +
    '<div class="campo"><label>Onde (endereço, poste, trecho ou a base)</label><input data-campo="local" value="' + h(f.local) + '"></div></div>';
  if (f.tipoRelato === 'lesao' || f.tipoRelato === 'transito') {
    html += '<div class="cartao"><b>Quem se machucou?</b>' + sel('ferido', [['eu', 'Eu'], ['outro', 'Outra pessoa'], ['ninguem', 'Ninguém']]) +
      (f.ferido === 'outro' ? '<div class="seg-dois"><div class="campo"><label>Matrícula (se souber)</label><input data-campo="feridoMatricula" inputmode="numeric" value="' + h(f.feridoMatricula) + '"></div>' +
        '<div class="campo"><label>Nome</label><input data-campo="feridoNome" value="' + h(f.feridoNome) + '"></div></div>' : '') + '</div>';
  }
  html += '<div class="cartao"><div class="campo"><label>Conte o que aconteceu</label><textarea data-campo="descricao" rows="5" class="seg-texto">' + h(f.descricao) + '</textarea></div>' +
    '<div class="campo"><label>O que foi feito na hora (se algo foi feito)</label><textarea data-campo="naHora" rows="2" class="seg-texto">' + h(f.naHora) + '</textarea></div></div>';
  html += '<div class="cartao"><b>Fotos (' + f.fotos.length + ' de ' + FOTOS_POR_RELATO + ')</b><p class="seg-sub">Do lugar, do equipamento ou do veículo. Não precisa fotografar ferimento.</p>' +
    f.fotos.map(function (id, i) { return '<span class="chip seg-ok">Foto ' + (i + 1) + ' ✓ <button type="button" class="link-texto" data-acao="tirarFotoRelato" data-i="' + i + '">tirar</button></span>'; }).join(' ') +
    (f.fotos.length < FOTOS_POR_RELATO ? '<button type="button" class="btn secundario auto" data-acao="fotoRelato">Tirar foto</button>' : '') + '</div>';
  var faltam = oQueFaltaNoRelato(f);
  return html + '<button type="button" class="btn" data-acao="salvarRelato"' + (faltam.length ? ' disabled' : '') + '>Enviar o relato</button>' +
    (faltam.length ? '<p class="seg-sub seg-falta">Para enviar, falta ' + faltam.join(', ') + '.</p>' : '<p class="seg-sub">Vai para a engenharia de segurança, com o seu nome. Sem sinal, sobe sozinho depois.</p>');
}

/* ---------- o incidente rápido (decisão do Dalton, 27/10/2026, 20h07; App nº 7) ----------
   Para quem é de campo, só três coisas: onde aconteceu, o que aconteceu e a foto (o exemplo dele: bater numa cerca). É
   diferente do relato do técnico de segurança, que pergunta quem se machucou, o dia e a hora: aqui o dia e a hora são os
   de agora, e ninguém se machucou (quem se machucou usa o relato de acidente, que pede o socorro primeiro). No servidor
   ele entra como os outros relatos, com a situação "Relatado no celular", para o técnico completar.
   O VÍDEO: o Dalton decidiu que não há limite de duração (01/11, carta ao App nº 8). Hoje a casca só tira foto (App nº 8,
   01/11): o vídeo entra nesta tela quando a casca guardar e mandar vídeo. */
function oQueFaltaNoIncidente(f) {
  var l = [];
  if (!String(f.local || '').trim()) l.push('dizer onde foi');
  if (String(f.descricao || '').trim().length < 10) l.push('contar o que aconteceu (uma frase, pelo menos)');
  return l;
}
function telaIncidente() {
  var f = S.form = S.form || { id: novoId('inc'), tipo: 'incidente', local: '', descricao: '', fotos: [] };
  var html = '<div class="cartao"><div class="campo"><label>Onde foi (endereço, poste, trecho ou a base)</label><input data-campo="local" value="' + h(f.local) + '"></div>' +
    '<div class="campo"><label>O que aconteceu</label><textarea data-campo="descricao" rows="4" class="seg-texto" placeholder="Ex.: o caminhão encostou na cerca ao manobrar">' + h(f.descricao) + '</textarea></div></div>';
  html += blocoDeFotos(f, 'Fotos', 'Do lugar e do que foi danificado.');
  var faltam = oQueFaltaNoIncidente(f);
  return html + '<button type="button" class="btn" data-acao="salvarIncidente"' + (faltam.length ? ' disabled' : '') + '>Enviar</button>' +
    (faltam.length ? '<p class="seg-sub seg-falta">Para enviar, falta ' + faltam.join(', ') + '.</p>' : '<p class="seg-sub">Vai para a engenharia de segurança, com o seu nome, a hora de agora e a sua base. Sem sinal, sobe sozinho depois.</p>');
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
  return '<div class="cartao"><b>Neste mês, neste celular</b><p>Checklists de EPI/EPC: <b>' + conta('epi') + '</b><br>Testes de luvas: <b>' + conta('luvas') + '</b><br>Checklists veiculares: <b>' + conta('veicular') + '</b><br>Relatos de acidente ou quase acidente: <b>' + conta('relato') + '</b></p><p class="seg-sub">Sem percentual de propósito: o número que vale para a Campanha é o do seu extrato, na área pessoal.</p></div>';
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
  if (t.dataset.busca === 'tema') { filtrarTemas(t.value); return; }
  if (t.dataset.nova && f.nova) { f.nova[t.dataset.nova] = t.value; if (t.dataset.nova === 'obs' && f.nova.desvio === DESVIO_NAO_PREVISTO) redesenharMantendoFoco(t); }
  if (t.dataset.campo) {
    /* "Outro" nas listas de equipe e de tema: vira campo de digitar, vazio, para não gravar o texto interno da opção. */
    if (t.tagName === 'SELECT' && t.value === VALOR_OUTRO) { f._livre = f._livre || {}; f._livre[t.dataset.campo] = true; f[t.dataset.campo] = ''; guardarRascunho(); return desenhar(); }
    f[t.dataset.campo] = t.value;
    /* O km avisa sem redesenhar a tela: só troca o texto do aviso, para o cursor não sair do campo. */
    if (f.tipo === 'veicular' && t.dataset.campo === 'km') atualizarAvisoDoKm(false);
    // No relato, o botão de enviar depende do que se digita: redesenha mantendo o cursor onde estava.
    if (t.dataset.campo === 'busca' || (f.tipo === 'relato' && /^(descricao|feridoMatricula|feridoNome|data)$/.test(t.dataset.campo)) ||
      (f.tipo === 'incidente' && /^(descricao|local)$/.test(t.dataset.campo)) || (f.tipo === 'veicular' && t.dataset.campo === 'placa') ||
      (f.tipo === 'ddsAntigo' && /^(ministrou|inicio|fim|tema|adm|oper)$/.test(t.dataset.campo))) redesenharMantendoFoco(t);
    // A Blitz anterior e a sugestão do condutor aparecem enquanto se digita o prefixo, a placa ou quem está presente.
    else if ((f.tipo === 'blitz' && /^(alvoId|placa|integrantesTxt|encarregadoBusca)$/.test(t.dataset.campo)) || (f.tipo === 'sqp' && /^(equipe|placa|encarregadoBusca|integrantesTxt)$/.test(t.dataset.campo))) redesenharMantendoFoco(t);
  }
  if (t.dataset.vale && f.anterior && f.anterior[t.dataset.vale]) f.anterior[t.dataset.vale].matricula = t.value;
  if (t.dataset.obs !== undefined) f.obs[f._itens[+t.dataset.obs]] = t.value;
  if (t.dataset.manual) { f.manuais[t.dataset.manual] = t.value.replace(/\D/g, ''); }
  guardarRascunho();
});
/* Texto digitado NÃO redesenha a tela ao sair do campo: redesenhar no "change" troca o botão debaixo do dedo, e o toque
   que vem logo depois de digitar se perde (a bateria pegou em 23/10/2026: o "+ Irregularidade" não respondia). O que
   depende de texto é conferido no toque do botão, com a frase do que falta. */
document.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.id === 'arquivoFoto') aoEscolherFoto(t.files[0]);
  /* Ao sair do campo do km, o aviso vale mesmo para o número curto (ver avisoDoKm). */
  if (t.dataset && t.dataset.campo === 'km' && S.form && S.form.tipo === 'veicular') atualizarAvisoDoKm(true);
  /* Alguns navegadores de celular só avisam a escolha numa lista suspensa pelo "change", e não pelo "input": repassa para
     o mesmo tratamento, só se o valor ainda não foi lido. */
  if (t.tagName === 'SELECT' && t.dataset.campo && S.form && t.value !== S.form[t.dataset.campo] && !(t.value === VALOR_OUTRO && S.form._livre && S.form._livre[t.dataset.campo])) t.dispatchEvent(new Event('input', { bubbles: true }));
});
function falta(msg) { S.msg = msg; desenhar(); return true; }
function redesenharMantendoFoco(el) {
  var qual = el.dataset.campo ? '[data-campo="' + el.dataset.campo + '"]' : '[data-nova="' + el.dataset.nova + '"]', pos = el.selectionStart;
  desenhar();
  var n = document.querySelector(qual); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } }
}

document.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-acao]'); if (!b || b.disabled) return;
  var a = b.dataset.acao, f = S.form, v = b.dataset.v;
  if (a === 'voltarApp') return Casca.voltar();
  if (a === 'inicio') return voltarDaTela();
  if (a === 'escolherBase') { S.baseDia = v; S.msg = ''; return segGravarConfig('baseDia:' + S.pessoa.matricula, { dia: hoje(), base: v }).then(desenhar); }
  if (a === 'abrir') return ir(b.dataset.tela);
  if (a === 'equipe') return ir('equipe');
  if (a === 'fila') return ir('fila');
  if (a === 'enviarAgora' || a === 'buscarPacote') return segGravarConfig('pacoteEm', null).then(function () { return enviarEAtualizar(0); }).then(carregarLocal).then(desenhar);
  if (a === 'reenviar') return SEG_BANCO.ler('registros', b.dataset.id).then(function (r) { if (!r) return; r.estado = 'guardado'; r.ultimoErro = ''; return SEG_BANCO.gravar('registros', r); }).then(function () { return enviarEAtualizar(0); }).then(carregarLocal).then(desenhar);
  if (a === 'fazerPor') { var p = S.contexto.equipe.filter(function (x) { return String(x.matricula) === String(b.dataset.m); })[0]; return ir(b.dataset.t, p); }
  if (a === 'estadoItem') { f.estados[f._itens[+b.dataset.i]] = v; return desenhar(); }
  if (a === 'todosOk') { var bom = f.tipo === 'veicular' ? 'aprovado' : 'ok'; f._itens.forEach(function (it) { if (!f.estados[it]) f.estados[it] = bom; }); return desenhar(); }
  if (a === 'fotoItem') return pedirFoto(function (id) { f.fotos[f._itens[+b.dataset.i]] = id; });
  /* Luvas reprovadas continuam só com a câmera (a foto é do par naquele momento); a lista do DDS aceita a galeria (12/11/2026). */
  if (a === 'fotoCampo') return pedirFoto(function (id) { f[b.dataset.c] = id; }, false, false, /^fotoLista2?$/.test(b.dataset.c || ''));
  if (a === 'rosto') return pedirFoto(function (id) { f.rosto = id; }, true);
  if (a === 'campo') { f[b.dataset.c] = v; return desenhar(); }
  if (a === 'escolherTema') { f.tema = b.dataset.v; f._livre = f._livre || {}; f._livre.tema = false; guardarRascunho(); return desenhar(); }
  if (a === 'trocarTema') { f.tema = ''; guardarRascunho(); return desenhar(); }
  if (a === 'temaOutro') { f._livre = f._livre || {}; f._livre.tema = true; f.tema = ''; guardarRascunho(); return desenhar(); }
  if (a === 'voltarLista') { f._livre = f._livre || {}; f._livre[b.dataset.c] = false; f[b.dataset.c] = ''; return desenhar(); }
  if (a === 'alternar') { f.nova[b.dataset.c] = !f.nova[b.dataset.c]; return desenhar(); }
  if (a === 'novaIrr') { f.nova = { desvio: '', foto: '' }; f.busca = ''; return desenhar(); }
  if (a === 'cancelarIrr') { f.nova = null; return desenhar(); }
  if (a === 'escolherDesvio') { f.nova.desvio = v; return desenhar(); }
  if (a === 'addEnvolvido') { f.nova.envolvidosTxt = (f.nova.envolvidosTxt ? f.nova.envolvidosTxt + ', ' : '') + v; return desenhar(); }
  if (a === 'fotoNova') return pedirFoto(function (id) { f.nova.foto = id; });
  if (a === 'addIrr') { f.irr.push({ desvio: f.nova.desvio, envolvidos: String(f.nova.envolvidosTxt || '').split(/[,;\s]+/).filter(String), foto: f.nova.foto, obs: f.nova.obs || '', solucionadaNaHora: !!f.nova.solucionadaNaHora }); f.nova = null; return desenhar(); }
  if (a === 'tirarIrr') { f.irr.splice(+b.dataset.i, 1); return desenhar(); }
  if (a === 'blitzResp') { f.resp[b.dataset.k] = v; return desenhar(); }
  if (a === 'anterior') {
    f.anterior = f.anterior || {};
    var item = ((S.pacote && S.pacote.anteriores) || []).filter(function (x) { return x.r === b.dataset.r; })[0] || {}, quem = String(item.m || '').split(',').filter(String), antes = f.anterior[b.dataset.r] || {};
    // Uma pessoa só no item: o vale já nasce no nome dela, e o inspetor troca se precisar.
    f.anterior[b.dataset.r] = { resultado: v, matricula: antes.matricula || (v === 'vale' && quem.length === 1 ? quem[0] : '') };
    return desenhar();
  }
  if (a === 'valeQuem') { f.anterior[b.dataset.r].matricula = v; return desenhar(); }
  /* O toque no nome já marcado desmarca (antes acrescentava de novo, e a lista ficava com a matrícula duas vezes). */
  if (a === 'addIntegrante') { var jaTem = matsDoTexto(f.integrantesTxt), vv = matsDoTexto(v)[0]; f.integrantesTxt = (jaTem.indexOf(vv) >= 0 ? jaTem.filter(function (m) { return m !== vv; }) : jaTem.concat(vv)).join(', '); return desenhar(); }
  if (a === 'blitzMotivo') { f.motivo[b.dataset.k] = v; return desenhar(); }
  if (a === 'blitzFoto') return pedirFoto(function (id) { f.fotos[b.dataset.k] = id; });
  if (a === 'conf') { f.conf[b.dataset.m] = v === '1'; return desenhar(); }
  if (a === 'fotoPagina') { var pg = +b.dataset.p; fotoPendente = null; var i = $('arquivoFoto'); i.removeAttribute('capture'); i.value = ''; i.onchange = function () { i.onchange = null; lerPagina(i.files[0], pg); }; i.click(); return; }
  /* As etapas do SQP e da Blitz: a tela volta ao alto a cada troca, como quando a tela muda. */
  if (a === 'etapaSeguir') { var fe = conferirAoSeguir(f); if (fe && falta(fe)) return; f.etapa = etapaDe(f) + 1; S.msg = ''; guardarRascunho(); desenhar(); window.scrollTo(0, 0); return; }
  if (a === 'etapaVoltar') { f.etapa = etapaDe(f) - 1; S.msg = ''; guardarRascunho(); desenhar(); window.scrollTo(0, 0); return; }
  if (a === 'irEtapa') { f.etapa = +v; etapaDe(f); S.msg = ''; guardarRascunho(); desenhar(); window.scrollTo(0, 0); return; }
  if (a === 'salvarEpi') return concluir({ id: f.id, tipo: 'epi', funcao: (S.alvo || {}).funcao || (S.pacote && S.pacote.pessoa.funcao) || '', fotoRosto: f.rosto,
    itens: f._itens.map(function (it) { return { item: it, estado: f.estados[it], obs: f.obs[it] || '', foto: f.fotos[it] || '' }; }) }, 'Checklist de EPI/EPC salvo.');
  if (a === 'luvaCampo') { luvasDaRodada(f)[+b.dataset.i][b.dataset.c] = v; return desenhar(); }
  if (a === 'luvaTirar') { luvasDaRodada(f).splice(+b.dataset.i, 1); return desenhar(); }
  if (a === 'luvaFoto') return pedirFoto(function (id) { luvasDaRodada(f)[+b.dataset.i].foto = id; });
  if (a === 'luvaSugerida') { if (luvasDaRodada(f).length < MAX_LUVAS_NA_RODADA) f.itens.push({ codigo: v, classe: b.dataset.k, inflagem: '', visual: '', foto: '' }); return desenhar(); }
  if (a === 'luvaAdicionar') {
    var cod = String(f.novoCodigo || '').trim();
    if (!CODIGO_DE_LUVA.test(cod) && falta('Digite o número da luva (letras, números, ponto, barra ou hífen, sem espaço).')) return;
    if (!f.novaClasse && falta('Escolha a classe da luva.')) return;
    if (luvasDaRodada(f).some(function (x) { return x.codigo.toUpperCase() === cod.toUpperCase(); }) && falta('Essa luva já está na lista.')) return;
    f.itens.push({ codigo: cod, classe: f.novaClasse, inflagem: '', visual: '', foto: '' }); f.novoCodigo = ''; S.msg = ''; return desenhar();
  }
  if (a === 'salvarLuvas' && faltaDasLuvas(f) && falta(faltaDasLuvas(f))) return;
  if (a === 'salvarLuvas') {
    var reprovadas = luvasDaRodada(f).filter(luvaReprovada).map(function (x) { return x.codigo; });
    return concluir({ id: f.id, tipo: 'luvas', fotoRosto: f.rosto, luvas: { itens: f.itens.map(function (x) { return { codigo: x.codigo, classe: x.classe, inflagem: x.inflagem, visual: x.visual, foto: x.foto || '' }; }) } },
      reprovadas.length ? 'Reprovada(s): ' + reprovadas.join(', ') + '. Só ela(s) sai(em) de uso.' : 'Teste de luvas salvo.');
  }
  if (a === 'salvarVeicular' && !String(f.placa).trim() && falta('Digite a placa do veículo.')) return;
  if (a === 'salvarVeicular') { var reg = { id: f.id, tipo: 'veicular', fotoRosto: f.rosto, veiculo: { placa: f.placa, tipo: f.tipoV, km: kmDoCampo(f.km) }, retido: !!(f._retidos.length && S.pacote.retencaoLigada),
    itens: f._itens.map(function (it) { return { item: it.replace(/^Lataria /, 'Lataria '), estado: f.estados[it], obs: f.obs[it] || '', foto: f.fotos[it] || '' }; }) };
    return concluir(reg, reg.retido ? 'VEÍCULO RETIDO: não saia com ele até um superior liberar.' : 'Checklist veicular salvo.'); }
  if (a === 'salvarSqp' && f.nova && falta('Acrescente ou cancele a irregularidade aberta, na etapa 2.')) return;
  if (a === 'salvarSqp' && valeSemQuem(f, chavesDoSqp(f)) && falta('Diga quem vai arcar com cada vale (a matrícula).')) return;
  if (a === 'salvarSqp') { var antS = anteriorParaEnviar(f, chavesDoSqp(f));
    return concluir({ id: f.id, tipo: 'sqp', inspecao: { equipe: f.equipe, local: f.local, placa: f.placa, condutor: soPlaca(f.placa) ? matsDoTexto(f.condutor)[0] || '' : '', irregularidades: f.irr, anterior: antS, integrantes: matsDoTexto(f.integrantesTxt), responsavel: matriculaDoResponsavel(f), fotos: f.fotos.slice() } },
      'Inspeção SQP salva (' + f.irr.length + ' irregularidade(s)' + (antS.length ? ', ' + antS.length + ' da Blitz anterior conferido(s)' : '') + ').'); }
  if (a === 'salvarBlitz' && !String(f.alvoId).trim() && falta('Diga quem ou o que foi inspecionado (matrícula, placa ou prefixo).')) return;
  if (a === 'salvarBlitz' && valeSemQuem(f, chavesDaBlitz(f)) && falta('Diga quem vai arcar com cada vale (a matrícula).')) return;
  if (a === 'salvarBlitz') {
    /* Os envolvidos de cada não conforme: a pessoa inspecionada; na equipe, quem estava presente (como o Controle da Blitz
       de hoje faz com os integrantes); no veículo, quem conduz. */
    var placaB = soPlaca(placaDaBlitz(f)), condutor = placaB ? matsDoTexto(f.condutor)[0] || '' : '', presentes = f.alvoTipo === 'equipe' ? matsDoTexto(f.integrantesTxt) : [];
    var envolvidos = f.alvoTipo === 'pessoa' ? [f.alvoId] : f.alvoTipo === 'equipe' ? presentes : condutor ? [condutor] : [];
    var irr = Object.keys(f.resp).filter(function (k) { return f.resp[k] === 'NC'; }).map(function (k) {
      var p = k.split(SEP_BLITZ), it = (S.pacote.blitz[p[0]] || []).filter(function (x) { return x.item === p[1]; })[0];
      return it ? { desvio: it.desvio, envolvidos: envolvidos.slice(), itemBlitz: p[0] + ' · ' + it.item, motivo: f.motivo[k], foto: f.fotos[k] } : null;
    }).filter(Boolean), antB = anteriorParaEnviar(f, chavesDaBlitz(f));
    return concluir({ id: f.id, tipo: 'blitz', inspecao: { alvo: { tipo: f.alvoTipo, id: f.alvoId }, placa: placaB, condutor: condutor, integrantes: presentes, irregularidades: irr, anterior: antB } },
      'Blitz salva (' + irr.length + ' não conforme' + (antB.length ? ', ' + antB.length + ' da anterior conferido(s)' : '') + ').');
  }
  if (a === 'fotoRelato') return pedirFoto(function (id) { if (f.fotos.length < FOTOS_POR_RELATO) f.fotos.push(id); });
  if (a === 'fotoAdicionar') return pedirFoto(function (id) { if (f.fotos.length < FOTOS_POR_RELATO) f.fotos.push(id); }, false, false, true);
  if (a === 'tirarFotoRelato') { f.fotos.splice(+b.dataset.i, 1); return desenhar(); }
  if (a === 'salvarIncidente') {
    if (oQueFaltaNoIncidente(f).length && falta('Para enviar, falta ' + oQueFaltaNoIncidente(f).join(', ') + '.')) return;
    return concluir({ id: f.id, tipo: 'relato', relato: { tipo: 'incidente', data: hoje(), hora: agoraHHMM(), local: String(f.local).trim(), ferido: 'ninguem',
      feridoMatricula: '', feridoNome: '', descricao: String(f.descricao).trim(), naHora: '', fotos: f.fotos.slice() } }, 'Incidente salvo. Um técnico de segurança vai completar.');
  }
  if (a === 'salvarRelato') {
    if (oQueFaltaNoRelato(f).length && falta('Para enviar, falta ' + oQueFaltaNoRelato(f).join(', ') + '.')) return;
    var fer = f.tipoRelato === 'lesao' || f.tipoRelato === 'transito' ? f.ferido || 'ninguem' : 'ninguem';
    return concluir({ id: f.id, tipo: 'relato', relato: { tipo: f.tipoRelato, data: f.data, hora: f.hora, local: String(f.local).trim(), ferido: fer,
      feridoMatricula: fer === 'outro' ? String(f.feridoMatricula).replace(/\D/g, '') : '', feridoNome: fer === 'outro' ? String(f.feridoNome).trim() : '',
      descricao: String(f.descricao).trim(), naHora: String(f.naHora).trim(), fotos: f.fotos.slice() } }, 'Relato salvo. Um técnico de segurança vai completar e investigar.');
  }
  if (a === 'fotoDdsAntigo') { var iF = +b.dataset.i; return pedirFoto(function (id) { f.fotos[iF] = id; }, false, false, true); }
  if (a === 'salvarDdsAntigo') {
    var que = faltaNoDdsAntigo(f); if (que && falta('Para enviar, falta ' + que + '.')) return;
    return concluir({ id: f.id, tipo: 'dds', dds: { modelo: 'antigo', onde: 'base', ministrou: String(f.ministrou).replace(/\D/g, ''), inicio: f.inicio, fim: f.fim, tema: String(f.tema).trim(),
      tipoDds: f.tipoDds, cliente: f.cliente, participantesAdm: String(f.adm).trim(), participantesOper: String(f.oper).trim(), fotoLista: f.fotoLista, fotoLista2: f.fotoLista2 || '',
      fotos: f.fotos.filter(function (x) { return !!x; }) } }, 'Informe do DDS enviado: a lista não saiu do sistema, então vai para revisão.');
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
