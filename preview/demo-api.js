window.__EVENT_PREVIEW__ = true;
// Demonstração isolada no navegador: nenhum dado é enviado a um servidor.
const key = 'event-api-preview-v1';
const uuid = () => crypto.randomUUID();
const initial = () => {
  const eventId = uuid();
  return {
    events: [{ id: eventId, title: 'Encontro de Tecnologia', description: 'Demonstração da gestão de eventos.', category: 'Tecnologia', location: 'São Paulo', date: '2026-12-12T14:00:00.000Z', capacity: 120, status: 'ACTIVE' }],
    tickets: [{ id: uuid(), eventId, name: 'Ingresso geral', price: 45, quantityAvailable: 80 }],
    products: [{ id: uuid(), eventId, name: 'Camiseta do evento', price: 55, stock: 30, active: true }],
    orders: [], user: null
  };
};
let db;
try { db = JSON.parse(localStorage.getItem(key)) || initial(); } catch { db = initial(); }
const save = () => localStorage.setItem(key, JSON.stringify(db));
const reply = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});
const error = (message, status = 400) => reply({ error: { message } }, status);
const route = (path, pattern) => path.match(pattern);
window.fetch = async (url, options = {}) => {
  const path = new URL(url, location.href).pathname;
  const method = (options.method || 'GET').toUpperCase();
  let data = {};
  try { data = options.body ? JSON.parse(options.body) : {}; } catch { return error('Dados inválidos'); }
  if (path === '/health') return reply({ status: 'ok' });
  if (path === '/api/v1/auth/register' && method === 'POST') {
    if (!data.name || !data.email || String(data.password || '').length < 8) return error('Preencha nome, e-mail e senha de pelo menos 8 caracteres.');
    db.user = { id: uuid(), name: data.name, email: data.email };
    save(); return reply({ user: db.user, token: 'preview-only' }, 201);
  }
  if (path === '/api/v1/auth/login' && method === 'POST') {
    if (!db.user || db.user.email !== data.email) return error('Use o cadastro de demonstração para entrar.', 401);
    return reply({ user: db.user, token: 'preview-only' });
  }
  if (path === '/api/v1/events') {
    if (method === 'GET') return reply({ data: db.events });
    if (method === 'POST') {
      const event = { ...data, id: uuid(), status: 'ACTIVE', date: new Date(data.date).toISOString() };
      db.events.push(event); save(); return reply(event, 201);
    }
  }
  let match = route(path, /^\/api\/v1\/events\/([^/]+)$/);
  if (match) {
    const event = db.events.find(e => e.id === match[1]);
    if (!event) return error('Evento não encontrado', 404);
    if (method === 'GET') return reply(event);
    if (method === 'DELETE') { event.status = 'CANCELLED'; save(); return reply(null, 204); }
  }
  match = route(path, /^\/api\/v1\/events\/([^/]+)\/(tickets|products)$/);
  if (match) {
    const [, eventId, kind] = match;
    const collection = db[kind];
    if (method === 'GET') return reply({ data: collection.filter(i => i.eventId === eventId) });
    if (method === 'POST') {
      const event = db.events.find(e => e.id === eventId);
      if (!event || event.status !== 'ACTIVE') return error('Evento indisponível', 409);
      const item = { ...data, id: uuid(), eventId };
      collection.push(item); save(); return reply(item, 201);
    }
  }
  if (path === '/api/v1/orders') {
    if (!db.user) return error('Faça o cadastro para criar pedidos.', 401);
    if (method === 'GET') return reply({ data: db.orders.filter(o => o.userId === db.user.id) });
    if (method === 'POST') {
      const event = db.events.find(e => e.id === data.eventId);
      if (!event || event.status !== 'ACTIVE') return error('Evento indisponível', 409);
      const order = { id: uuid(), userId: db.user.id, eventId: event.id, status: 'PENDING', total: 0, items: [], createdAt: new Date().toISOString() };
      db.orders.push(order); save(); return reply(order, 201);
    }
  }
  match = route(path, /^\/api\/v1\/orders\/([^/]+)(?:\/(items|cancel))?$/);
  if (match) {
    const order = db.orders.find(o => o.id === match[1] && o.userId === db.user?.id);
    if (!order) return error('Pedido não encontrado', 404);
    if (method === 'GET' && !match[2]) return reply(order);
    if (method === 'POST' && order.status === 'CANCELLED') return error('Pedido cancelado', 409);
    if (method === 'POST' && match[2] === 'items') {
      const kind = data.itemType === 'TICKET' ? 'tickets' : 'products';
      const item = db[kind].find(i => i.id === data.referenceId && i.eventId === order.eventId);
      const stockField = kind === 'tickets' ? 'quantityAvailable' : 'stock';
      const quantity = Number(data.quantity);
      if (!item || !Number.isInteger(quantity) || quantity <= 0 || item[stockField] < quantity) return error('Item indisponível ou estoque insuficiente', 409);
      item[stockField] -= quantity;
      const subtotal = item.price * quantity;
      order.items.push({ id: uuid(), orderId: order.id, itemType: data.itemType, referenceId: item.id, nameSnapshot: item.name, unitPrice: item.price, quantity, subtotal });
      order.total += subtotal; save(); return reply(order, 201);
    }
    if (method === 'POST' && match[2] === 'cancel') {
      order.status = 'CANCELLED';
      for (const item of order.items) {
        const kind = item.itemType === 'TICKET' ? 'tickets' : 'products';
        const source = db[kind].find(i => i.id === item.referenceId);
        if (source) source[kind === 'tickets' ? 'quantityAvailable' : 'stock'] += item.quantity;
      }
      save(); return reply(order);
    }
  }
  return error('Recurso não disponível na demonstração.', 404);
};
save();
