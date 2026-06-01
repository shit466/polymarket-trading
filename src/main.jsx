import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Filter,
  Gauge,
  Info,
  Layers3,
  LineChart,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  XCircle
} from "lucide-react";
import "./styles.css";

const tierMeta = {
  A: {
    label: "A 官方结算源",
    score: 35,
    text: "联赛、政府、交易所公告或市场规则指定的原始结算源。"
  },
  B: {
    label: "B 可验证数据源",
    score: 25,
    text: "指数、交易所、链上或可复核 API，通常可靠但要核对口径。"
  },
  C: {
    label: "C 可信二手源",
    score: 14,
    text: "主流媒体、赔率聚合、统计站或模型预测，可辅助但不单独决策。"
  },
  D: {
    label: "D 证据不足",
    score: 3,
    text: "规则含糊、来源缺失、社媒传闻或不可复核材料。"
  }
};

const categoryOptions = ["all", "sports", "politics", "crypto", "finance"];

const sourceMatrix = [
  {
    name: "Polymarket Gamma",
    tier: "B",
    use: "发现市场、读取标题、结算规则、成交量、流动性",
    url: "https://gamma-api.polymarket.com/markets"
  },
  {
    name: "Polymarket CLOB",
    tier: "B",
    use: "下单前核对订单簿、买卖价差、可成交深度",
    url: "https://docs.polymarket.com/api-reference"
  },
  {
    name: "官方比赛/赛会数据",
    tier: "A",
    use: "比分、胜负、赛程、伤停、最终结算口径",
    url: "https://www.nba.com/stats"
  },
  {
    name: "交易所/指数价格",
    tier: "B",
    use: "加密、股票、宏观价格类市场的独立校验",
    url: "https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices"
  }
];

const strategyTiles = [
  {
    title: "体育比分/赛果",
    icon: Trophy,
    edge: "只看结算源明确、临近开赛、流动性足够的盘口。",
    model: "官方伤病 + 赛程疲劳 + 赔率共识 + 最近 10 场节奏。",
    avoid: "阵容未公布、市场规则写得模糊、盘口价差超过 4%。"
  },
  {
    title: "加密价格区间",
    icon: LineChart,
    edge: "适合短期限、多笔小仓，重点看波动率和订单簿深度。",
    model: "现货价格 + 近 24h realized vol + 资金费率 + 事件日历。",
    avoid: "重大公告前、价格源不一致、结算时间跨交易所维护窗口。"
  },
  {
    title: "政治/宏观事件",
    icon: BookOpenCheck,
    edge: "周期长，适合记录，不适合频繁换手。",
    model: "官方认证源 + 高质量民调/预测 + 新闻触发概率。",
    avoid: "规则依赖媒体主观判断、结算日期太远、单一新闻驱动。"
  }
];

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
    sourceTier: "A",
    modelProbability: 0.59,
    thesis: "体育类市场先不猜比分，先验证赛程、伤停和盘口是否给出 3% 以上概率差。若官方伤病报告显示核心球员缺阵，模型概率要重算。",
    entryPlan: "只在买入价 <= 55c 且价差 <= 3c 时放入篮子；开赛前 2 小时复查阵容。",
    exitPlan: "盘口涨到 64c 以上先减半；临场出现关键伤停反向信号直接退出。",
    noTrade: ["官方伤病报告未更新", "同场已有 2 笔相关仓位", "订单簿前 200 美元深度不足"],
    evidence: [
      { tier: "A", source: "Official league scoreboard", signal: "最终比分和结算口径" },
      { tier: "A", source: "Official injury report", signal: "核心球员状态" },
      { tier: "C", source: "Odds consensus", signal: "市场外部基准概率" }
    ],
    checklist: ["核对 Polymarket 规则是否按官方比分结算", "记录开赛时间和盘口冻结时间", "把同场相关市场合并计算暴露"],
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
    sourceTier: "A",
    modelProbability: 0.58,
    thesis: "政治类市场的核心不是短期噪音，而是结算定义。只有官方认证路径清晰、民调样本质量足够时才进入观察篮子。",
    entryPlan: "只有当模型概率比市场隐含概率高 6% 以上，且持仓周期可接受时才开小仓。",
    exitPlan: "认证规则变化、候选人退出、重大司法/资格事件出现时立即重估。",
    noTrade: ["结算依赖媒体宣布而非官方认证", "单一民调造成价格跳动", "期限过长导致资金效率过低"],
    evidence: [
      { tier: "A", source: "Official election certification", signal: "最终结算依据" },
      { tier: "C", source: "Polling average", signal: "趋势而非单点读数" },
      { tier: "C", source: "Prediction model", signal: "情景权重" }
    ],
    checklist: ["确认市场问句和实际选举范围一致", "记录认证日期而非投票日", "把新闻冲击拆成可复核事件"],
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
    sourceTier: "B",
    modelProbability: 0.68,
    thesis: "加密价格市场要先算波动率，再谈方向。若当前价格离门槛很近，隐含概率会被短期噪声放大，仓位要更小。",
    entryPlan: "当市场 No 价格 <= 70c 且 24h realized vol 没有异常扩张时观察；只用限价单。",
    exitPlan: "价格穿越门槛后不摊平；剩余时间低于 20% 时按订单簿流动性处理。",
    noTrade: ["结算价格源不清楚", "重大宏观数据公布前 30 分钟", "买卖价差超过 5c"],
    evidence: [
      { tier: "B", source: "Coinbase/Binance spot", signal: "独立现货价格" },
      { tier: "B", source: "Exchange/index rule", signal: "结算价格口径" },
      { tier: "C", source: "Volatility estimate", signal: "价格触及概率" }
    ],
    checklist: ["确认结算时间使用 UTC 还是本地时区", "记录门槛价和当前价距离", "只比较可成交买价，不看中间价"],
    isSample: true
  }
];

