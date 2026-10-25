/* envio.js — a fila do bloco Segurança no App Compel (23/10/2026).
 *
 * Roda na tela E no service worker da casca (blocos/README.md): por isso nada de `document` nem `window`. O que está
 * aqui é só do bloco — o que vai em cada envio, a ordem e o que fazer com cada resposta do servidor SEGURANCA. O
 * endereço conferido pelo resumo, a trava, a paciência do segundo plano e a sessão de cada pessoa vêm do `ctx`.
 *
 * A ORDEM, e por quê:
 *   1. as fotos de um registro antes do registro (a mesma ordem do campo/ da Operação): o registro cita as fotos pelo
 *      ID, e o servidor que recebe um registro sem a foto não tem como pedi-la depois;
 *   2. cada registro sobe com a sessão de quem o FEZ (carimbo.feitoPor). No celular do encarregado, o checklist feito
 *      em nome do José sobe com a sessão do encarregado, que é quem estava com o celular (D20);
 *   3. depois dos registros, o pacote do dia (catálogo, itens, listas do DDS), se houver sessão: é o mesmo caminho
 *      conferido, e assim o celular atualiza o que sabe sempre que manda alguma coisa.
 *
 * O QUE FAZER COM CADA RESPOSTA:
 *   ok ou jaTinha  → enviado (o servidor não grava duas vezes: com sinal e sem resposta, a fila manda de novo);
 *   sessaoExpirada → para aquela pessoa, apaga a sessão guardada dela (para a tela pedir outra com sinal) e espera;
 *   recusa: true   → a regra do servidor disse não (perfil, base, documento): fica "recusado", com a frase, e a fila
 *                    não insiste. A tela tem "mandar de novo" para quando a regra mudar;
 *   qualquer outro "não" (servidor ocupado, tempo esgotado, Núcleo fora) → continua guardado e vai na próxima. Até
 *                    23/10/2026 esse "não" do momento também virava "recusado", e o checklist do pico das 7h se perdia
 *                    (revisão independente);
 *   erro de rede   → para tudo; o que não subiu espera, e a casca tenta de novo.
 */
var SEG_BANCO = cascaBanco('seguranca-bloco', 1, { registros: 'id', fotos: 'id', config: 'chave' });
var SEG_PACOTE_MINUTOS = 10;
var SEG_DIAS_GUARDADOS = 35;   // o enviado fica no celular para o "Meus dados" do mês; depois disso sai

function segGuardarRegistro(r) { r.estado = 'guardado'; r.guardadoEm = new Date().toISOString(); return SEG_BANCO.gravar('registros', r); }
function segGuardarFoto(f) { f.estado = 'guardada'; f.guardadaEm = new Date().toISOString(); return SEG_BANCO.gravar('fotos', f); }
function segConfig(chave) { return SEG_BANCO.ler('config', chave).then(function (x) { return x ? x.valor : undefined; }); }
function segGravarConfig(chave, valor) { return SEG_BANCO.gravar('config', { chave: chave, valor: valor }); }

function segEsperando() {
  return SEG_BANCO.listar('registros').then(function (l) {
    return l.filter(function (r) { return r.estado === 'guardado'; }).sort(function (a, b) { return a.carimbo.feitoEm < b.carimbo.feitoEm ? -1 : 1; });
  });
}

/* Blob → base64, sem FileReader (no service worker do Chrome ele existe, mas o arrayBuffer é o caminho que não depende
   de nada da tela). Em pedaços: String.fromCharCode com 200 mil argumentos estoura a pilha. */
function segBase64(blob) {
  return blob.arrayBuffer().then(function (buf) {
    var b = new Uint8Array(buf), s = '', passo = 0x8000;
    for (var i = 0; i < b.length; i += passo) s += String.fromCharCode.apply(null, b.subarray(i, i + passo));
    return btoa(s);
  });
}

