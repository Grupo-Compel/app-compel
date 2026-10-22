# Blocos

Cada pasta aqui é de **uma frente só**, a dona do bloco: `blocos/operacao/` é da Operação, `blocos/seguranca/` da
Segurança, e assim por diante. A casca (a raiz do repositório) é da frente App Compel.

> **Estado em 21/10/2026:** nenhum bloco entrou ainda. A casca já tem tudo o que um bloco usa: o cartão no Início, a
> tela do celular guardada para abrir sem sinal, a fila de envio com o segundo plano, a tela de Envio e a conferência
> da declaração. A bateria da casca prova cada parte com um bloco de exemplo (`testes/bloco-exemplo/`), que nunca é
> publicado. **Ele é o molde:** copie os quatro arquivos dele para começar.

## A declaração: `bloco.json`

Sem ela, ou com ela incompleta, a conferência recusa a publicação.

```json
{
  "nome": "Operação",
  "dono": "Operação",
  "especie": "ambas",
  "quemVe": ["ENCARREGADO", "CAMPO"],
  "servidor": "OPERACAO",
  "versao": "5g-1",
  "entrada": "index.html",
  "arquivos": ["index.html", "app.js", "fila.js", "pdfjs/pdf.min.js", "pdfjs/pdf.worker.min.js"],
  "cache": "operacao-campo-",
  "envia": { "etiqueta": "enviar-diarios", "app": "campo", "script": "fila.js" }
}
```

| Campo | O que é |
|---|---|
| `nome` | o nome do bloco na tela de Envio (o do cartão do Início vem da `MODULOS`) |
| `dono` | a frente que edita esta pasta |
| `especie` | `celular` (tela que funciona sem sinal, nesta pasta), `sistema` (a tela do próprio sistema, aberta numa janela por cima do app, com sinal) ou `ambas` |
| `quemVe` | os perfis ou funções, vindos do Núcleo, que veem o bloco. Quem decide de verdade é a `ACESSOS`: o cartão só aparece para quem o login devolve o módulo |
| `servidor` | o **nome** do módulo na aba `MODULOS` da CENTRAL. **Nunca o endereço**: o endereço chega na resposta do login. É também por ele que o cartão do Início acha o bloco |
| `versao` | a versão do bloco. Entra no nome do cache: **mudou um arquivo da lista, mude a versão**, senão o celular continua com o arquivo velho |
| `entrada` | (celular e ambas) o arquivo que o cartão do Início abre |
| `arquivos` | (celular e ambas) tudo o que o celular guarda para a tela abrir sem sinal, com o caminho a partir desta pasta. Todos têm de existir |
| `cache` | (celular e ambas) o prefixo do cache deste bloco, só dele. A casca guarda o bloco em `<cache><versao>` e apaga só as versões velhas com este prefixo, e só depois de a nova estar inteira guardada |
| `envia` | (só quem envia) `etiqueta`: o nome do envio em segundo plano, único no app; `app`: o que o servidor do bloco espera no campo `app`; `script`: o arquivo com as funções de envio (tem de estar em `arquivos`) |

**Quem envia publica também `servidor.sha256`:** uma linha só, com o resumo SHA-256 do endereço do servidor do bloco
(o `url` da `MODULOS`, sem os espaços das pontas). Antes de cada envio, a casca confere o endereço que veio do login
contra esse resumo. Se não bater, nada sai, nada se apaga, e a tela de Envio diz *"O endereço do servidor de <bloco>
mudou. Avise a administração."* O conserto de uma troca de implantação de propósito é republicar o bloco com o resumo
novo. **Um resumo só**: um segundo seria uma segunda porta (carta nº 8 do App à Operação).

Para calcular o resumo: `printf '%s' 'https://script.google.com/macros/s/…/exec' | sha256sum` (o endereço inteiro,
sem quebra de linha no fim). O endereço não entra no repositório; só o resumo.

## O arquivo de envio (`envia.script`)

