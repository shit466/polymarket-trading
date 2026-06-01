import express from "express";
import { createServer as createViteServer } from "vite";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 5173;
const execFileAsync = promisify(execFile);

function readMacProxy() {
  if (process.platform !== "darwin") return null;
  try {
    const output = execFileSync("scutil", ["--proxy"], { encoding: "utf8", timeout: 1200 });
    const httpsEnabled = /HTTPSEnable\s*:\s*1/.test(output);
    const httpEnabled = /HTTPEnable\s*:\s*1/.test(output);
    const socksEnabled = /SOCKSEnable\s*:\s*1/.test(output);
    const httpsHost = output.match(/HTTPSProxy\s*:\s*(.+)/)?.[1]?.trim();
    const httpsPort = output.match(/HTTPSPort\s*:\s*(\d+)/)?.[1]?.trim();
    const httpHost = output.match(/HTTPProxy\s*:\s*(.+)/)?.[1]?.trim();
    const httpPort = output.match(/HTTPPort\s*:\s*(\d+)/)?.[1]?.trim();
    const socksHost = output.match(/SOCKSProxy\s*:\s*(.+)/)?.[1]?.trim();
    const socksPort = output.match(/SOCKSPort\s*:\s*(\d+)/)?.[1]?.trim();

    if (httpsEnabled && httpsHost && httpsPort) return `http://${httpsHost}:${httpsPort}`;
    if (httpEnabled && httpHost && httpPort) return `http://${httpHost}:${httpPort}`;
    if (socksEnabled && socksHost && socksPort) return `socks://${socksHost}:${socksPort}`;
  } catch {
    return null;
  }
  return null;
}

const outboundProxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.ALL_PROXY ||
  process.env.all_proxy ||
  readMacProxy();

if (outboundProxy) {
  setGlobalDispatcher(new ProxyAgent(outboundProxy));
  console.log(`Outbound API proxy enabled: ${outboundProxy}`);
}

