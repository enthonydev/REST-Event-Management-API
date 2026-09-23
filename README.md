# Event Management API

API REST em **Node.js + TypeScript + Express**, criada para praticar backend profissional com eventos, ingressos, produtos, pedidos e autenticação.

## Escopo

O MVP cobre eventos, tipos de ingresso, produtos, pedidos, cálculo de totais no servidor, disponibilidade/estoque, cancelamento, autenticação JWT, validação Zod, contrato OpenAPI e testes Vitest. Pagamento real, frontend, QR Code operacional, notificações e microserviços ficam fora do MVP.

## Arquitetura

`Cliente → Router → Middleware → Controller/Handler → regras de domínio → persistência`

O código inicial usa um store em memória para permitir execução e testes sem infraestrutura externa. O schema PostgreSQL/Prisma em `prisma/schema.prisma` define a persistência de produção, com chaves estrangeiras, índices, enums e timestamps; a troca do adapter é uma etapa explícita de evolução, não uma mudança de contrato.

## Como executar

```bash
cp .env.example .env
npm install
npm run check
npm test
npm run build
npm run dev
```

A API fica em `http://localhost:3000`. O health check é `GET /health`.

## Endpoints principais

| Método | Endpoint | Regra |
|---|---|---|
| GET/POST | `/api/v1/events` | listar/criar eventos |
| GET/PATCH/DELETE | `/api/v1/events/:id` | consultar/alterar/cancelar |
| GET/POST | `/api/v1/events/:id/tickets` | ingressos vinculados |
| GET/POST | `/api/v1/events/:id/products` | produtos vinculados |
| PATCH | `/api/v1/products/:id` | preço, estoque ou ativação |
| POST | `/api/v1/auth/register` | cadastro com hash de senha |
| POST | `/api/v1/auth/login` | login e token JWT |
| GET/POST | `/api/v1/orders` | pedidos do usuário autenticado |
| GET | `/api/v1/orders/:id` | pedido próprio |
| POST | `/api/v1/orders/:id/items` | item com snapshot de preço |
| POST | `/api/v1/orders/:id/cancel` | cancelamento do pedido |

Pedidos exigem `Authorization: Bearer <token>`. O cliente informa apenas referência e quantidade; o backend consulta o preço atual, calcula `subtotal = quantity × unitPrice`, recalcula o total e reduz a disponibilidade/estoque. Erros de domínio usam `409`; validação usa `400`; autenticação usa `401`; propriedade usa `403`.

## OpenAPI

O contrato está em [`docs/openapi.yaml`](docs/openapi.yaml) e deve ser mantido sincronizado com as rotas.

## Testes

```bash
npm test
npm run check
npm run build
```

Os testes cobrem health check, CRUD/cancelamento, validação, autenticação, autorização e total calculado no servidor.

## Banco e seed

Configure `DATABASE_URL` a partir de `.env.example` e execute `npm run db:generate` e `npm run db:migrate` quando o adapter Prisma for ativado. O seed demonstrativo fica em `prisma/seed.ts`; não contém dados reais.

## Decisões e limitações

A primeira entrega prioriza um núcleo executável, pequeno e explicável. O armazenamento em memória torna o MVP demonstrável sem PostgreSQL local; para produção, o próximo marco é conectar os casos de uso a Prisma dentro de transações, usando atualização condicional de estoque/disponibilidade. O contrato HTTP, as regras e o modelo relacional já estão preparados para essa evolução.
