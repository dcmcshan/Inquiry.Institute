import { TABLES } from './tables.js';

const state = {
  table: null,
  playing: false
};

const refs = {
  conversationStream: document.getElementById('conversationStream'),
  generateRound: document.getElementById('generateRound'),
  tableNumberLabel: document.getElementById('tableNumberLabel'),
  tableTitle: document.getElementById('tableTitle'),
  tableSummary: document.getElementById('tableSummary'),
  tableSeatCount: document.getElementById('tableSeatCount'),
  sidebarSeatCount: document.getElementById('sidebarSeatCount'),
  participantsList: document.getElementById('participantsList'),
  tableVibe: document.getElementById('tableVibe'),
  activeTableTitle: document.getElementById('activeTableTitle'),
  activeTableTheme: document.getElementById('activeTableTheme'),
  activeTableSummary: document.getElementById('activeTableSummary'),
  topicText: document.getElementById('topicText'),
  latencyStatus: document.getElementById('latencyStatus'),
  messageTemplate: document.getElementById('messageTemplate')
};

init();

function init() {
  const table = loadTableFromLocation();
  if (!table) {
    renderMissingTable();
    return;
  }

  state.table = { ...table, history: [] };
  hydratePage(state.table);
  refs.generateRound?.addEventListener('click', handleGenerateRound);
}

function loadTableFromLocation() {
  const pathMatch = window.location.pathname.match(/\/tables\/([^/]+)/i);
  const slug = pathMatch?.[1] || new URLSearchParams(window.location.search).get('tableId');
  if (!slug) return null;
  const normalized = decodeURIComponent(slug).toLowerCase();

  const byId = TABLES.find((table) => table.id.toLowerCase() === normalized);
  if (byId) return byId;

  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    const byNumber = TABLES.find((table) => table.number === numeric);
    if (byNumber) return byNumber;
  }
  return null;
}

function hydratePage(table) {
  const seats = getSeatCount(table);
  refs.tableNumberLabel.textContent = `Table ${formatNumber(table.number)}`;
  refs.tableTitle.textContent = table.title;
  refs.tableSummary.textContent = table.summary;
  refs.tableSeatCount.textContent = `${seats} ${seats === 1 ? 'seat' : 'seats'}`;
  refs.sidebarSeatCount.textContent = seats;
  refs.activeTableTitle.textContent = `Table ${formatNumber(table.number)}`;
  refs.activeTableTheme.textContent = table.theme;
  refs.activeTableSummary.textContent = table.summary;
  refs.tableVibe.textContent = table.vibe || 'Atmosphere TBD.';
  refs.topicText.textContent = '—';
  refs.generateRound.disabled = false;

  renderParticipants(table);
  renderConversation(table);
}

function renderParticipants(table) {
  if (!refs.participantsList) return;
  refs.participantsList.innerHTML = '';

  if (!Array.isArray(table.participants) || table.participants.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'muted';
    placeholder.textContent = 'No participants configured yet.';
    refs.participantsList.appendChild(placeholder);
    return;
  }

  table.participants.forEach((participant) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = participant.label;
    refs.participantsList.appendChild(chip);
  });
}

