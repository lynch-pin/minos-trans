/**
 * localStorage 래퍼.
 *
 * 시크릿 창이나 사이트 데이터 차단 환경에서는 읽기/쓰기가 모두 예외를 던질 수 있으므로
 * 전부 try/catch 로 감싸고, 실패하면 메모리에만 보관한다.
 */

import { MODELS, DEFAULT_MODEL } from './models.js';

const PREFIX = 'accurate-translator:';
const memory = new Map();

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? (memory.has(key) ? memory.get(key) : null) : raw;
  } catch {
    return memory.has(key) ? memory.get(key) : null;
  }
}

function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* 저장 불가 환경 — 메모리 값으로 이번 세션만 유지한다. */
  }
}

function remove(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* 무시 */
  }
}

function readJSON(key, fallback) {
  const raw = read(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  write(key, JSON.stringify(value));
}

/* ── API 키 ─────────────────────────────────────────────── */

export const apiKey = {
  get: () => read('apiKey') || '',
  set: (value) => (value ? write('apiKey', value) : remove('apiKey')),
  clear: () => remove('apiKey'),
};

/* ── 설정 ──────────────────────────────────────────────── */

const EFFORTS = ['low', 'medium', 'high'];
const MODEL_IDS = MODELS.map((model) => model.id);

export const settings = {
  getModel() {
    const value = read('model');
    return MODEL_IDS.includes(value) ? value : DEFAULT_MODEL;
  },
  setModel(value) {
    write('model', MODEL_IDS.includes(value) ? value : DEFAULT_MODEL);
  },
  getEffort() {
    const value = read('effort');
    return EFFORTS.includes(value) ? value : 'medium';
  },
  setEffort(value) {
    write('effort', EFFORTS.includes(value) ? value : 'medium');
  },
  getTheme() {
    const value = read('theme');
    return value === 'light' || value === 'dark' ? value : 'auto';
  },
  setTheme(value) {
    if (value === 'auto') remove('theme');
    else write('theme', value);
  },
};

/* ── 숙어 기록 ─────────────────────────────────────────── */

const HISTORY_LIMIT = 60;

export const history = {
  /** @returns {Array<{date: string, idiom: object}>} 최신순 */
  all() {
    const list = readJSON('history', []);
    return Array.isArray(list) ? list : [];
  },

  /** 해당 날짜에 저장된 숙어를 돌려준다. 없으면 null. */
  forDate(date) {
    const entry = history.all().find((item) => item.date === date);
    return entry ? entry.idiom : null;
  },

  /** 같은 날짜 항목은 덮어쓴다. */
  save(date, idiom) {
    const list = history.all().filter((item) => item.date !== date);
    list.unshift({ date, idiom });
    writeJSON('history', list.slice(0, HISTORY_LIMIT));
  },

  /** 중복 추천을 피하려고 프롬프트에 넘길 최근 숙어 목록. */
  recentKorean(count = 20) {
    return history
      .all()
      .slice(0, count)
      .map((item) => item.idiom && item.idiom.korean)
      .filter(Boolean);
  },

  clear() {
    remove('history');
  },
};