function money(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD"
  }).format(Number.isFinite(value) ? value : 0);
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number.isFinite(value) ? value : 0);
}

function daysUntil(date) {
  if (!date) return null;
  const end = new Date(date);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

function scoreMarket(market) {
  const tierScore = tierMeta[market.sourceTier]?.score ?? 3;
  const liquidityScore = Math.min(24, Math.log10(Math.max(market.liquidity, 1)) * 4.3);
  const volumeScore = Math.min(18, Math.log10(Math.max(market.volume, 1)) * 3);
  const priceNumbers = (market.outcomePrices || []).map(Number).filter(Number.isFinite);
  const hasBalancedPrice = priceNumbers.some((price) => price > 0.12 && price < 0.88);
  const days = daysUntil(market.endDate);
  const timingScore = days === null ? 5 : days < 0 ? 0 : days <= 45 ? 12 : days <= 180 ? 8 : 4;
  const clarityScore = market.resolutionSource?.length > 40 ? 11 : market.resolutionSource ? 7 : 1;
  const samplePenalty = market.isSample ? -5 : 0;
  return Math.round(tierScore + liquidityScore + volumeScore + timingScore + clarityScore + (hasBalancedPrice ? 6 : 0) + samplePenalty);
}

function actionForScore(score, market) {
  if (market.sourceTier === "D") return "跳过";
  if (score >= 82 && market.liquidity >= 10000) return "优先研究";
  if (score >= 64) return "小仓观察";
  return "只记录";
}

function suggestedStake(bankroll, perTradePct, deployPct, index, selectedCount) {
  const perTradeCap = bankroll * (perTradePct / 100);
  const basketCap = bankroll * (deployPct / 100);
  const taper = Math.max(0.45, 1 - index * 0.07);
  return Math.max(0, Math.min(perTradeCap, (basketCap / Math.max(selectedCount, 1)) * taper));
}

function bestVisibleOutcome(market) {
  const prices = (market.outcomePrices || []).map(Number);
  if (!prices.length) return "需补价格";
  const idx = prices.reduce((bestIdx, price, currentIdx) => (price > prices[bestIdx] ? currentIdx : bestIdx), 0);
  const outcome = market.outcomes?.[idx] || `Outcome ${idx + 1}`;
  return `${outcome} @ ${(prices[idx] * 100).toFixed(1)}%`;
}

function impliedProbability(market) {
  const prices = (market.outcomePrices || []).map(Number).filter(Number.isFinite);
  if (!prices.length) return null;
  return Math.max(...prices);
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "待补";
  return `${(value * 100).toFixed(1)}%`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "待补";
  return `${(value * 100).toFixed(1)}c`;
}

function formatDepth(value) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  return money(value);
}

