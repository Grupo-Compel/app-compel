/*
 * O MODO DA OPERAÇÃO NO APP: qual servidor o cartão Operação usa.
 *
 *   'appsscript' (o de hoje): o cartão e o "Diário da equipe" do Início abrem a tela do celular guardada no app
 *                              (blocos/operacao/), que fala com o Apps Script.
 *   'servidor'  (o da virada): o cartão deixa de abrir essa tela e passa a abrir o sistema da Operação no servidor
 *                              novo, pelo endereço que o login devolve para o módulo OPERACAO, com o token do Núcleo
 *                              (o mesmo caminho dos "Sistemas completos"): a pessoa não digita CPF e senha de novo.
 *
 * POR QUE É UMA LINHA SÓ, num arquivo à parte: no dia em que o Dalton avisar que desligou o Apps Script da Operação, a
 * troca é mudar esta palavra (versão nova do app, com a Revisão e o "publica" dele), e voltar atrás é mudá-la de volta.
 * O valor aqui NÃO é endereço de servidor (o endereço chega pelo login), e por isso a conferência do repositório o aceita.
 *
 * ANTES DE TROCAR: a fila do bloco antigo tem de estar vazia nos celulares. Depois da troca o endereço do login deixa de
 * bater com o resumo do bloco (blocos/operacao/servidor.sha256) e ele não envia mais; o que estiver na fila fica
 * guardado, mas preso. Padrão: 'appsscript'. Escrito em 27/11/2026 (carta nº 3 do App).
 */
var MODO_DA_OPERACAO = 'appsscript';