function segEnviarFotosDe(ctx, registro, sessao) {
  return SEG_BANCO.listar('fotos').then(function (todas) {
    var minhas = todas.filter(function (f) { return f.idRegistro === registro.id && f.estado !== 'enviada'; });
    var i = 0;
    function proxima() {
      if (i >= minhas.length) return Promise.resolve({ ok: true });
      var f = minhas[i++];
      return segBase64(f.blob).then(function (b64) {
        return ctx.postar({ acao: 'foto', sessao: sessao, foto: { id: f.id, idRegistro: f.idRegistro, dia: registro.dia, base64: b64, meta: f.meta || {} } });
      }).then(function (r) {
        if (r && r.sessaoExpirada) return { sessaoExpirada: true };
        if (r && r.recusa) return { recusa: true, erro: 'a foto foi recusada: ' + (r.erro || '') };
        if (!r || !r.ok) return { erro: (r && r.erro) || 'a foto não subiu agora' };
        f.estado = 'enviada'; f.blob = null;   // a foto enviada sai do celular: o servidor guardou, e o espaço é da equipe
        return SEG_BANCO.gravar('fotos', f).then(proxima);
      });
    }
    return proxima();
  });
}

function segAtualizarPacote(ctx) {
  return segConfig('ultimaMatricula').then(function (mat) {
    if (!mat) return null;
    return ctx.sessaoDe(mat).then(function (sessao) {
      if (!sessao) return null;
      return Promise.all([segConfig('pacote'), segConfig('pacoteEm')]).then(function (v) {
        var atual = v[0];
        /* No máximo a cada 10 minutos: cada envio pedia o pacote, e cada pedido custa ao servidor a leitura do catálogo
           e da tabela de funções (revisão de 23/10/2026). Sem pacote, pede sempre. */
        if (atual && v[1] && Date.now() - new Date(v[1]).getTime() < SEG_PACOTE_MINUTOS * 60000) return null;
        return ctx.postar({ acao: 'pacote', sessao: sessao, versaoQueTenho: atual && atual.versao || '' }).then(function (p) {
          if (p && p.ok && !p.igual) return segGravarConfig('pacote', p).then(function () { return segGravarConfig('pacoteEm', new Date().toISOString()); });
          if (p && p.ok && p.igual) return segGravarConfig('pacoteEm', new Date().toISOString());
          return null;
        });
      });
    });
  }).catch(function () { return null; });   // o pacote é bônus do envio: falhar nele não pode marcar o envio como falho
}

/* O enviado fica 35 dias (o "Meus dados" do mês) e sai. E as FOTOS órfãs também saem (revisão de 23/10/2026): a foto
   de um formulário abandonado, ou de um registro que já saiu, ficava no celular para sempre. Órfã é a foto guardada há
   mais de 3 dias cujo registro não está no banco e que não é do rascunho aberto. */
function segLimparVelhos() {
  var limite = new Date(Date.now() - SEG_DIAS_GUARDADOS * 86400000).toISOString(), tres = new Date(Date.now() - 3 * 86400000).toISOString();
  return Promise.all([SEG_BANCO.listar('registros'), SEG_BANCO.listar('fotos'), segConfig('rascunho')]).then(function (v) {
    var regs = v[0] || [], fotos = v[1] || [], rasc = v[2], vivos = {};
    var sai = regs.filter(function (r) { return (r.estado === 'enviado' && r.enviadoEm < limite) || (r.estado === 'recusado' && r.guardadoEm < limite); });
    var saem = {}; sai.forEach(function (r) { saem[r.id] = true; });
    regs.forEach(function (r) { if (!saem[r.id]) vivos[r.id] = true; });
    if (rasc && rasc.form && rasc.form.id) vivos[rasc.form.id] = true;
    var orfas = fotos.filter(function (f) { return !vivos[f.idRegistro] && f.guardadaEm && f.guardadaEm < tres; });
    return Promise.all(sai.map(function (r) { return SEG_BANCO.apagar('registros', r.id); }).concat(orfas.map(function (f) { return SEG_BANCO.apagar('fotos', f.id); })));
  });
}

