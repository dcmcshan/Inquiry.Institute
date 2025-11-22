import { TABLES } from './tables.js';

const state = {
  tables: TABLES.map((table) => ({ ...table, history: [] })),
  activeTableId: TABLES[0]?.id ?? null,
  playing: false
};

const refs = {
  tablesPanel: document.getElementById('tablesPanel'),
  conversationStream: document.getElementById('conversationStream'),
  generateRound: document.getElementById('generateRound'),
  activeTableTitle: document.getElementById('activeTableTitle'),
  activeTableTheme: document.getElementById('activeTableTheme'),
  activeTableSummary: document.getElementById('activeTableSummary'),
  activeTableVibe: document.getElementById('activeTableVibe'),
  topicText: document.getElementById('topicText'),
  topicBanner: document.getElementById('topicBanner'),
  latencyStatus: document.getElementById('latencyStatus'),
  messageTemplate: document.getElementById('messageTemplate')
};

init();

function init() {
  renderTables();
  if (state.activeTableId) {
    setActiveTable(state.activeTableId);
  }
  refs.generateRound.addEventListener('click', handleGenerateRound);
}

function renderTables() {
  refs.tablesPanel.innerHTML = '';
  state.tables.forEach((table) => {
    const card = document.createElement('article');
    card.className = `table-card ${state.activeTableId === table.id ? 'active' : ''}`;
    card.dataset.tableId = table.id;
    card.innerHTML = `
      <h3 class="table-title">${table.title}</h3>
      <p class="table-summary">${table.summary}</p>
      <div class="chips">
        ${table.participants
          .map((participant) => `<span class="chip">${participant.handle}</span>`)
          .join('')}
      </div>
    `;
    card.addEventListener('click', () => setActiveTable(table.id));
    refs.tablesPanel.appendChild(card);
  });
}

function setActiveTable(tableId) {
  if (state.playing) return;
  state.activeTableId = tableId;
  renderTables();
  const table = getActiveTable();
  if (!table) return;
  refs.activeTableTitle.textContent = table.title;
  refs.activeTableTheme.textContent = table.theme;
  refs.activeTableSummary.textContent = table.summary;
  refs.activeTableVibe.textContent = table.vibe;
  refs.generateRound.disabled = false;
  refs.topicText.textContent = '—';
  renderConversation(table);
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
  if (state.playing) return;
  const table = getActiveTable();
  if (!table) return;

  state.playing = true;
  refs.generateRound.disabled = true;
  updateLatencyStatus('connecting…');

  try {
    const started = performance.now();
    const payload = await requestRound(table);
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    updateLatencyStatus(`model responded in ${elapsed}s`);
    await playRound(table, payload);
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

function getActiveTable() {
  return state.tables.find((table) => table.id === state.activeTableId);
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
