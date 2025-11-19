const MAX_GUESSES = 8;

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

// ---------- Utility ----------
function getDailyIndex(num) {
  const today = new Date();
  const seed =
    today.getFullYear() * 10000 +
    (today.getMonth() + 1) * 100 +
    today.getDate();
  let x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return Math.floor(frac * num);
}

function marketCapBucket(cap) {
  if (cap < 2) return 0;
  if (cap < 10) return 1;
  if (cap < 50) return 2;
  if (cap < 200) return 3;
  return 4;
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

// ---------- Init ----------
async function init() {
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

    // pick daily secret deterministically
    secret = STOCKS[getDailyIndex(STOCKS.length)];

    // fill datalist
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

    // attach events
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

// ---------- Guess handling ----------
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
    setStatus("Stock not in Investle universe.", "warn");
    return;
  }
  if (guesses.some((g) => g.ticker === stock.ticker)) {
    setStatus("You already guessed that stock.", "warn");
    return;
  }
  if (guesses.length >= MAX_GUESSES) {
    setStatus("You’ve used all guesses.", "warn");
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
    showAnswer(true);
    guessBtn.disabled = true;
    guessInput.disabled = true;
    return;
  }

  if (guesses.length === MAX_GUESSES) {
    gameOver = true;
    setStatus(
      `Out of guesses! The mystery stock was ${secret.ticker} – ${secret.name}.`,
      "error"
    );
    showAnswer(false);
    guessBtn.disabled = true;
    guessInput.disabled = true;
  } else {
    setStatus("Keep going!", "info");
  }
}

// ---------- Rendering ----------
function setStatus(msg, kind) {
  statusMessage.textContent = msg;
  statusMessage.style.color = "#f97316";
  if (kind === "success") statusMessage.style.color = "#4ade80";
  if (kind === "error") statusMessage.style.color = "#f87171";
  if (kind === "info") statusMessage.style.color = "#93c5fd";
}

function renderGuesses() {
  guessesBody.innerHTML = "";
  guessesCounter.textContent = `${guesses.length} / ${MAX_GUESSES} guesses used`;

  guesses.forEach((g) => {
    const tr = document.createElement("tr");

    const tdTicker = document.createElement("td");
    tdTicker.textContent = g.ticker;
    tr.appendChild(tdTicker);

    const tdName = document.createElement("td");
    tdName.textContent = g.name;
    tr.appendChild(tdName);

    const tdSector = document.createElement("td");
    tdSector.appendChild(buildCategoricalCell(g.sector, secret.sector));
    tr.appendChild(tdSector);

    const tdCountry = document.createElement("td");
    tdCountry.appendChild(buildCategoricalCell(g.country, secret.country));
    tr.appendChild(tdCountry);

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
      g.oneYearReturnPct.toFixed(1) +
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

function buildCategoricalCell(guessVal, targetVal) {
  const div = document.createElement("div");
  const cls = guessVal === targetVal ? "match" : "miss";
  div.className = `cell ${cls}`;
  const span = document.createElement("span");
  span.className = "value";
  span.textContent = guessVal;
  div.appendChild(span);
  return div;
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

function showAnswer() {
  const lines = [];
  lines.push(`${secret.ticker} – ${secret.name}`);
  lines.push(`Sector: ${secret.sector}`);
  lines.push(
    `Country: ${secret.country}, Market cap: ${secret.marketCap}B`
  );
  lines.push(
    `IPO Year: ${secret.ipoYear}, 1Y Return: ${
      (secret.oneYearReturnPct >= 0 ? "+" : "") +
      secret.oneYearReturnPct.toFixed(1)
    }%, Dividend yield: ${
      secret.dividendYieldPct > 0
        ? secret.dividendYieldPct.toFixed(2) + "%"
        : "None"
    }`
  );
  answerReveal.textContent = lines.join("\n");
}