function renderConversation(table) {
  refs.conversationStream.innerHTML = '';
  if (!table || table.history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
        <p>No conversation yet.</p>
        <p class="muted">When you run the widget the faculty replies will render here with a typewriter reveal.</p>
      `;
    refs.conversationStream.appendChild(empty);
    return;
  }

  table.history.forEach((entry) => {
    const card = buildMessageCard(entry);
    card.querySelector('.thinking-line').textContent = 'Delivered';
    refs.conversationStream.appendChild(card);
  });
  refs.conversationStream.scrollTop = refs.conversationStream.scrollHeight;
}

async function handleGenerateRound() {
  if (state.playing || !state.table) return;

  state.playing = true;
  refs.generateRound.disabled = true;
  updateLatencyStatus('connecting…');

  try {
    const started = performance.now();
    const payload = await requestRound(state.table);
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    updateLatencyStatus(`model responded in ${elapsed}s`);
    await playRound(state.table, payload);
  } catch (error) {
    console.error(error);
    updateLatencyStatus('error');
    alert(error.message || 'Failed to generate conversation');
  } finally {
    state.playing = false;
    refs.generateRound.disabled = false;
    setTimeout(() => updateLatencyStatus('idle'), 2500);
  }
}

async function requestRound(table) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableId: table.id,
      tableName: table.title,
      theme: table.theme,
      participants: table.participants,
      history: table.history
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'OpenRouter call failed');
  }
  return response.json();
}

async function playRound(table, payload) {
  const stream = refs.conversationStream;
  if (stream.querySelector('.empty-state')) {
    stream.innerHTML = '';
  }

  const liveContainer = document.createElement('div');
  liveContainer.className = 'live-round';
  stream.appendChild(liveContainer);

  refs.topicText.textContent = payload.topic || table.theme;

  for (const msg of payload.messages) {
    const participantMeta = resolveParticipant(table, msg.speaker);
    const entry = {
      speaker: participantMeta.label,
      handle: participantMeta.handle,
      content: '',
      createdAt: new Date().toISOString()
    };
    const card = buildMessageCard(entry);
    card.classList.add('playing');
    liveContainer.appendChild(card);
    scrollConversationToBottom();

    const thinkingEl = card.querySelector('.thinking-line');
    thinkingEl.textContent = `Thinking (${msg.thinking_delay.toFixed(1)}s)…`;
    await sleep(msg.thinking_delay * 1000);
    thinkingEl.textContent = 'Speaking…';

    await typewriter(
      card.querySelector('.message-body'),
      msg.content,
      msg.speaking_speed_wpm
    );

    thinkingEl.textContent = 'Delivered';
    card.classList.remove('playing');
    entry.content = msg.content;
    table.history.push(entry);
  }

  renderConversation(table);
}

function buildMessageCard(entry) {
  const fragment = refs.messageTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.message-card');
  card.querySelector('.speaker-name').textContent = entry.speaker;
  card.querySelector('.speaker-handle').textContent = entry.handle ? `@${entry.handle}` : '';
  card.querySelector('.timestamp').textContent = formatTime(entry.createdAt);
  card.querySelector('.message-body').textContent = entry.content || '';
  return card;
}

function resolveParticipant(table, speakerId) {
  const matched =
    table.participants.find((p) => p.handle === speakerId) ||
    table.participants.find((p) => p.label.toLowerCase() === speakerId?.toLowerCase());

  return (
    matched || {
      handle: speakerId || 'guest',
      label: speakerId || 'Guest'
    }
  );
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateLatencyStatus(text) {
  refs.latencyStatus.textContent = text;
}

function scrollConversationToBottom() {
  requestAnimationFrame(() => {
    refs.conversationStream.scrollTop = refs.conversationStream.scrollHeight;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typewriter(target, text, wpm = 140) {
  const safeText = text ?? '';
  const charsPerMinute = Math.max(wpm * 5, 200);
  const msPerChar = Math.min(Math.max(60000 / charsPerMinute, 18), 120);
  target.textContent = '';

  return new Promise((resolve) => {
    let idx = 0;
    const timer = setInterval(() => {
      target.textContent += safeText[idx] ?? '';
      idx += 1;
      if (idx >= safeText.length) {
        clearInterval(timer);
        resolve();
      }
    }, msPerChar);
  });
}

function renderMissingTable() {
  if (refs.tableTitle) refs.tableTitle.textContent = 'Table not found';
  if (refs.tableSummary) refs.tableSummary.textContent = 'Double-check the table link or return to the main list.';
  if (refs.tableSeatCount) refs.tableSeatCount.textContent = '—';
  if (refs.sidebarSeatCount) refs.sidebarSeatCount.textContent = '—';
  if (refs.generateRound) refs.generateRound.disabled = true;

  refs.conversationStream.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = `
      <p>We couldn’t locate that table.</p>
      <p class="muted"><a href="/">Head back to the table directory.</a></p>
    `;
  refs.conversationStream.appendChild(empty);
}

function getSeatCount(table) {
  if (!table) return 0;
  if (typeof table.seats === 'number') return table.seats;
  if (Array.isArray(table.participants)) return table.participants.length;
  return 0;
}

function formatNumber(number) {
  if (typeof number !== 'number' || Number.isNaN(number)) return '—';
  return number.toString().padStart(2, '0');
}