Roda **na tela e no service worker da casca**, então não usa `document` nem `window`. Ele registra duas funções:

```js
var MEU_BANCO = cascaBanco('operacao-campo', 1, { config: 'chave', diarios: 'id', fotos: 'id' });

cascaBlocoEnvia('operacao', {
  pendentes: function () { /* Promise do número de registros esperando */ },
  enviar: function (ctx) { /* Promise do resumo { enviados, pendentes, erro, semRede, servidorFora } */ }
});
```

O `ctx` que a casca entrega:

| | |
|---|---|
| `ctx.postar(corpo, ms)` | manda ao servidor do bloco, já conferido pelo resumo: texto puro, 90 s, com o `app` e a `versao` do bloco, o relógio e o fuso do celular. Erro de rede vem como `{ rede, comSinal, msg }` ("sem sinal" separado de "com sinal, sem resposta") |
| `ctx.sessaoDe(matricula)` | a sessão daquela pessoa no servidor do bloco (no celular da equipe, cada registro sobe com a sessão de quem o fez) |
| `ctx.enviadoPor` | quem pediu o envio: `na hora`, `Enviar agora`, `ao abrir`, `o sinal voltou` ou `segundo plano` |

A casca põe a trava única (a tela e o segundo plano nunca mandam ao mesmo tempo), a paciência do segundo plano (5, 15,
30 e 60 s) e a anotação das 10 últimas vezes que o Android acordou o app. O que vai em cada envio, a ordem e o que
fazer com cada resposta são do bloco.

## A tela do celular

Carrega, nesta ordem, e começa por `Casca.iniciar('<pasta do bloco>')`:

```html
<link rel="stylesheet" href="../../estilo/fontes.css">
<link rel="stylesheet" href="../../estilo/nucleo.css">
<script src="../../config/login.js"></script>
<script src="../../servicos.js"></script>
<script src="../indice.js"></script>
<script src="../../casca.js"></script>
<script src="fila.js"></script>   <!-- o arquivo de envio, se o bloco envia -->
```

| `Casca.` | |
|---|---|
| `iniciar(id)` | confere a entrada de hoje e devolve `{ pessoa, bloco }`. Sem entrada, leva a pessoa de volta para entrar |
| `pessoa()` | nome, nome completo, matrícula, função, lotação e bases. **Nunca o CPF**, a sessão do aparelho ou o verificador; nenhum campo `base` |
| `carimbo(emNomeDe)` | quem entrou no celular e em nome de quem o registro é (D20), com a hora. Todo registro leva um |
| `pedirEnvio()` | depois de gravar no banco do bloco: pede ao Android que acorde o app e, com sinal, manda agora |
| `banco(nome, versao, lojas)` | os ajudantes do banco do bloco (o mesmo `cascaBanco` do arquivo de envio) |
| `guardarSessao(matricula, sessao, validaAte)` | guarda a sessão de uma pessoa no servidor do bloco |
| `foto(arquivo, opcoes)` | reduz a foto até caber no teto, grava a marca d'água (`opcoes.linhas`) e lê o GPS: `{ blob, largura, altura, meta }` |
| `sinal()`, `aoMudarOSinal(fn)` | o sinal agora, e quando ele muda |
| `voltar()` | de volta ao Início |
| `ajuda(elemento, texto)` | o "Como funciona esta tela", igual ao das telas da casca. Toda tela tem a dela |
| `abrirSistema()` | (espécie ambas) abre a tela do sistema do bloco com a pessoa entrada. Chamar no toque |

## O que um bloco não faz

- Mexer fora da pasta dele. Um envio que mexe em duas áreas é recusado, e o que atravessa vai por carta.
- Guardar código do Apps Script, endereço de servidor, planilha ou pasta, ou CPF. O repositório é público.
- Ter entrada, fila de envio ou service worker próprios: são serviços da casca, um para o app inteiro.
- Guardar dado pessoal fora do banco dele.
