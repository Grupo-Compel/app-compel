/*
 * leitor.js — leitura da foto da lista de presença do DDS (RH-FORM-092 com bolinha), em JavaScript puro.
 * Porte do leitor.py (23/10/2026). Roda no celular, sem sinal e sem OpenCV: por isso tudo aqui é conta em
 * vetor de bytes, sem `document` nem `window` (pode rodar num Worker, para a tela não travar durante a leitura).
 *
 * Uso no navegador: <script src="jsQR.js"></script><script src="leitor.js"></script>, desenhar a foto num canvas e
 *   LeitorLista.ler(ctx.getImageData(0,0,w,h).data, w, h, layouts, { paginaEsperada: 1 })
 * Uso no Node: require('./leitor.js') devolve o mesmo objeto (o final do arquivo exporta se houver `module`).
 *
 * Os limiares são os do leitor.py, de propósito iguais: foram medidos na simulação de 23/10/2026 (2.400 linhas,
 * 1 erro). Mudar um número aqui sem refazer a medição é trocar uma regra medida por um palpite.
 */
var LeitorLista = (function () {
  'use strict';

  var S = 5.0; // pixels por mm na imagem endireitada — o mesmo do Python, para que os limiares valham igual

  // Limiares do leitor.py (23/10/2026, 16h). A bolinha decide; a assinatura só gera aviso, porque a do vizinho
  // invade a linha. Um tique fino cobre ~10 % da bolinha na linha de 5,3 mm: acima de 6 % já vai para conferir.
  var LIM = {
    presente: 0.45,
    conferir: 0.06,
    semAssinatura: 0.15,
    assinaturaSemBolinha: 0.30,
    escritaManual: 0.03
  };

  // A busca dos cantos não precisa da foto inteira: um quadrado de 7 mm continua com dezenas de pixels numa
  // imagem de ~1000 px, e reduzir antes corta o trabalho de rotular manchas em até 16 vezes numa foto de 3000 px.
  var LADO_BUSCA = 1000;

  function agora() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  // Cinza com os mesmos pesos inteiros do OpenCV (BGR2GRAY): assim a imagem que o limiar vê é a mesma do Python.
  function cinzaPx(d, p) {
    return (d[p] * 4899 + d[p + 1] * 9617 + d[p + 2] * 1868 + 8192) >> 14;
  }

  // Reduz e converte para cinza numa passada só, pela média de cada bloco f×f: a média (e não pular pixels)
  // mantém o centro do quadrado preciso, porque cada pixel reduzido pesa a área toda que cobre.
  function reduzirCinza(rgba, w, h, f) {
    var wd = Math.floor(w / f), hd = Math.floor(h / f);
    var out = new Uint8Array(wd * hd), soma = new Uint32Array(wd), area = f * f, meia = area >> 1;
    for (var yd = 0; yd < hd; yd++) {
      soma.fill(0);
      for (var k = 0; k < f; k++) {
        var base = (yd * f + k) * w * 4;
        for (var xd = 0; xd < wd; xd++) {
          var p = base + xd * f * 4, acc = 0;
          for (var j = 0; j < f; j++, p += 4) acc += cinzaPx(rgba, p);
          soma[xd] += acc;
        }
      }
      var o = yd * wd;
      for (xd = 0; xd < wd; xd++) out[o + xd] = ((soma[xd] + meia) / area) | 0;
    }
    return { g: out, w: wd, h: hd };
  }

  // Desfoque 5×5 [1 4 6 4 1]/16: é o núcleo fixo que o OpenCV usa em GaussianBlur((5,5), 0) antes do Otsu.
  function desfoque5(g, w, h) {
    var t = new Uint16Array(w * h), out = new Uint8Array(w * h), x, y, i;
    for (y = 0; y < h; y++) {
      i = y * w;
      for (x = 0; x < w; x++) {
        var a = g[i + Math.max(x - 2, 0)], b = g[i + Math.max(x - 1, 0)], c = g[i + x],
          d = g[i + Math.min(x + 1, w - 1)], e = g[i + Math.min(x + 2, w - 1)];
        t[i + x] = a + 4 * b + 6 * c + 4 * d + e;
      }
    }
    for (y = 0; y < h; y++) {
      var r0 = Math.max(y - 2, 0) * w, r1 = Math.max(y - 1, 0) * w, r2 = y * w,
        r3 = Math.min(y + 1, h - 1) * w, r4 = Math.min(y + 2, h - 1) * w;
      for (x = 0; x < w; x++) {
        out[r2 + x] = (t[r0 + x] + 4 * t[r1 + x] + 6 * t[r2 + x] + 4 * t[r3 + x] + t[r4 + x] + 128) >> 8;
      }
    }
    return out;
  }

  // Limiar global (Otsu), como no Python: o limiar local esvazia o miolo de um quadrado preto grande.
  function otsu(g) {
    var hist = new Float64Array(256), n = g.length, i;
    for (i = 0; i < n; i++) hist[g[i]]++;
    var somaT = 0;
    for (i = 0; i < 256; i++) somaT += i * hist[i];
    var wB = 0, somaB = 0, melhor = -1, lim = 0;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      var wF = n - wB;
      if (wF === 0) break;
      somaB += i * hist[i];
      var mB = somaB / wB, mF = (somaT - somaB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > melhor) { melhor = v; lim = i; }
    }
    return lim;
  }

  // Fecho convexo (cadeia monótona) de pontos [x,y].
  function fecho(pts) {
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cruz(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var inf = [], sup = [], i;
    for (i = 0; i < pts.length; i++) {
      while (inf.length >= 2 && cruz(inf[inf.length - 2], inf[inf.length - 1], pts[i]) <= 0) inf.pop();
      inf.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (sup.length >= 2 && cruz(sup[sup.length - 2], sup[sup.length - 1], pts[i]) <= 0) sup.pop();
      sup.push(pts[i]);
    }
    inf.pop(); sup.pop();
    return inf.concat(sup);
  }

  function areaPoligono(p) {
    var a = 0;
    for (var i = 0, n = p.length; i < n; i++) {
      var q = p[(i + 1) % n];
      a += p[i][0] * q[1] - q[0] * p[i][1];
    }
    return Math.abs(a) / 2;
  }

  function perimetro(p) {
    var s = 0;
    for (var i = 0, n = p.length; i < n; i++) {
      var q = p[(i + 1) % n];
      s += Math.hypot(q[0] - p[i][0], q[1] - p[i][1]);
    }
    return s;
  }

  // Quantos vértices sobram ao simplificar o polígono fechado com tolerância eps (Douglas-Peucker, como o
  // approxPolyDP: parte de um par de pontos quase opostos e divide cada metade enquanto houver ponto longe).
  function verticesSimplificados(p, eps) {
    var n = p.length;
    if (n <= 4) return n;
    var ini = 0, fim = 0, k, i;
    for (k = 0; k < 3; k++) { // três idas e voltas acham um par perto do diâmetro, como faz o OpenCV
      var dmax = -1;
      for (i = 0; i < n; i++) {
        var d = (p[i][0] - p[ini][0]) * (p[i][0] - p[ini][0]) + (p[i][1] - p[ini][1]) * (p[i][1] - p[ini][1]);
        if (d > dmax) { dmax = d; fim = i; }
      }
      if (k < 2) { var t = ini; ini = fim; fim = t; }
    }
    var manter = new Uint8Array(n);
    manter[ini] = manter[fim] = 1;
    function dividir(a, b) { // pontos de a até b andando para frente, com volta
      var ax = p[a][0], ay = p[a][1], bx = p[b][0], by = p[b][1];
      var len = Math.hypot(bx - ax, by - ay) || 1, dmax = -1, imax = -1;
      for (var j = (a + 1) % n; j !== b; j = (j + 1) % n) {
        var d = Math.abs((bx - ax) * (ay - p[j][1]) - (ax - p[j][0]) * (by - ay)) / len;
        if (d > dmax) { dmax = d; imax = j; }
      }
      if (imax >= 0 && dmax > eps) { manter[imax] = 1; dividir(a, imax); dividir(imax, b); }
    }
    dividir(ini, fim); dividir(fim, ini);
    var c = 0;
    for (i = 0; i < n; i++) c += manter[i];
    return c;
  }

  // Acha os quatro quadrados pretos dos cantos. Mesmos testes do leitor.py: tamanho entre 0,02 % e 1 % da foto,
  // proporção 0,7–1,4, sólido (área/fecho > 0,9), cheio (área/retângulo > 0,75), quatro lados; depois fica só
  // quem tem mais da metade do maior, e para cada canto da foto o candidato mais próximo.
  function marcasDeCanto(red) {
    var w = red.w, h = red.h;
    var g = desfoque5(red.g, w, h), lim = otsu(g), n = w * h, i;
    var rot = new Int32Array(n), pilha = new Int32Array(n), comps = [], id = 0;
    var amin = n * 0.0002, amax = n * 0.01;
    for (i = 0; i < n; i++) {
      if (rot[i] || g[i] > lim) continue;
      id++;
      var topo = 0, cont = 0, sx = 0, sy = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
      pilha[topo++] = i; rot[i] = id;
      while (topo) { // vizinhança de 8, como o contorno do findContours
        var q = pilha[--topo], qx = q % w, qy = (q - qx) / w;
        cont++; sx += qx; sy += qy;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = qy + dy;
          if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = qx + dx;
            if (xx < 0 || xx >= w) continue;
            var r = yy * w + xx;
            if (!rot[r] && g[r] <= lim) { rot[r] = id; pilha[topo++] = r; }
          }
        }
      }
      // A área é a contagem de pixels (o Python usa a área do contorno, que inclui furos). Com isso um anel —
      // o quadrado de posição do QR, por exemplo — sai já no teste de cheio; o quadrado de canto é maciço e passa igual.
      if (cont < amin || cont > amax) continue;
      var cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      if (!(cw / ch > 0.7 && cw / ch < 1.4)) continue;
      if (cont / (cw * ch) < 0.75) continue;
      comps.push({ id: id, a: cont, cx: sx / cont, cy: sy / cont, x0: x0, x1: x1, y0: y0, y1: y1 });
    }
    var cand = [];
    for (var c = 0; c < comps.length; c++) {
      var m = comps[c], pts = [];
      // fecho pelos cantos dos pixels das pontas de cada linha: a área do fecho fica comparável à contagem de pixels
      for (var y = m.y0; y <= m.y1; y++) {
        var e = -1, d = -1, base = y * w;
        for (var x = m.x0; x <= m.x1; x++) if (rot[base + x] === m.id) { if (e < 0) e = x; d = x; }
        if (e < 0) continue;
        pts.push([e, y], [e, y + 1], [d + 1, y], [d + 1, y + 1]);
      }
      var hull = fecho(pts), ah = areaPoligono(hull);
      if (ah === 0 || m.a / ah < 0.9) continue;
      // quatro lados medidos no fecho, não no contorno: como já se exigiu sólido > 0,9, os dois quase coincidem
      if (verticesSimplificados(hull, 0.06 * perimetro(hull)) !== 4) continue;
      cand.push(m);
    }
    if (!cand.length) return null;
    var maior = 0;
    for (c = 0; c < cand.length; c++) if (cand[c].a > maior) maior = cand[c].a;
    cand = cand.filter(function (p) { return p.a > maior * 0.5; });
    var cantos = [[0, 0], [w, 0], [0, h], [w, h]], esc = [], usados = {};
    for (c = 0; c < 4; c++) {
      var melhor = null, dm = Infinity;
      for (var k = 0; k < cand.length; k++) {
        var dd = (cand[k].cx - cantos[c][0]) * (cand[k].cx - cantos[c][0]) + (cand[k].cy - cantos[c][1]) * (cand[k].cy - cantos[c][1]);
        if (dd < dm) { dm = dd; melhor = cand[k]; }
      }
      // Diferença deliberada do Python: o mesmo quadrado servindo a dois cantos daria uma folha achatada e
      // leitura de lixo. Melhor recusar a foto do que ler errado.
      if (usados[melhor.id]) return null;
      usados[melhor.id] = 1;
      esc.push([melhor.cx, melhor.cy]);
    }
    return esc; // sup-esq, sup-dir, inf-esq, inf-dir (coordenadas da imagem reduzida)
  }

  // Homografia que leva (u,v) da folha endireitada para (x,y) da foto: resolve o sistema 8×8 dos 4 pares.
  function homografia(de, para) {
    var A = [], i, j, k;
    for (i = 0; i < 4; i++) {
      var u = de[i][0], v = de[i][1], x = para[i][0], y = para[i][1];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
    }
    for (i = 0; i < 8; i++) {
      var piv = i;
      for (j = i + 1; j < 8; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j;
      if (Math.abs(A[piv][i]) < 1e-12) return null;
      var t = A[i]; A[i] = A[piv]; A[piv] = t;
      for (j = i + 1; j < 8; j++) {
        var f = A[j][i] / A[i][i];
        for (k = i; k < 9; k++) A[j][k] -= f * A[i][k];
      }
    }
    var hm = new Array(8);
    for (i = 7; i >= 0; i--) {
      var s = A[i][8];
      for (j = i + 1; j < 8; j++) s -= A[i][j] * hm[j];
      hm[i] = s / A[i][i];
    }
    return hm;
  }

  // Endireita a folha a 5 px/mm: para cada pixel da folha, acha o ponto da foto e interpola (bilinear) o cinza,
  // como o warpPerspective. O cinza é calculado só nos pixels usados, para não guardar a foto inteira em cinza.
  function endireitar(rgba, w, h, hm, W, H) {
    var out = new Uint8Array(W * H);
    for (var v = 0; v < H; v++) {
      for (var u = 0; u < W; u++) {
        var den = hm[6] * u + hm[7] * v + 1;
        var x = (hm[0] * u + hm[1] * v + hm[2]) / den, y = (hm[3] * u + hm[4] * v + hm[5]) / den;
        var x0 = Math.floor(x), y0 = Math.floor(y);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue; // fora da foto: preto, como o OpenCV
        var fx = x - x0, fy = y - y0, p = (y0 * w + x0) * 4, l = w * 4;
        var a = cinzaPx(rgba, p), b = cinzaPx(rgba, p + 4), c = cinzaPx(rgba, p + l), d = cinzaPx(rgba, p + l + 4);
        out[v * W + u] = (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy + 0.5) | 0;
      }
    }
    return out;
  }

  // Limiar local (gaussiano 41×41, C = 12, como o adaptiveThreshold do Python): aguenta sombra e luz desigual.
  // É tinta o pixel pelo menos 12 tons mais escuro que a média ponderada da vizinhança.
  // Calculado só nos retângulos que a leitura mede (bolinhas, faixa da assinatura, linhas à mão), não na folha
  // inteira: dá o mesmo valor pixel a pixel, porque a média de um pixel só depende dos vizinhos, e foi a etapa
  // mais lenta na primeira medição (~200 ms de ~330 ms por foto no Node, 23/10/2026).
  var NUCLEO = (function () {
    var sigma = 0.3 * ((41 - 1) * 0.5 - 1) + 0.8, ker = new Float32Array(41), s = 0, i; // sigma que o OpenCV usa para 41
    for (i = 0; i < 41; i++) { ker[i] = Math.exp(-((i - 20) * (i - 20)) / (2 * sigma * sigma)); s += ker[i]; }
    for (i = 0; i < 41; i++) ker[i] /= s;
    return ker;
  })();

  function limiarRegiao(g, W, H, tinta, x0, y0, x1, y1) {
    x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, W); y1 = Math.min(y1, H);
    var rw = x1 - x0, R = 20, ker = NUCLEO, x, y, k;
    if (rw <= 0 || y1 <= y0) return;
    var ya = Math.max(y0 - R, 0), yb = Math.min(y1 + R, H); // linhas que a média vertical vai pedir
    var hz = new Float32Array((yb - ya) * rw);
    for (y = ya; y < yb; y++) {
      var o = y * W, oh = (y - ya) * rw;
      for (x = 0; x < rw; x++) {
        var acc = 0, xc = x0 + x - R;
        for (k = 0; k < 41; k++) acc += g[o + Math.min(Math.max(xc + k, 0), W - 1)] * ker[k]; // borda repetida
        hz[oh + x] = acc;
      }
    }
    var soma = new Float32Array(rw);
    for (y = y0; y < y1; y++) {
      soma.fill(0);
      for (k = 0; k < 41; k++) {
        var yy = (Math.min(Math.max(y + k - R, 0), H - 1) - ya) * rw, wk = ker[k];
        for (x = 0; x < rw; x++) soma[x] += hz[yy + x] * wk;
      }
      var o2 = y * W + x0;
      for (x = 0; x < rw; x++) tinta[o2 + x] = g[o2 + x] <= ((soma[x] + 0.5) | 0) - 12 ? 1 : 0;
    }
  }

  // Recorta o quadrado do QR da folha endireitada e passa ao jsQR (que quer RGBA).
  function lerQR(reta, W, H, lay, X0, Y0, jsqr) {
    if (!jsqr) return null;
    var q = lay.qr;
    var a = Math.max(Math.trunc((q[0] - 2 - X0) * S), 0), b = Math.max(Math.trunc((q[1] - 2 - Y0) * S), 0);
    var c = Math.min(Math.trunc((q[2] + 2 - X0) * S), W), d = Math.min(Math.trunc((q[3] + 2 - Y0) * S), H);
    // segunda tentativa ampliada 2×: o módulo do QR tem ~4 px a 5 px/mm, no limite do que o jsQR acha com folga
    for (var z = 1; z <= 2; z++) {
      var cw = (c - a) * z, ch = (d - b) * z, rgba = new Uint8ClampedArray(cw * ch * 4);
      for (var y = 0; y < ch; y++) {
        for (var x = 0; x < cw; x++) {
          var v = reta[(b + ((y / z) | 0)) * W + a + ((x / z) | 0)], p = (y * cw + x) * 4;
          rgba[p] = rgba[p + 1] = rgba[p + 2] = v; rgba[p + 3] = 255;
        }
      }
      var r = jsqr(rgba, cw, ch, { inversionAttempts: 'dontInvert' });
      if (r && r.data) return r.data;
    }
    return null;
  }

  // O lugar do QR tem contraste forte e metade dos pixels escuros; o canto oposto da folha (números da tabela)
  // fica quase todo branco. Serve para saber de que lado está a folha quando o QR em si não deu leitura.
  function pareceQR(reta, W, H, lay, X0, Y0) {
    var q = lay.qr, a = Math.trunc((q[0] - X0) * S), b = Math.trunc((q[1] - Y0) * S);
    var c = Math.min(Math.trunc((q[2] - X0) * S), W), d = Math.min(Math.trunc((q[3] - Y0) * S), H);
    var hist = new Uint32Array(256), n = 0, x, y, i;
    for (y = Math.max(b, 0); y < d; y++) for (x = Math.max(a, 0); x < c; x++) { hist[reta[y * W + x]]++; n++; }
    if (!n) return false;
    var p5 = -1, p95 = -1, acc = 0;
    for (i = 0; i < 256; i++) {
      acc += hist[i];
      if (p5 < 0 && acc >= n * 0.05) p5 = i;
      if (p95 < 0 && acc >= n * 0.95) p95 = i;
    }
    if (p95 - p5 < 60) return false;
    var meio = (p5 + p95) / 2, escuros = 0;
    for (i = 0; i < meio; i++) escuros += hist[i];
    return escuros / n > 0.3 && escuros / n < 0.7;
  }

  function arred(v, casas) { var m = Math.pow(10, casas); return Math.round(v * m) / m; }

  function falha(erro, extra) {
    var r = { ok: false, pagina: null, id: null, linhas: [], manuais: [], erro: erro };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /*
   * ler(imagemRGBA, largura, altura, layouts, opcoes)
   *   imagemRGBA: Uint8ClampedArray/Uint8Array com 4 bytes por pixel (o que getImageData devolve)
   *   layouts:    a lista do layout2.json (uma entrada por página) ou um layout só
   *   opcoes:     { paginaEsperada, idEsperado, jsQR }
   */
  function ler(imagemRGBA, largura, altura, layouts, opcoes) {
    opcoes = opcoes || {};
    var t = { inicio: agora() }, tempos = {};
    var lista = Array.isArray(layouts) ? layouts : [layouts];
    var lay = lista[0];
    if (!lay || !lay.quadro) return falha('layout da folha ausente ou inválido');
    if (!imagemRGBA || imagemRGBA.length < largura * altura * 4) return falha('imagem vazia ou com tamanho errado');
    var X0 = lay.quadro[0], Y0 = lay.quadro[1], X1 = lay.quadro[2], Y1 = lay.quadro[3];

    var f = Math.max(1, Math.round(Math.max(largura, altura) / LADO_BUSCA));
    var red = reduzirCinza(imagemRGBA, largura, altura, f);
    var pts = marcasDeCanto(red);
    tempos.cantos = agora() - t.inicio;
    if (!pts) {
      return falha('Não achei os quatro quadrados pretos dos cantos. Fotografe de novo com a folha inteira na foto, ' +
        'reta e sem sombra forte por cima.', { tempos: tempos });
    }
    // centro do bloco reduzido de volta na foto: o pixel reduzido i cobre os pixels f·i … f·i+f−1
    var cantos = pts.map(function (p) { return [p[0] * f + (f - 1) / 2, p[1] * f + (f - 1) / 2]; });

    var W = Math.trunc((X1 - X0) * S), H = Math.trunc((Y1 - Y0) * S);
    var jsqr = opcoes.jsQR || (typeof jsQR !== 'undefined' ? jsQR : null); // eslint-disable-line no-undef
    // Os quatro quadrados são iguais: só o QR diz qual canto é o de cima. Folha de cabeça para baixo ou de lado
    // (medido em 23/10/2026: girada 180° e lida com página esperada, 32 de 42 linhas saíam erradas) é tentada
    // nas quatro posições. A primeira é a de sempre, então a foto normal não paga nada a mais.
    var giro = [cantos[0], cantos[1], cantos[3], cantos[2]]; // sup-esq, sup-dir, inf-dir, inf-esq: sentido horário
    var tentativas = [], reta = null, qr = null, t1, c4 = null;
    tempos.endireitar = 0; tempos.qr = 0;
    for (var k = 0; k < 4 && !qr; k++) {
      c4 = [giro[k], giro[(k + 1) % 4], giro[(k + 3) % 4], giro[(k + 2) % 4]];
      var hm = homografia([[0, 0], [W, 0], [0, H], [W, H]], c4);
      if (!hm) return falha('Os cantos achados não formam uma folha. Fotografe de novo com a folha inteira na foto.', { tempos: tempos });
      t1 = agora();
      reta = endireitar(imagemRGBA, largura, altura, hm, W, H);
      tempos.endireitar += agora() - t1;
      t1 = agora();
      qr = lerQR(reta, W, H, lay, X0, Y0, jsqr);
      tempos.qr += agora() - t1;
      tentativas.push({ reta: reta, cantos: c4 });
    }
    if (!qr) {
      // Sem QR em nenhuma posição, a página esperada só vale se exatamente uma posição tem "cara de QR" no
      // lugar do QR. Senão, a página esperada faria ler uma folha girada como se estivesse em pé.
      var comCara = tentativas.filter(function (r) { return pareceQR(r.reta, W, H, lay, X0, Y0); });
      reta = comCara.length === 1 ? comCara[0].reta : null;
      if (reta) c4 = comCara[0].cantos;
    }
    var pagina = null, id = null;
    if (qr && qr.lastIndexOf('|p') >= 0) {
      var cortar = qr.lastIndexOf('|p');
      id = qr.slice(0, cortar);
      pagina = parseInt(qr.slice(cortar + 2), 10);
    }
    if (opcoes.idEsperado && id && id !== opcoes.idEsperado) {
      return falha('Esta folha é de outra lista (' + id + '). Confira se fotografou a lista certa.', { qr: qr, tempos: tempos });
    }
    if (!pagina) {
      if (!reta) {
        return falha('Não consegui ler o código QR nem saber de que lado está a folha. Fotografe de novo com a folha ' +
          'inteira na foto, em pé, sem reflexo em cima do código.', { qr: qr, tempos: tempos });
      }
      if (opcoes.paginaEsperada) pagina = opcoes.paginaEsperada;
      else if (!Array.isArray(layouts)) pagina = 1;
      else {
        return falha('Não consegui ler o código QR da folha. Fotografe de novo com a folha inteira na foto, ' +
          'sem reflexo em cima do código.', { qr: qr, tempos: tempos });
      }
    }
    if (pagina < 1 || pagina > lista.length) {
      return falha('A folha diz ser a página ' + pagina + ', mas a lista tem ' + lista.length + '.', { qr: qr, tempos: tempos });
    }
    lay = lista[pagina - 1];

    t1 = agora();
    var tinta = new Uint8Array(W * H);
    function px(xm, ym) { return [Math.trunc((xm - X0) * S), Math.trunc((ym - Y0) * S)]; }
    function fracaoDisco(xm, ym, rmm) {
      var c = px(xm, ym), r = Math.trunc(rmm * S * 0.7); // 70 % do raio: o contorno impresso fica de fora
      var n = 0, s = 0;
      limiarRegiao(reta, W, H, tinta, c[0] - r, c[1] - r, c[0] + r + 1, c[1] + r + 1);
      for (var dy = -r; dy <= r; dy++) {
        var y = c[1] + dy;
        if (y < 0 || y >= H) continue;
        for (var dx = -r; dx <= r; dx++) {
          var x = c[0] + dx;
          if (x < 0 || x >= W || dx * dx + dy * dy > r * r) continue; // mesmo disco que o cv2.circle desenha
          n++; s += tinta[y * W + x];
        }
      }
      return n ? s / n : 0;
    }
    function recorte(x0, y0, x1, y1, mx, my) {
      var a = px(x0 + mx, y0 + my), b = px(x1 - mx, y1 - my);
      var r = [Math.max(a[0], 0), Math.max(a[1], 0), Math.min(b[0], W), Math.min(b[1], H)];
      limiarRegiao(reta, W, H, tinta, r[0], r[1], r[2], r[3]);
      return r;
    }
    function coberturaAssinatura(q) {
      // A assinatura do vizinho invade a linha em poucos pontos; a da própria pessoa atravessa o campo. Mede a
      // fração das colunas com tinta na faixa do meio da linha (decisão do leitor.py, 23/10, 16h).
      var r = recorte(q[0], q[1], q[2], q[3], 1, 1.6), cols = 0, total = r[2] - r[0];
      if (total <= 0 || r[3] <= r[1]) return 0;
      for (var x = r[0]; x < r[2]; x++) {
        for (var y = r[1]; y < r[3]; y++) if (tinta[y * W + x]) { cols++; break; }
      }
      return cols / total;
    }
    function tintaRetangulo(q) {
      var r = recorte(q[0], q[1], q[2], q[3], 1, 1.2), s = 0, n = 0; // longe das linhas da tabela
      for (var y = r[1]; y < r[3]; y++) for (var x = r[0]; x < r[2]; x++) { s += tinta[y * W + x]; n++; }
      return n ? s / n : 0;
    }

    var linhas = [], manuais = [];
    (lay.linhas || []).forEach(function (l) {
      var fb = fracaoDisco(l.bola[0], l.bola[1], lay.r_bola), ass = coberturaAssinatura(l.ass);
      var estado = fb > LIM.presente ? 'presente' : (fb > LIM.conferir ? 'conferir' : 'ausente');
      var avisos = [];
      if (estado === 'presente' && ass < LIM.semAssinatura) avisos.push('bolinha sem assinatura');
      if (estado === 'ausente' && ass > LIM.assinaturaSemBolinha) avisos.push('assinatura sem bolinha');
      if (estado === 'conferir') avisos.push('bolinha meio marcada');
      linhas.push({ mat: l.mat, estado: estado, tinta_bola: arred(fb, 3), assinatura: arred(ass, 3), avisos: avisos });
    });
    // linha em branco escrita à mão: o leitor não decifra letra; diz que tem tinta e pede a confirmação
    (lay.manuais || []).forEach(function (m) {
      var esc = tintaRetangulo(m.escrita);
      manuais.push({
        linha: m.linha, temTinta: esc > LIM.escritaManual, tinta_escrita: arred(esc, 3),
        tinta_bola: arred(fracaoDisco(m.bola[0], m.bola[1], lay.r_bola), 3)
      });
    });
    tempos.limiar_e_medir = agora() - t1;
    tempos.total = agora() - t.inicio;
    return { ok: true, pagina: pagina, id: id, qr: qr, linhas: linhas, manuais: manuais, erro: null,
      cantos: c4, tempos: tempos }; // cantos na ordem da folha em pé: sup-esq, sup-dir, inf-esq, inf-dir
  }

  return { ler: ler, LIMIARES: LIM, PX_POR_MM: S };
})();

if (typeof module === 'object' && module && module.exports) module.exports = LeitorLista;
