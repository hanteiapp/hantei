const storageKey = "hantei_abs_events";
const absSurgeConfig = { windowSeconds: 120, threshold: 3 };
const supabaseUrl = "https://aroguhvdhsjjucdprlra.supabase.co";
const supabaseKey = "sb_publishable_snAMHKDq3HFEx2d68ch4Sw_zUPeniLq";
const teamNames = {
  g: "読売ジャイアンツ",
  d: "中日ドラゴンズ",
  db: "横浜DeNAベイスターズ",
  s: "東京ヤクルトスワローズ",
  c: "広島東洋カープ",
  t: "阪神タイガース",
  e: "東北楽天ゴールデンイーグルス",
  l: "埼玉西武ライオンズ",
  m: "千葉ロッテマリーンズ",
  h: "福岡ソフトバンクホークス",
  b: "オリックスバファローズ",
  f: "北海道日本ハムファイターズ"
};
const teamShortNames = {
  g: "巨人",
  c: "広島",
  s: "ヤクルト",
  d: "中日",
  t: "阪神",
  db: "DeNA",
  e: "楽天",
  l: "西武",
  m: "ロッテ",
  h: "ソフトバンク",
  b: "オリックス",
  f: "日本ハム"
};
const teamAbbreviations = {
  g: "巨", t: "神", db: "D", c: "広", s: "ヤ", d: "中",
  h: "ソ", f: "日", m: "ロ", e: "楽", b: "オ", l: "西"
};
const teamOrder2025 = {
  t: 1, db: 2, g: 3, d: 4, c: 5, s: 6,
  h: 7, f: 8, b: 9, e: 10, l: 11, m: 12
};

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

function formatPitchLocation(course, height) {
  if (course === "middle" && height === "middle") return "ど真ん中";
  const courseLabel = { inside: "内角", middle: "真ん中", outside: "外角" }[course] || "";
  const heightLabel = { high: "高め", middle: "", low: "低め" }[height] || "";
  return `${courseLabel}${heightLabel}`;
}

function getSurgeHistory(events, game) {
  const windowMs = absSurgeConfig.windowSeconds * 1000;
  const sorted = events.filter(event => {
    const details = event.details;
    return details?.pitcherName && details?.batterName && details?.officialCall;
  }).sort((a, b) => a.pressedAt - b.pressedAt);

  return sorted.flatMap((event, index) => {
    const details = event.details;
    const pitcherKey = details.pitcherId || details.pitcherName;
    const batterKey = details.batterId || details.batterName;
    const matching = sorted.slice(0, index + 1).filter(candidate => {
      const candidateDetails = candidate.details;
      return candidate.pressedAt >= event.pressedAt - windowMs
        && (candidateDetails.pitcherId || candidateDetails.pitcherName) === pitcherKey
        && (candidateDetails.batterId || candidateDetails.batterName) === batterKey
        && candidateDetails.officialCall === details.officialCall;
    });
    if (matching.length !== absSurgeConfig.threshold) return [];

    const sameLocation = details.pitchCourse && details.pitchHeight && matching.every(candidate =>
      candidate.details.pitchCourse === details.pitchCourse
      && candidate.details.pitchHeight === details.pitchHeight);
    const location = sameLocation ? formatPitchLocation(details.pitchCourse, details.pitchHeight) : "";
    const call = details.officialCall === "strike" ? "ストライク" : "ボール";
    const batterTeam = teamShortNames[details.offenseTeamCode] || "";
    const pitcherCode = details.offenseTeamCode === game.visitorCode ? game.homeCode
      : details.offenseTeamCode === game.homeCode ? game.visitorCode : "";
    const pitcherTeam = teamShortNames[pitcherCode] || "";
    return [{
      startedAt: matching[0].pressedAt,
      triggeredAt: event.pressedAt,
      message: `${pitcherTeam ? `${pitcherTeam}・` : ""}${details.pitcherName}投手が${batterTeam ? `${batterTeam}・` : ""}${details.batterName}選手に投げた${location ? `${location}の` : ""}${call}判定にファンABSチャレンジが急増！`
    }];
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
    body: JSON.stringify({
      id: event.id,
      game_id: event.gameId,
      home_plate_umpire: event.homePlateUmpire || null
    })
  });
}