cascaBlocoEnvia('seguranca', {
  pendentes: function () { return segEsperando().then(function (l) { return l.length; }); },
  enviar: function (ctx) {
    var resumo = { enviados: 0, pendentes: 0, erro: '', semRede: false, servidorFora: false }, semSessao = {};
    /* A sessão que o servidor diz vencida (ou cortada) sai do banco do bloco: a tela olha esse registro para saber se
       precisa pedir outra, e sem apagar ela achava que tinha sessão por 30 dias (revisão de 23/10/2026). */
    function sessaoVenceu(mat) { semSessao[mat] = true; resumo.erro = 'A sessão venceu: abra o Segurança com sinal.'; return segGravarConfig('sessao:' + mat, null); }
    return segEsperando().then(function (fila) {
      var i = 0;
      function proximo() {
        if (i >= fila.length) return Promise.resolve();
        var r = fila[i++], mat = r.carimbo.feitoPor.matricula;
        if (semSessao[mat]) return proximo();
        return ctx.sessaoDe(mat).then(function (sessao) {
          if (!sessao) { semSessao[mat] = true; resumo.erro = 'Falta entrar no Segurança com sinal uma vez (sessão).'; return proximo(); }
          return segEnviarFotosDe(ctx, r, sessao).then(function (rf) {
            if (rf.sessaoExpirada) return sessaoVenceu(mat).then(proximo);
            // A foto recusada pela regra (grande demais) não muda na próxima tentativa: o registro inteiro fica recusado,
            // em vez de subir a mesma foto a cada envio gastando o plano de dados (revisão de 23/10/2026).
            if (rf.recusa) { r.estado = 'recusado'; r.ultimoErro = rf.erro; return SEG_BANCO.gravar('registros', r).then(proximo); }
            if (rf.erro) { r.ultimoErro = rf.erro; return SEG_BANCO.gravar('registros', r).then(proximo); }
            var corpo = { acao: 'registro', sessao: sessao, enviadoPor: ctx.enviadoPor, registro: segSemCamposLocais(r) };
            return ctx.postar(corpo).then(function (resp) {
              if (resp && resp.sessaoExpirada) return sessaoVenceu(mat).then(proximo);
              if (resp && resp.ok) { r.estado = 'enviado'; r.enviadoEm = new Date().toISOString(); r.resposta = segResumoDaResposta(resp); resumo.enviados++; }
              else if (resp && resp.recusa) { r.estado = 'recusado'; r.ultimoErro = resp.erro || 'recusado pelo servidor'; }
              else { r.ultimoErro = (resp && resp.erro) || 'o servidor não aceitou agora'; r.tentativas = (r.tentativas || 0) + 1; resumo.erro = r.ultimoErro; }
              return SEG_BANCO.gravar('registros', r).then(proximo);
            });
          });
        });
      }
      return proximo();
    }).then(function () { return segAtualizarPacote(ctx); })
      .then(segLimparVelhos)
      .then(segEsperando).then(function (l) { resumo.pendentes = l.length; return resumo; })
      .catch(function (e) {
        // Sem rede no meio: o que não subiu continua "guardado". A casca tenta de novo.
        resumo.erro = e && e.msg || String(e && e.message || e); if (e && e.rede && e.comSinal) resumo.servidorFora = true; else if (e && e.rede) resumo.semRede = true;
        return segEsperando().then(function (l) { resumo.pendentes = l.length; return resumo; });
      });
  }
});

/* O que fica só no celular (o estado da fila, os erros) não vai ao servidor. */
function segSemCamposLocais(r) {
  var c = {}; Object.keys(r).forEach(function (k) { if (['estado', 'guardadoEm', 'enviadoEm', 'ultimoErro', 'resposta', 'rotulo'].indexOf(k) < 0) c[k] = r[k]; });
  return c;
}
function segResumoDaResposta(resp) {
  return { retido: !!resp.retido, criticos: resp.criticos || [], irregularidades: resp.irregularidades || 0, presentes: resp.presentes, jaTinha: !!resp.jaTinha };
}
