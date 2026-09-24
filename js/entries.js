/**
 * data/entries.json 을 읽어 화면이 쓰는 형태로 가공한다.
 *
 * 이 파일이 사이트의 유일한 필수 데이터원이다. API 키 없이도 전부 동작한다.
 */

const DATA_URL = 'data/entries.json';

/**
 * 오늘의 표현에서 제외할 분류.
 * 일상에서 쓸 일이 없는 것들을 모아 둔 자리라 매일 뜨는 화면에는 올리지
 * 않는다. 모아보기와 단어장에는 그대로 들어간다.
 */
const NOT_DAILY = new Set(['기타']);

function dailyPool(entries) {
  return entries.filter((entry) => entry.kind === 'phrase' && !NOT_DAILY.has(entry.category));
}

let cache = null;

/** 한 번만 읽고 재사용한다. */
export async function loadEntries() {
  if (cache) return cache;
  const response = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`단어장 데이터를 불러오지 못했습니다 (HTTP ${response.status}).`);
  }
  const parsed = await response.json();
  if (!Array.isArray(parsed)) throw new Error('단어장 데이터 형식이 올바르지 않습니다.');
  cache = parsed;
  return cache;
}

/* ── 오늘의 숙어 ───────────────────────────────────────── */

/**
 * 날짜를 씨앗 삼아 숙어를 하나 고른다.
 *
 * 무작위가 아니라 날짜에서 계산하므로, 같은 날 몇 번을 새로고침해도
 * 같은 숙어가 나오고 저장할 필요도 없다.
 */
export function pickForDate(entries, date) {
  const pool = dailyPool(entries);
  if (!pool.length) return null;
  const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return pool[((days % pool.length) + pool.length) % pool.length];
}

/** 오늘 것 말고 다른 표현. `다른 표현` 버튼이 쓴다. */
export function nextPhrase(entries, currentId) {
  const pool = dailyPool(entries);
  if (!pool.length) return null;
  const index = pool.findIndex((entry) => entry.id === currentId);
  return pool[(index + 1) % pool.length];
}

/* ── 검색 ──────────────────────────────────────────────── */

function haystack(entry) {
  return [
    entry.ko,
    entry.romanization,
    entry.el,
    entry.literal_el,
    entry.meaning,
    entry.category,
    entry.source,
    ...(entry.tags || []),
    entry.ko_pron,
    ...(entry.words || []).flatMap((word) => [word.surface, word.base, word.meaning]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * 공백으로 나눈 모든 조각을 포함하는 항목만 남긴다(AND 검색).
 * 항목 수가 수천 개가 되기 전까지는 이 정도로 충분히 빠르다.
 */
export function search(entries, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((entry) => {
    const text = haystack(entry);
    return terms.every((term) => text.includes(term));
  });
}

/* ── 단어장 ────────────────────────────────────────────── */

/**
 * 모든 항목의 words 를 기본형 기준으로 모은다.
 * 같은 낱말이 여러 항목에 나오면 출처를 함께 모아 둔다.
 *
 * @returns {Array<{base: string, pos: string, meanings: string[], surfaces: string[], sources: object[]}>}
 */
export function buildVocabulary(entries) {
  const byBase = new Map();

  for (const entry of entries) {
    for (const word of entry.words || []) {
      if (!word || !word.base) continue;
      const key = word.base.toLowerCase();
      let item = byBase.get(key);
      if (!item) {
        item = { base: word.base, pos: word.pos || '', ipa: '', meanings: [], surfaces: [], notes: [], sources: [] };
        byBase.set(key, item);
      }
      // 단어장은 기본형을 표제어로 삼는다. 굴절형의 발음을 기본형 옆에 붙이면
      // 사전형 발음인 것처럼 잘못 읽히므로, 둘이 같을 때만 싣는다.
      // 문장 첫머리라 대문자인 것은 같은 낱말로 본다.
      if (!item.ipa && word.ipa && word.base.toLowerCase() === word.surface.toLowerCase()) {
        item.ipa = word.ipa;
      }
      if (word.meaning && !item.meanings.includes(word.meaning)) item.meanings.push(word.meaning);
      if (word.surface && !item.surfaces.includes(word.surface)) item.surfaces.push(word.surface);
      if (word.note && !item.notes.includes(word.note)) item.notes.push(word.note);
      item.sources.push({ id: entry.id, el: entry.el, ko: entry.ko });
    }
  }

  // 그리스어 사전 순서(그리스 문자, 강세 부호는 무시)를 따른다.
  return [...byBase.values()].sort((a, b) => a.base.localeCompare(b.base, 'el'));
}

/** 검색어로 단어장을 거른다. */
export function searchVocabulary(vocabulary, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return vocabulary;
  return vocabulary.filter((item) => {
    const text = [item.base, item.pos, ...item.surfaces, ...item.meanings].join(' ').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/* ── 분류와 집계 ───────────────────────────────────────── */

/**
 * 분류를 항목이 많은 순으로 돌려준다. 모아보기 탭의 칩이 쓴다.
 * @returns {Array<{name: string, count: number}>}
 */
export function categoriesOf(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const name = entry.category || '기타';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

/**
 * 화면 위에 띄우는 집계. 문장이 몇 개 들어왔는지 한눈에 보려는 것이다.
 * @returns {{sentences: number, words: number, wordInstances: number, categories: number, latest: string}}
 */
export function summarize(entries, vocabulary) {
  const dates = entries.map((entry) => entry.added).filter(Boolean).sort();
  return {
    sentences: entries.filter((entry) => entry.kind !== 'word').length,
    vocabularyWords: vocabulary.length,
    wordInstances: entries.reduce((sum, entry) => sum + (entry.words || []).length, 0),
    categories: categoriesOf(entries).length,
    total: entries.length,
    latest: dates.length ? dates[dates.length - 1] : '',
  };
}
