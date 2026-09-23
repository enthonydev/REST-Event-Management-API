import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

// O app usa o store singleton; os testes independentes usam IDs únicos e cobrem o contrato público.
describe('Event Management API', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'event-management-api' });
  });

  it('creates, lists and cancels an event', async () => {
    const created = await request(app).post('/api/v1/events').send({ title: 'Festival Demo', date: '2026-10-20T20:00:00Z', location: 'São Paulo', capacity: 500 });
    expect(created.status).toBe(201);
    const listed = await request(app).get('/api/v1/events');
    expect(listed.body.data.some((event: { id: string }) => event.id === created.body.id)).toBe(true);
    const cancelled = await request(app).delete(`/api/v1/events/${created.body.id}`);
    expect(cancelled.status).toBe(204);
  });

  it('rejects invalid events and missing resources', async () => {
    expect((await request(app).post('/api/v1/events').send({ title: 'x', capacity: 0 })).status).toBe(400);
    expect((await request(app).get('/api/v1/events/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('authenticates a user and calculates order totals server-side', async () => {
    const register = await request(app).post('/api/v1/auth/register').send({ name: 'Alice', email: `alice-${Date.now()}@example.com`, password: 'secret-123' });
    expect(register.status).toBe(201);
    const token = register.body.token as string;
    const event = await request(app).post('/api/v1/events').send({ title: 'Show', date: '2026-11-20T20:00:00Z', location: 'Rio', capacity: 100 });
    const ticket = await request(app).post(`/api/v1/events/${event.body.id}/tickets`).send({ name: 'Inteira', price: 25, quantityAvailable: 4 });
    const order = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ eventId: event.body.id });
    const item = await request(app).post(`/api/v1/orders/${order.body.id}/items`).set('Authorization', `Bearer ${token}`).send({ itemType: 'TICKET', referenceId: ticket.body.id, quantity: 2 });
    expect(item.status).toBe(201);
    expect(item.body.total).toBe(50);
  });

  it('requires authentication for orders', async () => {
    expect((await request(app).get('/api/v1/orders')).status).toBe(401);
  });
});
