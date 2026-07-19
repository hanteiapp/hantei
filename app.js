const games = [
  { id: 1, time: "18:00", visitor: "阪神", visitorFull: "阪神タイガース", home: "巨人", homeFull: "読売ジャイアンツ", status: "試合中" },
  { id: 2, time: "18:00", visitor: "広島", visitorFull: "広島東洋カープ", home: "DeNA", homeFull: "横浜DeNAベイスターズ", status: "試合前" },
  { id: 3, time: "18:00", visitor: "ヤクルト", visitorFull: "東京ヤクルトスワローズ", home: "中日", homeFull: "中日ドラゴンズ", status: "試合中" },
  { id: 4, time: "18:00", visitor: "日本ハム", visitorFull: "北海道日本ハムファイターズ", home: "ソフトバンク", homeFull: "福岡ソフトバンクホークス", status: "試合前" },
  { id: 5, time: "18:00", visitor: "ロッテ", visitorFull: "千葉ロッテマリーンズ", home: "オリックス", homeFull: "オリックス・バファローズ", status: "終了" },
  { id: 6, time: "18:00", visitor: "西武", visitorFull: "埼玉西武ライオンズ", home: "楽天", homeFull: "東北楽天ゴールデンイーグルス", status: "終了" }
];

const storageKey = "hantei_abs_events";

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

function renderGameList() {
  const list = document.querySelector("#game-list");
  if (!list) return;

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
}

function renderGamePage() {
  const view = document.querySelector("#game-view");
  if (!view) return;

  const gameId = Number(new URLSearchParams(location.search).get("game"));
  const game = games.find(item => item.id === gameId);
  if (!game) {
    document.querySelector("#game-error").hidden = false;
    return;
  }

  document.title = `${game.visitor} vs ${game.home} | HANTEI`;
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

  function updateAbsDisplay() {
    const events = getEvents().filter(event => event.gameId === gameId);
    const index = calculateAbsIndex(events);
    document.querySelector("#abs-index").textContent = index;
    document.querySelector("#abs-meter-fill").style.width = `${index}%`;
    document.querySelector("#abs-meter").setAttribute("aria-valuenow", index);
    document.querySelector("#surge-notice").hidden = index < 60;
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
    updateAbsDisplay();
    form.reset();
    dialog.showModal();
  });

  document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const events = getEvents();
    const target = events.find(item => item.id === activeEventId);
    if (target) {
      target.details = {
        batterName: data.get("batterName") || "",
        pitchNumber: data.get("pitchNumber") || "",
        officialCall: data.get("officialCall") || "",
        fanCall: data.get("fanCall") || ""
      };
      saveEvents(events);
    }
    dialog.close();
  });

  dialog.addEventListener("close", () => { activeEventId = null; });
  updateAbsDisplay();
  setInterval(updateAbsDisplay, 10000);
}

renderGameList();
renderGamePage();
