# Blocos

Cada pasta aqui é de **uma frente só**, a dona do bloco: `blocos/operacao/` é da Operação, `blocos/seguranca/` da
Segurança, e assim por diante. A casca (a raiz do repositório) é da frente App Compel.

> **Estado em 27/10/2026 (casca 1.11):** dois blocos no repositório, `seguranca` (0.4.1) e `operacao` (o `campo/` 7v.1 da
> Operação, integrado pelo App por decisão do Dalton às 20h07). O Início tem o **Acesso rápido** (ver abaixo, `atalhos`).
>
> **Estado em 24/10/2026 (casca 1.7):** nenhum bloco entrou ainda; o primeiro a chegar é o da Segurança. A casca já tem tudo o que um bloco usa: o cartão no Início, a
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
| `atalhos` | (celular e ambas; opcional) os formulários do **Acesso rápido** do Início: `[{ "id", "nome", "icone", "perfis" }]`. `perfis` são os perfis da pessoa **neste módulo** (o que o login devolve da `ACESSOS`); `"*"` vale para todos. O toque abre a `entrada` com o contexto `{ abrir: "<id>" }`, sem sinal: a tela lê pelo `Casca.iniciar().contexto` e vai direto ao formulário |
| `completo` | (opcional) os perfis que veem o cartão do módulo em **Sistemas completos**. Sem ele, todos veem. Num bloco `ambas` com atalhos, esse cartão abre o sistema do Google (com o token), porque a tela do celular já está nos botões de cima |

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
| `iniciar(id)` | confere a entrada de hoje e devolve `{ pessoa, bloco, contexto, de }`. Sem entrada, leva a pessoa de volta para entrar. `contexto` e `de` só vêm quando outro bloco abriu esta tela (ver abaixo); senão, `null` |
| `pessoa()` | nome, nome completo, matrícula, função, lotação, bases e o `fuso` da base (o mesmo que fecha a entrada do dia; conte o dia por ele, e não pelo fuso do celular). **Nunca o CPF**, a sessão do aparelho ou o verificador; nenhum campo `base` |
| `carimbo(emNomeDe)` | quem entrou no celular e em nome de quem o registro é (D20), com a hora. Todo registro leva um |
| `pedirEnvio()` | depois de gravar no banco do bloco: pede ao Android que acorde o app e, com sinal, manda agora |
| `banco(nome, versao, lojas)` | os ajudantes do banco do bloco (o mesmo `cascaBanco` do arquivo de envio) |
| `guardarSessao(matricula, sessao, validaAte)` | guarda a sessão de uma pessoa no servidor do bloco |
| `foto(arquivo, opcoes)` | reduz a foto até caber no teto, grava a marca d'água (`opcoes.linhas`) e lê o GPS: `{ blob, largura, altura, meta }` |
| `sinal()`, `aoMudarOSinal(fn)` | o sinal agora, e quando ele muda |
| `voltar()` | de volta para quem abriu a tela: o bloco que chamou, ou o Início |
| `abrirBloco(id, contexto)` | abre a tela do celular de outro bloco levando o contexto. Funciona sem sinal. Devolve `{ erro }` se o contexto for recusado |
| `sessaoNova(extra)` | (só quem envia) cria a sessão desta pessoa no servidor do bloco, a partir do token do Núcleo. Chamar no toque, com sinal (ver abaixo) |
| `postar(corpo, ms)` | (só quem envia; casca 1.11) um pedido da **tela** ao servidor do bloco, fora da fila (o "ligar", o pacote, um documento): o endereço do login, conferido pelo resumo, com o `app` e a `versao` do bloco. Recusa com `{ servidorRecusado, msg }` quando o endereço não bate, e com `{ rede, comSinal, msg }` sem resposta. Não leva a sessão: o que precisa dela vai pela fila |
| `temSessao()` | `{ tem, venceu, valeAte }`: se a sessão desta pessoa no servidor do bloco existe e não venceu. Nunca devolve a sessão |
| `ajuda(elemento, texto)` | o "Como funciona esta tela", igual ao das telas da casca. Toda tela tem a dela |
| `abrirSistema()` | (espécie ambas) abre a tela do sistema do bloco com a pessoa entrada. Chamar no toque |

## A sessão do bloco: `Casca.sessaoNova(extra)`

O servidor do bloco cria a sessão dele a partir do token do Núcleo (contrato do Núcleo, 2.2). **O token nunca passa pela
tela do bloco** (FRONTEIRA §2.1, regra 1): a casca o pede e posta direto ao servidor.

1. A casca confere o endereço do servidor pelo resumo **antes** de pedir o token: com o resumo errado, nenhum token é
   gasto.
2. Pede o token ao login. O termo pendente, a sessão cortada (`pedirCpf`), a senha mudada (`entrarDeNovo`) e a troca
   pedida (`precisaTrocar`) voltam como recusa, com a frase, como no `abrirSistema`.
