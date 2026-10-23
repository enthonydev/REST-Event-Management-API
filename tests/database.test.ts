import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

const run = process.env.DATABASE_INTEGRATION_TEST === '1' ? describe : describe.skip;

run('PostgreSQL + Prisma integration', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it('persists a user and an event with relational integrity', async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { name: 'Integration Test', email: `integration-${suffix}@example.com`, passwordHash: 'test-hash' }
    });
    const event = await prisma.event.create({
      data: { title: 'Integration Event', category: 'Tests', date: new Date('2027-01-01T12:00:00Z'), location: 'Test', capacity: 10 }
    });
    try {
      const order = await prisma.order.create({ data: { userId: user.id, eventId: event.id, total: 0 } });
      expect((await prisma.order.findUnique({ where: { id: order.id }, include: { user: true, event: true } }))?.user.id).toBe(user.id);
      await prisma.order.delete({ where: { id: order.id } });
    } finally {
      await prisma.event.delete({ where: { id: event.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
