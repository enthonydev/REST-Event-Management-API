import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';

type AuthRequest = Request & { userId?: string };
class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new ApiError(status, code, message); };
const id = z.object({ id: z.string().uuid() });
const eventInput = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().max(2000).optional(),
  category: z.string().trim().min(2).max(50).default('Outros'),
  date: z.coerce.date(),
  location: z.string().trim().min(2).max(200),
  capacity: z.number().int().positive().max(1_000_000)
}).strict();
const ticketInput = z.object({ name: z.string().trim().min(2).max(100), price: z.number().nonnegative().finite(), quantityAvailable: z.number().int().nonnegative() }).strict();
const productInput = z.object({ name: z.string().trim().min(2).max(100), description: z.string().max(1000).optional(), price: z.number().nonnegative().finite(), stock: z.number().int().nonnegative(), active: z.boolean().default(true) }).strict();
const registerInput = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(8).max(100) }).strict();
const loginInput = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(1) }).strict();
const orderInput = z.object({ eventId: z.string().uuid() }).strict();
const itemInput = z.object({ itemType: z.enum(['TICKET', 'PRODUCT']), referenceId: z.string().uuid(), quantity: z.number().int().positive().max(1000) }).strict();
const secret = () => process.env.JWT_SECRET || fail(500, 'JWT_SECRET_MISSING', 'JWT_SECRET não configurado');
const auth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(new ApiError(401, 'UNAUTHENTICATED', 'Token de autenticação ausente'));
  try {
    const payload = jwt.verify(header.slice(7), secret()) as JwtPayload;
    if (!payload || typeof payload.sub !== 'string') throw new Error('Token sem identificação');
    req.userId = payload.sub;
    next();
  } catch { next(new ApiError(401, 'INVALID_TOKEN', 'Token de autenticação inválido')); }
};
const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<void>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res)).catch(next); };
const publicUser = (user: { id: string; name: string; email: string; createdAt: Date; updatedAt: Date }) => ({
  id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt
});
const publicTicket = (ticket: { price: Prisma.Decimal; [key: string]: unknown }) => ({ ...ticket, price: Number(ticket.price) });
const publicProduct = (product: { price: Prisma.Decimal; [key: string]: unknown }) => ({ ...product, price: Number(product.price) });
type FullOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;
const publicOrder = (order: FullOrder) => ({
  ...order, total: Number(order.total),
  items: order.items.map(item => ({ ...item, unitPrice: Number(item.unitPrice), subtotal: Number(item.subtotal) }))
});
const ensureEvent = async (eventId: string) =>
  (await prisma.event.findUnique({ where: { id: eventId } })) ?? fail(404, 'EVENT_NOT_FOUND', 'Evento não encontrado');
const ensureOwner = async (req: AuthRequest, orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) fail(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado');
  if (order.userId !== req.userId) fail(403, 'FORBIDDEN', 'Você não pode acessar este pedido');
  return order;
};
const router = express.Router();

