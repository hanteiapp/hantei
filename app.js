const storageKey = "hantei_abs_events";
const supabaseUrl = "https://aroguhvdhsjjucdprlra.supabase.co";
const supabaseKey = "sb_publishable_snAMHKDq3HFEx2d68ch4Sw_zUPeniLq";
const statusLabels = { scheduled: "試合前", live: "試合中", final: "終了" };
const teamNames = {
  tigers: "阪神タイガース",
  baystars: "横浜DeNAベイスターズ",
  giants: "読売ジャイアンツ",
  dragons: "中日ドラゴンズ",
  carp: "広島東洋カープ",
  swallows: "東京ヤクルトスワローズ",
  hawks: "福岡ソフトバンクホークス",
  fighters: "北海道日本ハムファイターズ",
  buffaloes: "オリックス・バファローズ",
  eagles: "東北楽天ゴールデンイーグルス",
  lions: "埼玉西武ライオンズ",
  marines: "千葉ロッテマリーンズ"
};

function statusClass(status) {
  return status === "試合中" ? "live" : status === "終了" ? "finished" : "";
}

function getEvents() {
  try {
    const events = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(events));
  } catch {
    return false;
  }
  return true;
}

function calculateAbsIndex(events) {
  const cutoff = Date.now() - 60000;
  return Math.min(events.filter(event => event.pressedAt >= cutoff).length * 20, 100);
}

function getSurgeHistory(events) {
  const sorted = [...events].sort((a, b) => a.pressedAt - b.pressedAt);
  return sorted.filter((event, index) => {
    const recent = sorted.slice(0, index).filter(item => item.pressedAt >= event.pressedAt - 60000);
    return recent.length === 2;
  });
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function saveAbsEvent(event) {
  return supabaseRequest("abs_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ id: event.id, game_id: event.gameId, details: null })
  });
}

function saveAbsDetails(id, details) {
  return supabaseRequest(`abs_events?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ details })
  });
}

function getRemoteReactionState(gameId) {
  return supabaseRequest("rpc/get_abs_reaction_state", {
    method: "POST",
    body: JSON.stringify({ p_game_id: gameId })
  });
}

function formatGame(game) {
  const visitor = teamNames[game.visitor_team] || game.visitor_team;
  const home = teamNames[game.home_team] || game.home_team;
  return {
    id: game.game_id,
    date: game.game_date,
    time: game.start_time.slice(0, 5),
    visitor,
    visitorFull: visitor,
    home,
    homeFull: home,
    status: statusLabels[game.status] || game.status
  };
}

function todayInJapan() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo"
  }).format(new Date(`${date}T00:00:00+09:00`));
}

async function renderGameList(date) {
  const list = document.querySelector("#game-list");
  if (!list) return;

  try {
    const games = (await supabaseRequest(`games?select=*&game_date=eq.${date}&order=start_time.asc,game_number.asc`)).map(formatGame);
    document.querySelector("#game-count").textContent = `${games.length}試合`;
    list.innerHTML = games.map(game => `
      <a class="game-card" href="game.html?game=${game.id}" aria-label="${game.visitor} 対 ${game.home}、${game.status}">
        <div class="card-top">
          <span class="card-time">${game.time}</span>
          <span class="status ${statusClass(game.status)}">${game.status}</span>
        </div>
        <div class="teams">
          <strong><span>VIS</span>${game.visitor}</strong>
          <strong><span>HOME</span>${game.home}</strong>
        </div>
      </a>
    `).join("");
  } catch {
    document.querySelector("#game-count").textContent = "0試合";
  }
}

function setupDateNavigation() {
  if (!document.querySelector("#game-list")) return;
  const parameter = new URLSearchParams(location.search).get("date");
  let date = /^\d{4}-\d{2}-\d{2}$/.test(parameter || "") ? parameter : todayInJapan();

  function showDate() {
    document.querySelector("#selected-date").dateTime = date;
    document.querySelector("#selected-date").textContent = formatDate(date);
    const url = new URL(location.href);
    url.searchParams.set("date", date);
    history.replaceState(null, "", url);
    renderGameList(date);
  }

  document.querySelector("#previous-date").addEventListener("click", () => {
    date = shiftDate(date, -1);
    showDate();
  });
  document.querySelector("#next-date").addEventListener("click", () => {
    date = shiftDate(date, 1);
    showDate();
  });
  showDate();
}

async function renderGamePage() {
  const view = document.querySelector("#game-view");
  if (!view) return;

  const gameId = new URLSearchParams(location.search).get("game");
  let game;
  try {
    const games = await supabaseRequest(`games?select=*&game_id=eq.${encodeURIComponent(gameId)}&limit=1`);
    game = games[0] && formatGame(games[0]);
  } catch {}
  if (!game) {
    document.querySelector("#game-error").hidden = false;
    return;
  }

  document.title = `${game.visitor} vs ${game.home} | HANTEI`;
  document.querySelector(".back-link").href = `index.html?date=${game.date}`;
  document.querySelector("#visitor-name").textContent = game.visitorFull;
  document.querySelector("#home-name").textContent = game.homeFull;
  document.querySelector("#game-time").textContent = `${game.time}開始`;
  const status = document.querySelector("#game-status");
  status.textContent = game.status;
  status.classList.add(statusClass(game.status));
  view.hidden = false;

  const dialog = document.querySelector("#details-dialog");
  const form = document.querySelector("#details-form");
  let activeEventId = null;
  const pendingSaves = new Map();

  function localReactionState() {
    const events = getEvents().filter(event => event.gameId === gameId);
    return {
      isSurging: calculateAbsIndex(events) >= 60,
      history: getSurgeHistory(events).slice(-5).reverse()
    };
  }

  function renderReactionState(state) {
    document.querySelector("#surge-notice").hidden = !state.isSurging;
    const list = document.querySelector("#surge-history");
    list.innerHTML = state.history.map(event => `
      <li><time datetime="${new Date(event.pressedAt).toISOString()}">${new Date(event.pressedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span>ABS反応が急増</span></li>
    `).join("");
    list.hidden = state.history.length === 0;
    document.querySelector("#history-empty").hidden = state.history.length > 0;
  }

  async function updateReactionState() {
    try {
      renderReactionState(await getRemoteReactionState(gameId));
    } catch {
      renderReactionState(localReactionState());
    }
  }

  document.querySelector("#abs-button").addEventListener("click", () => {
    const event = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      gameId,
      pressedAt: Date.now(),
      details: null
    };
    const events = getEvents();
    events.push(event);
    saveEvents(events);
    activeEventId = event.id;
    updateReactionState();
    const save = saveAbsEvent(event).then(updateReactionState).catch(() => updateReactionState());
    pendingSaves.set(event.id, save);
    save.finally(() => pendingSaves.delete(event.id));
    form.reset();
    dialog.showModal();
  });

  document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(form);
    const events = getEvents();
    const target = events.find(item => item.id === activeEventId);
    if (target) {
      const details = {
        batterName: data.get("batterName") || "",
        pitchNumber: data.get("pitchNumber") || "",
        officialCall: data.get("officialCall") || "",
        fanCall: data.get("fanCall") || ""
      };
      target.details = details;
      saveEvents(events);
      try {
        await pendingSaves.get(activeEventId);
        await saveAbsDetails(activeEventId, details);
      } catch {}
    }
    dialog.close();
  });

  dialog.addEventListener("close", () => { activeEventId = null; });
  updateReactionState();
  setInterval(updateReactionState, 10000);
}

setupDateNavigation();
renderGamePage();
