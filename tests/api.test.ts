import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

const uniqueEmail = () => `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
const createUser = async () => {
  const response = await request(app).post('/api/v1/auth/register').send({ name: 'Pessoa Teste', email: uniqueEmail(), password: 'secret-123' });
  return response.body as { user: { id: string }; token: string };
};
const createEvent = async () => {
  const response = await request(app).post('/api/v1/events').send({ title: 'Evento de Teste', category: 'Tecnologia', date: '2026-11-20T20:00:00Z', location: 'São Paulo', capacity: 100 });
  return response.body as { id: string };
};

describe('Event Management API', () => {
  it('returns health status and API metadata', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok', service: 'event-management-api' });
    const root = await request(app).get('/');
    expect(root.status).toBe(200);
    expect(root.body.ui).toBe('/ui');
    expect(root.body.openapi).toBe('/docs/openapi.yaml');
  });

  it('creates, lists, updates and cancels an event', async () => {
    const created = await request(app).post('/api/v1/events').send({ title: 'Festival Demo', category: 'Música', date: '2026-10-20T20:00:00Z', location: 'São Paulo', capacity: 500 });
    expect(created.status).toBe(201);
    expect(created.body.category).toBe('Música');
    const listed = await request(app).get('/api/v1/events');
    expect(listed.body.data.some((event: { id: string }) => event.id === created.body.id)).toBe(true);
    const updated = await request(app).patch(`/api/v1/events/${created.body.id}`).send({ location: 'Rio de Janeiro' });
    expect(updated.status).toBe(200);
    expect(updated.body.location).toBe('Rio de Janeiro');
    const cancelled = await request(app).delete(`/api/v1/events/${created.body.id}`);
    expect(cancelled.status).toBe(204);
    expect((await request(app).get(`/api/v1/events/${created.body.id}`)).body.status).toBe('CANCELLED');
  });

  it('rejects invalid events, malformed IDs and missing resources with useful errors', async () => {
    const invalid = await request(app).post('/api/v1/events').send({ title: 'x', capacity: 0 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    const malformed = await request(app).get('/api/v1/events/not-an-uuid');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    const missing = await request(app).get('/api/v1/events/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('Evento não encontrado');
    const unknownRoute = await request(app).get('/api/v1/unknown');
    expect(unknownRoute.status).toBe(404);
    expect(unknownRoute.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('registers and authenticates a user while rejecting duplicate and invalid credentials', async () => {
    const email = uniqueEmail();
    const register = await request(app).post('/api/v1/auth/register').send({ name: 'Alice', email, password: 'secret-123' });
    expect(register.status).toBe(201);
    expect(register.body.user.passwordHash).toBeUndefined();
    const duplicate = await request(app).post('/api/v1/auth/register').send({ name: 'Alice', email, password: 'secret-123' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.message).toBe('E-mail já cadastrado');
    const login = await request(app).post('/api/v1/auth/login').send({ email: email.toUpperCase(), password: 'secret-123' });
    expect(login.status).toBe(200);
    const invalid = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.message).toBe('E-mail ou senha inválidos');
  });

  it('creates tickets and products and calculates order totals server-side', async () => {
    const { token } = await createUser();
    const event = await createEvent();
    const ticket = await request(app).post(`/api/v1/events/${event.id}/tickets`).send({ name: 'Inteira', price: 25, quantityAvailable: 4 });
    const product = await request(app).post(`/api/v1/events/${event.id}/products`).send({ name: 'Camiseta', price: 30, stock: 3, active: true });
    expect(ticket.status).toBe(201);
    expect(product.status).toBe(201);
    expect((await request(app).get(`/api/v1/events/${event.id}/tickets`)).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/v1/events/${event.id}/products`)).body.data).toHaveLength(1);
    const order = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ eventId: event.id });
    expect(order.status).toBe(201);
    expect(order.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const item = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'TICKET', referenceId: ticket.body.id, quantity: 2 });
    expect(item.status).toBe(201);
    expect(item.body.total).toBe(50);
    const productItem = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'PRODUCT', referenceId: product.body.id, quantity: 1 });
    expect(productItem.status).toBe(201);
    expect(productItem.body.total).toBe(80);
    expect((await request(app).get(`/api/v1/orders/${order.body.id}`).set('Authorization', `Bearer ${token}`)).body.items).toHaveLength(2);
  });

  it('requires authentication and protects order ownership', async () => {
    const first = await createUser();
    const second = await createUser();
    const event = await createEvent();
    const unauthenticated = await request(app).get('/api/v1/orders');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.message).toBe('Token de autenticação ausente');
    const order = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${first.token}`).send({ eventId: event.id });
    const forbidden = await request(app).get(`/api/v1/orders/${order.body.id}`).set('Authorization', `Bearer ${second.token}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.message).toBe('Você não pode acessar este pedido');
    const invalidToken = await request(app).get('/api/v1/orders').set('Authorization', 'Bearer invalid');
    expect(invalidToken.status).toBe(401);
    expect(invalidToken.body.error.message).toBe('Token de autenticação inválido');
  });

  it('rejects unavailable, inactive and unrelated order items', async () => {
    const { token } = await createUser();
    const event = await createEvent();
    const otherEvent = await createEvent();
    const ticket = await request(app).post(`/api/v1/events/${event.id}/tickets`).send({ name: 'Limitado', price: 10, quantityAvailable: 1 });
    const inactive = await request(app).post(`/api/v1/events/${event.id}/products`).send({ name: 'Inativo', price: 5, stock: 1, active: false });
    const otherTicket = await request(app).post(`/api/v1/events/${otherEvent.id}/tickets`).send({ name: 'Outro', price: 5, quantityAvailable: 1 });
    const order = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ eventId: event.id });
    const unavailable = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'TICKET', referenceId: ticket.body.id, quantity: 2 });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.message).toBe('Disponibilidade de ingresso insuficiente');
    const unrelated = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'TICKET', referenceId: otherTicket.body.id, quantity: 1 });
    expect(unrelated.status).toBe(404);
    const inactiveResponse = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'PRODUCT', referenceId: inactive.body.id, quantity: 1 });
    expect(inactiveResponse.status).toBe(409);
  });

  it('cancels an order and prevents further items', async () => {
    const { token } = await createUser();
    const event = await createEvent();
    const ticket = await request(app).post(`/api/v1/events/${event.id}/tickets`).send({ name: 'Ingresso', price: 20, quantityAvailable: 2 });
    const order = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ eventId: event.id });
    const cancelled = await request(app).post(`/api/v1/orders/${order.body.id}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const again = await request(app).post(`/api/v1/orders/${order.body.id}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);
    const item = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'TICKET', referenceId: ticket.body.id, quantity: 1 });
    expect(item.status).toBe(409);
    expect(item.body.error.message).toBe('Pedido cancelado não recebe itens');
  });
});
