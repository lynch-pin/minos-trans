/**
 * 사용량 추적.
 *
 * 두 가지 서로 다른 것을 다루므로 섞지 않는다.
 *
 *  1) 분당 속도 제한(rate limit) — 매 응답의 `anthropic-ratelimit-*` 헤더에서
 *     그대로 읽는다. 실제 값이고 요청마다 갱신된다. 다만 이것은 **분당** 한도이지
 *     월 지출 한도가 아니다.
 *  2) 누적 사용량 — 응답의 `usage` 를 이 브라우저에 달 단위로 쌓아 비용을
 *     추정한다. 어디까지나 이 브라우저에서 보낸 요청만 세므로 실제 청구액과는
 *     다르다. 정확한 금액과 월 지출 한도는 Anthropic 콘솔에서 봐야 한다.
 */

import { estimateCost } from './models.js';

const PREFIX = 'accurate-translator:';

/* ── 분당 속도 제한 ────────────────────────────────────── */

/** 마지막 응답의 헤더에서 읽은 값. 아직 요청이 없으면 null. */
let lastRateLimit = null;

function readPair(headers, kind) {
  const limit = Number(headers.get(`anthropic-ratelimit-${kind}-limit`));
  const remaining = Number(headers.get(`anthropic-ratelimit-${kind}-remaining`));
  const reset = headers.get(`anthropic-ratelimit-${kind}-reset`);
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || limit <= 0) return null;
  return { limit, remaining, reset: reset || null };
}

/**
 * 응답 헤더에서 속도 제한을 갈무리한다.
 * 헤더가 없으면(프록시가 걷어내는 경우 등) 이전 값을 유지한다.
 */
export function captureRateLimit(headers) {
  const snapshot = {
    requests: readPair(headers, 'requests'),
    inputTokens: readPair(headers, 'input-tokens'),
    outputTokens: readPair(headers, 'output-tokens'),
    at: new Date().toISOString(),
  };
  if (snapshot.requests || snapshot.inputTokens || snapshot.outputTokens) {
    lastRateLimit = snapshot;
  }
  return lastRateLimit;
}

export function getRateLimit() {
  return lastRateLimit;
}

/* ── 이번 달 누적 ──────────────────────────────────────── */

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const EMPTY = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

function readTotals() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(`${PREFIX}usage`) || 'null');
  } catch {
    stored = null;
  }
  // 달이 바뀌면 0 부터 다시 센다.
  if (!stored || stored.month !== currentMonth()) {
    return { month: currentMonth(), ...EMPTY };
  }
  return { ...EMPTY, ...stored, month: stored.month };
}

let totals = readTotals();

function persist() {
  try {
    localStorage.setItem(`${PREFIX}usage`, JSON.stringify(totals));
  } catch {
    /* 저장 불가 환경 — 이번 세션 동안만 메모리로 유지한다. */
  }
}

/**
 * 한 번의 응답을 누적에 더한다.
 * @returns {{month: string, requests: number, inputTokens: number, outputTokens: number, costUsd: number}}
 */
export function recordUsage(modelId, usage) {
  totals = readTotals(); // 다른 탭이 갱신했을 수 있으니 다시 읽는다
  totals.requests += 1;
  totals.inputTokens +=
    (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  totals.outputTokens += usage.output_tokens || 0;
  totals.costUsd += estimateCost(modelId, usage);
  persist();
  return totals;
}

export function getTotals() {
  totals = readTotals();
  return totals;
}

export function resetTotals() {
  totals = { month: currentMonth(), ...EMPTY };
  persist();
  return totals;
}

/* ── 표시용 서식 ───────────────────────────────────────── */

/** 1234567 → "1.2M", 45600 → "46K" */
export function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const n = Math.max(0, value);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/** 1000 → "1,000". 자릿수가 적은 값에 쓴다. */
export function groupedNumber(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.max(0, Math.round(value)).toLocaleString('ko-KR');
}

/** 작은 금액도 뭉개지지 않게 자릿수를 조절한다. */
export function formatUsd(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * 남은 비율에 따른 심각도.
 * 색만으로 뜻이 전달되지 않도록 화면에는 항상 숫자를 함께 적는다.
 */
export function severityOf(remaining, limit) {
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) return 'normal';
  const usedRatio = 1 - remaining / limit;
  if (usedRatio >= 0.9) return 'critical';
  if (usedRatio >= 0.7) return 'warning';
  return 'normal';
}
