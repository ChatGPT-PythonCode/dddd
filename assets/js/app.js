async function loadData() {
  const res = await fetch('comics.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load comics.json');
  return await res.json();
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function idToNumber(id) {
  const m = String(id ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.NaN;
}

function byIdAscending(a, b) {
  const na = idToNumber(a.id);
  const nb = idToNumber(b.id);
  const aHas = Number.isFinite(na);
  const bHas = Number.isFinite(nb);
  if (aHas && bHas && na !== nb) return na - nb;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''), undefined, { numeric: true });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}

function setCurrentTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'page' : 'false');
  });
  document.querySelectorAll('[data-panel]').forEach(p => {
    p.style.display = p.dataset.panel === tab ? 'block' : 'none';
  });
}

function openReader() {
  const d = document.getElementById('reader');
  d.setAttribute('open', '');
  document.body.style.overflow = 'hidden';
}
function closeReader() {
  const d = document.getElementById('reader');
  d.removeAttribute('open');
  document.body.style.overflow = '';
}


/* ===== Disclaimer gate (must acknowledge once) ===== */
const DISCLAIMER_KEY = "eowebcomic_disclaimer_accepted_v1";

function openDisclaimer() {
  const d = document.getElementById('disclaimer');
  if (!d) return;
  d.setAttribute('open', '');
  document.documentElement.style.overflow = 'hidden';
}
function closeDisclaimer() {
  const d = document.getElementById('disclaimer');
  if (!d) return;
  d.removeAttribute('open');
  document.documentElement.style.overflow = '';
}
function hasAcceptedDisclaimer() {
  try { return localStorage.getItem(DISCLAIMER_KEY) === 'true'; } catch { return false; }
}
function acceptDisclaimer() {
  try { localStorage.setItem(DISCLAIMER_KEY, 'true'); } catch {}
  closeDisclaimer();
}


function setBtn(id, enabled, onClick) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!enabled) {
    el.setAttribute('aria-disabled', 'true');
    el.onclick = null;
  } else {
    el.removeAttribute('aria-disabled');
    el.onclick = onClick;
  }
}

function setHash(idOrKey) {
  // hash format: #c=001
  const u = new URL(window.location.href);
  u.hash = `c=${encodeURIComponent(idOrKey)}`;
  history.replaceState(null, '', u.toString());
}

function getHashComic() {
  const h = (window.location.hash || '').replace(/^#/, '');
  const sp = new URLSearchParams(h);
  return sp.get('c');
}

let STATE = { data: null, comics: [], currentIndex: 0 };

function displayTitle(c) {
  // If you just want numeric pages, leaving title blank in comics.json still looks good.
  return c.title?.trim() ? c.title : `Page #${String(c.id ?? '').trim()}`;
}

function displayMeta(c) {
  const bits = [];
  if (c.date) bits.push(c.date);
  if (c.id != null) bits.push(`#${c.id}`);
  return bits.join(' • ');
}

function renderGrid(comics) {
  const grid = document.getElementById('archiveGrid');
  if (!grid) return;

  grid.innerHTML = comics.map(c => {
    const title = displayTitle(c);
    const meta = displayMeta(c);
    return `
      <button class="tile" type="button" data-open="${escapeHtml(c.id)}" aria-label="Open ${escapeHtml(title)}">
        <img class="thumb" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.alt || title)}" loading="lazy">
        <h3>${escapeHtml(title)}</h3>
        ${meta ? `<div class="muted small">${escapeHtml(meta)}</div>` : ''}
      </button>
    `;
  }).join('');

  grid.querySelectorAll('button[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-open');
      openComicById(id);
    });
  });
}

function renderLatest(comic) {
  // Keep the "Latest" tab usable, even though Archive is the landing page.
  setText('latestTitle', displayTitle(comic));
  setText('latestDate', comic.date || '');
  setAttr('latestImg', 'src', comic.image);
  setAttr('latestImg', 'alt', comic.alt || displayTitle(comic));
  const btn = document.getElementById('latestOpen');
  if (btn) btn.onclick = () => openComicById(comic.id);
}

function openComicById(id) {
  const idx = STATE.comics.findIndex(c => String(c.id) === String(id));
  if (idx === -1) return;
  STATE.currentIndex = idx;
  renderReader();
  setHash(id);
  openReader();
}

