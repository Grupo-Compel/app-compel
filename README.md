# App Compel

O aplicativo de celular de quem vai a campo na Compel: um app só para os sistemas da Plataforma Compel (Operação,
Segurança, Departamento Pessoal, RH). Quem não vai a campo usa o Portal, no computador.

É uma página web instalável (PWA), em JavaScript puro, publicada pelo GitHub Pages. O app funciona sem sinal e envia
quando o sinal volta.

> **Estado em 21/10/2026:** a casca tem as telas de entrada (CPF e senha, primeiro acesso, senha temporária, esqueci
> a senha, entrada sem sinal), o Início, os Avisos e o Perfil. **Ninguém entra ainda:** o endereço do login do Núcleo,
> em `config/login.js`, está vazio até o projeto do login nascer (carta nº 12 do App ao Núcleo). Nenhum bloco entrou.

## As regras deste repositório

**O repositório é público.** Então, aqui só entra o código do app:

- **nunca código do Apps Script.** O servidor de cada módulo mora no projeto dele;
- **nunca dado da Compel**: nem planilha, nem pasta, nem nome de pessoa, nem massa de teste com dado real;
- **nunca CPF**, em código, em teste ou em tela;
- **nunca endereço de servidor, com uma exceção só:** o endereço do login do Núcleo, em `config/login.js` (decisão do
  Dalton, 20/10/2026). Ele não é segredo, porque vai estar em todo celular, e nenhum caminho em uso o troca. O
  endereço do servidor de cada bloco chega na resposta do login, e nunca fica aqui.

## Quem edita o quê

| Quem | Edita |
|---|---|
| **Frente App Compel** (a casca) | a raiz: a entrada, o Início, os Avisos, o Perfil, a fila de envio, o service worker, as regras e a conferência |
| **A frente dona de cada bloco** | só a pasta dela, `blocos/<bloco>/` (ver `blocos/README.md`) |
| **Núcleo** | nada aqui. O login, a identidade e as comunicações são dele, no Apps Script |

**O visual é o do Portal.** `estilo/nucleo.css` é uma cópia da folha do Núcleo, e `estilo/fontes/` guarda as três
fontes da plataforma para o app abrir sem sinal. Não se edita a cópia aqui: mudança de visual é do Núcleo, chega por
carta, e a casca troca o arquivo inteiro.

O que atravessa de uma área para outra é pedido por carta entre as frentes. As regras completas estão no documento
`FRONTEIRA_APP_COMPEL.md`, na base de conhecimento do projeto.

## A conferência

Toda publicação passa antes pela conferência (`conferencia/conferir.js`). Se ela achar alguma coisa, nada é
publicado. Ela recusa:

1. código do Apps Script;
2. endereço de servidor, planilha, documento ou pasta, fora de `config/login.js`;
3. CPF (onze algarismos com os dígitos verificadores certos);
4. bloco sem o `bloco.json`, ou com o servidor escrito como endereço;
5. um envio que mexe em mais de uma área (a casca ou um bloco).

Antes dela, roda a **bateria da casca** (`testes/casca.js`), que abre o app no Chromium e recusa a publicação se uma
regra da entrada quebrar, se uma tela não tiver ajuda ou se uma tela passar da largura do celular (360 e 412 px). O
login do Núcleo, nessa bateria, é imitado dentro do próprio teste; o app publicado não tem login imitado.

Para rodar à mão:

```
node conferencia/teste.js      # o teste: cada caso errado tem de ser recusado
node conferencia/conferir.js   # a conferência deste repositório
node testes/casca.js           # a bateria da casca (precisa do Playwright)
```

## Publicar

A publicação é automática: um envio para a `main` roda a conferência e, se ela passar, publica
(`.github/workflows/publicar.yml`). O GitHub Pages do repositório precisa estar em *Settings › Pages › Source:
GitHub Actions*.
