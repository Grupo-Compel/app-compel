# Regras do projeto — App Compel (celular)

Este repositório é o aplicativo de celular da Plataforma Compel: uma página instalável (PWA), em JavaScript puro, publicada pelo GitHub Pages. Quem trabalha aqui é a frente **App** no Code. O que vale está também no `README.md` e em `blocos/README.md`; este arquivo junta as regras de trabalho.

## O repositório é público
- **Nunca** código do Apps Script, dado da Compel (planilha, pasta, nome de pessoa, massa de teste com dado real), CPF ou endereço de servidor.
- **Única exceção:** o endereço do login do Núcleo em `config/login.js` (Dalton, 20/10/2026). O endereço do servidor de cada bloco chega na resposta do login; aqui fica só o resumo SHA-256 dele (`blocos/<bloco>/servidor.sha256`).
- Nenhum dado pessoal em teste, exemplo ou carta. Use dados inventados.

## Quem edita o quê
- A frente App edita **a casca** (a raiz: entrada, Início, Avisos, Perfil, fila de envio, service worker, regras e conferência).
- Cada bloco (`blocos/<bloco>/`) é da frente dona dele. A frente App só mexe num bloco para integrar ou conferir, e avisa a dona por carta.
- `estilo/nucleo.css` é cópia da folha do Núcleo: não se edita aqui, a casca troca o arquivo inteiro quando o Núcleo mandar versão nova.
- No `sgi-compel`, a frente App escreve **só** em `docs/app/` (as cartas dela). Cartas: `docs/app/CARTA_APP_PARA_<PARA>_<n>.md`, cabeçalho de três linhas (Dalton decide / Afeta o todo / Espera), corpo curto, sem dado pessoal. Regras completas no `CLAUDE.md` do `sgi-compel`.

## Uma área por envio
Cada envio (commit que vai ao `main`) mexe em **uma área só**: a casca **ou** um bloco. A conferência recusa mistura. Se um envio for recusado só por isso, o seguinte publica junto o anterior (limite conhecido, ver `.github/workflows/publicar.yml`).

## Conferência e bateria (antes de qualquer envio ao `main`)
1. `node conferencia/teste.js` — cada caso errado tem de ser recusado.
2. `node testes/casca.js` — a bateria da casca (abre o app no Chromium, nas larguras 360 e 412 px; precisa do Playwright 1.56).
3. `node conferencia/conferir.js` — a conferência da árvore (Apps Script, endereço, CPF, `bloco.json`, áreas).
Se qualquer uma falhar, nada é publicado. Teste novo só vale **depois de visto falhando**: quebre o código de propósito, mostre o teste acusando, e só então conserte. Teste que espera conserto de outra frente fica na lista `ESPERANDO`.

## Publicar: só com o "publica" do Dalton
- **Ir ao `main` é ir para o celular de todo mundo.** Nada vai ao `main` sem: bateria e conferência verdes, carta à Revisão (`docs/app/CARTA_APP_PARA_REVISAO_<n>.md`) e o **"publica" do Dalton**, dito por ele nesta conversa.
- Trabalho em ramo próprio `claude/app-...`. Nunca empurrar para o `main` por conta própria, nem abrir pull request sem pedido.
- Mudou arquivo da lista de um bloco: mude a `versao` dele no `bloco.json` (entra no nome do cache), senão o celular fica com o arquivo velho. Mudou a casca: suba `VERSAO_APP` em `servicos.js` e a versão do `sw.js`.
- Quem publica acrescenta a nota em `notas.json` na mesma entrega, em português claro, para quem usa o app no campo.
- Quando um módulo virar do Apps Script para o servidor novo, o endereço do bloco dele muda no mesmo dia; a data vem da Linha, por carta. Nesse dia o `servidor.sha256` do bloco é republicado.

## Bateria do celular e uso sem sinal
O app funciona sem sinal e envia quando o sinal volta (fila de envio, segundo plano do Android, trava única: a tela e o segundo plano nunca mandam ao mesmo tempo). Não acrescentar nada que gaste bateria à toa (sondagem em laço, localização contínua, relógio acordando o aparelho). A localização, quando um bloco a usar, é lida só na hora de gravar um registro.

## Como escrever
- Comentários em **português**, explicando o **porquê**; se afirmam uma medição, levam a data dela.
- Arquivo inteiro na entrega; nunca "ache esta parte e troque".
- Português claro: o Dalton não programa. Diga o que ele precisa fazer, na ordem.
- Nada de afirmar sobre código que não foi lido.

## Começo de toda resposta
`git pull` nos dois repositórios; ler as cartas novas que citam o App em `docs/*/` do `sgi-compel` e na base de conhecimento (os módulos ainda no Apps Script escrevem lá); responder na mesma volta.
