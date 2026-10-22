/* envio.js — o envio do bloco de exemplo (só existe na bateria da casca, 21/10/2026).
 *
 * É o molde do que cada bloco que envia escreve: um arquivo que roda na tela E no service worker da casca (por isso
 * nada de `document` nem `window`), com o banco dele e as duas funções que a casca chama. O que vai em cada envio e o
 * que fazer com cada resposta são do bloco; o servidor, o postar, a trava e a sessão de cada pessoa vêm do `ctx`.
 */
var EXEMPLO_BANCO = cascaBanco('exemplo-bloco', 1, { registros: 'id' });

function exemploGuardar(registro) { registro.estado = 'guardado'; return EXEMPLO_BANCO.gravar('registros', registro); }
function exemploEsperando() {
  return EXEMPLO_BANCO.listar('registros').then(function (l) {
    return l.filter(function (r) { return r.estado === 'guardado'; }).sort(function (a, b) { return a.carimbo.feitoEm < b.carimbo.feitoEm ? -1 : 1; });
  });
}

cascaBlocoEnvia('exemplo', {
  pendentes: function () { return exemploEsperando().then(function (l) { return l.length; }); },
  enviar: function (ctx) {
    var resumo = { enviados: 0, pendentes: 0, erro: '', semRede: false, servidorFora: false };
    return exemploEsperando().then(function (fila) {
      var i = 0;
      function proximo() {
        if (i >= fila.length) return Promise.resolve();
        var r = fila[i++];
        // A sessão de quem o registro é, e não a de quem está no celular agora.
        return ctx.sessaoDe(r.carimbo.emNomeDe.matricula).then(function (sessao) {
          return ctx.postar({ acao: 'registro', sessao: sessao, enviadoPor: ctx.enviadoPor, registro: r });
        }).then(function (resp) {
          if (resp && resp.ok) { r.estado = 'enviado'; resumo.enviados++; }
          else r.ultimoErro = resp && resp.erro || 'recusado';
          return EXEMPLO_BANCO.gravar('registros', r).then(proximo);
        }, function (e) {
          // Sem rede: para aqui. O que não subiu fica, e a casca tenta de novo.
          resumo.erro = e && e.msg || 'falhou'; if (e && e.comSinal) resumo.servidorFora = true; else resumo.semRede = true;
        });
      }
      return proximo();
    }).then(function () { return exemploEsperando(); }).then(function (l) { resumo.pendentes = l.length; return resumo; });
  }
});
