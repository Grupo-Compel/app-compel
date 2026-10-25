/*
 * folha.js — monta a lista de presença do DDS (RH-FORM-092 com bolinha) no navegador, para imprimir em A4,
 * e o layout que o leitor.js usa para lê-la. Porte do ficha2.py (23/10/2026).
 *
 * Por que existe: o app precisa gerar a folha sem servidor e sem Python. A folha e o layout saem da MESMA conta,
 * aqui; se um dia mudar a posição de uma coluna, muda nos dois juntos e o leitor continua lendo certo.
 * As constantes são as do ficha2.py, de propósito iguais: o teste confere o layout número a número contra o
 * layout2.json, e o leitor foi medido nessa geometria.
 *
 * Uso no navegador: <script src="qrcode.js"></script><script src="folha.js"></script>
 *   FolhaLista.layout(pessoas, cab)  → lista de layouts por página (igual ao layout2.json)
 *   FolhaLista.html(pessoas, cab)    → página HTML pronta para imprimir (A4, margem zero)
 *   pessoas = [{mat, nome, tipo}]    cab = {id, base, data, resp}
 * Uso no Node: require('./folha.js') (o QR precisa do global `qrcode` ou de opcoes.qrcode).
 */
var FolhaLista = (function () {
  'use strict';

  var LARG = 210, ALT = 297;
  var MARCA = 7, MARGEM = 6;
  var X0 = MARGEM + MARCA / 2, Y0 = MARGEM + MARCA / 2;
  var X1 = LARG - MARGEM - MARCA / 2, Y1 = ALT - MARGEM - MARCA / 2;
  var TOPO_TAB = 58, ALT_LINHA = 5.3;      // 5,3 mm: perto da lista de hoje, que leva 48 nomes por página
  var POR_PAGINA = 42, EM_BRANCO_ULTIMA = 6;
  var R = 1.9;                             // raio da bolinha, mm
  var COL = { q: 15, mat: 23, nome: 40, base: 110, bola: 136, ass: 145, fim: 196 };
  var QR = [172, 28, 194, 50];             // o leitor procura o QR aqui: lugar e tamanho não podem mudar
  var PT = 25.4 / 72;                      // o ficha2.py mede letra e traço em pontos; aqui tudo é mm

  // Mesma regra de páginas do ficha2.py: 42 por página; se a última não tem lugar para as 6 linhas em branco,
  // ganha uma página só com as linhas em branco.
  function grupos(pessoas) {
    var g = [];
    for (var i = 0; i < pessoas.length; i += POR_PAGINA) g.push(pessoas.slice(i, i + POR_PAGINA));
    if (!g.length) g.push([]); // lista vazia: ainda sai uma folha com as linhas em branco
    if (g[g.length - 1].length > POR_PAGINA - EM_BRANCO_ULTIMA) g.push([]);
    return g;
  }

  // As linhas de uma página, na ordem do ficha2.py (pessoas e depois as em branco), com a conta de posição.
  function linhasDaPagina(g, k, total) {
    var emBranco = k === total - 1 ? EM_BRANCO_ULTIMA : 0, out = [], i;
    for (i = 0; i < g.length + emBranco; i++) {
      var topo = TOPO_TAB + i * ALT_LINHA;
      out.push({ p: i < g.length ? g[i] : null, n: k * POR_PAGINA + i + 1, topo: topo, meio: topo + ALT_LINHA / 2 });
    }
    return out;
  }

  function layout(pessoas) {
    var gs = grupos(pessoas || []), lays = [];
    gs.forEach(function (g, k) {
      var lay = { pagina: [LARG, ALT], quadro: [X0, Y0, X1, Y1], r_bola: R, linhas: [], manuais: [], qr: QR.slice() };
      linhasDaPagina(g, k, gs.length).forEach(function (l) {
        if (l.p) {
          lay.linhas.push({ mat: l.p.mat, bola: [COL.bola + R, l.meio], ass: [COL.ass, l.topo, COL.fim, l.topo + ALT_LINHA] });
        } else {
          lay.manuais.push({ linha: l.n, escrita: [COL.mat, l.topo, COL.base - 2, l.topo + ALT_LINHA],
            bola: [COL.bola + R, l.meio], ass: [COL.ass, l.topo, COL.fim, l.topo + ALT_LINHA] });
        }
      });
      lays.push(lay);
    });
    return lays;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function n(v) { return +v.toFixed(3); } // mm com 3 casas: 1 µm basta e o HTML fica menor

  // Texto com a linha de base em (x, y) mm, como o drawString do reportlab.
  function texto(x, y, t, tamPt, negrito, meio) {
    return '<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + n(tamPt * PT) + '"' +
      (negrito ? ' font-weight="bold"' : '') + (meio ? ' text-anchor="middle"' : '') + '>' + esc(t) + '</text>';
  }

  function linha(xa, ya, xb, yb, cor, larguraPt) {
    return '<line x1="' + n(xa) + '" y1="' + n(ya) + '" x2="' + n(xb) + '" y2="' + n(yb) + '" stroke="' + cor +
      '" stroke-width="' + n(larguraPt * PT) + '"/>';
  }

  // QR desenhado como quadradinhos num caminho só, com 1 módulo de borda branca como no ficha2.py (border=1),
  // ocupando os mesmos 22 × 22 mm.
  function qrSVG(dado, gerador) {
    var q = gerador(0, 'M'); // correção M: a mesma que o qrcode do Python usa por padrão
    q.addData(dado); q.make();
    var m = q.getModuleCount(), lado = QR[2] - QR[0], mod = lado / (m + 2), d = '';
    for (var r = 0; r < m; r++) {
      for (var c = 0; c < m; c++) {
        if (q.isDark(r, c)) d += 'M' + n(QR[0] + (c + 1) * mod) + ' ' + n(QR[1] + (r + 1) * mod) + 'h' + n(mod) + 'v' + n(mod) + 'h' + n(-mod) + 'z';
      }
    }
    // os quadradinhos vizinhos não podem deixar fresta clara entre si: shape-rendering crispEdges e sem contorno
    return '<rect x="' + QR[0] + '" y="' + QR[1] + '" width="' + lado + '" height="' + lado + '" fill="#fff"/>' +
      '<path d="' + d + '" fill="#000" shape-rendering="crispEdges"/>';
  }

  /*
   * Uma folha é um SVG de 210 × 297 mm posicionado em absoluto dentro de um bloco do tamanho da página. Por que
   * SVG e não um <div> por elemento: o texto do ficha2.py é posicionado pela linha de base, e só o SVG põe a linha
   * de base onde se manda; os quadrados, a bolinha e o QR, que o leitor mede, ficam com a geometria exata em mm.
   */
  function paginaSVG(g, k, total, cab, gerador) {
    var s = [], i;
    var cantos = [[MARGEM, MARGEM], [LARG - MARGEM - MARCA, MARGEM], [MARGEM, ALT - MARGEM - MARCA], [LARG - MARGEM - MARCA, ALT - MARGEM - MARCA]];
    cantos.forEach(function (c) { s.push('<rect x="' + c[0] + '" y="' + c[1] + '" width="' + MARCA + '" height="' + MARCA + '" fill="#000"/>'); });
    // cabeçalho no desenho da RH-FORM-092
    s.push('<rect x="15" y="16" width="181" height="36" fill="none" stroke="#000" stroke-width="' + n(0.6 * PT) + '"/>');
    s.push(texto(20, 23, cab.empresa || 'COMPEL', 12, true));
    s.push(texto(95, 23, 'Lista de Presença (RH-FORM-092)', 12, true, true));
    s.push(texto(150, 21, 'Página ' + (k + 1) + ' de ' + total, 7));
    ['DDS/DSS', 'Treinamento/Simulado', 'Reunião', 'Outros ______'].forEach(function (t, j) {
      var x = 20 + j * 40;
      s.push('<rect x="' + x + '" y="27.5" width="3" height="3" fill="none" stroke="#000" stroke-width="' + n(0.6 * PT) + '"/>');
      s.push(texto(x + 4.5, 30, t, 8));
    });
    s.push(texto(20, 36, 'Data: ' + (cab.data || ''), 8));
    s.push(texto(60, 36, 'Instrutor/Responsável: ' + (cab.resp || ''), 8));
    s.push(texto(20, 41, 'Base: ' + (cab.base || ''), 8));
    s.push(texto(60, 41, 'Horário inicial: ______   Horário final: ______', 8));
    s.push(texto(20, 47.5, 'Assunto abordado / Tema: _______________________________________________', 8));
    s.push(qrSVG((cab.id || '') + '|p' + (k + 1), gerador));
    [['q', 'Qtd'], ['mat', 'Matrícula'], ['nome', 'Nome do Funcionário'], ['base', 'Base'], ['ass', 'Assinatura']].forEach(function (c) {
      s.push(texto(COL[c[0]], TOPO_TAB - 1.3, c[1], 7.5, true));
    });
    s.push(texto(COL.bola + R, TOPO_TAB - 1.3, 'Presente', 7.5, true, true));
    var ls = linhasDaPagina(g, k, total);
    for (i = 0; i < ls.length; i++) {
      var l = ls[i];
      s.push(linha(COL.q, l.topo, COL.fim, l.topo, '#8c8c8c', 0.4));
      s.push('<circle cx="' + n(COL.bola + R) + '" cy="' + n(l.meio) + '" r="' + R + '" fill="none" stroke="#000" stroke-width="' + n(0.7 * PT) + '"/>');
      s.push(texto(COL.q, l.meio + 1.1, String(l.n), 7.5));
      if (l.p) {
        s.push(texto(COL.mat, l.meio + 1.1, l.p.mat, 7.5));
        s.push(texto(COL.nome, l.meio + 1.1, String(l.p.nome || '').slice(0, 40), 7.5));
        s.push(texto(COL.base, l.meio + 1.1, l.p.tipo, 7.5));
      }
    }
    var fim = TOPO_TAB + ls.length * ALT_LINHA;
    // no ficha2.py estas linhas saem cinza e com a espessura que ficou da última bolinha (0,7 pt)
    s.push(linha(COL.q, fim, COL.fim, fim, '#8c8c8c', 0.7));
    [COL.mat - 1, COL.nome - 1, COL.base - 1, COL.bola - 1.5, COL.ass - 1].forEach(function (x) {
      s.push(linha(x, TOPO_TAB - 4, x, fim, '#8c8c8c', 0.7));
    });
    s.push(texto(20, 284, 'Assinatura do Instrutor/Responsável: ______________________________', 8));
    s.push(texto(20, 288, 'Preencha a bolinha inteira com caneta azul ou preta e assine. Não está na lista? Escreva matrícula e nome numa linha em branco.', 6.5));
    return '<div class="folha"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm">' +
      s.join('') + '</svg></div>';
  }

  function html(pessoas, cab, opcoes) {
    opcoes = opcoes || {};
    cab = cab || {};
    var gerador = opcoes.qrcode || (typeof qrcode !== 'undefined' ? qrcode : null); // eslint-disable-line no-undef
    if (!gerador) throw new Error('falta o gerador de QR (qrcode.js) carregado antes do folha.js');
    var gs = grupos(pessoas || []), paginas = [];
    gs.forEach(function (g, k) { paginas.push(paginaSVG(g, k, gs.length, cab, gerador)); });
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Lista de presença ' + esc(cab.data || '') + '</title><style>' +
      // margem zero: os quadrados dos cantos estão a 6 mm da borda e a impressora não pode mudar a escala.
      // Ao imprimir, escolher "tamanho real / 100 %"; "ajustar à página" encolhe a folha e o leitor ainda lê
      // (a conta é pelos cantos), mas a bolinha fica menor que a medida.
      '@page{size:A4;margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}' +
      '.folha{position:relative;width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always}' +
      '.folha:last-child{break-after:auto;page-break-after:auto}' +
      '.folha svg{position:absolute;left:0;top:0;width:210mm;height:297mm}' +
      'text{font-family:Helvetica,Arial,"Liberation Sans",sans-serif;fill:#000}' +
      '@media screen{body{background:#ddd}.folha{background:#fff;margin:8mm auto;box-shadow:0 0 3mm rgba(0,0,0,.3)}}' +
      '</style></head><body>' + paginas.join('') + '</body></html>';
  }

  return { layout: layout, html: html };
})();

if (typeof module === 'object' && module && module.exports) module.exports = FolhaLista;
