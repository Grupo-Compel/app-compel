# Blocos

Cada pasta aqui é de **uma frente só**, a dona do bloco: `blocos/operacao/` é da Operação, `blocos/seguranca/` da
Segurança, e assim por diante. A casca (a raiz do repositório) é da frente App Compel.

## O que cada bloco tem de ter

Um arquivo `bloco.json` na pasta dele, que diz à casca quem ele é. Sem ele, a conferência recusa a publicação.

```json
{
  "nome": "Operação",
  "dono": "Operação",
  "especie": "ambas",
  "quemVe": ["ENCARREGADO", "CAMPO"],
  "servidor": "OPERACAO"
}
```

| Campo | O que é |
|---|---|
| `nome` | o nome que aparece no cartão do Início |
| `dono` | a frente que edita esta pasta |
| `especie` | `celular` (tela que funciona sem sinal, nesta pasta), `sistema` (a tela do próprio sistema, aberta numa aba por cima do app, com sinal) ou `ambas` |
| `quemVe` | os perfis ou funções, vindos do Núcleo, que veem o bloco |
| `servidor` | o **nome** do módulo na aba `MODULOS` da CENTRAL. **Nunca o endereço**: o endereço chega na resposta do login |

A lista vai crescer (o ícone, os arquivos que o celular guarda, o que desce no pacote do dia) à medida que as frentes
fecharem as regras com a casca, por carta.

## O que um bloco não faz

- Mexer fora da pasta dele. Um envio que mexe em duas áreas é recusado, e o que atravessa vai por carta.
- Guardar código do Apps Script, endereço de servidor, planilha ou pasta, ou CPF. O repositório é público.
- Ter entrada, fila de envio ou service worker próprios: são serviços da casca, um para o app inteiro.
