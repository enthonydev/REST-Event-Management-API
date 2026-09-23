# Event Management API

Uma API REST para organizar eventos, ingressos, produtos e pedidos. O projeto foi construído como um laboratório de backend: a proposta é praticar decisões comuns em sistemas de venda, como validação no servidor, controle de disponibilidade, autenticação e cálculo de pedidos.

## O que a API faz

A aplicação permite criar e cancelar eventos, cadastrar tipos de ingresso e produtos associados a cada evento, registrar usuários e criar pedidos autenticados. O valor final do pedido nunca vem pronto do cliente. O servidor consulta os preços atuais, registra o preço usado na compra e calcula os subtotais e o total.

O escopo atual não inclui pagamento, notificações, QR Code operacional ou integração com serviços externos. O projeto também possui um painel frontend simples em `/ui`, usado para testar a API visualmente. Os eventos têm categoria e podem ser filtrados no painel por categoria e por intervalo de datas.

## Stack

- Node.js
- TypeScript com modo estrito
- Express
- Zod
- JWT e bcrypt
- PostgreSQL e Prisma, com schema preparado em `prisma/schema.prisma`
- Vitest e Supertest
- OpenAPI

## Organização do código

A aplicação mantém o fluxo HTTP separado das regras de domínio. As rotas recebem a requisição, validam os dados e delegam a operação; as regras de negócio decidem se a ação pode acontecer; o armazenamento fica isolado para que possa ser substituído sem mudar o contrato da API.

```text
src/
├── app.ts       # configuração do Express, rotas e tratamento de erros
└── server.ts    # inicialização do servidor HTTP

public/
├── index.html   # painel visual
├── app.js       # chamadas para a API e filtros
└── styles.css   # estilo simples do painel

prisma/
└── schema.prisma

docs/
└── openapi.yaml

tests/
└── api.test.ts
```

Neste primeiro marco, o runtime usa um store em memória. Isso deixa o projeto fácil de executar e testar sem instalar um banco local. O modelo relacional do Prisma já está definido para a próxima etapa de persistência.

## Executando localmente

É necessário ter Node.js 22 ou versão compatível instalada.

```bash
cp .env.example .env
npm install
npm run check
npm test
npm run build
npm run dev
```

Depois de iniciar o servidor, a API estará disponível em `http://localhost:3000`. Para verificar se o processo está ativo:

```bash
curl http://localhost:3000/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "service": "event-management-api"
}
```

## Rotas principais

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/v1/events` | Lista eventos |
| `POST` | `/api/v1/events` | Cria um evento |
| `GET` | `/api/v1/events/:id` | Consulta um evento |
| `PATCH` | `/api/v1/events/:id` | Atualiza os campos enviados |
| `DELETE` | `/api/v1/events/:id` | Cancela o evento |
| `GET` / `POST` | `/api/v1/events/:id/tickets` | Lista ou cria ingressos |
| `GET` / `POST` | `/api/v1/events/:id/products` | Lista ou cria produtos |
| `PATCH` | `/api/v1/products/:id` | Atualiza preço, estoque ou status |
| `POST` | `/api/v1/auth/register` | Cadastra um usuário |
| `POST` | `/api/v1/auth/login` | Retorna um token JWT |
| `GET` / `POST` | `/api/v1/orders` | Lista ou cria pedidos do usuário |
| `GET` | `/api/v1/orders/:id` | Consulta um pedido próprio |
| `POST` | `/api/v1/orders/:id/items` | Adiciona um item ao pedido |
| `POST` | `/api/v1/orders/:id/cancel` | Cancela um pedido |

As rotas de pedido usam o cabeçalho `Authorization`:

```text
Authorization: Bearer <token>
```

## Exemplo de uso

Criar um evento:

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Festival Demo",
    "date": "2026-10-20T20:00:00Z",
    "location": "São Paulo",
    "capacity": 500
  }'
```

O cadastro e o login retornam o token que deve ser usado nas operações de pedido. O cliente envia apenas o identificador do ingresso ou produto e a quantidade. O preço e o total são sempre definidos pela API.

## Regras de negócio importantes

- A capacidade de um evento deve ser maior que zero.
- Ingressos e produtos só podem ser vinculados a eventos existentes.
- Eventos cancelados não aceitam novos ingressos, produtos ou pedidos.
- Uma compra acima da disponibilidade ou do estoque retorna `409 Conflict`.
- Produtos inativos não podem ser vendidos.
- O preço do item é copiado para o pedido no momento da compra.
- Pedidos cancelados não recebem novos itens.
- Um usuário só pode consultar e alterar os próprios pedidos.
- Senhas são armazenadas apenas como hash.
- Dados inválidos retornam `400`; requisições sem autenticação retornam `401`; acesso a recurso de outro usuário retorna `403`.

## Testes e qualidade

Os comandos abaixo executam as verificações principais do projeto:

```bash
npm run check
npm test
npm run build
```

A suíte atual cobre o health check, criação e cancelamento de eventos, validação, recurso inexistente, cadastro, autenticação, criação de pedido e cálculo do total no servidor. O workflow em `.github/workflows/ci.yml` executa essas mesmas verificações em cada alteração enviada ao GitHub.

## Banco de dados

O arquivo `prisma/schema.prisma` descreve as entidades `User`, `Event`, `Ticket`, `Product`, `Order` e `OrderItem`, incluindo relacionamentos, enums, índices e timestamps.

Para preparar o Prisma em um ambiente com PostgreSQL:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

