# Event Management API

Uma API REST para organizar eventos, ingressos, produtos e pedidos. O projeto foi construído como um laboratório de backend: a proposta é praticar decisões comuns em sistemas de venda, como validação no servidor, controle de disponibilidade, autenticação e cálculo de pedidos.

## O que a API faz

A aplicação permite criar e cancelar eventos, cadastrar tipos de ingresso e produtos associados a cada evento, registrar usuários e criar pedidos autenticados. O valor final do pedido nunca vem pronto do cliente. O servidor consulta os preços atuais, registra o preço usado na compra e calcula os subtotais e o total.

O escopo atual não inclui pagamento, frontend, notificações, QR Code operacional ou integração com serviços externos. Esses itens podem fazer parte de uma evolução futura, mas não são necessários para demonstrar o núcleo da aplicação.

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

O servidor deste marco ainda utiliza o store em memória. A próxima mudança estrutural é conectar as operações de pedidos ao Prisma usando transações e atualização protegida de estoque e disponibilidade.

## Documentação da API

O contrato OpenAPI está em [`docs/openapi.yaml`](docs/openapi.yaml). Ele serve como referência para os endpoints, parâmetros, autenticação e respostas previstas.

## Próximos passos

1. Substituir o store em memória por repositórios Prisma.
2. Adicionar migrations e testes de integração com PostgreSQL.
3. Usar transações nas operações que alteram estoque e disponibilidade.
4. Expandir a documentação de exemplos e respostas de erro.
5. Preparar uma configuração de demonstração com dados fictícios.

## Referências

[1]: https://spec.openapis.org/oas/v3.0.3 "OpenAPI Specification 3.0.3"
[2]: https://www.prisma.io/docs/orm "Prisma ORM Documentation"