3. Posta ao servidor do bloco `{ acao: 'sessaoDoNucleo', token, ...extra }`, com o `app` e a `versao` do `bloco.json`, o
   relógio e o fuso, como todo postar da casca. O `extra` não troca `acao`, `token`, `sessao`, `app`, `versao`, `relogio`
   nem `fuso`. A Operação manda nele o `aparelho` (a chave do "ligar", que mora no banco dela).
4. O servidor responde `{ ok: true, sessao, valeAte, ... }` ou `{ ok: false, erro, <marca> }`.
   - Com `tokenRecusado`, a casca pede outro token e tenta **uma** vez mais.
   - Se a resposta traz `matricula` ou `mat` de outra pessoa, nada é guardado (`outraPessoa`).
   - A sessão fica guardada pela matrícula de quem entrou no celular, com o `valeAte` (milissegundos desde 1970, ou
     data em texto). Ela sobe com cada registro pelo `ctx.sessaoDe` do envio.
5. **A tela recebe a resposta do servidor sem a sessão e sem o token** (o `nome`, o `perfil`, as `funcoes` e o resto),
   ou a recusa com a marca. Sem sinal: `{ ok: false, semSinal }`. Sem matrícula: `{ ok: false, semMatricula }`.

Cada chamada gasta um token do Núcleo: pergunte antes `Casca.temSessao()` e chame o `sessaoNova` só quando não houver
sessão, quando ela venceu ou quando o servidor do bloco a recusar.

## Abrir outro bloco com contexto: `Casca.abrirBloco(id, contexto)`

É o "uma tela, duas portas" (FRONTEIRA §5.4): o diário da Operação abre o checklist da Segurança na etapa da equipe do
dia. **Vale para todo bloco**, e é uma forma só (cartas nº 1 do Módulo Segurança, do PESSOAS e da Linha ao App).

- **O caminho:** `blocos/<id>/<entrada>#de=<quem chamou>&ctx=<base64url do JSON em UTF-8>`. É o fragmento do endereço:
  ele nunca sai do celular (não vai no pedido da página nem a servidor nenhum) e funciona sem sinal.
- **Quem recebe** lê pelo `Casca.iniciar`, que devolve o `contexto` já aberto e o `de`. Não leia o fragmento por conta
  própria: a casca confere na volta, porque um link pode ser escrito à mão.
- **O que é proibido no contexto**, na ida e na volta: campo com `cpf`, `token`, `sessao`, `senha` ou `verificador` no
  nome; valor com a forma de um CPF (11 algarismos, com ou sem pontos); mais de 8.000 caracteres. Na ida, a casca recusa
  e não abre nada; na volta, o contexto chega `null`, e não pela metade.
- **O contexto é uma sugestão de quem chamou, nunca permissão.** O que decide quem pode fazer o quê é o servidor de quem
  recebe.
- **O `voltar()`** de quem foi aberto assim leva de volta à tela de quem chamou.
- **Tela do sistema** (espécie `sistema`, aberta numa aba com `?t=`): não leva contexto hoje, porque nenhum módulo
  precisou. Quando precisar, vai um parâmetro `ctx` no endereço, com a mesma forma e as mesmas proibições, combinado por
  carta antes.

## O estilo do bloco

O estilo é o da casca (`estilo/nucleo.css`, a folha do Portal). Um `<style>` curto na tela do bloco é aceito, com duas
condições: **toda classe dele começa pelo prefixo do bloco** (`seg-` na Segurança), e ele não redefine nenhuma classe
da folha (`n-…`, `app-…`, `btn`, `cartao`, `aviso`…). Nome de classe que já tem dono na folha muda a tela da casca sem
ninguém ver (a família 39 do `02_LICOES`).

## Quem publica a pasta

A frente dona do bloco entrega a pasta inteira ao Dalton, com o `servidor.sha256` calculado do endereço de verdade, e
a frente App sobe a pasta como veio, num envio só dela (a conferência recusa envio que mexe em duas áreas). A casca não
edita nada dentro da pasta: se a conferência recusar, a pasta volta para a frente dona.

Antes de o cartão aparecer no Início, o módulo do bloco precisa estar na `MODULOS` da CENTRAL (ativo, com `URL` e
`ORDEM`) e quem o vê precisa de linha na `ACESSOS`. É cadastro do Dalton.

## O que um bloco não faz

- Mexer fora da pasta dele. Um envio que mexe em duas áreas é recusado, e o que atravessa vai por carta.
- Guardar código do Apps Script, endereço de servidor, planilha ou pasta, ou CPF. O repositório é público.
- Ter entrada, fila de envio ou service worker próprios: são serviços da casca, um para o app inteiro.
- Guardar dado pessoal fora do banco dele.
