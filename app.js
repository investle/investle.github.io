const MAX_GUESSES = 8;
const SHUFFLE_SEED = 123456789; // fixed seed for deterministic shuffle
const GAME_START = { year: 2025, month: 1, day: 1 }; // day 0 in ET

let STOCKS = [];
let secret = null;
let guesses = [];
let gameOver = false;

// DOM refs
const guessInput = document.getElementById("guess-input");
const guessBtn = document.getElementById("guess-btn");
const statusMessage = document.getElementById("status-message");
const guessesBody = document.getElementById("guesses-body");
const guessesCounter = document.getElementById("guesses-counter");
const maxGuessesLabel = document.getElementById("max-guesses-label");
const tickerList = document.getElementById("ticker-list");
const answerReveal = document.getElementById("answer-reveal");
const themeToggleBtn = document.getElementById("theme-toggle");
const themeToggleLabel = document.getElementById("theme-toggle-label");

// -------- Theme handling --------

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("theme-light");
    if (themeToggleLabel) themeToggleLabel.textContent = "Light";
  } else {
    document.body.classList.remove("theme-light");
    if (themeToggleLabel) themeToggleLabel.textContent = "Dark";
  }
}

function initTheme() {
  const stored = localStorage.getItem("investle-theme");
  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  const theme = stored || (prefersLight ? "light" : "dark");
  applyTheme(theme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const isLight = document.body.classList.contains("theme-light");
      const next = isLight ? "dark" : "light";
      applyTheme(next);
      localStorage.setItem("investle-theme", next);
    });
  }
}

// -------- Time / daily index (ET) --------

