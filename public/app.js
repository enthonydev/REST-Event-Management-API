const state = {
  token: localStorage.getItem('event-api-token'),
  user: JSON.parse(localStorage.getItem('event-api-user') || 'null'),
  events: [],
  selectedEvent: null,
  orders: [],
  currentOrder: null,
  orderCatalog: { tickets: [], products: [] },
  filters: { category: '', from: '', to: '' }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const api = async (path, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o servidor está online.');
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('A API retornou uma resposta inválida. Tente novamente.');
    }
  }

  if (!response.ok) throw new Error(body?.error?.message || `A API retornou o erro HTTP ${response.status}.`);
  return body;
};

const showMessage = (message, isError = false) => {
  const box = $('#flash');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.classList.remove('hidden');
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => box.classList.add('hidden'), 5000);
};

const money = (value) => `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
const date = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const shortId = (value) => String(value).slice(0, 8);

function setSession(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem('event-api-user', JSON.stringify(user));
  localStorage.setItem('event-api-token', token);
  renderSession();
}

function clearSession() {
  state.user = null;
  state.token = null;
  state.currentOrder = null;
  localStorage.removeItem('event-api-user');
  localStorage.removeItem('event-api-token');
  renderSession();
}

function renderSession() {
  $('#session-label').textContent = state.user ? state.user.name : 'Visitante';
  $('#logout-button').classList.toggle('hidden', !state.user);
  $('#orders-guest').classList.toggle('hidden', Boolean(state.user));
  $('#orders-content').classList.toggle('hidden', !state.user);
}

function navigate(section) {
  $$('.view').forEach((view) => view.classList.toggle('active-view', view.id === section));
  $$('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.section === section));
  if (section === 'events') loadEvents();
  if (section === 'orders' && state.user) loadOrders();
}

function renderStats() {
  $('#stat-events').textContent = state.events.length;
  $('#stat-active').textContent = state.events.filter((event) => event.status === 'ACTIVE').length;
  $('#stat-orders').textContent = state.orders.length || '0';
}

function filteredEvents() {
  return state.events.filter((event) => {
    const eventDate = event.date.slice(0, 10);
    const categoryOk = !state.filters.category || event.category === state.filters.category;
    const fromOk = !state.filters.from || eventDate >= state.filters.from;
    const toOk = !state.filters.to || eventDate <= state.filters.to;
    return categoryOk && fromOk && toOk;
  });
}

async function loadHealth() {
  try {
    await api('/health');
    $('#api-status').textContent = 'API online';
    $('.status-dot').classList.add('online');
  } catch {
    $('#api-status').textContent = 'API offline';
    $('.status-dot').classList.remove('online');
  }
}

async function loadEvents() {
  try {
    const result = await api('/api/v1/events');
    state.events = result.data;
    renderEvents();
    renderStats();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function renderEvents() {
  const list = $('#events-list');
  const events = filteredEvents();
  if (!events.length) {
    list.innerHTML = '<div class="empty-state">Nenhum evento encontrado com esses filtros.</div>';
    return;
  }
  list.innerHTML = events.map((event) => `<article class="card"><div class="card-top"><div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.category)} · ${escapeHtml(event.location)} · ${date(event.date)}</p></div><span class="badge ${event.status === 'CANCELLED' ? 'cancelled' : ''}">${event.status === 'ACTIVE' ? 'Ativo' : 'Cancelado'}</span></div><p>${escapeHtml(event.description || 'Sem descrição')} · capacidade: ${event.capacity}</p><div class="card-actions"><button class="small-button" data-open-event="${event.id}">Ver detalhes</button>${event.status === 'ACTIVE' ? `<button class="small-button danger" data-cancel-event="${event.id}">Cancelar</button>` : ''}</div></article>`).join('');
}

async function openEvent(id) {
  try {
    const event = await api(`/api/v1/events/${id}`);
    state.selectedEvent = event;
    const [tickets, products] = await Promise.all([api(`/api/v1/events/${id}/tickets`), api(`/api/v1/events/${id}/products`)]);
    state.orderCatalog = { tickets: tickets.data, products: products.data };
    renderEventDetail(event, tickets.data, products.data);
    $('#event-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showMessage(error.message, true);
  }
}

function renderEventDetail(event, tickets, products) {
  const orderButton = state.user && event.status === 'ACTIVE' ? `<button class="primary" id="create-order" data-event-id="${event.id}">Criar pedido para este evento</button>` : '';
  $('#event-detail').classList.remove('hidden');
  $('#event-detail').innerHTML = `<div class="card-top"><div><span class="eyebrow">DETALHES DO EVENTO</span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.category)} · ${escapeHtml(event.location)} · ${date(event.date)} · capacidade ${event.capacity}</p></div>${orderButton}</div><div class="detail-grid"><div class="detail-column"><h4>Ingressos</h4><form id="ticket-form" class="inline-form"><input name="name" required placeholder="Nome" /><input name="price" required type="number" min="0" step="0.01" placeholder="Preço" /><input name="quantityAvailable" required type="number" min="0" placeholder="Qtd." /><button class="small-button" type="submit">Adicionar</button></form><div>${tickets.length ? tickets.map((ticket) => `<div class="item-row"><span>${escapeHtml(ticket.name)} · ${money(ticket.price)}<small>ID: ${escapeHtml(ticket.id)}</small></span><strong>${ticket.quantityAvailable} disponíveis</strong></div>`).join('') : '<p>Nenhum ingresso cadastrado.</p>'}</div></div><div class="detail-column"><h4>Produtos</h4><form id="product-form" class="inline-form"><input name="name" required placeholder="Nome" /><input name="price" required type="number" min="0" step="0.01" placeholder="Preço" /><input name="stock" required type="number" min="0" placeholder="Estoque" /><button class="small-button" type="submit">Adicionar</button></form><div>${products.length ? products.map((product) => `<div class="item-row"><span>${escapeHtml(product.name)} · ${money(product.price)}<small>ID: ${escapeHtml(product.id)}</small></span><strong>${product.stock} em estoque</strong></div>`).join('') : '<p>Nenhum produto cadastrado.</p>'}</div></div></div>`;
  $('#ticket-form').addEventListener('submit', createTicket);
  $('#product-form').addEventListener('submit', createProduct);
  $('#create-order')?.addEventListener('click', () => createOrder(event.id));
}

async function createTicket(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await api(`/api/v1/events/${state.selectedEvent.id}/tickets`, { method: 'POST', body: JSON.stringify({ name: data.name, price: Number(data.price), quantityAvailable: Number(data.quantityAvailable) }) });
    form.reset();
    showMessage('Ingresso adicionado.');
    await openEvent(state.selectedEvent.id);
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function createProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await api(`/api/v1/events/${state.selectedEvent.id}/products`, { method: 'POST', body: JSON.stringify({ name: data.name, price: Number(data.price), stock: Number(data.stock), active: true }) });
    form.reset();
    showMessage('Produto adicionado.');
    await openEvent(state.selectedEvent.id);
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function createOrder(eventId) {
  if (!state.user) return navigate('auth');
  try {
    state.currentOrder = await api('/api/v1/orders', { method: 'POST', body: JSON.stringify({ eventId }) });
    showMessage('Pedido criado. O ID completo está visível na tela de pedidos.');
    navigate('orders');
    renderOrderBuilder();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadOrders() {
  try {
    const result = await api('/api/v1/orders');
    state.orders = result.data;
    renderOrders();
    renderStats();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function orderHeader(order) {
  return `<div class="order-id-row"><span>ID completo do pedido:</span><code>${escapeHtml(order.id)}</code><button class="small-button" data-copy-order="${escapeHtml(order.id)}">Copiar ID</button></div>`;
}

function renderOrders() {
  const list = $('#orders-list');
  if (!state.orders.length) {
    list.innerHTML = '<div class="empty-state">Nenhum pedido encontrado.</div>';
    return;
  }
  list.innerHTML = state.orders.map((order) => `<article class="card"><div class="card-top"><div><h3>Pedido ${shortId(order.id)}</h3><p>${date(order.createdAt)} · ${order.items.length} item(ns) · status: ${order.status}</p></div><strong>${money(order.total)}</strong></div>${orderHeader(order)}<div class="card-actions"><button class="small-button" data-open-order="${order.id}">Ver pedido</button></div></article>`).join('');
}

function renderOrderBuilder() {
  if (!state.currentOrder) {
    $('#order-builder').classList.add('hidden');
    return;
  }
  const order = state.currentOrder;
  const ticketOptions = state.orderCatalog.tickets.map((ticket) => `<option value="${ticket.id}">${escapeHtml(ticket.name)} — ${money(ticket.price)} (${ticket.quantityAvailable} disponíveis)</option>`).join('');
  const productOptions = state.orderCatalog.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} — ${money(product.price)} (${product.stock} em estoque)</option>`).join('');
  $('#order-builder').classList.remove('hidden');
  $('#order-builder').innerHTML = `<div class="card-top"><div><span class="eyebrow">PEDIDO ABERTO</span><h3>Pedido ${shortId(order.id)}</h3><p>Status: ${order.status} · total: <strong>${money(order.total)}</strong></p></div><button class="small-button danger" id="cancel-order">Cancelar pedido</button></div>${orderHeader(order)}<form id="item-form" class="inline-form" style="margin-top:16px"><label>Tipo<select name="itemType"><option value="TICKET">Ingresso</option><option value="PRODUCT">Produto</option></select></label><label>Item<select name="referenceId" required><option value="">Selecione um item</option>${ticketOptions}</select></label><label>Quantidade<input name="quantity" required type="number" min="1" value="1" /></label><button class="primary" type="submit">Adicionar item</button></form><div>${order.items.length ? order.items.map((item) => `<div class="item-row"><span>${escapeHtml(item.nameSnapshot)} x ${item.quantity}</span><strong>${money(item.subtotal)}</strong></div>`).join('') : '<p style="margin-top:14px">Nenhum item ainda.</p>'}</div>`;
  $('#item-form').addEventListener('submit', addOrderItem);
  $('#item-form [name="itemType"]').addEventListener('change', (event) => {
    const select = $('#item-form [name="referenceId"]');
    select.innerHTML = `<option value="">Selecione um item</option>${event.target.value === 'TICKET' ? ticketOptions : productOptions}`;
  });
  $('#cancel-order').addEventListener('click', cancelCurrentOrder);
}