function categoryTemplate(market) {
  const text = `${market.category} ${market.question}`.toLowerCase();
  if (text.includes("crypto") || text.includes("btc") || text.includes("eth")) {
    return {
      modelProbability: 0.52,
      thesis: "先用现货价格、结算时间和近期波动率估计触及概率，再与市场隐含概率比较。",
      entryPlan: "只用限价单；价差超过 5c 时不追价。",
      exitPlan: "接近结算但订单簿变薄时主动降仓。",
      noTrade: ["结算价格源不明确", "重大宏观数据公布窗口", "波动率突然扩张但没有重新建模"],
      evidence: [
        { tier: "B", source: "Exchange/index price", signal: "结算口径" },
        { tier: "C", source: "Volatility model", signal: "触及概率" }
      ],
      checklist: ["核对 UTC 结算时间", "核对当前价和门槛价距离", "查看订单簿深度"]
    };
  }
  if (text.includes("sport") || text.includes("game") || text.includes("score") || text.includes("nba")) {
    return {
      modelProbability: 0.54,
      thesis: "体育市场优先核对官方比分、伤停和开赛时间；不在阵容不明时提前重仓。",
      entryPlan: "开赛前复查官方阵容，价差 <= 3c 才考虑。",
      exitPlan: "临场伤停或赔率反向移动时重估。",
      noTrade: ["官方阵容未出", "同场暴露过高", "流动性不足"],
      evidence: [
        { tier: "A", source: "Official scoreboard", signal: "结算比分" },
        { tier: "C", source: "Odds consensus", signal: "外部概率锚" }
      ],
      checklist: ["确认结算源", "确认开赛时间", "合并同场相关仓位"]
    };
  }
  return {
    modelProbability: 0.5,
    thesis: "先确认市场规则和结算源，再决定是否值得建模；没有独立概率就只记录。",
    entryPlan: "模型概率高出市场隐含概率 5% 以上才进入观察。",
    exitPlan: "结算规则或关键事实源变化时退出观察。",
    noTrade: ["结算源含糊", "只有社媒传闻", "无法找到独立数据"],
    evidence: [
      { tier: market.sourceTier || "C", source: "Market rules", signal: "结算定义" }
    ],
    checklist: ["读完整规则", "找独立来源", "确认流动性"]
  };
}

function enrichMarket(market) {
  const template = categoryTemplate(market);
  const implied = impliedProbability(market);
  const modelProbability = market.modelProbability ?? (market.isSample ? template.modelProbability : null);
  const edge = Number.isFinite(implied) && Number.isFinite(modelProbability) ? modelProbability - implied : null;
  return {
    ...template,
    ...market,
    evidence: market.evidence || template.evidence,
    checklist: market.checklist || template.checklist,
    noTrade: market.noTrade || template.noTrade,
    implied,
    modelProbability,
    edge
  };
}

