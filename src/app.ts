import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';

export type EventStatus = 'ACTIVE' | 'CANCELLED';
export type OrderStatus = 'PENDING' | 'CANCELLED';
export type ItemType = 'TICKET' | 'PRODUCT';
export type User = { id: string; name: string; email: string; passwordHash: string; createdAt: Date; updatedAt: Date };
export type Event = { id: string; title: string; description?: string; date: Date; location: string; capacity: number; status: EventStatus; createdAt: Date; updatedAt: Date };
export type Ticket = { id: string; eventId: string; name: string; price: number; quantityAvailable: number };
export type Product = { id: string; eventId: string; name: string; description?: string; price: number; stock: number; active: boolean };
export type OrderItem = { id: string; orderId: string; itemType: ItemType; referenceId: string; nameSnapshot: string; unitPrice: number; quantity: number; subtotal: number };
export type Order = { id: string; userId: string; eventId: string; status: OrderStatus; total: number; createdAt: Date; updatedAt: Date; items: OrderItem[] };

type Store = { users: Map<string, User>; events: Map<string, Event>; tickets: Map<string, Ticket>; products: Map<string, Product>; orders: Map<string, Order> };
export const createStore = (): Store => ({ users: new Map(), events: new Map(), tickets: new Map(), products: new Map(), orders: new Map() });
const store = createStore();

class AppError extends Error { constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) { super(message); } }
const error = (status: number, code: string, message: string, details?: Record<string, unknown>) => new AppError(status, code, message, details);
const idSchema = z.object({ id: z.string().uuid() });
const eventSchema = z.object({ title: z.string().trim().min(3).max(140), description: z.string().max(2000).optional(), date: z.coerce.date(), location: z.string().trim().min(2).max(200), capacity: z.number().int().positive().max(1_000_000) }).strict();
const eventPatchSchema = eventSchema.partial();
const ticketSchema = z.object({ name: z.string().trim().min(2).max(100), price: z.number().nonnegative().finite(), quantityAvailable: z.number().int().nonnegative() }).strict();
const productSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().max(1000).optional(), price: z.number().nonnegative().finite(), stock: z.number().int().nonnegative(), active: z.boolean().default(true) }).strict();
const productPatchSchema = productSchema.partial();
const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254).transform((v) => v.toLowerCase()), password: z.string().min(8).max(100) }).strict();
const loginSchema = z.object({ email: z.string().email().transform((v) => v.toLowerCase()), password: z.string().min(1) }).strict();
const orderSchema = z.object({ eventId: z.string().uuid() }).strict();
const itemSchema = z.object({ itemType: z.enum(['TICKET', 'PRODUCT']), referenceId: z.string().uuid(), quantity: z.number().int().positive().max(1000) }).strict();