async function addOrderItem(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (!data.referenceId) return showMessage('Selecione um ingresso ou produto antes de adicionar.', true);
  try {
    state.currentOrder = await api(`/api/v1/orders/${state.currentOrder.id}/items`, { method: 'POST', body: JSON.stringify({ itemType: data.itemType, referenceId: data.referenceId, quantity: Number(data.quantity) }) });
    showMessage('Item adicionado e total recalculado.');
    renderOrderBuilder();
    await loadOrders();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function cancelCurrentOrder() {
  try {
    state.currentOrder = await api(`/api/v1/orders/${state.currentOrder.id}/cancel`, { method: 'POST' });
    showMessage('Pedido cancelado.');
    renderOrderBuilder();
    await loadOrders();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function findOrder(event) {
  event.preventDefault();
  const id = new FormData(event.currentTarget).get('orderId').toString().trim();
  if (!id) return showMessage('Informe o ID completo do pedido.', true);
  try {
    state.currentOrder = await api(`/api/v1/orders/${encodeURIComponent(id)}`);
    const eventData = await api(`/api/v1/events/${state.currentOrder.eventId}`);
    const [tickets, products] = await Promise.all([api(`/api/v1/events/${eventData.id}/tickets`), api(`/api/v1/events/${eventData.id}/products`)]);
    state.orderCatalog = { tickets: tickets.data, products: products.data };
    renderOrderBuilder();
    showMessage('Pedido encontrado.');
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function openOrder(id) {
  try {
    state.currentOrder = await api(`/api/v1/orders/${encodeURIComponent(id)}`);
    const eventData = await api(`/api/v1/events/${state.currentOrder.eventId}`);
    const [tickets, products] = await Promise.all([api(`/api/v1/events/${eventData.id}/tickets`), api(`/api/v1/events/${eventData.id}/products`)]);
    state.orderCatalog = { tickets: tickets.data, products: products.data };
    navigate('orders');
    renderOrderBuilder();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function copyOrderId(id) {
  try {
    await navigator.clipboard.writeText(id);
    showMessage('ID do pedido copiado.');
  } catch {
    showMessage(`Copie manualmente o ID: ${id}`, true);
  }
}

$('#event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/v1/events', { method: 'POST', body: JSON.stringify({ title: data.title, category: data.category, date: new Date(data.date).toISOString(), location: data.location, capacity: Number(data.capacity), description: data.description || undefined }) });
    event.currentTarget.reset();
    showMessage('Evento criado.');
    await loadEvents();
  } catch (error) {
    showMessage(error.message, true);
  }
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(data) });
    setSession(result.user, result.token);
    showMessage('Login realizado.');
    navigate('dashboard');
  } catch (error) {
    showMessage(error.message, true);
  }
});

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await api('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(data) });
    setSession(result.user, result.token);
    showMessage('Cadastro realizado.');
    navigate('dashboard');
  } catch (error) {
    showMessage(error.message, true);
  }
});

