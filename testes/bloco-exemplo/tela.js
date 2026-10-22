/* tela.js — a tela do bloco de exemplo (só na bateria da casca, 21/10/2026). Guarda um registro e pede o envio. */
'use strict';
Casca.iniciar('exemplo').then(function (r) {
  window.PESSOA_DO_BLOCO = r.pessoa;   // a bateria confere o que o bloco recebeu
  var corpo = document.getElementById('corpo');
  corpo.innerHTML = '<p class="n-saudacao" id="ola"></p><div class="cartao">' +
    '<div class="campo"><label for="texto">Anotação</label><input id="texto" value="poste 12 conferido"></div>' +
    '<button type="button" class="btn" id="anotar">Anotar</button><button type="button" class="btn fantasma" id="voltar">Voltar ao Início</button>' +
    '<div id="resultado" class="ajuda"></div></div><div id="ajuda"></div>';
  document.getElementById('ola').textContent = 'Olá, ' + r.pessoa.nome.split(' ')[0] + '.';
  Casca.ajuda(document.getElementById('ajuda'), 'A tela de exemplo: anota um texto e manda para o servidor do exemplo quando houver sinal.');
  document.getElementById('voltar').addEventListener('click', function () { Casca.voltar(); });
  document.getElementById('anotar').addEventListener('click', function () {
    var reg = { id: 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), texto: document.getElementById('texto').value, carimbo: Casca.carimbo() };
    exemploGuardar(reg).then(function () { return Casca.pedirEnvio(); }).then(function (x) {
      document.getElementById('resultado').textContent = x.esperando ? 'Guardado. Vai quando houver sinal.' : x.erro ? 'Guardado. ' + x.erro : 'Enviado: ' + (x.enviados || 0) + '.';
    });
  });
});