const sampleMarkets = [
  {
    id: "sample-nba-finals",
    question: "Will the listed team win its next playoff game?",
    slug: "sample-nba-playoff-game",
    category: "Sports",
    volume: 248000,
    liquidity: 42000,
    endDate: "2026-06-20T00:00:00Z",
    resolutionSource: "Official league final score and Polymarket market rules",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.54", "0.46"],
    clobTokenIds: ["sample-sports-yes", "sample-sports-no"],
    orderBooks: [
      { outcome: "Yes", tokenId: "sample-sports-yes", bestBid: 0.53, bestAsk: 0.56, spread: 0.03, bidDepth: 720, askDepth: 680, source: "sample" },
      { outcome: "No", tokenId: "sample-sports-no", bestBid: 0.44, bestAsk: 0.47, spread: 0.03, bidDepth: 610, askDepth: 590, source: "sample" }
    ],
    sourceTier: "A",
    isSample: true
  },
  {
    id: "sample-election",
    question: "Will the named candidate win the next listed election?",
    slug: "sample-election-market",
    category: "Politics",
    volume: 970000,
    liquidity: 116000,
    endDate: "2026-11-05T00:00:00Z",
    resolutionSource: "Official election certification",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.37", "0.63"],
    clobTokenIds: ["sample-election-yes", "sample-election-no"],
    orderBooks: [
      { outcome: "Yes", tokenId: "sample-election-yes", bestBid: 0.36, bestAsk: 0.39, spread: 0.03, bidDepth: 920, askDepth: 810, source: "sample" },
      { outcome: "No", tokenId: "sample-election-no", bestBid: 0.61, bestAsk: 0.64, spread: 0.03, bidDepth: 1300, askDepth: 1180, source: "sample" }
    ],
    sourceTier: "A",
    isSample: true
  },
  {
    id: "sample-crypto",
    question: "Will BTC close above the listed price on the target date?",
    slug: "sample-btc-close",
    category: "Crypto",
    volume: 511000,
    liquidity: 76000,
    endDate: "2026-07-01T00:00:00Z",
    resolutionSource: "Exchange/index price specified in market rules",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.29", "0.71"],
    clobTokenIds: ["sample-btc-yes", "sample-btc-no"],
    orderBooks: [
      { outcome: "Yes", tokenId: "sample-btc-yes", bestBid: 0.28, bestAsk: 0.31, spread: 0.03, bidDepth: 440, askDepth: 500, source: "sample" },
      { outcome: "No", tokenId: "sample-btc-no", bestBid: 0.69, bestAsk: 0.72, spread: 0.03, bidDepth: 860, askDepth: 910, source: "sample" }
    ],
    sourceTier: "B",
    isSample: true
  }
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 4500;
  if (outboundProxy && url.includes("polymarket.com")) {
    return fetchJsonWithCurl(url, { ...options, timeoutMs });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "polymarket-research-desk/0.1",
        ...(options.headers || {})
      },
      method: options.method || "GET",
      body: options.body
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithCurl(url, options = {}) {
  const timeoutSeconds = Math.max(1, Math.ceil((options.timeoutMs || 4500) / 1000));
  const args = [
    "-sS",
    "-L",
    "--max-time",
    String(timeoutSeconds),
    "-w",
    "\n%{http_code}",
    "-H",
    "accept: application/json",
    "-H",
    "user-agent: polymarket-research-desk/0.1"
  ];
  if (outboundProxy) {
    args.push("--proxy", outboundProxy);
  }
  for (const [key, value] of Object.entries(options.headers || {})) {
    args.push("-H", `${key}: ${value}`);
  }
  args.push(url);

  const { stdout, stderr } = await execFileAsync("curl", args, {
    encoding: "utf8",
    timeout: (options.timeoutMs || 4500) + 1500,
    maxBuffer: 10 * 1024 * 1024
  });
  const marker = stdout.lastIndexOf("\n");
  const body = marker >= 0 ? stdout.slice(0, marker) : stdout;
  const status = marker >= 0 ? Number(stdout.slice(marker + 1)) : 0;
  if (status < 200 || status >= 300) {
    throw new Error(`curl returned ${status || "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`);
  }
  return JSON.parse(body);
}

function parseMaybeJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function classifySource(source = "", question = "") {
  const text = `${source} ${question}`.toLowerCase();
  const tierA = [
    "official",
    "league",
    "certification",
    "government",
    "sec.gov",
    "federal reserve",
    "bureau of labor",
    "nba.com",
    "mlb.com",
    "nfl.com",
    "fifa",
    "uefa"
  ];
  const tierB = ["exchange", "index", "oracle", "chainlink", "coinbase", "binance", "kalshi", "nasdaq"];
  const tierC = ["espn", "reuters", "associated press", "the athletic", "poll", "forecast", "consensus"];

  if (tierA.some((word) => text.includes(word))) return "A";
  if (tierB.some((word) => text.includes(word))) return "B";
  if (tierC.some((word) => text.includes(word))) return "C";
  return source ? "C" : "D";
}

function normalizeMarket(market) {
  const outcomes = parseMaybeJson(market.outcomes, ["Yes", "No"]);
  const outcomePrices = parseMaybeJson(market.outcomePrices, []);
  const clobTokenIds = parseMaybeJson(market.clobTokenIds || market.clob_token_ids || market.tokenIds, []);
  const resolutionSource =
    market.resolutionSource ||
    market.rules ||
    market.description ||
    market.events?.[0]?.resolutionSource ||
    "";

  return {
    id: String(market.id || market.conditionId || market.slug),
    question: market.question || market.title || "Untitled market",
    slug: market.slug || market.conditionId || market.id,
    category: market.category || market.events?.[0]?.category || "General",
    volume: Number(market.volumeNum ?? market.volume ?? 0),
    liquidity: Number(market.liquidityNum ?? market.liquidity ?? 0),
    endDate: market.endDate || market.end_date || market.events?.[0]?.endDate || null,
    resolutionSource,
    outcomes,
    outcomePrices,
    clobTokenIds,
    sourceTier: classifySource(resolutionSource, market.question || ""),
    isSample: false
  };
}

function summarizeBook(book, outcome, tokenId) {
  const bids = Array.isArray(book?.bids) ? book.bids : [];
  const asks = Array.isArray(book?.asks) ? book.asks : [];
  const normalizedBids = bids
    .map((level) => ({ price: Number(level.price), size: Number(level.size) }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size))
    .sort((a, b) => b.price - a.price);
  const normalizedAsks = asks
    .map((level) => ({ price: Number(level.price), size: Number(level.size) }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size))
    .sort((a, b) => a.price - b.price);
  const bestBid = normalizedBids[0]?.price ?? null;
  const bestAsk = normalizedAsks[0]?.price ?? null;
  return {
    outcome,
    tokenId,
    bestBid,
    bestAsk,
    spread: Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? Math.max(0, bestAsk - bestBid) : null,
    bidDepth: normalizedBids.slice(0, 5).reduce((sum, level) => sum + level.price * level.size, 0),
    askDepth: normalizedAsks.slice(0, 5).reduce((sum, level) => sum + level.price * level.size, 0),
    bids: normalizedBids.slice(0, 5),
    asks: normalizedAsks.slice(0, 5),
    source: "clob"
  };
}

async function fetchOrderBook(tokenId, outcome) {
  if (!tokenId) return null;
  try {
    const book = await fetchJson(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`, {
      timeoutMs: 2200
    });
    return summarizeBook(book, outcome, tokenId);
  } catch (error) {
    return {
      outcome,
      tokenId,
      bestBid: null,
      bestAsk: null,
      spread: null,
      bidDepth: 0,
      askDepth: 0,
      source: "unavailable",
      warning: error.name === "AbortError" ? "CLOB request timed out" : error.message
    };
  }
}

async function attachOrderBooks(markets) {
  const candidates = markets.slice(0, 14);
  return Promise.all(
    candidates.map(async (market) => {
      const tokenIds = market.clobTokenIds || [];
      const books = await Promise.all(
        tokenIds.slice(0, 2).map((tokenId, index) => fetchOrderBook(tokenId, market.outcomes?.[index] || `Outcome ${index + 1}`))
      );
      return { ...market, orderBooks: books.filter(Boolean) };
    })
  ).then((enriched) => [...enriched, ...markets.slice(candidates.length)]);
}

async function fetchExternalSnapshot() {
  const today = todayIsoDate();
  const cryptoSymbols = ["BTC", "ETH", "SOL"];
  const crypto = await Promise.all(
    cryptoSymbols.map(async (symbol) => {
      try {
        const data = await fetchJson(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`, { timeoutMs: 2800 });
        return {
          name: `${symbol}/USD`,
          tier: "B",
          source: "Coinbase spot",
          value: Number(data?.data?.amount),
          unit: "USD",
          status: "live"
        };
      } catch (error) {
        return {
          name: `${symbol}/USD`,
          tier: "B",
          source: "Coinbase spot",
          value: null,
          unit: "USD",
          status: "unavailable",
          warning: error.name === "AbortError" ? "Coinbase request timed out" : error.message
        };
      }
    })
  );

  let mlb = { name: "MLB schedule", tier: "A", source: "MLB Stats API", status: "unavailable", games: [], warning: "" };
  try {
    const data = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}`, { timeoutMs: 2800 });
    const games = (data?.dates?.[0]?.games || []).slice(0, 8).map((game) => ({
      away: game.teams?.away?.team?.name,
      home: game.teams?.home?.team?.name,
      status: game.status?.detailedState,
      gameDate: game.gameDate
    }));
    mlb = { ...mlb, status: "live", games };
  } catch (error) {
    mlb = { ...mlb, warning: error.name === "AbortError" ? "MLB request timed out" : error.message };
  }

  let nba = { name: "NBA scoreboard", tier: "A", source: "NBA CDN scoreboard", status: "unavailable", games: [], warning: "" };
  try {
    const data = await fetchJson("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", {
      timeoutMs: 2800,
      headers: {
        referer: "https://www.nba.com/",
        origin: "https://www.nba.com"
      }
    });
    const games = (data?.scoreboard?.games || []).slice(0, 8).map((game) => ({
      away: game.awayTeam?.teamName,
      home: game.homeTeam?.teamName,
      status: game.gameStatusText,
      gameDate: game.gameTimeUTC
    }));
    nba = { ...nba, status: "live", games };
  } catch (error) {
    nba = { ...nba, warning: error.name === "AbortError" ? "NBA request timed out" : error.message };
  }

  return {
    fetchedAt: new Date().toISOString(),
    crypto,
    sports: [mlb, nba]
  };
}

app.get("/api/markets", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 80), 200);
  const search = String(req.query.search || "").trim().toLowerCase();
  const category = String(req.query.category || "all").toLowerCase();
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    limit: String(limit),
    order: "volume",
    ascending: "false"
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3200);

  try {
    const data = await fetchJson(`https://gamma-api.polymarket.com/markets?${params}`, { timeoutMs: 3200 });
    clearTimeout(timeout);
    let markets = data.map(normalizeMarket);
    if (search) {
      markets = markets.filter((market) => `${market.question} ${market.category}`.toLowerCase().includes(search));
    }
    if (category !== "all") {
      markets = markets.filter((market) => market.category.toLowerCase().includes(category));
    }
    markets = await attachOrderBooks(markets);
    res.json({ markets, source: "live", fetchedAt: new Date().toISOString() });
  } catch (error) {
    clearTimeout(timeout);
    let markets = sampleMarkets;
    if (search) {
      markets = markets.filter((market) => `${market.question} ${market.category}`.toLowerCase().includes(search));
    }
    if (category !== "all") {
      markets = markets.filter((market) => market.category.toLowerCase().includes(category));
    }
    res.json({
      markets,
      source: "sample",
      fetchedAt: new Date().toISOString(),
      warning: error.name === "AbortError" ? "Polymarket API request timed out." : error.message
    });
  }
});

app.get("/api/orderbook", async (req, res) => {
  const tokenId = String(req.query.token_id || req.query.tokenId || "");
  const outcome = String(req.query.outcome || "");
  if (!tokenId) {
    res.status(400).json({ error: "token_id is required" });
    return;
  }
  res.json(await fetchOrderBook(tokenId, outcome));
});

app.get("/api/external", async (_req, res) => {
  res.json(await fetchExternalSnapshot());
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*splat", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Polymarket research desk running at http://localhost:${port}`);
});