function getEasternDayIndex() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year").value, 10);
  const month = parseInt(parts.find((p) => p.type === "month").value, 10);
  const day = parseInt(parts.find((p) => p.type === "day").value, 10);

  const todayUTC = Date.UTC(year, month - 1, day);
  const startUTC = Date.UTC(
    GAME_START.year,
    GAME_START.month - 1,
    GAME_START.day
  );

  const diffMs = todayUTC - startUTC;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Mulberry32 seeded PRNG
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build deterministic shuffled order of indices
function buildShuffledIndices(length) {
  const indices = Array.from({ length }, (_, i) => i);
  const rng = mulberry32(SHUFFLE_SEED);

  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// Pick today’s secret using ET day index
function pickDailySecret(stocks) {
  const n = stocks.length;
  const indices = buildShuffledIndices(n);
  const dayIndex = getEasternDayIndex();
  const idx = indices[((dayIndex % n) + n) % n];
  return stocks[idx];
}

// -------- Utility for hints --------

function marketCapBucket(cap) {
  // cap in billions
  if (cap < 2) return 0; // small
  if (cap < 10) return 1; // small/mid
  if (cap < 50) return 2; // mid
  if (cap < 200) return 3; // large
  return 4; // mega
}

function bucketLabel(index) {
  switch (index) {
    case 0:
      return "Small";
    case 1:
      return "Small/Mid";
    case 2:
      return "Mid";
    case 3:
      return "Large";
    case 4:
      return "Mega";
    default:
      return "?";
  }
}

function colorForBucket(guessBucket, targetBucket) {
  const diff = Math.abs(guessBucket - targetBucket);
  if (diff === 0) return "match";
  if (diff === 1) return "near";
  return "miss";
}

function colorForNumeric(guess, target, closeThreshold, mediumThreshold) {
  const diff = Math.abs(guess - target);
  if (diff <= closeThreshold) return "match";
  if (diff <= mediumThreshold) return "near";
  return "miss";
}

function getArrow(guess, target) {
  if (guess < target) return "▲";
  if (guess > target) return "▼";
  return "";
}

function divColorClass(guessYield, targetYield) {
  const guessPays = guessYield > 0.01;
  const targetPays = targetYield > 0.01;

  if (!guessPays && !targetPays) return "match";

  if (guessPays && targetPays) {
    const diff = Math.abs(guessYield - targetYield);
    if (diff <= 0.5) return "match";
    if (diff <= 1.5) return "near";
    return "miss";
  }
  return "miss";
}

// -------- Status & rendering helpers --------

function setStatus(msg, kind) {
  statusMessage.textContent = msg;
  statusMessage.style.color = "#f97316"; // default warn

  if (kind === "success") statusMessage.style.color = "#4ade80";
  if (kind === "error") statusMessage.style.color = "#f87171";
  if (kind === "info") statusMessage.style.color = "#93c5fd";
}

function shortSectorLabel(sector) {
  switch ((sector || "").toLowerCase()) {
    case "information technology":
      return "Info Tech";
    case "consumer discretionary":
      return "Cons Disc";
    case "consumer staples":
      return "Cons Stap";
    case "communication services":
      return "Comm Serv";
    case "health care":
      return "Health";
    case "real estate":
      return "Real Est";
    default:
      return sector || "Unknown";
  }
}

function buildCategoricalCell(guessVal, targetVal, displayVal) {
  const div = document.createElement("div");
  const cls = guessVal === targetVal ? "match" : "miss";
  div.className = `cell ${cls}`;
  const span = document.createElement("span");
  span.className = "value";
  span.textContent = displayVal || guessVal;
  div.title = guessVal; // show full text on hover
  div.appendChild(span);
  return div;
}

function renderGuesses() {
  guessesBody.innerHTML = "";
  guessesCounter.textContent = `${guesses.length} / ${MAX_GUESSES} guesses used`;

  guesses.forEach((g) => {
    const tr = document.createElement("tr");

    // STOCK cell: ticker + name
    const tdStock = document.createElement("td");
    const stockContainer = document.createElement("div");
    stockContainer.className = "stock-cell";

    const tickerSpan = document.createElement("span");
    tickerSpan.className = "stock-ticker";
    tickerSpan.textContent = g.ticker;

    const nameSpan = document.createElement("span");
    nameSpan.className = "stock-name";
    nameSpan.textContent = g.name;

    stockContainer.appendChild(tickerSpan);
    stockContainer.appendChild(nameSpan);
    tdStock.appendChild(stockContainer);
    tr.appendChild(tdStock);

    // SECTOR (short label, full in tooltip)
    const tdSector = document.createElement("td");
    tdSector.appendChild(
      buildCategoricalCell(g.sector, secret.sector, shortSectorLabel(g.sector))
    );
    tr.appendChild(tdSector);

    // PRICE
    const tdPrice = document.createElement("td");
    const priceClass = colorForNumeric(
      g.price,
      secret.price,
      secret.price * 0.02,  // within ~2% -> green
      secret.price * 0.08   // within ~8% -> yellow
    );
    const priceArrow = getArrow(g.price, secret.price);
    const priceCell = document.createElement("div");
    priceCell.className = `cell ${priceClass}`;
    const priceSpan = document.createElement("span");
    priceSpan.className = "value";
    priceSpan.textContent = `$${g.price.toFixed(2)}`;
    priceCell.appendChild(priceSpan);
    if (priceArrow) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "arrow";
      arrowSpan.textContent = priceArrow;
      priceCell.appendChild(arrowSpan);
    }
    tdPrice.appendChild(priceCell);
    tr.appendChild(tdPrice);

    // MARKET CAP
    const tdCap = document.createElement("td");
    const gBucket = marketCapBucket(g.marketCap);
    const sBucket = marketCapBucket(secret.marketCap);
    const capClass = colorForBucket(gBucket, sBucket);
    const capArrow = getArrow(g.marketCap, secret.marketCap);
    const capCell = document.createElement("div");
    capCell.className = `cell ${capClass}`;
    const capSpan = document.createElement("span");
    capSpan.className = "value";
    capSpan.textContent = bucketLabel(gBucket);
    capCell.appendChild(capSpan);
    if (capArrow) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "arrow";
      arrowSpan.textContent = capArrow;
      capCell.appendChild(arrowSpan);
    }
    tdCap.appendChild(capCell);
    tr.appendChild(tdCap);

    // IPO YEAR
    const tdIpo = document.createElement("td");
    const ipoClass = colorForNumeric(g.ipoYear, secret.ipoYear, 2, 5);
    const ipoArrow = getArrow(g.ipoYear, secret.ipoYear);
    const ipoCell = document.createElement("div");
    ipoCell.className = `cell ${ipoClass}`;
    const ipoSpan = document.createElement("span");
    ipoSpan.className = "value";
    ipoSpan.textContent = g.ipoYear.toString();
    ipoCell.appendChild(ipoSpan);
    if (ipoArrow) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "arrow";
      arrowSpan.textContent = ipoArrow;
      ipoCell.appendChild(arrowSpan);
    }
    tdIpo.appendChild(ipoCell);
    tr.appendChild(tdIpo);

    // 1Y RETURN
    const tdRet = document.createElement("td");
    const retClass = colorForNumeric(
      g.oneYearReturnPct,
      secret.oneYearReturnPct,
      3,
      10
    );
    const retArrow = getArrow(g.oneYearReturnPct, secret.oneYearReturnPct);
    const retCell = document.createElement("div");
    retCell.className = `cell ${retClass}`;
    const retSpan = document.createElement("span");
    retSpan.className = "value";
    retSpan.textContent =
      (g.oneYearReturnPct >= 0 ? "+" : "") +
      g.oneYearReturnPct.toFixed(2) +
      "%";
    retCell.appendChild(retSpan);
    if (retArrow) {
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "arrow";
      arrowSpan.textContent = retArrow;
      retCell.appendChild(arrowSpan);
    }
    tdRet.appendChild(retCell);
    tr.appendChild(tdRet);

    // DIVIDEND YIELD
    const tdDiv = document.createElement("td");
    const divClass = divColorClass(
      g.dividendYieldPct,
      secret.dividendYieldPct
    );
    const divCell = document.createElement("div");
    divCell.className = `cell ${divClass}`;
    const divSpan = document.createElement("span");
    divSpan.className = "value";
    divSpan.textContent =
      g.dividendYieldPct > 0
        ? g.dividendYieldPct.toFixed(2) + "%"
        : "None";
    divCell.appendChild(divSpan);
    tdDiv.appendChild(divCell);
    tr.appendChild(tdDiv);

    guessesBody.appendChild(tr);
  });
}