function App() {
  const [markets, setMarkets] = useState([]);
  const [meta, setMeta] = useState({ source: "loading" });
  const [external, setExternal] = useState({ crypto: [], sports: [], fetchedAt: null });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [bankroll, setBankroll] = useState(1000);
  const [perTradePct, setPerTradePct] = useState(2);
  const [deployPct, setDeployPct] = useState(18);
  const [loading, setLoading] = useState(false);

  const loadMarkets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: query, category, limit: "120" });
      const response = await fetch(`/api/markets?${params}`);
      if (!response.ok) throw new Error(`Local API returned ${response.status}`);
      const data = await response.json();
      setMarkets(data.markets || []);
      setMeta(data);
    } catch (error) {
      const search = query.trim().toLowerCase();
      const filteredMarkets = sampleMarkets.filter((market) => {
        const matchesSearch = !search || `${market.question} ${market.category}`.toLowerCase().includes(search);
        const matchesCategory = category === "all" || market.category.toLowerCase().includes(category);
        return matchesSearch && matchesCategory;
      });
      setMarkets(filteredMarkets);
      setMeta({
        source: "sample",
        fetchedAt: new Date().toISOString(),
        warning: error.message
      });
    }
    setLoading(false);
  };

  const loadExternal = async () => {
    try {
      const response = await fetch("/api/external");
      if (!response.ok) throw new Error(`External API returned ${response.status}`);
      setExternal(await response.json());
    } catch (error) {
      setExternal({
        fetchedAt: new Date().toISOString(),
        crypto: [
          { name: "BTC/USD", tier: "B", source: "Coinbase spot", value: null, status: "unavailable", warning: error.message },
          { name: "ETH/USD", tier: "B", source: "Coinbase spot", value: null, status: "unavailable", warning: error.message }
        ],
        sports: [
          { name: "MLB schedule", tier: "A", source: "MLB Stats API", status: "unavailable", games: [], warning: error.message }
        ]
      });
    }
  };

  useEffect(() => {
    loadMarkets();
    loadExternal();
  }, []);

  const rankedMarkets = useMemo(() => {
    return markets
      .map((market) => {
        const enrichedMarket = enrichMarket(market);
        const score = scoreMarket(enrichedMarket);
        return {
          ...enrichedMarket,
          score,
          action: actionForScore(score, enrichedMarket)
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [markets]);

  const basket = rankedMarkets.filter((market) => market.action !== "跳过").slice(0, 10);
  const totalStake = basket.reduce(
    (sum, market, index) => sum + suggestedStake(bankroll, perTradePct, deployPct, index, basket.length),
    0
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Polymarket Research Desk</p>
          <h1>多笔交易候选池</h1>
        </div>
        <button className="refresh" onClick={loadMarkets} disabled={loading} title="刷新市场">
          <RefreshCw size={18} />
          <span>{loading ? "刷新中" : "刷新"}</span>
        </button>
      </header>

      <main className="layout">
        <aside className="panel controls">
          <div className="section-title">
            <SlidersHorizontal size={18} />
            <span>筛选与资金</span>
          </div>
          <label className="field">
            <span><Search size={15} />关键词</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="score, NBA, election..." />
          </label>
          <label className="field">
            <span><Filter size={15} />类别</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "全部" : item}
                </option>
              ))}
            </select>
          </label>
          <div className="range-grid">
            <label className="field">
              <span><Wallet size={15} />本金</span>
              <input type="number" value={bankroll} min="1" onChange={(event) => setBankroll(Number(event.target.value))} />
            </label>
            <label className="field">
              <span><Gauge size={15} />单笔上限 %</span>
              <input type="number" value={perTradePct} min="0.1" step="0.1" onChange={(event) => setPerTradePct(Number(event.target.value))} />
            </label>
            <label className="field wide">
              <span><Layers3 size={15} />总暴露 %</span>
              <input type="number" value={deployPct} min="1" step="1" onChange={(event) => setDeployPct(Number(event.target.value))} />
            </label>
          </div>
          <button className="primary" onClick={loadMarkets}>
            <BarChart3 size={18} />
            生成候选池
          </button>

          <div className="summary">
            <div>
              <strong>{basket.length}</strong>
              <span>候选笔数</span>
            </div>
            <div>
              <strong>{money(totalStake)}</strong>
              <span>建议总暴露</span>
            </div>
          </div>

          <div className="notice">
            <AlertTriangle size={17} />
            <p>这不是投资建议。方向必须由外部胜率模型或官方数据校验后，再和市场隐含概率比较。</p>
          </div>

          <div className="mini-rules">
            <strong>入篮硬规则</strong>
            <span>Edge &gt;= 3%</span>
            <span>价差 &lt;= 5c</span>
            <span>A/B/C 源至少 2 个</span>
            <span>单事件总暴露 &lt;= 6%</span>
          </div>
        </aside>

        <section className="workspace">
          <div className="status-row">
            <div className={meta.source === "live" ? "status live" : "status sample"}>
              <Activity size={16} />
              {meta.source === "live" ? "实时 Polymarket 数据" : "示例数据 / API 降级"}
            </div>
            <span>{meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleString() : ""}</span>
          </div>

          <div className="external-board">
            <div className="section-title compact">
              <Activity size={17} />
              <span>外部数据源实时快照</span>
            </div>
            <div className="external-grid">
              {external.crypto.map((item) => (
                <article className="external-card" key={item.name}>
                  <div>
                    <span className={`tier tier-${item.tier}`}>{item.tier}</span>
                    <strong>{item.name}</strong>
                  </div>
                  <p>{item.source}</p>
                  <b>{Number.isFinite(item.value) ? money(item.value) : "不可用"}</b>
                  <small className={item.status === "live" ? "ok" : "warn"}>{item.status === "live" ? "live" : item.warning}</small>
                </article>
              ))}
              {external.sports.map((item) => (
                <article className="external-card sports-feed" key={item.name}>
                  <div>
                    <span className={`tier tier-${item.tier}`}>{item.tier}</span>
                    <strong>{item.name}</strong>
                  </div>
                  <p>{item.source}</p>
                  <b>{item.status === "live" ? `${item.games.length} games` : "不可用"}</b>
                  <small className={item.status === "live" ? "ok" : "warn"}>
                    {item.status === "live"
                      ? item.games.slice(0, 2).map((game) => `${game.away} @ ${game.home}`).join(" / ") || "No games"
                      : item.warning}
                  </small>
                </article>
              ))}
            </div>
          </div>

          <div className="strategy-grid">
            {strategyTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <article className="strategy-card" key={tile.title}>
                  <div className="strategy-title">
                    <Icon size={18} />
                    <strong>{tile.title}</strong>
                  </div>
                  <p>{tile.edge}</p>
                  <dl>
                    <div>
                      <dt>模型</dt>
                      <dd>{tile.model}</dd>
                    </div>
                    <div>
                      <dt>跳过</dt>
                      <dd>{tile.avoid}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="market-list">
            {rankedMarkets.map((market, index) => {
              const stake = suggestedStake(bankroll, perTradePct, deployPct, index, basket.length);
              const days = daysUntil(market.endDate);
              return (
                <article className="market-card" key={market.id}>
                  <div className="market-main">
                    <div className="market-head">
                      <span className={`tier tier-${market.sourceTier}`}>{market.sourceTier}</span>
                      <span className="category">{market.category}</span>
                      <span className={`action ${market.action === "优先研究" ? "hot" : ""}`}>{market.action}</span>
                    </div>
                    <h2>{market.question}</h2>
                    <p className="source-line">{market.resolutionSource || "缺少明确结算源，先不要进入交易篮子。"}</p>
                    <div className="metrics">
                      <span>分数 {market.score}</span>
                      <span>量 {compactNumber(market.volume)}</span>
                      <span>流动性 {compactNumber(market.liquidity)}</span>
                      <span>{days === null ? "期限未知" : days >= 0 ? `${days} 天` : "已过期"}</span>
                    </div>
                    <p className="thesis">{market.thesis}</p>
                    <div className="prob-grid">
                      <div>
                        <span>市场隐含</span>
                        <strong>{formatPct(market.implied)}</strong>
                      </div>
                      <div>
                        <span>独立模型</span>
                        <strong>{formatPct(market.modelProbability)}</strong>
                      </div>
                      <div className={market.edge > 0 ? "positive" : "negative"}>
                        <span>Edge</span>
                        <strong>{Number.isFinite(market.edge) ? `${(market.edge * 100).toFixed(1)}%` : "待补"}</strong>
                      </div>
                    </div>
                    <div className="research-grid">
                      <section>
                        <h3><Target size={15} />入场</h3>
                        <p>{market.entryPlan}</p>
                      </section>
                      <section>
                        <h3><TrendingUp size={15} />退出</h3>
                        <p>{market.exitPlan}</p>
                      </section>
                    </div>
                    <div className="evidence-list">
                      {market.evidence.map((item) => (
                        <div key={`${market.id}-${item.source}-${item.signal}`}>
                          <span className={`tier tier-${item.tier}`}>{item.tier}</span>
                          <strong>{item.source}</strong>
                          <p>{item.signal}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="trade-box">
                    <span>市场隐含高概率</span>
                    <strong>{bestVisibleOutcome(market)}</strong>
                    <span>CLOB 盘口</span>
                    <div className="book-list">
                      {(market.orderBooks || []).slice(0, 2).map((book) => (
                        <div key={`${market.id}-${book.tokenId}`} className={book.source === "clob" ? "book-row live-book" : "book-row"}>
                          <strong>{book.outcome}</strong>
                          <p>Bid {formatPrice(book.bestBid)} / Ask {formatPrice(book.bestAsk)}</p>
                          <p>Spread {formatPrice(book.spread)} · 深度 {formatDepth(book.bidDepth + book.askDepth)}</p>
                        </div>
                      ))}
                      {!(market.orderBooks || []).length && <p className="book-empty">没有可用 token id 或盘口请求失败。</p>}
                    </div>
                    <span>单笔上限</span>
                    <strong>{market.action === "跳过" ? "$0" : money(stake)}</strong>
                    <div className="trade-note">
                      <Calculator size={15} />
                      <p>先按 edge 排序，再按相关性删减，不因笔数多而放大同一事件风险。</p>
                    </div>
                    <div className="check-block">
                      <strong><ClipboardList size={15} />核验清单</strong>
                      {market.checklist.map((item) => (
                        <p key={`${market.id}-${item}`}><CheckCircle2 size={13} />{item}</p>
                      ))}
                    </div>
                    <div className="check-block danger">
                      <strong><XCircle size={15} />不做条件</strong>
                      {market.noTrade.map((item) => (
                        <p key={`${market.id}-${item}`}><XCircle size={13} />{item}</p>
                      ))}
                    </div>
                    {market.slug && (
                      <a href={`https://polymarket.com/event/${market.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} />
                        打开
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="panel intelligence">
          <div className="section-title">
            <ShieldCheck size={18} />
            <span>权威等级</span>
          </div>
          {Object.entries(tierMeta).map(([tier, metaItem]) => (
            <div className="tier-row" key={tier}>
              <span className={`tier tier-${tier}`}>{tier}</span>
              <div>
                <strong>{metaItem.label}</strong>
                <p>{metaItem.text}</p>
              </div>
            </div>
          ))}

          <div className="rules">
            <div className="section-title compact">
              <Trophy size={17} />
              <span>比分/体育核验</span>
            </div>
            <a href="https://www.nba.com/stats" target="_blank" rel="noreferrer">NBA Stats</a>
            <a href="https://www.mlb.com/stats" target="_blank" rel="noreferrer">MLB Stats</a>
            <a href="https://www.espn.com" target="_blank" rel="noreferrer">ESPN scoreboard</a>
            <a href="https://www.uefa.com" target="_blank" rel="noreferrer">UEFA official</a>
          </div>

          <div className="rules">
            <div className="section-title compact">
              <ExternalLink size={17} />
              <span>市场数据</span>
            </div>
            <a href="https://docs.polymarket.com/" target="_blank" rel="noreferrer">Polymarket Docs</a>
            <a href="https://gamma-api.polymarket.com/markets" target="_blank" rel="noreferrer">Gamma markets API</a>
          </div>

          <div className="rules">
            <div className="section-title compact">
              <CheckCircle2 size={17} />
              <span>入篮规则</span>
            </div>
            <p><Info size={15} />只选 A/B/C 源，D 源跳过。</p>
            <p><Info size={15} />同一赛事只保留 1 到 2 笔，避免假分散。</p>
            <p><Info size={15} />市场价格不是胜率模型，买入前要有独立概率估计。</p>
          </div>

          <div className="rules">
            <div className="section-title compact">
              <ShieldCheck size={17} />
              <span>数据源库</span>
            </div>
            {sourceMatrix.map((source) => (
              <a key={source.name} href={source.url} target="_blank" rel="noreferrer">
                <span className={`tier tier-${source.tier}`}>{source.tier}</span>
                <span>{source.name}: {source.use}</span>
              </a>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
