import { TABLES } from './tables.js';

const grid = document.getElementById('tablesGrid');

renderTableLinks();

function renderTableLinks() {
  if (!grid) return;
  grid.innerHTML = '';

  const sorted = [...TABLES].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  sorted.forEach((table) => {
    const seats = typeof table.seats === 'number' ? table.seats : table.participants?.length ?? 0;
    const link = document.createElement('a');
    link.className = 'table-card-link';
    link.href = `/tables/${table.id}`;
    link.setAttribute('aria-label', `Open Table ${table.number} (${seats} seats)`);

    link.innerHTML = `
      <article class="table-card simple-card">
        <p class="table-number">Table ${formatNumber(table.number)}</p>
        <h2 class="table-seat-count">${seats} ${seats === 1 ? 'seat' : 'seats'}</h2>
        <p class="muted seat-caption">Max participants</p>
      </article>
    `;

    grid.appendChild(link);
  });
}

function formatNumber(number) {
  if (typeof number !== 'number' || Number.isNaN(number)) return '—';
  return number.toString().padStart(2, '0');
}