type AuthRequest = Request & { userId?: string };
const jwtSecret = () => process.env.JWT_SECRET ?? 'development-only-secret';
const signToken = (userId: string) => jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: '2h' });
const auth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(error(401, 'UNAUTHENTICATED', 'Token de autenticação ausente'));
  try { const payload = jwt.verify(header.slice(7), jwtSecret()); if (typeof payload === 'string' || !payload.sub) throw new Error(); req.userId = payload.sub; next(); } catch { next(error(401, 'INVALID_TOKEN', 'Token de autenticação inválido')); }
};
const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, updatedAt: u.updatedAt });
const publicOrder = (o: Order) => ({ ...o, items: o.items });
const ensureEvent = (id: string) => { const event = store.events.get(id); if (!event) throw error(404, 'EVENT_NOT_FOUND', 'Evento não encontrado'); return event; };
const ensureOrderOwner = (req: AuthRequest, id: string) => { const order = store.orders.get(id); if (!order) throw error(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado'); if (order.userId !== req.userId) throw error(403, 'FORBIDDEN', 'Você não pode acessar este pedido'); return order; };
const router = express.Router();

router.get('/', (_req, res) => res.json({
  name: 'event-management-api',
  message: 'API REST de gerenciamento de eventos',
  health: '/health',
  events: '/api/v1/events',
  ui: '/ui',
  openapi: '/docs/openapi.yaml'
}));
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'event-management-api' }));
router.post('/api/v1/auth/register', (req, res) => { const data = registerSchema.parse(req.body); if ([...store.users.values()].some((u) => u.email === data.email)) throw error(409, 'EMAIL_IN_USE', 'E-mail já cadastrado'); const now = new Date(); const user: User = { id: randomUUID(), name: data.name, email: data.email, passwordHash: bcrypt.hashSync(data.password, 12), createdAt: now, updatedAt: now }; store.users.set(user.id, user); res.status(201).json({ user: publicUser(user), token: signToken(user.id) }); });
router.post('/api/v1/auth/login', (req, res) => { const data = loginSchema.parse(req.body); const user = [...store.users.values()].find((u) => u.email === data.email); if (!user || !bcrypt.compareSync(data.password, user.passwordHash)) throw error(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos'); res.json({ user: publicUser(user), token: signToken(user.id) }); });

router.get('/api/v1/events', (_req, res) => res.json({ data: [...store.events.values()] }));
router.post('/api/v1/events', (req, res) => { const data = eventSchema.parse(req.body); const now = new Date(); const event: Event = { id: randomUUID(), ...data, status: 'ACTIVE', createdAt: now, updatedAt: now }; store.events.set(event.id, event); res.status(201).json(event); });
router.get('/api/v1/events/:id', (req, res) => res.json(ensureEvent(idSchema.parse(req.params).id)));
router.patch('/api/v1/events/:id', (req, res) => { const event = ensureEvent(idSchema.parse(req.params).id); const data = eventPatchSchema.parse(req.body); if (data.capacity !== undefined && data.capacity <= 0) throw error(400, 'INVALID_CAPACITY', 'Capacidade deve ser maior que zero'); Object.assign(event, data, { updatedAt: new Date() }); res.json(event); });
router.delete('/api/v1/events/:id', (req, res) => { const event = ensureEvent(idSchema.parse(req.params).id); event.status = 'CANCELLED'; event.updatedAt = new Date(); res.status(204).send(); });
router.get('/api/v1/events/:id/tickets', (req, res) => { const id = idSchema.parse(req.params).id; ensureEvent(id); res.json({ data: [...store.tickets.values()].filter((t) => t.eventId === id) }); });
router.post('/api/v1/events/:id/tickets', (req, res) => { const event = ensureEvent(idSchema.parse(req.params).id); if (event.status === 'CANCELLED') throw error(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita ingressos'); const data = ticketSchema.parse(req.body); const ticket: Ticket = { id: randomUUID(), eventId: event.id, ...data }; store.tickets.set(ticket.id, ticket); res.status(201).json(ticket); });
router.get('/api/v1/events/:id/products', (req, res) => { const id = idSchema.parse(req.params).id; ensureEvent(id); res.json({ data: [...store.products.values()].filter((p) => p.eventId === id) }); });
router.post('/api/v1/events/:id/products', (req, res) => { const event = ensureEvent(idSchema.parse(req.params).id); if (event.status === 'CANCELLED') throw error(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita produtos'); const data = productSchema.parse(req.body); const product: Product = { id: randomUUID(), eventId: event.id, ...data }; store.products.set(product.id, product); res.status(201).json(product); });
router.patch('/api/v1/products/:id', (req, res) => { const id = idSchema.parse(req.params).id; const product = store.products.get(id); if (!product) throw error(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado'); Object.assign(product, productPatchSchema.parse(req.body)); res.json(product); });

router.post('/api/v1/orders', auth, (req: AuthRequest, res) => { const data = orderSchema.parse(req.body); const event = ensureEvent(data.eventId); if (event.status === 'CANCELLED') throw error(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita pedidos'); const now = new Date(); const order: Order = { id: randomUUID(), userId: req.userId!, eventId: event.id, status: 'PENDING', total: 0, createdAt: now, updatedAt: now, items: [] }; store.orders.set(order.id, order); res.status(201).json(publicOrder(order)); });
router.get('/api/v1/orders', auth, (req: AuthRequest, res) => res.json({ data: [...store.orders.values()].filter((o) => o.userId === req.userId).map(publicOrder) }));
router.get('/api/v1/orders/:id', auth, (req: AuthRequest, res) => res.json(publicOrder(ensureOrderOwner(req, idSchema.parse(req.params).id))));
router.post('/api/v1/orders/:id/items', auth, (req: AuthRequest, res) => { const order = ensureOrderOwner(req, idSchema.parse(req.params).id); if (order.status === 'CANCELLED') throw error(409, 'ORDER_CANCELLED', 'Pedido cancelado não recebe itens'); const data = itemSchema.parse(req.body); const event = ensureEvent(order.eventId); let name: string; let unitPrice: number; if (data.itemType === 'TICKET') { const ticket = store.tickets.get(data.referenceId); if (!ticket || ticket.eventId !== event.id) throw error(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado para este evento'); if (ticket.quantityAvailable < data.quantity) throw error(409, 'INSUFFICIENT_AVAILABILITY', 'Disponibilidade de ingresso insuficiente'); ticket.quantityAvailable -= data.quantity; name = ticket.name; unitPrice = ticket.price; } else { const product = store.products.get(data.referenceId); if (!product || product.eventId !== event.id) throw error(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado para este evento'); if (!product.active) throw error(409, 'PRODUCT_INACTIVE', 'Produto inativo não pode ser vendido'); if (product.stock < data.quantity) throw error(409, 'INSUFFICIENT_STOCK', 'Estoque insuficiente'); product.stock -= data.quantity; name = product.name; unitPrice = product.price; } const item: OrderItem = { id: randomUUID(), orderId: order.id, itemType: data.itemType, referenceId: data.referenceId, nameSnapshot: name, unitPrice, quantity: data.quantity, subtotal: Number((unitPrice * data.quantity).toFixed(2)) }; order.items.push(item); order.total = Number(order.items.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2)); order.updatedAt = new Date(); res.status(201).json(publicOrder(order)); });
router.post('/api/v1/orders/:id/cancel', auth, (req: AuthRequest, res) => { const order = ensureOrderOwner(req, idSchema.parse(req.params).id); if (order.status === 'CANCELLED') throw error(409, 'ORDER_ALREADY_CANCELLED', 'Pedido já está cancelado'); order.status = 'CANCELLED'; order.updatedAt = new Date(); res.json(publicOrder(order)); });

export const app = express();
app.use(helmet()); app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true })); app.use(express.json({ limit: '100kb' }));
app.use((req, _res, next) => { const requestId = req.header('x-request-id') ?? randomUUID(); req.headers['x-request-id'] = requestId; next(); });
app.use('/ui', express.static('public'));
app.use('/docs', express.static('docs'));
app.use(router);
app.use((_req, _res, next) => next(error(404, 'ROUTE_NOT_FOUND', 'Rota não encontrada')));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => { if (err instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dados de entrada inválidos', details: err.flatten() } }); if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } }); console.error(err); return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno inesperado', details: {} } }); });
export { AppError };
