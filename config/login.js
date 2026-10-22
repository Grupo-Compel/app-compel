/*
 * O ENDEREÇO DO LOGIN DO NÚCLEO — o único endereço de servidor deste repositório.
 *
 * Por que está escrito aqui (decisão do Dalton, 20/10/2026, a "saída B" da carta nº 9 do App ao Núcleo):
 *   - o endereço do login não é segredo: ele vai estar em todo celular que tiver o app;
 *   - quem protege a entrada é a senha e a trava por erros, no Núcleo, e não o endereço escondido;
 *   - e NENHUM caminho em uso pode trocá-lo (carta nº 8 do Núcleo). Um link, uma configuração baixada ou uma resposta
 *     de servidor que mudasse este endereço deixaria um login falso receber a senha das pessoas. Foi o que se achou
 *     no link do supervisor do app antigo do campo, em 19/10/2026.
 *
 * Mudar este endereço é versão nova do app, de propósito o caminho mais lento. E ele não deve mudar nunca: toda
 * republicação do projeto do login é "Implantar › Gerenciar implantações › editar a que já existe", e não
 * "Nova implantação" (regra do Núcleo, carta nº 7).
 *
 * O endereço do servidor de cada bloco NÃO vem para cá: ele chega na resposta do login, com os módulos da pessoa.
 * A conferência do repositório (conferencia/conferir.js) recusa endereço de servidor em qualquer outro arquivo.
 *
 * Preenchido em 22/10/2026 com o /exec do projeto "Login do App Compel", que o Dalton implantou e mandou às 07h48
 * (o projeto foi construído pelo Núcleo; carta nº 14 do Núcleo ao App).
 */
var ENDERECO_DO_LOGIN = 'https://script.google.com/macros/s/AKfycbyHxNB5Rv3QqFdf6KAwnAVIyoKVXUZysxqXeuXxl4x1aiSawhfk1pdYIr5MFe-R5A4/exec';