function saveAbsDetails(id, details) {
  return supabaseRequest(`abs_events?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      offense_team_code: details.offenseTeamCode || null,
      batter_id: details.batterId || null,
      batter_name: details.batterName || null,
      pitcher_id: details.pitcherId || null,
      pitcher_name: details.pitcherName || null,
      pitch_number: details.pitchNumber || null,
      pitch_course: details.pitchCourse || null,
      pitch_height: details.pitchHeight || null,
      official_call: details.officialCall || null,
      fan_call: details.fanCall || null
    })
  });
}

function getRemoteReactionState(gameId) {
  return supabaseRequest("rpc/get_abs_reaction_state", {
    method: "POST",
    body: JSON.stringify({ p_game_id: gameId })
  });
}

function getPlayers(game) {
  const season = Number(game.date.slice(0, 4));
  const teams = `${game.visitorCode},${game.homeCode}`;
  return supabaseRequest(`players?select=player_id,team_code,uniform_number,player_name,registered_name,position&season=eq.${season}&active=eq.true&team_code=in.(${teams})&order=uniform_number.asc`);
}

function getPlayerDisplayName(player) {
  return player.registered_name?.trim() || player.player_name;
}

function formatGame(game) {
  const visitorFull = teamNames[game.visitor_team] || game.visitor_team;
  const homeFull = teamNames[game.home_team] || game.home_team;
  const visitor = teamShortNames[game.visitor_team] || visitorFull;
  const home = teamShortNames[game.home_team] || homeFull;
  const startTime = String(game.start_time || "").trim();
  const cancelled = startTime.toLowerCase() === "cancelled" || startTime === "試合中止";
  return {
    id: game.game_id,
    date: game.game_date,
    time: cancelled ? "試合中止" : startTime.slice(0, 5),
    cancelled,
    visitorCode: game.visitor_team,
    visitor,
    visitorFull,
    homeCode: game.home_team,
    home,
    homeFull,
    end: game.game_end,
    umpire: game.home_plate_umpire
  };
}

function todayInJapan() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function isAbsAvailable(game, now = new Date()) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(now);
  return game.date === new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now)
    && time >= game.time;
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
  const empty = document.querySelector("#game-empty");

  try {
    const games = (await supabaseRequest(`games?select=*&game_date=eq.${date}&order=start_time.asc`))
      .map(formatGame)
      .sort((a, b) => Math.min(teamOrder2025[a.visitorCode], teamOrder2025[a.homeCode])
        - Math.min(teamOrder2025[b.visitorCode], teamOrder2025[b.homeCode]));
    document.querySelector("#game-count").textContent = `${games.length}試合`;
    list.innerHTML = games.map(game => `
      <a class="game-card visitor-${game.visitorCode} home-${game.homeCode}" href="game.html?game=${game.id}" aria-label="${game.visitor} 対 ${game.home}">
        <div class="card-top">
          <span class="card-time">${game.time}</span>
        </div>
        <div class="teams">
          <strong><span>Visitor</span>${game.visitor}</strong>
          <strong><span>Home</span>${game.home}</strong>
        </div>
      </a>
    `).join("");
    empty.textContent = date === todayInJapan()
      ? "試合開始時刻までお待ちください。"
      : "試合がありません。";
    empty.hidden = games.length > 0;
  } catch {
    document.querySelector("#game-count").textContent = "0試合";
    empty.hidden = true;
  }
}

function setupDateNavigation() {
  if (!document.querySelector("#game-list")) return;
  const parameter = new URLSearchParams(location.search).get("date");
  const minimumDate = "2026-01-01";
  const today = todayInJapan();
  const previousButton = document.querySelector("#previous-date");
  const nextButton = document.querySelector("#next-date");
  const todayButton = document.querySelector("#today-date");
  const datePicker = document.querySelector("#date-picker");
  datePicker.max = today;
  let date = /^\d{4}-\d{2}-\d{2}$/.test(parameter || "")
    && parameter >= minimumDate && parameter <= today ? parameter : today;

  function showDate() {
    document.querySelector("#selected-date").dateTime = date;
    document.querySelector("#selected-date").textContent = formatDate(date);
    datePicker.value = date;
    previousButton.disabled = date <= minimumDate;
    nextButton.hidden = date >= today;
    todayButton.hidden = date === today;
    const url = new URL(location.href);
    url.searchParams.set("date", date);
    history.replaceState(null, "", url);
    renderGameList(date);
  }

  previousButton.addEventListener("click", () => {
    if (date > minimumDate) date = shiftDate(date, -1);
    showDate();
  });
  nextButton.addEventListener("click", () => {
    if (date < today) date = shiftDate(date, 1);
    showDate();
  });
  todayButton.addEventListener("click", () => {
    date = today;
    showDate();
  });
  datePicker.addEventListener("change", () => {
    if (datePicker.value >= minimumDate && datePicker.value <= today) {
      date = datePicker.value;
      showDate();
    }
  });
  showDate();
}

async function renderGamePage() {
  const view = document.querySelector("#game-view");
  if (!view) return;

  const gameId = new URLSearchParams(location.search).get("game");
  const isDummyGame = gameId === "dummy";
  let game;
  if (isDummyGame) {
    game = {
      ...formatGame({
        game_id: "dummy",
        game_date: todayInJapan(),
        visitor_team: "g",
        home_team: "s",
        start_time: "00:00",
        game_end: null,
        home_plate_umpire: ""
      }),
      isDummy: true
    };
  } else {
    try {
      const games = await supabaseRequest(`games?select=*&game_id=eq.${encodeURIComponent(gameId)}&limit=1`);
      game = games[0] && formatGame(games[0]);
    } catch {}
  }
  if (!game) {
    document.querySelector("#game-error").hidden = false;
    return;
  }

  document.title = `${game.visitor} vs ${game.home} | HANTEI`;
  document.querySelector(".back-link").href = `index.html?date=${game.date}`;
  view.classList.add(`visitor-${game.visitorCode}`, `home-${game.homeCode}`);
  document.querySelector("#visitor-name").textContent = game.visitorFull;
  document.querySelector("#home-name").textContent = game.homeFull;
  const gameDate = formatDate(game.date).replace("(", " (");
  document.querySelector("#game-time").textContent = `${gameDate} ${game.cancelled ? "試合中止" : `${game.time}開始`}${game.isDummy ? "（動作確認用）" : ""}`;
  const umpire = document.querySelector("#game-umpire");
  umpire.textContent = `球審：${game.umpire || ""}`;
  umpire.hidden = !game.umpire;
  view.hidden = false;

  const dialog = document.querySelector("#details-dialog");
  dialog.classList.add(`visitor-${game.visitorCode}`, `home-${game.homeCode}`);
  const form = document.querySelector("#details-form");
  const absButton = document.querySelector("#abs-button");
  const absConfirmation = document.querySelector("#abs-confirmation");
  const actionButtons = document.querySelectorAll(".reaction-button");
  const availability = document.querySelector("#abs-availability");
  const offenseTeamInputs = document.querySelectorAll('input[name="offenseTeamCode"]');
  const batterInput = document.querySelector("#batter-name");
  const pitcherInput = document.querySelector("#pitcher-name");
  const fanCallInput = document.querySelector("#fan-call");
  const fanCallOutput = document.querySelector("#fan-call-output");
  let players = [];
  let activeEventId = null;
  let detailPromptTimer;
  const pendingSaves = new Map();

  document.querySelector("#offense-visitor").value = game.visitorCode;
  document.querySelector("#offense-home").value = game.homeCode;
  document.querySelector("#offense-visitor").setAttribute("aria-label", `${game.visitor}を攻撃チームに選択`);
  document.querySelector("#offense-home").setAttribute("aria-label", `${game.home}を攻撃チームに選択`);
  document.querySelector("#offense-visitor-name").textContent = teamAbbreviations[game.visitorCode] || game.visitor;
  document.querySelector("#offense-home-name").textContent = teamAbbreviations[game.homeCode] || game.home;
  getPlayers(game).then(data => {
    players = data.sort((a, b) => Number(a.uniform_number) - Number(b.uniform_number)
      || b.uniform_number.length - a.uniform_number.length
      || getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b), "ja"));
  }).catch(() => {});

  function setupPlayerSearch(input, clearButton, suggestions, getTeamCode, positions) {
    let selectedId = "";

    function hide() {
      suggestions.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }

    function show() {
      const query = input.value.trim().toLowerCase();
      const matches = players.filter(player => player.team_code === getTeamCode()
        && positions.some(([position]) => position === player.position)
        && (!query || getPlayerDisplayName(player).toLowerCase().includes(query)
          || player.player_name.toLowerCase().includes(query) || player.uniform_number.includes(query)));
      suggestions.innerHTML = positions.map(([position, label]) => {
        const group = matches.filter(player => player.position === position);
        return group.length ? `<section><strong>${label}</strong>${group.map(player => {
          const name = getPlayerDisplayName(player);
          return `
          <button type="button" role="option" data-player-id="${escapeHtml(player.player_id)}" data-player-name="${escapeHtml(name)}">
            <span>${escapeHtml(player.uniform_number)}</span>${escapeHtml(name)}
          </button>`;
        }).join("")}</section>` : "";
      }).join("");
      suggestions.hidden = !suggestions.innerHTML;
      input.setAttribute("aria-expanded", String(!suggestions.hidden));
    }

    function reset() {
      selectedId = "";
      input.value = "";
      clearButton.hidden = true;
      hide();
    }

    input.addEventListener("focus", show);
    input.addEventListener("input", () => {
      selectedId = "";
      clearButton.hidden = !input.value;
      show();
    });
    clearButton.addEventListener("click", () => {
      reset();
      input.focus();
      show();
    });
    suggestions.addEventListener("click", event => {
      const button = event.target.closest("button[data-player-id]");
      if (!button) return;
      selectedId = button.dataset.playerId;
      input.value = button.dataset.playerName;
      clearButton.hidden = false;
      hide();
      input.focus();
    });

    return { getId: () => selectedId, hide, reset, show, field: input.parentElement };
  }

  const batterSearch = setupPlayerSearch(
    batterInput,
    document.querySelector("#clear-batter"),
    document.querySelector("#batter-suggestions"),
    () => form.elements.offenseTeamCode.value,
    [["catcher", "捕手"], ["infielder", "内野手"], ["outfielder", "外野手"], ["pitcher", "投手"]]
  );
  const pitcherSearch = setupPlayerSearch(
    pitcherInput,
    document.querySelector("#clear-pitcher"),
    document.querySelector("#pitcher-suggestions"),
    () => form.elements.offenseTeamCode.value === game.visitorCode ? game.homeCode
      : form.elements.offenseTeamCode.value === game.homeCode ? game.visitorCode : "",
    [["pitcher", "投手"]]
  );

  function updatePlayerFieldColors() {
    const offense = form.elements.offenseTeamCode.value;
    const batterSide = offense === game.visitorCode ? "visitor" : offense === game.homeCode ? "home" : "";
    const pitcherSide = batterSide === "visitor" ? "home" : batterSide === "home" ? "visitor" : "";
    [batterSearch.field, pitcherSearch.field].forEach(field => field.classList.remove("tone-visitor", "tone-home"));
    if (batterSide) batterSearch.field.classList.add(`tone-${batterSide}`);
    if (pitcherSide) pitcherSearch.field.classList.add(`tone-${pitcherSide}`);
  }

  offenseTeamInputs.forEach(input => input.addEventListener("change", () => {
    batterSearch.reset();
    pitcherSearch.reset();
    updatePlayerFieldColors();
  }));
  document.querySelectorAll('input[name="officialCall"]').forEach(input => input.addEventListener("change", () => {
    fanCallInput.value = input.value === "strike" ? "ball" : "strike";
    fanCallOutput.textContent = input.value === "strike" ? "ボール" : "ストライク";
    fanCallOutput.classList.add("selected");
  }));
  document.addEventListener("click", event => {
    if (!batterSearch.field.contains(event.target)) batterSearch.hide();
    if (!pitcherSearch.field.contains(event.target)) pitcherSearch.hide();
  });

  function updateAbsAvailability() {
    const ended = game.end === "final";
    const available = game.isDummy || (!ended && !game.cancelled && isAbsAvailable(game));
    actionButtons.forEach(button => { button.disabled = !available; });
    availability.textContent = game.cancelled
      ? "この試合は中止になりました。"
      : ended ? "この試合は終了しました。" : "試合開始後よりご利用いただけます。";
    availability.hidden = available;
  }

  function localReactionState() {
    const events = getEvents().filter(event => event.gameId === gameId);
    const history = getSurgeHistory(events, game).slice(-5).reverse();
    const currentSurge = history.find(item =>
      item.triggeredAt >= Date.now() - absSurgeConfig.windowSeconds * 1000) || null;
    return {
      isSurging: Boolean(currentSurge),
      currentSurge,
      history
    };
  }

  function renderReactionState(state) {
    const notice = document.querySelector("#surge-notice");
    const currentSurge = state.currentSurge || null;
    const message = currentSurge?.message || "ファンABSチャレンジが急増！";
    notice.hidden = !state.isSurging;
    notice.querySelector("strong").textContent = message;
    notice.querySelector("span").textContent = `${absSurgeConfig.windowSeconds / 60}分間に${absSurgeConfig.threshold}件の反応が集まりました`;
    const list = document.querySelector("#surge-history");
    list.innerHTML = state.history.map(event => {
      const historyMessage = event.message || "ファンABSチャレンジが急増！";
      const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(`${historyMessage}\n${location.href}\n#みんなのABS`)}`;
      return `<li>
        <time datetime="${new Date(event.startedAt || event.pressedAt).toISOString()}">${new Date(event.startedAt || event.pressedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
        <div class="history-content"><span>${escapeHtml(historyMessage)}</span><a href="${shareUrl}" target="_blank" rel="noopener noreferrer" aria-label="このABS指数をXに投稿">Xに投稿</a></div>
      </li>`;
    }).join("");
    list.hidden = state.history.length === 0;
    document.querySelector("#history-empty").hidden = state.history.length > 0;
  }

  async function updateReactionState() {
    if (game.isDummy) {
      renderReactionState(localReactionState());
      return;
    }
    try {
      renderReactionState(await getRemoteReactionState(gameId));
    } catch {
      renderReactionState(localReactionState());
    }
  }

  function closeDetailPrompt(clearEvent = true) {
    clearTimeout(detailPromptTimer);
    absConfirmation.hidden = true;
    absButton.hidden = false;
    if (clearEvent) activeEventId = null;
    updateAbsAvailability();
  }

  function showDetailPrompt() {
    absButton.hidden = true;
    absConfirmation.hidden = false;
    detailPromptTimer = setTimeout(closeDetailPrompt, 10000);
  }

  absButton.addEventListener("click", () => {
    const event = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      gameId,
      pressedAt: Date.now(),
      homePlateUmpire: game.umpire || null,
      details: null
    };
    const events = getEvents();
    events.push(event);
    saveEvents(events);
    activeEventId = event.id;
    updateReactionState();
    const save = game.isDummy
      ? Promise.resolve()
      : saveAbsEvent(event).then(updateReactionState).catch(() => updateReactionState());
    pendingSaves.set(event.id, save);
    save.finally(() => pendingSaves.delete(event.id));
    form.reset();
    fanCallOutput.textContent = "実際の判定を選択";
    fanCallOutput.classList.remove("selected");
    batterSearch.reset();
    pitcherSearch.reset();
    updatePlayerFieldColors();
    showDetailPrompt();
  });

  document.querySelector("#open-details").addEventListener("click", () => {
    closeDetailPrompt(false);
    dialog.showModal();
  });
  document.querySelector("#skip-details").addEventListener("click", () => closeDetailPrompt());

  document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(form);
    const events = getEvents();
    const target = events.find(item => item.id === activeEventId);
    if (target) {
      const details = {
        offenseTeamCode: data.get("offenseTeamCode") || "",
        batterId: batterSearch.getId(),
        batterName: batterSearch.getId() ? data.get("batterName") || "" : "",
        pitcherId: pitcherSearch.getId(),
        pitcherName: pitcherSearch.getId() ? data.get("pitcherName") || "" : "",
        pitchNumber: data.get("pitchNumber") || "",
        pitchCourse: data.get("pitchCourse") || "",
        pitchHeight: data.get("pitchHeight") || "",
        officialCall: data.get("officialCall") || "",
        fanCall: data.get("fanCall") || ""
      };
      target.details = details;
      saveEvents(events);
      try {
        await pendingSaves.get(activeEventId);
        if (!game.isDummy) await saveAbsDetails(activeEventId, details);
      } catch {}
      updateReactionState();
    }
    dialog.close();
  });

  dialog.addEventListener("close", () => { activeEventId = null; });
  updateAbsAvailability();
  updateReactionState();
  setInterval(updateAbsAvailability, 10000);
  setInterval(updateReactionState, 10000);
}

setupDateNavigation();
renderGamePage();