router.post('/api/v1/auth/register', asyncRoute(async (req, res) => {
  const data = registerInput.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) fail(409, 'EMAIL_IN_USE', 'E-mail já cadastrado');
  const user = await prisma.user.create({ data: { name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 12) } });
  res.status(201).json({ user: publicUser(user), token: jwt.sign({ sub: user.id }, secret(), { expiresIn: '2h' }) });
}));
router.post('/api/v1/auth/login', asyncRoute(async (req, res) => {
  const data = loginInput.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !await bcrypt.compare(data.password, user.passwordHash)) fail(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
  res.json({ user: publicUser(user), token: jwt.sign({ sub: user.id }, secret(), { expiresIn: '2h' }) });
}));
router.get('/api/v1/events', asyncRoute(async (_req, res) => { res.json({ data: await prisma.event.findMany() }); }));
router.post('/api/v1/events', asyncRoute(async (req, res) => {
  const event = await prisma.event.create({ data: eventInput.parse(req.body) });
  res.status(201).json(event);
}));
router.get('/api/v1/events/:id', asyncRoute(async (req, res) => { res.json(await ensureEvent(id.parse(req.params).id)); }));
router.patch('/api/v1/events/:id', asyncRoute(async (req, res) => {
  const eventId = id.parse(req.params).id;
  await ensureEvent(eventId);
  res.json(await prisma.event.update({ where: { id: eventId }, data: eventInput.partial().parse(req.body) }));
}));
router.delete('/api/v1/events/:id', asyncRoute(async (req, res) => {
  const eventId = id.parse(req.params).id;
  await ensureEvent(eventId);
  await prisma.event.update({ where: { id: eventId }, data: { status: 'CANCELLED' } });
  res.status(204).send();
}));
router.get('/api/v1/events/:id/tickets', asyncRoute(async (req, res) => {
  const eventId = id.parse(req.params).id;
  await ensureEvent(eventId);
  res.json({ data: (await prisma.ticket.findMany({ where: { eventId } })).map(publicTicket) });
}));
router.post('/api/v1/events/:id/tickets', asyncRoute(async (req, res) => {
  const event = await ensureEvent(id.parse(req.params).id);
  if (event.status === 'CANCELLED') fail(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita ingressos');
  res.status(201).json(publicTicket(await prisma.ticket.create({ data: { ...ticketInput.parse(req.body), eventId: event.id } })));
}));
router.get('/api/v1/events/:id/products', asyncRoute(async (req, res) => {
  const eventId = id.parse(req.params).id;
  await ensureEvent(eventId);
  res.json({ data: (await prisma.product.findMany({ where: { eventId } })).map(publicProduct) });
}));
router.post('/api/v1/events/:id/products', asyncRoute(async (req, res) => {
  const event = await ensureEvent(id.parse(req.params).id);
  if (event.status === 'CANCELLED') fail(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita produtos');
  res.status(201).json(publicProduct(await prisma.product.create({ data: { ...productInput.parse(req.body), eventId: event.id } })));
}));
router.patch('/api/v1/products/:id', asyncRoute(async (req, res) => {
  const productId = id.parse(req.params).id;
  if (!await prisma.product.findUnique({ where: { id: productId } })) fail(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado');
  res.json(publicProduct(await prisma.product.update({ where: { id: productId }, data: productInput.partial().parse(req.body) })));
}));
router.post('/api/v1/orders', auth, asyncRoute(async (req, res) => {
  const event = await ensureEvent(orderInput.parse(req.body).eventId);
  if (event.status === 'CANCELLED') fail(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita pedidos');
  const order = await prisma.order.create({ data: { userId: req.userId!, eventId: event.id, total: 0 }, include: { items: true } });
  res.status(201).json(publicOrder(order));
}));
router.get('/api/v1/orders', auth, asyncRoute(async (req, res) => {
  const orders = await prisma.order.findMany({ where: { userId: req.userId }, include: { items: true } });
  res.json({ data: orders.map(publicOrder) });
}));
router.get('/api/v1/orders/:id', auth, asyncRoute(async (req, res) => {
  res.json(publicOrder(await ensureOwner(req, id.parse(req.params).id)));
}));

// Transações serializáveis e atualização condicional impedem estoque negativo em compras simultâneas.
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 };
async function retrySerializable<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034' && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error('Falha na transação');
}
router.post('/api/v1/orders/:id/items', auth, asyncRoute(async (req, res) => {
  const orderId = id.parse(req.params).id;
  const data = itemInput.parse(req.body);
  await ensureOwner(req, orderId);
  const updated = await retrySerializable(() => prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, event: true } });
    if (!order) fail(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado');
    if (order.userId !== req.userId) fail(403, 'FORBIDDEN', 'Você não pode acessar este pedido');
    if (order.status === 'CANCELLED') fail(409, 'ORDER_CANCELLED', 'Pedido cancelado não recebe itens');
    if (order.event.status === 'CANCELLED') fail(409, 'EVENT_CANCELLED', 'Evento cancelado não aceita novos itens');
    let name: string;
    let price: Prisma.Decimal;
    if (data.itemType === 'TICKET') {
      const ticket = await tx.ticket.findUnique({ where: { id: data.referenceId } });
      if (!ticket || ticket.eventId !== order.eventId) fail(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado para este evento');
      const changed = await tx.ticket.updateMany({ where: { id: ticket.id, quantityAvailable: { gte: data.quantity } }, data: { quantityAvailable: { decrement: data.quantity } } });
      if (!changed.count) fail(409, 'INSUFFICIENT_AVAILABILITY', 'Disponibilidade de ingresso insuficiente');
      name = ticket.name; price = ticket.price;
    } else {
      const product = await tx.product.findUnique({ where: { id: data.referenceId } });
      if (!product || product.eventId !== order.eventId) fail(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado para este evento');
      if (!product.active) fail(409, 'PRODUCT_INACTIVE', 'Produto inativo não pode ser vendido');
      const changed = await tx.product.updateMany({ where: { id: product.id, active: true, stock: { gte: data.quantity } }, data: { stock: { decrement: data.quantity } } });
      if (!changed.count) fail(409, 'INSUFFICIENT_STOCK', 'Estoque insuficiente');
      name = product.name; price = product.price;
    }
    const subtotal = price.mul(data.quantity);
    await tx.orderItem.create({ data: {
      orderId, itemType: data.itemType, referenceId: data.referenceId,
      ticketId: data.itemType === 'TICKET' ? data.referenceId : null,
      productId: data.itemType === 'PRODUCT' ? data.referenceId : null,
      nameSnapshot: name, unitPrice: price, quantity: data.quantity, subtotal
    } });
    await tx.order.update({ where: { id: orderId }, data: { total: { increment: subtotal } } });
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  }, serializable));
  res.status(201).json(publicOrder(updated));
}));
router.post('/api/v1/orders/:id/cancel', auth, asyncRoute(async (req, res) => {
  const orderId = id.parse(req.params).id;
  await ensureOwner(req, orderId);
  const updated = await retrySerializable(() => prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) fail(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado');
    if (order.userId !== req.userId) fail(403, 'FORBIDDEN', 'Você não pode acessar este pedido');
    if (order.status === 'CANCELLED') fail(409, 'ORDER_ALREADY_CANCELLED', 'Pedido já está cancelado');
    const changed = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!changed.count) fail(409, 'ORDER_ALREADY_CANCELLED', 'Pedido já está cancelado');
    for (const item of order.items) {
      if (item.itemType === 'TICKET') await tx.ticket.update({ where: { id: item.referenceId }, data: { quantityAvailable: { increment: item.quantity } } });
      else await tx.product.update({ where: { id: item.referenceId }, data: { stock: { increment: item.quantity } } });
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  }, serializable));
  res.json(publicOrder(updated));
}));
router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  if (err instanceof ApiError) return next(err);
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return next(new ApiError(409, 'CONFLICT', 'Registro já existente'));
  next(err);
});
export { router as prismaRouter, ApiError as PrismaApiError };