O servidor deste marco ainda utiliza o store em memória. A próxima mudança estrutural é conectar as operações de pedidos ao Prisma usando transações e atualização protegida de estoque e disponibilidade. O comando `npm run db:seed` ainda é demonstrativo: ele imprime um usuário fictício e não grava dados no banco.

## Documentação da API

O contrato OpenAPI está em [`docs/openapi.yaml`](docs/openapi.yaml). Ele serve como referência para os endpoints, parâmetros, autenticação e respostas previstas.

## Próximos passos

1. Substituir o store em memória por repositórios Prisma.
2. Adicionar migrations e testes de integração com PostgreSQL.
3. Usar transações nas operações que alteram estoque e disponibilidade.
4. Expandir a documentação de exemplos e respostas de erro.
5. Preparar uma configuração de demonstração com dados fictícios.

## Resultado da revisão técnica

Revisei o projeto comparando o comportamento real da aplicação com o modelo de domínio, o schema Prisma, os testes e a documentação. O projeto está adequado para estudo e demonstração local, mas ainda tem limites que precisam ser conhecidos antes de tratá-lo como uma API de produção:

- O runtime usa `Map` em memória. Os dados desaparecem quando o processo reinicia, mesmo que o schema PostgreSQL já esteja definido.
- O arquivo `prisma/seed.ts` ainda não usa o Prisma Client. Por isso, o script de seed não cria registros de verdade.
- A especificação OpenAPI documenta as rotas principais, mas ainda não cobre todos os endpoints de produtos, itens e cancelamento de pedidos.
- A lógica ainda está concentrada em `src/app.ts`. Para crescer sem ficar difícil de manter, seria melhor separar rotas, validações, serviços e repositórios.
- A alteração de estoque acontece antes de terminar toda a operação do pedido. Sem uma transação, uma falha inesperada pode deixar o estoque reduzido e o pedido incompleto.
- O cancelamento do pedido muda o status, mas ainda não devolve ao estoque ou à disponibilidade os itens que já foram reservados.
- `Event.capacity` existe no modelo, mas ainda não limita automaticamente a soma dos ingressos vendidos.
- Os valores monetários usam `number` no runtime. Em uma versão persistida, é mais seguro usar `Decimal` do Prisma ou trabalhar com centavos inteiros.
- As rotas de criação e alteração de eventos, ingressos e produtos ainda não exigem autenticação ou verificam um papel de administrador.
- O `requestId` é criado, mas ainda não é devolvido no response nem aparece em logs estruturados.
- Existe um segredo JWT padrão para facilitar o desenvolvimento local. Em produção, a aplicação deveria falhar ao iniciar quando `JWT_SECRET` não estiver configurado.
- Os testes usam o mesmo store em memória. O ideal é criar um store novo por teste ou limpar explicitamente os dados entre os casos.

Esses pontos não foram escondidos na documentação porque fazem parte do estado atual do projeto. Eles também definem uma ordem razoável para as próximas melhorias.

## Minha experiência com o projeto

Durante a construção, eu aprendi que uma API REST não é apenas uma coleção de rotas CRUD. A rota recebe a requisição, mas a decisão importante precisa ficar em uma regra de negócio que eu consiga explicar. Isso ficou mais claro no pedido: o cliente envia uma referência e uma quantidade, enquanto o servidor consulta o preço, calcula o subtotal e decide se ainda existe estoque ou disponibilidade.

Também precisei entender melhor a diferença entre `401` e `403`. O primeiro caso acontece quando não existe uma identidade válida, como quando o token não foi enviado. O segundo acontece quando o usuário está autenticado, mas tenta acessar um pedido que pertence a outra pessoa. Antes de implementar, eu tendia a tratar os dois casos como “não autorizado”.

As partes que mais exigiram pesquisa foram JWT, hash de senha com bcrypt, validação estrita com Zod, relações no Prisma e o motivo para usar transações ao alterar estoque. Também precisei pesquisar como representar um `OrderItem` que pode apontar para um ingresso ou para um produto. A solução atual mantém `itemType` e `referenceId` no contrato e deixa `ticketId` e `productId` opcionais no schema relacional. Essa solução funciona como modelo inicial, mas ainda precisa de uma regra de integridade para garantir que apenas o campo correspondente ao tipo seja preenchido.

Eu cometi alguns erros durante a implementação. Primeiro, escrevi o schema Prisma com vários campos na mesma linha. O TypeScript não apontou esse problema, mas o Prisma recusou o arquivo. Separei os campos em linhas próprias e validei o schema com `prisma validate`. Depois, usei uma sintaxe de enum que parecia válida para mim, mas também não era aceita pelo parser do Prisma; coloquei cada valor do enum em sua própria linha. Outro problema foi manter um código de teste sem efeito e um comentário mencionando `pnpm`, embora os scripts do projeto usassem `npm`. Removi o trecho sem uso e corrigi a documentação para deixar o procedimento consistente.

O ponto que eu ainda não considero resolvido é a persistência. Manter o store em memória foi uma escolha consciente para conseguir executar e testar o primeiro marco sem depender de um PostgreSQL local, mas isso não substitui uma implementação real com Prisma. A próxima etapa que eu buscaria é criar repositórios, migrar as operações para o banco e testar concorrência com duas compras tentando consumir o mesmo estoque.

Essa revisão também me ajudou a separar “o código compila” de “o sistema está correto”. Os testes e o build passaram, mas eles não provam que há transação, autorização administrativa, restauração de estoque ou persistência. Por isso, esses limites aparecem explicitamente nesta documentação.

## Referências

[1]: https://spec.openapis.org/oas/v3.0.3 "OpenAPI Specification 3.0.3"
[2]: https://www.prisma.io/docs/orm "Prisma ORM Documentation"