$('#logout-button').addEventListener('click', () => { clearSession(); showMessage('Sessão encerrada.'); });
$('#refresh-events').addEventListener('click', loadEvents);
$('#refresh-orders').addEventListener('click', loadOrders);
$('#find-order-form').addEventListener('submit', findOrder);
['category', 'from', 'to'].forEach((filter) => { $(`#filter-${filter}`).addEventListener('input', (event) => { state.filters[filter] = event.target.value; renderEvents(); }); });
$('#clear-filters').addEventListener('click', () => { state.filters = { category: '', from: '', to: '' }; $('#filter-category').value = ''; $('#filter-from').value = ''; $('#filter-to').value = ''; renderEvents(); });

document.addEventListener('click', (event) => {
  const section = event.target.closest('[data-section-link]')?.dataset.sectionLink;
  if (section) navigate(section);
  const nav = event.target.closest('[data-section]')?.dataset.section;
  if (nav) navigate(nav);
  const openEventButton = event.target.closest('[data-open-event]');
  if (openEventButton) openEvent(openEventButton.dataset.openEvent);
  const cancelButton = event.target.closest('[data-cancel-event]');
  if (cancelButton) cancelEvent(cancelButton.dataset.cancelEvent);
  const orderButton = event.target.closest('[data-open-order]');
  if (orderButton) openOrder(orderButton.dataset.openOrder);
  const copyButton = event.target.closest('[data-copy-order]');
  if (copyButton) copyOrderId(copyButton.dataset.copyOrder);
});

async function cancelEvent(id) {
  if (!confirm('Cancelar este evento?')) return;
  try {
    await api(`/api/v1/events/${id}`, { method: 'DELETE' });
    showMessage('Evento cancelado.');
    await loadEvents();
  } catch (error) {
    showMessage(error.message, true);
  }
}

renderSession();
loadHealth();
loadEvents();
renderStats();