function renderReader() {
  const comic = STATE.comics[STATE.currentIndex];
  const title = displayTitle(comic);
  setText('readerTitle', title);
  setText('readerMeta', displayMeta(comic));
  setAttr('readerImg', 'src', comic.image);
  setAttr('readerImg', 'alt', comic.alt || title);

  // Navigation (LOW → HIGH)
  const prev = STATE.comics[STATE.currentIndex - 1];
  const next = STATE.comics[STATE.currentIndex + 1];

  setBtn('btnPrev', !!prev, () => {
    STATE.currentIndex -= 1;
    renderReader();
    setHash(prev.id);
  });

  setBtn('btnNext', !!next, () => {
    STATE.currentIndex += 1;
    renderReader();
    setHash(next.id);
  });

  const latest = STATE.comics[STATE.comics.length - 1];
  setBtn('btnLatest', !!latest, () => {
    STATE.currentIndex = STATE.comics.length - 1;
    renderReader();
    setHash(latest.id);
  });

  // Simple preloading hint
  [prev, next].filter(Boolean).forEach(c => {
    const img = new Image();
    img.src = c.image;
  });
}

async function init() {
  try {
    // Disclaimer gate
    if (!hasAcceptedDisclaimer()) openDisclaimer();

    const data = await loadData();
    STATE.data = data;
    STATE.comics = [...(data.comics || [])].sort(byIdAscending);

    // Header + footer
    setText('siteTitle', data.title || 'Webcomic');
    setText('siteTitleFooter', data.title || 'Webcomic');
    setText('siteTagline', data.author ? `by ${data.author}` : '');

    if (!STATE.comics.length) {
      const empty = document.getElementById('emptyNote');
      if (empty) empty.style.display = 'block';
      return;
    }

    // Latest = highest page number
    renderLatest(STATE.comics[STATE.comics.length - 1]);
    renderGrid(STATE.comics);

    // Tabs
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => setCurrentTab(btn.dataset.tab));
    });
    setCurrentTab('archive');


    // Disclaimer interactions
    const discAccept = document.getElementById('discAccept');
    if (discAccept) discAccept.addEventListener('click', acceptDisclaimer);
    const openDisc = document.getElementById('openDisclaimer');
    if (openDisc) openDisc.addEventListener('click', (e) => { e.preventDefault(); openDisclaimer(); });
    const disc = document.getElementById('disclaimer');
    if (disc) {
      // Force acknowledgement: ignore overlay clicks + Escape when open
      disc.addEventListener('click', (e) => { if (e.target === disc) { /* no-op */ } });
    }

    // Archive quick actions
    const btnStart = document.getElementById('btnStart');
    if (btnStart) {
      btnStart.addEventListener('click', () => openComicById(STATE.comics[0].id));
    }
    const btnOpenLatest = document.getElementById('btnOpenLatest');
    if (btnOpenLatest) {
      btnOpenLatest.addEventListener('click', () => openComicById(STATE.comics[STATE.comics.length - 1].id));
    }

    // Reader close
    const close = document.getElementById('btnClose');
    if (close) close.addEventListener('click', closeReader);
    const reader = document.getElementById('reader');
    if (reader) {
      reader.addEventListener('click', (e) => {
        if (e.target.id === 'reader') closeReader();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('disclaimer')?.hasAttribute('open')) return;
        closeReader();
      }
      const r = document.getElementById('reader');
      if (!r || !r.hasAttribute('open')) return;
      if (e.key === 'ArrowLeft') document.getElementById('btnPrev')?.click();
      if (e.key === 'ArrowRight') document.getElementById('btnNext')?.click();
    });

    
    // Swipe navigation (mobile)
    let touchStartX = 0, touchStartY = 0, touchActive = false;
    const readerImg = document.getElementById('readerImg');
    const swipeTarget = readerImg?.parentElement || document.getElementById('reader');
    if (swipeTarget) {
      swipeTarget.addEventListener('touchstart', (e) => {
        if (!document.getElementById('reader')?.hasAttribute('open')) return;
        const t = e.touches[0];
        touchStartX = t.clientX; touchStartY = t.clientY;
        touchActive = true;
      }, { passive: true });

      swipeTarget.addEventListener('touchend', (e) => {
        if (!touchActive) return;
        touchActive = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) document.getElementById('btnNext')?.click();   // swipe left → next
        if (dx > 0) document.getElementById('btnPrev')?.click();   // swipe right → prev
      }, { passive: true });
    }

// Open from hash if present
    const cid = getHashComic();
    if (cid) {
      setCurrentTab('archive');


    // Disclaimer interactions
    const discAccept = document.getElementById('discAccept');
    if (discAccept) discAccept.addEventListener('click', acceptDisclaimer);
    const openDisc = document.getElementById('openDisclaimer');
    if (openDisc) openDisc.addEventListener('click', (e) => { e.preventDefault(); openDisclaimer(); });
    const disc = document.getElementById('disclaimer');
    if (disc) {
      // Force acknowledgement: ignore overlay clicks + Escape when open
      disc.addEventListener('click', (e) => { if (e.target === disc) { /* no-op */ } });
    }
      openComicById(cid);
    }

  } catch (e) {
    console.error(e);
    const el = document.getElementById('pageError');
    if (el) el.textContent = 'Could not load site data. Check comics.json and image paths.';
  }
}

init();
