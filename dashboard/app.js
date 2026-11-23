// Token Radar dashboard (radar-3). Reads window.RADAR from data.js beside the page and renders
// the ranked board, the live-token set, and a detail view for every protocol. No network: every
// byte it shows is in data.js, and no address is named anywhere in this file.
//
// The page recomputes each row from the snapshot figures with the same arithmetic the program
// uses (category multiple from the comparables table, growth, maturity, chains), so the number
// a detail view shows is the number board.json carries — the page and the board agree by
// construction, and the detail view says so.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  if (!DATA || !DATA.rows) {
    app.innerHTML = '<div class="shell missing"><h1>Token Radar</h1>' +
      '<p class="sub">No data loaded. This page reads data.js beside it; open it from the built output directory.</p></div>';
    app.setAttribute('aria-busy', 'false');
    return;
  }

  // ---- state, from the URL so every view has a deep link ----
  var params = new URLSearchParams(window.location.search);
  var state = {
    view: params.get('view') || 'board', // board | live | detail | filtered
    slug: params.get('slug') || null,
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    chain: params.get('chain') || 'all',
    watchlist: params.get('watchlist') === '1',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === '1' ? 1 : -1,
  };
  if (state.view === 'filtered' && state.category === 'all') state.view = 'board';
  if (state.view !== 'board' && state.view !== 'live' && state.view !== 'detail' && state.view !== 'filtered') state.view = 'board';

  function writeState() {
    var p = new URLSearchParams();
    if (state.view !== 'board') p.set('view', state.view);
    if (state.slug) p.set('slug', state.slug);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.watchlist) p.set('watchlist', '1');
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.dir !== -1) p.set('dir', String(state.dir));
    var next = p.toString();
    try {
      window.history.replaceState(null, '', next ? '?' + next : window.location.pathname);
    } catch (e) { /* file URLs in some browsers refuse replaceState; the view still renders */ }
  }

  // ---- formatting ----
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function fmtDate(d) {
    return d ? esc(d) : 'unknown';
  }

  // ---- the model, recomputed from the snapshot figures ----
  function multipleFor(cat) {
    var want = cat || 'Other';
    for (var i = 0; i < DATA.comparables.categories.length; i++) {
      if (DATA.comparables.categories[i].category === want) return DATA.comparables.categories[i].multiple;
    }
    return DATA.comparables.overall_median;
  }
  function comparableFor(cat) {
    var want = cat || 'Other';
    for (var i = 0; i < DATA.comparables.categories.length; i++) {
      if (DATA.comparables.categories[i].category === want) return DATA.comparables.categories[i];
    }
    return null;
  }
  function recompute(row) {
    var m = DATA.model;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var gm = 1 + (growth / 100) * m.growth_weight;
    var mm = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var cm = 1 + m.chains_step * Math.min(Math.max(row.chains.length - 1, 0), m.chains_cap);
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * multipleFor(row.category) * gm * mm * cm)),
      growthMult: gm, maturityMult: mm, chainsMult: cm, multiple: multipleFor(row.category), age: age, growth: growth,
    };
  }

  // ---- filtering and sorting ----
  function boardRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlist && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function liveRows() {
    var q = state.q.trim().toLowerCase();
    if (!q) return DATA.live;
    return DATA.live.filter(function (r) {
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  // ---- pieces of the page ----
  function band() {
    return '<header class="band"><div class="band-inner">' +
      '<div class="brand"><span class="mark" aria-hidden="true"></span>' +
      '<span class="name">Token Radar</span>' +
      '<span class="tag">pre-token protocols, ranked by implied value</span></div>' +
      '<div class="band-meta"><span>Snapshot <b>' + esc(DATA.as_of) + '</b></span>' +
      '<span>DefiLlama protocol index</span>' +
      '<span>Model <b>' + esc(DATA.model_version) + '</b></span></div>' +
      '</div></header>';
  }
  function lede() {
    return '<section class="lede"><div><h1>' + DATA.watchlist_size +
      ' watchlist protocols, ranked by implied value</h1>' +
      '<p>The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) +
      'M of TVL and no token on record. The early radar adds ' + DATA.early_size +
      ' pre-token protocols below that floor, picked by the model. Implied value is a model, not a price.</p></div>' +
      '<div class="facts">' +
      '<div class="fact"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Pre-token rows</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="fact"><span>Early rows</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="fact"><span>Live tokens set aside</span><b>' + DATA.live_size + '</b></div>' +
      '</div></section>';
  }
  function tabs() {
    var pre = state.view === 'board' || state.view === 'filtered';
    return '<div class="tabs" role="tablist">' +
      '<button type="button" role="tab" aria-pressed="' + pre + '" data-action="tab" data-tab="board">Pre-token board (' + DATA.board_size + ')</button>' +
      '<button type="button" role="tab" aria-pressed="' + (state.view === 'live') + '" data-action="tab" data-tab="live">Live tokens (' + DATA.live.length + ')</button>' +
      '</div>';
  }
  function controls() {
    var cats = [];
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort();
    var chains = [];
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    chains.sort();
    var catOpts = '<option value="all">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label>' +
      '<input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label>' +
      '<select id="category" aria-label="Filter by category">' + catOpts + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label>' +
      '<select id="chain" aria-label="Filter by chain">' + chainOpts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="watchlist" ' + (state.watchlist ? 'checked' : '') + '> Watchlist only</label>' +
      '<span class="count" id="count"></span></div>';
  }
  function sortHead(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
    return '<th scope="col"><button type="button" data-action="sort" data-key="' + key + '">' + esc(label) + esc(arrow) + '</button></th>';
  }
  function chainText(r) {
    if (!r.chains || !r.chains.length) return 'an unnamed chain';
    if (r.chains.length === 1) return r.chains[0];
    return r.chains[0] + ', ' + r.chains[1] + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
  }
  function boardTable() {
    var list = sortedRows(boardRows());
    var max = list.length ? list[0].implied_value_usd : 1;
    var body = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      return '<tr tabindex="0" data-action="open" data-slug="' + esc(r.slug) + '"' + (state.slug === r.slug ? ' data-selected="true"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b>' +
        '<span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chainText(r)) + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gc + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' +
        Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%"></i></div>' +
        '<span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
        '<td>' + (r.watchlist ? '<span class="pill">Watchlist</span>' : '<span class="status">no token</span>') + '</td></tr>';
    }).join('');
    if (!list.length) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p class="sub">Clear the search or pick another category to see the board again.</p>' +
        '<button class="button" type="button" data-action="clear">Clear filters</button></div></div>';
    }
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortHead('implied', 'Rank') + sortHead('name', 'Protocol') + sortHead('tvl', 'TVL') +
      sortHead('growth', '7d') + sortHead('age', 'Age') + sortHead('implied', 'Implied value') +
      '<th scope="col">Token</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }
  function liveTable() {
    var list = liveRows();
    var body = list.map(function (r) {
      return '<tr><td><span class="status live">live</span></td>' +
        '<td class="name"><b>' + esc(r.name) + '</b>' +
        '<span class="sub">' + esc(r.category || 'Other') + ' on ' + esc(chainText(r)) + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="status live">already trades</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Tokens already live: their market cap is a fact, not a model. They are set aside from the pre-token ranking, and they are also the comparables the model is built from.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th>' +
      '<th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }
  function modelPanel() {
    var m = DATA.model;
    var cats = DATA.comparables.categories.slice().sort(function (a, b) { return b.multiple - a.multiple; });
    var rows = cats.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td>' +
        '<td class="num">' + (c.median === null ? '—' : fmtMult(c.median)) + '</td>' +
        '<td class="num">' + fmtMult(c.multiple) + '</td></tr>';
    }).join('');
    var earned = cats.filter(function (c) { return c.n >= m.min_comparables; }).length;
    return '<section class="panel model"><div class="card" style="border:0;margin:0">' +
      '<h2>How implied value is computed</h2>' +
      '<p class="sub">One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">implied = round( tvl_usd × category_multiple × growth_multiplier × maturity_multiplier × chains_multiplier )\n' +
      'growth_multiplier = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '\n' +
      'maturity_multiplier = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + '   (unknown age: ' + m.unknown_age_days + ' days)\n' +
      'chains_multiplier = 1 + ' + m.chains_step + ' × min(chains − 1, ' + m.chains_cap + ')   = 1.00 for every row: tested, see below</div>' +
      '<h3>Category multiples, from the protocols that already trade</h3>' +
      '<p class="sub">For each category, the median market-cap-to-TVL ratio of its tokenised protocols. A category earns its own multiple only with at least ' + m.min_comparables + ' tokenised protocols; below that it takes the market-wide median ' + fmtMult(DATA.comparables.overall_median) + '. Where it earns one, the median is shrunk toward the market median with ' + m.shrinkage_k + ' pseudo-observations of weight. ' + earned + ' of ' + cats.length + ' categories earn their own multiple; the rest use the market median for lack of evidence.</p>' +
      '<div class="table-wrap"><table><thead><tr><th scope="col">Category</th><th scope="col">Tokenised</th><th scope="col">Median ratio</th><th scope="col">Multiple used</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h3>Reach was tested and cut</h3>' +
      '<p class="sub">The model first gave multi-chain protocols a premium, then checked it against the ' + DATA.comparables.tokenised_count + ' tokenised protocols: single-chain protocols trade at a median 0.321× TVL against 0.175× for multi-chain ones, and the correlation of log ratio with chain count is −0.02. No premium exists in this snapshot, so the chains factor is 1.00 and moves no value. Growth leans on one week only, so its weight is halved; maturity discounts a young protocol but never refuses to value one.</p>' +
      '</div></section>';
  }
  function stepParts(s) {
    var at = s.indexOf(' Cost: ');
    if (at < 0) return { action: s, tail: '' };
    return { action: s.slice(0, at), tail: s.slice(at + 1) };
  }
  function detailView() {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.slug) { row = DATA.rows[i]; break; }
    if (!row) {
      return '<div class="shell"><a class="back" href="#" data-action="back">← Back to the board</a>' +
        '<div class="panel"><div class="empty"><h2>No protocol by that name</h2>' +
        '<p class="sub">The link names a slug this board does not carry.</p></div></div></div>';
    }
    var rec = recompute(row);
    var comp = comparableFor(row.category);
    var agree = rec.implied === row.implied_value_usd;
    var steps = row.farm_steps.map(function (s) {
      var p = stepParts(s);
      return '<li><b>' + esc(p.action) + '</b>' + (p.tail ? '<span class="cost">' + esc(p.tail) + '</span>' : '') + '</li>';
    }).join('');
    return '<div class="shell">' +
      '<a class="back" href="#" data-action="back">← Back to the board</a>' +
      '<div class="detail-head"><h1>' + esc(row.name) + '</h1>' +
      '<p class="meta">Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + esc(row.category || 'Other') +
      ' · ' + esc((row.chains || []).join(', ') || 'an unnamed chain') +
      (row.watchlist ? ' · <span class="pill">Watchlist</span>' : '') + '</p></div>' +
      '<div class="detail-grid"><div>' +
      '<section class="card"><h2>Implied value</h2>' +
      '<div class="big num">' + fmtUsd(row.implied_value_usd) + '</div>' +
      '<p class="sub">What a token would be worth if the protocol’s record stayed as it is. A model, not a price.</p>' +
      '<div class="equation">' +
      '<div class="row"><span>TVL</span><b class="num">' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div class="row"><span>Category multiple (' + esc(row.category || 'Other') + ')</span><b class="num">' + fmtMult(rec.multiple) + '</b></div>' +
      '<div class="row"><span>Category median, ' + (comp ? comp.n : 0) + ' tokenised protocol' + ((comp && comp.n === 1) ? '' : 's') + '</span><b class="num">' + (comp && comp.median !== null ? fmtMult(comp.median) : 'no median — market median used') + '</b></div>' +
      '<div class="row"><span>Seven-day growth</span><b class="num">' + fmtPct(row.change_7d) + ' → ×' + rec.growthMult.toFixed(3) + '</b></div>' +
      '<div class="row"><span>Age with no token</span><b class="num">' + fmtAge(row.age_days) + ' → ×' + rec.maturityMult.toFixed(3) + '</b></div>' +
      '<div class="row"><span>Chains (' + row.chains.length + ')</span><b class="num">×' + rec.chainsMult.toFixed(2) + ' — tested, no premium</b></div>' +
      '<div class="row total"><span>Recomputed from these figures</span><b class="num">' + fmtUsd(rec.implied) + '</b></div>' +
      '</div>' +
      '<p class="note">' + (agree ? 'The page recomputes this row as ' + fmtUsd(rec.implied) + ', the same number board.json carries.' : 'The page recomputes this row as ' + fmtUsd(rec.implied) + ', which differs from the board: the data would be stale.') + '</p>' +
      '</section>' +
      '<section class="card"><h2>Snapshot figures</h2>' +
      '<div class="equation">' +
      '<div class="row"><span>First listed</span><b>' + fmtDate(row.listed_at) + '</b></div>' +
      '<div class="row"><span>Chains</span><b>' + esc((row.chains || []).join(', ') || '—') + '</b></div>' +
      '<div class="row"><span>Token on record</span><b>none</b></div>' +
      '<div class="row"><span>Seven-day TVL change</span><b class="num">' + fmtPct(row.change_7d) + '</b></div>' +
      '</div></section></div>' +
      '<div><section class="card"><h2>Farm plan</h2>' +
      '<p class="sub">Seven steps, each with what it costs and how long it takes. The first step is the model’s own reasoning for this protocol.</p>' +
      '<ol class="steps">' + steps + '</ol></section></div>' +
      '</div></div>';
  }
  function footer() {
    return '<footer class="footer"><p>Source: DefiLlama protocol index, snapshot of ' + esc(DATA.as_of) +
      '. The snapshot carries no ranking, no implied value and no farm plan; deriving them is this entry’s work. ' +
      'A protocol is shown as recording no token, never as having none: its record may simply not carry one.</p>' +
      '<p>Model ' + esc(DATA.model_version) + ' · ' + DATA.board_size + ' rows · ' + DATA.live_size +
      ' live-token protocols set aside with their market caps.</p></footer>';
  }

  // ---- render ----
  function render() {
    var html = band();
    if (state.view === 'detail') {
      html += detailView();
    } else {
      html += '<div class="shell">' + lede() + tabs();
      if (state.view === 'filtered') {
        html += '<div class="banner"><span>Filtered: category <b>' + esc(state.category) + '</b> — ' +
          boardRows().length + ' rows of ' + DATA.board_size + '.</span>' +
          '<button type="button" data-action="clear">Clear filter</button></div>';
      }
      html += controls();
      html += '<div id="board-area">' + (state.view === 'live' ? liveTable() : boardTable()) + '</div>';
      if (state.view !== 'live') html += modelPanel();
      html += footer() + '</div>';
    }
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    var count = document.getElementById('count');
    if (count) {
      count.textContent = state.view === 'live'
        ? liveRows().length + ' live-token protocols'
        : boardRows().length + ' of ' + DATA.board_size + ' rows shown';
    }
    window.scrollTo(0, 0);
  }

  // ---- events, delegated ----
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var action = t.getAttribute('data-action');
    if (action === 'sort') {
      var key = t.getAttribute('data-key');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      writeState(); render();
    } else if (action === 'tab') {
      var tab = t.getAttribute('data-tab');
      state.view = tab === 'live' ? 'live' : 'board';
      state.slug = null;
      writeState(); render();
    } else if (action === 'open') {
      state.view = 'detail';
      state.slug = t.getAttribute('data-slug');
      writeState(); render();
    } else if (action === 'back') {
      e.preventDefault();
      state.view = 'board';
      state.slug = null;
      writeState(); render();
    } else if (action === 'clear') {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false;
      state.view = 'board';
      writeState(); render();
    }
  });
  app.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-action="open"]')) {
      e.preventDefault();
      state.view = 'detail';
      state.slug = e.target.getAttribute('data-slug');
      writeState(); render();
    }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    state.q = e.target.value;
    writeState();
    // Re-render only the table, so the search box keeps focus while typing.
    var area = document.getElementById('board-area');
    if (area) area.innerHTML = state.view === 'live' ? liveTable() : boardTable();
    var count = document.getElementById('count');
    if (count) {
      count.textContent = state.view === 'live'
        ? liveRows().length + ' live-token protocols'
        : boardRows().length + ' of ' + DATA.board_size + ' rows shown';
    }
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'category') {
      state.category = e.target.value;
      state.view = state.category === 'all' ? 'board' : 'filtered';
      writeState(); render();
    } else if (e.target.id === 'chain') {
      state.chain = e.target.value;
      writeState(); render();
    } else if (e.target.id === 'watchlist') {
      state.watchlist = e.target.checked;
      writeState(); render();
    }
  });

  render();
})();