// -------- Game logic --------

function findStockByInput(str) {
  const value = str.trim();
  if (!value) return null;

  const upper = value.toUpperCase();
  let match = STOCKS.find((s) => s.ticker.toUpperCase() === upper);
  if (match) return match;

  const lower = value.toLowerCase();
  match = STOCKS.find((s) => s.name.toLowerCase().includes(lower));
  return match || null;
}

function onGuess() {
  if (gameOver) return;

  const raw = guessInput.value;
  const stock = findStockByInput(raw);

  if (!raw.trim()) {
    setStatus("Type a ticker or company name.", "warn");
    return;
  }
  if (!stock) {
    setStatus("That stock isn’t in today’s universe.", "warn");
    return;
  }
  if (guesses.some((g) => g.ticker === stock.ticker)) {
    setStatus("You already guessed that stock.", "warn");
    return;
  }
  if (guesses.length >= MAX_GUESSES) {
    setStatus("You’ve used all your guesses.", "warn");
    return;
  }

  guesses.push(stock);
  renderGuesses();
  guessInput.value = "";
  guessInput.focus();

  if (stock.ticker === secret.ticker) {
    gameOver = true;
    setStatus(
      `✅ Correct! The mystery stock is ${secret.ticker} – ${secret.name}.`,
      "success"
    );
    showAnswer();
    guessBtn.disabled = true;
    guessInput.disabled = true;
    return;
  }

  if (guesses.length === MAX_GUESSES) {
    gameOver = true;
    setStatus(
      `Out of guesses. The mystery stock was ${secret.ticker} – ${secret.name}.`,
      "error"
    );
    showAnswer();
    guessBtn.disabled = true;
    guessInput.disabled = true;
  } else {
    setStatus("Nice try — keep going.", "info");
  }
}

// -------- Init --------

async function init() {
  initTheme();

  maxGuessesLabel.textContent = MAX_GUESSES.toString();
  guessesCounter.textContent = `0 / ${MAX_GUESSES} guesses used`;
  setStatus("Loading stock universe…", "info");
  guessBtn.disabled = true;
  guessInput.disabled = true;

  try {
    const res = await fetch("stocks.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Failed to load stocks.json");
    STOCKS = await res.json();

    if (!Array.isArray(STOCKS) || STOCKS.length === 0) {
      throw new Error("stocks.json is empty or invalid");
    }

    // Pick daily secret using pre-shuffled order & ET date
    secret = pickDailySecret(STOCKS);

    // Fill datalist for autocomplete
    STOCKS.forEach((s) => {
      const optTicker = document.createElement("option");
      optTicker.value = s.ticker;
      tickerList.appendChild(optTicker);

      const optName = document.createElement("option");
      optName.value = s.name;
      tickerList.appendChild(optName);
    });

    setStatus("Type a ticker or company name to start guessing.", "info");
    guessBtn.disabled = false;
    guessInput.disabled = false;
    guessInput.focus();

    // Event listeners
    guessBtn.addEventListener("click", onGuess);
    guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onGuess();
      }
    });
  } catch (err) {
    console.error(err);
    setStatus("Error loading stock data. Check stocks.json.", "error");
  }
}

document.addEventListener("DOMContentLoaded", init);
