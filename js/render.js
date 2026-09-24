/**
 * 모델이 돌려준 객체를 DOM 으로 그린다.
 *
 * 모델 출력은 신뢰할 수 없는 텍스트로 다룬다 — innerHTML 대신 textContent 만 쓴다.
 */

import { compactNumber, groupedNumber, formatUsd, severityOf } from './usage.js';
import { canSpeak, speak, SLOW_RATE } from './speech.js';

/** 스피커 아이콘. 폰트에 기대지 않도록 SVG 로 그린다. */
function speakerIcon(size = 14) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a9 9 0 0 1 0 14']) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/**
 * 읽어 주는 버튼. 그리스어 목소리가 없는 기기에서는 아예 만들지 않는다.
 * 엉뚱한 언어 목소리로 읽어 주는 것보다 없는 편이 낫다.
 * @param {string} text 읽을 그리스어
 * @param {{slow?: boolean, label?: string, small?: boolean}} [options]
 */
function speakButton(text, options = {}) {
  if (!nonEmpty(text) || !canSpeak(text)) return null;

  const button = el('button', options.small ? 'speak speak-sm' : 'speak');
  button.type = 'button';
  const name = options.slow ? '느리게 듣기' : '듣기';
  button.setAttribute('aria-label', `${name}: ${text}`);
  button.title = name;
  button.append(speakerIcon(options.small ? 12 : 14));
  if (options.label) button.append(el('span', null, options.label));

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    speak(text, {
      rate: options.slow ? SLOW_RATE : 1,
      onStart: () => button.classList.add('is-speaking'),
      onEnd: () => button.classList.remove('is-speaking'),
    });
  });
  return button;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function section(title) {
  const wrap = el('div', 'sec');
  wrap.append(el('h3', 'sec-title', title));
  return wrap;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** 낱말 풀이 목록. */
function wordList(words) {
  const box = el('div', 'words');
  const items = Array.isArray(words) ? words : [];

  for (const word of items) {
    if (!word || !nonEmpty(word.surface)) continue;
    const row = el('div', 'word');
    row.append(el('span', 'word-surface', word.surface));
    row.append(el('span', 'word-meaning', word.meaning || ''));

    const gram = [word.part_of_speech, nonEmpty(word.base_form) && word.base_form !== word.surface ? `← ${word.base_form}` : '']
      .filter(nonEmpty)
      .join('  ');
    row.append(el('span', 'word-gram', gram));

    if (nonEmpty(word.note)) row.append(el('span', 'word-note', word.note));
    box.append(row);
  }

  if (!box.childElementCount) box.append(el('p', 'muted small', '풀이할 낱말이 없습니다.'));
  return box;
}

/** 라벨 / 값 목록. `[label, value]` 쌍 중 값이 빈 것은 건너뛴다. */
function keyValues(pairs) {
  const dl = el('dl', 'kv');
  let count = 0;
  for (const [label, value] of pairs) {
    if (!nonEmpty(value)) continue;
    dl.append(el('dt', null, label));
    dl.append(el('dd', null, value));
    count += 1;
  }
  return count ? dl : null;
}

/* ── 오늘의 숙어 ───────────────────────────────────────── */

/**
 * @param {HTMLElement} target
 * @param {object} idiom
 * @param {{onRefresh?: () => void, onCopy?: () => void}} [handlers]
 */
export function renderIdiom(target, idiom, handlers = {}) {
  target.replaceChildren();

  const head = el('div');
  head.append(el('p', 'headline-ko', idiom.korean || ''));
  if (nonEmpty(idiom.romanization)) head.append(el('p', 'romanization', `[${idiom.romanization}]`));
  head.append(el('p', 'headline-el', idiom.greek || ''));
  target.append(head);

  /* 뜻 */
  const meaning = section('뜻');
  const meaningPairs = keyValues([
    ['직역', idiom.literal_meaning],
    ['속뜻', idiom.figurative_meaning],
    ['그리스어 직역', idiom.greek_literal],
  ]);
  if (meaningPairs) meaning.append(meaningPairs);
  target.append(meaning);

  /* 그리스어 낱말 */
  const el_ = section('그리스어 낱말 풀이');
  el_.append(wordList(idiom.greek_words));
  target.append(el_);

  /* 한국어 낱말 */
  if (Array.isArray(idiom.korean_words) && idiom.korean_words.length) {
    const ko = section('한국어 낱말 풀이');
    ko.append(wordList(idiom.korean_words));
    target.append(ko);
  }

  /* 대응 관용구 */
  const equiv = idiom.greek_equivalent;
  if (equiv && nonEmpty(equiv.phrase)) {
    const box = section('그리스어에서 비슷한 표현');
    const quote = el('div', 'example');
    quote.append(el('p', 'ex-el', equiv.phrase));
    if (nonEmpty(equiv.literal_korean)) quote.append(el('p', 'ex-ko', `직역: ${equiv.literal_korean}`));
    box.append(quote);
    if (nonEmpty(equiv.note)) box.append(el('p', 'muted small', equiv.note));
    target.append(box);
  }

  /* 예문 */
  if (idiom.example && (nonEmpty(idiom.example.greek) || nonEmpty(idiom.example.korean))) {
    const box = section('예문');
    const quote = el('div', 'example');
    if (nonEmpty(idiom.example.greek)) quote.append(el('p', 'ex-el', idiom.example.greek));
    if (nonEmpty(idiom.example.korean)) quote.append(el('p', 'ex-ko', idiom.example.korean));
    box.append(quote);
    target.append(box);
  }

  /* 쓰임새 */
  if (nonEmpty(idiom.usage_note)) {
    const box = section('쓰임새');
    box.append(el('p', null, idiom.usage_note));
    target.append(box);
  }

  /* 버튼 */
  const foot = el('div', 'card-foot');
  if (handlers.onCopy) {
    const copy = el('button', 'btn btn-ghost', '복사');
    copy.type = 'button';
    copy.addEventListener('click', () => handlers.onCopy(copy));
    foot.append(copy);
  }
  if (foot.childElementCount) target.append(foot);

  target.hidden = false;
}

/* ── 번역 결과 ─────────────────────────────────────────── */

const LANGUAGE_LABEL = { ko: '한국어', el: '그리스어', other: '그 외' };

/**
 * @param {HTMLElement} target
 * @param {object} result
 * @param {{onCopy?: (btn: HTMLElement) => void}} [handlers]
 */
export function renderTranslation(target, result, handlers = {}) {
  target.replaceChildren();

  const head = el('div');
  const tags = el('p', null);
  tags.style.margin = '0 0 10px';
  const from = LANGUAGE_LABEL[result.source_language] || '알 수 없음';
  const to = LANGUAGE_LABEL[result.target_language] || '알 수 없음';
  tags.append(el('span', 'tag', `${from} → ${to}`));
  head.append(tags);
  head.append(el('p', 'headline-el', result.translation || ''));
  target.append(head);

  if (nonEmpty(result.caution)) {
    const box = section('짚어 둘 점');
    box.append(el('p', null, result.caution));
    target.append(box);
  }

  if (nonEmpty(result.literal_translation) && result.literal_translation !== result.translation) {
    const box = section('직역');
    box.append(el('p', null, result.literal_translation));
    target.append(box);
  }

  const words = section('낱말 풀이');
  words.append(wordList(result.words));
  target.append(words);

  if (Array.isArray(result.grammar_notes) && result.grammar_notes.filter(nonEmpty).length) {
    const box = section('문법 노트');
    const ul = el('ul', 'list');
    for (const note of result.grammar_notes) {
      if (nonEmpty(note)) ul.append(el('li', null, note));
    }
    box.append(ul);
    target.append(box);
  }

  const alts = Array.isArray(result.alternatives) ? result.alternatives.filter((a) => a && nonEmpty(a.text)) : [];
  if (alts.length) {
    const box = section('다른 번역');
    for (const alt of alts) {
      const quote = el('div', 'example');
      quote.style.marginBottom = '8px';
      quote.append(el('p', 'ex-el', alt.text));
      if (nonEmpty(alt.note)) quote.append(el('p', 'ex-ko', alt.note));
      box.append(quote);
    }
    target.append(box);
  }

  const foot = el('div', 'card-foot');
  if (handlers.onCopy) {
    const copy = el('button', 'btn btn-ghost', '번역문 복사');
    copy.type = 'button';
    copy.addEventListener('click', () => handlers.onCopy(copy));
    foot.append(copy);
  }
  if (foot.childElementCount) target.append(foot);

  target.hidden = false;
}

/* ── 지난 숙어 ─────────────────────────────────────────── */

/**
 * @param {HTMLElement} target
 * @param {Array<{date: string, idiom: object}>} entries
 * @param {(entry: {date: string, idiom: object}) => void} onSelect
 */
export function renderHistory(target, entries, onSelect) {
  target.replaceChildren();

  if (!entries.length) {
    target.append(el('p', 'empty', '아직 저장된 숙어가 없습니다.'));
    return;
  }

  for (const entry of entries) {
    const item = el('button', 'history-item');
    item.type = 'button';
    item.append(el('div', 'h-date', entry.date));
    item.append(el('div', 'h-ko', (entry.idiom && entry.idiom.korean) || ''));
    item.append(el('div', 'h-el', (entry.idiom && entry.idiom.greek) || ''));
    item.addEventListener('click', () => onSelect(entry));
    target.append(item);
  }
}

/* ── 상태 표시 ─────────────────────────────────────────── */

/** 로딩 스피너와 메시지. */
export function showLoading(node, message) {
  node.replaceChildren();
  node.className = 'status';
  node.append(el('span', 'spinner'));
  node.append(el('span', null, message));
  node.hidden = false;
}

export function showError(node, message) {
  node.replaceChildren();
  node.className = 'status is-error';
  node.append(el('span', null, message));
  node.hidden = false;
}

export function hideStatus(node) {
  node.hidden = true;
  node.replaceChildren();
}

/* ── 사용량 표시 ───────────────────────────────────────── */

const METER_ROWS = [
  { key: 'requests', label: '요청', unit: '회' },
  { key: 'inputTokens', label: '입력 토큰', unit: '' },
  { key: 'outputTokens', label: '출력 토큰', unit: '' },
];

/** 값 + 라벨 한 덩어리. 색이 아니라 숫자가 뜻을 전달한다. */
function statTile(label, value, sub) {
  const tile = el('div', 'tile');
  tile.append(el('span', 'tile-label', label));
  tile.append(el('span', 'tile-value', value));
  if (sub) tile.append(el('span', 'tile-sub', sub));
  return tile;
}

/**
 * 한 줄짜리 미터. 채워진 부분이 '쓴 양', 빈 부분이 '남은 양'이다.
 * 심각도는 채움색으로 드러나되, 옆의 숫자가 항상 같은 정보를 글로 말한다.
 */
function meterRow(label, unit, pair, formatValue) {
  const row = el('div', 'meter');
  row.append(el('span', 'meter-label', label));

  const track = el('div', 'meter-track');
  // 남은 양이 음수로 보고되는 일은 없어야 하지만, 표시가 깨지지 않게 막아 둔다.
  const remaining = Math.min(pair.limit, Math.max(0, pair.remaining));
  const used = pair.limit - remaining;
  const percent = Math.min(100, Math.max(0, (used / pair.limit) * 100));
  const fill = el('div', 'meter-fill');
  fill.dataset.severity = severityOf(pair.remaining, pair.limit);
  // 아주 작은 사용량도 보이도록 최소 폭을 준다.
  fill.style.width = percent > 0 && percent < 1.5 ? '1.5%' : `${percent}%`;
  track.append(fill);
  track.setAttribute('role', 'img');
  track.setAttribute(
    'aria-label',
    `${label} 남은 양 ${formatValue(remaining)}${unit}, 한도 ${formatValue(pair.limit)}${unit}`
  );
  row.append(track);

  row.append(
    el('span', 'meter-value', `${formatValue(remaining)}${unit} / ${formatValue(pair.limit)}${unit}`)
  );
  return row;
}

function formatResetTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return '지금 회복됨';
  if (seconds < 60) return `${seconds}초 뒤 회복`;
  return `${Math.ceil(seconds / 60)}분 뒤 회복`;
}

/**
 * @param {HTMLElement} target
 * @param {{model: object, totals: object, rateLimit: object|null}} state
 */
export function renderUsage(target, { model, totals, rateLimit }) {
  target.replaceChildren();

  /* 이번 달 누적 — 이 브라우저에서 보낸 요청만 센 추정치 */
  const tiles = el('div', 'tiles');
  tiles.append(statTile('이번 달 추정 비용', formatUsd(totals.costUsd), totals.month));
  tiles.append(statTile('요청', `${groupedNumber(totals.requests)}회`, model.label));
  tiles.append(statTile('입력 토큰', compactNumber(totals.inputTokens), `$${model.inputPerMTok}/MTok`));
  tiles.append(statTile('출력 토큰', compactNumber(totals.outputTokens), `$${model.outputPerMTok}/MTok`));
  target.append(tiles);

  /* 분당 속도 제한 — 마지막 응답 헤더에서 읽은 실제 값 */
  const limits = el('div', 'meters');
  const heading = el('div', 'meters-head');
  heading.append(el('span', 'sec-title', '분당 한도 · 남은 양'));
  if (rateLimit && rateLimit.at) {
    const resets = METER_ROWS.map((row) => rateLimit[row.key])
      .filter(Boolean)
      .map((pair) => formatResetTime(pair.reset))
      .filter(Boolean);
    if (resets.length) heading.append(el('span', 'muted small', resets[0]));
  }
  limits.append(heading);

  let drew = 0;
  for (const row of METER_ROWS) {
    const pair = rateLimit && rateLimit[row.key];
    if (!pair) continue;
    limits.append(
      meterRow(row.label, row.unit, pair, row.key === 'requests' ? groupedNumber : compactNumber)
    );
    drew += 1;
  }

  if (!drew) {
    limits.append(
      el('p', 'muted small', '아직 요청이 없습니다. 한 번 번역하면 남은 분당 한도가 여기에 표시됩니다.')
    );
  }
  target.append(limits);

  const foot = el('p', 'usage-foot muted small');
  foot.textContent =
    '위 막대는 Anthropic이 매 응답에 실어 주는 분당 속도 제한입니다. ' +
    '월 지출 한도와 실제 청구액은 여기서 알 수 없으니 Anthropic 콘솔에서 확인하세요. ' +
    '비용은 이 브라우저가 보낸 요청만 더한 추정치입니다.';
  target.append(foot);
}

/* ── 단어장 항목 렌더 (data/entries.json 기반) ──────────── */

const KIND_LABEL = { phrase: '표현', word: '낱말' };

/** entries.json 의 words 는 {surface, base, pos, meaning, note} 형태다. */
function entryWordList(words) {
  const box = el('div', 'words');
  for (const word of Array.isArray(words) ? words : []) {
    if (!word || !nonEmpty(word.surface)) continue;
    const row = el('div', 'word');
    const head = el('span', 'word-surface');
    head.append(document.createTextNode(word.surface));
    if (nonEmpty(word.ipa)) head.append(el('span', 'word-ipa', `/${word.ipa}/`));
    const say = speakButton(word.surface, { small: true });
    if (say) head.append(say);
    row.append(head);
    row.append(el('span', 'word-meaning', word.meaning || ''));
    const gram = [word.pos, nonEmpty(word.base) && word.base !== word.surface ? `← ${word.base}` : '']
      .filter(nonEmpty)
      .join('  ');
    row.append(el('span', 'word-gram', gram));
    if (nonEmpty(word.note)) row.append(el('span', 'word-note', word.note));
    box.append(row);
  }
  if (!box.childElementCount) box.append(el('p', 'muted small', '풀이할 낱말이 없습니다.'));
  return box;
}

/**
 * 항목 하나를 카드로 그린다. 오늘의 숙어와 모아보기가 함께 쓴다.
 * @param {{compact?: boolean, onCopy?: (btn: HTMLElement) => void}} [options]
 */
export function renderEntry(target, entry, options = {}) {
  target.replaceChildren();
  if (!entry) {
    target.append(el('p', 'empty', '보여 줄 항목이 없습니다.'));
    target.hidden = false;
    return;
  }

  const head = el('div');
  const tags = el('p', 'tag-row');
  if (nonEmpty(entry.category)) tags.append(el('span', 'tag', entry.category));
  for (const tag of entry.tags || []) tags.append(el('span', 'tag tag-gold', tag));
  head.append(tags);

  head.append(el('p', 'headline-ko', entry.ko || ''));
  if (nonEmpty(entry.romanization)) head.append(el('p', 'romanization', `[${entry.romanization}]`));
  head.append(el('p', 'headline-el', entry.el || ''));

  const speakRow = el('div', 'speak-row');
  const normal = speakButton(entry.el, { label: '듣기' });
  const slow = speakButton(entry.el, { slow: true, label: '느리게' });
  if (normal) speakRow.append(normal);
  if (slow) speakRow.append(slow);
  if (speakRow.childElementCount) head.append(speakRow);

  // 발음 — IPA 는 정확하지만 읽기 어렵고, 한글은 읽기 쉽지만 근사치다. 둘 다 준다.
  if (nonEmpty(entry.ipa) || nonEmpty(entry.ko_pron)) {
    const pron = el('div', 'pron');
    if (nonEmpty(entry.ipa)) {
      const row = el('div', 'pron-row');
      row.append(el('span', 'pron-tag', 'IPA'));
      row.append(el('span', 'pron-ipa', `/${entry.ipa}/`));
      pron.append(row);
    }
    if (nonEmpty(entry.ko_pron)) {
      const row = el('div', 'pron-row');
      row.append(el('span', 'pron-tag', '한글'));
      row.append(el('span', 'pron-ko', entry.ko_pron));
      pron.append(row);
    }
    head.append(pron);
  }
  target.append(head);

  const meaning = section('뜻');
  const pairs = keyValues([
    ['뜻풀이', entry.meaning],
    ['직역', entry.literal_el],
  ]);
  if (pairs) meaning.append(pairs);
  target.append(meaning);

  const words = section('낱말 풀이');
  words.append(entryWordList(entry.words));
  target.append(words);

  const notes = (entry.notes || []).filter(nonEmpty);
  if (notes.length) {
    const box = section('문법 노트');
    const ul = el('ul', 'list');
    for (const note of notes) ul.append(el('li', null, note));
    box.append(ul);
    target.append(box);
  }

  const examples = (entry.examples || []).filter((ex) => ex && (nonEmpty(ex.el) || nonEmpty(ex.ko)));
  if (examples.length) {
    const box = section('예문');
    for (const ex of examples) {
      const quote = el('div', 'example');
      if (nonEmpty(ex.el)) {
        const line = el('p', 'ex-el');
        line.append(document.createTextNode(ex.el));
        const say = speakButton(ex.el, { small: true });
        if (say) line.append(say);
        quote.append(line);
      }
      if (nonEmpty(ex.ko)) quote.append(el('p', 'ex-ko', ex.ko));
      box.append(quote);
    }
    target.append(box);
  }

  const equiv = entry.equivalent;
  if (equiv && nonEmpty(equiv.el)) {
    const box = section('그리스어의 비슷한 표현');
    const quote = el('div', 'example');
    quote.append(el('p', 'ex-el', equiv.el));
    if (nonEmpty(equiv.literal)) quote.append(el('p', 'ex-ko', `직역: ${equiv.literal}`));
    box.append(quote);
    if (nonEmpty(equiv.note)) box.append(el('p', 'muted small', equiv.note));
    target.append(box);
  }

  if (options.onCopy) {
    const foot = el('div', 'card-foot');
    const copy = el('button', 'btn btn-ghost', '복사');
    copy.type = 'button';
    copy.addEventListener('click', () => options.onCopy(copy));
    foot.append(copy);
    target.append(foot);
  }

  target.hidden = false;
}

/* ── 모아보기 목록 ─────────────────────────────────────── */

export function renderEntryList(target, entries, onSelect) {
  target.replaceChildren();
  if (!entries.length) {
    target.append(el('p', 'empty', '조건에 맞는 항목이 없습니다.'));
    return;
  }
  for (const entry of entries) {
    const item = el('button', 'history-item');
    item.type = 'button';
    const meta = el('div', 'h-date');
    meta.textContent = `${entry.category || KIND_LABEL[entry.kind] || ''} · ${entry.added}`;
    item.append(meta);
    item.append(el('div', 'h-ko', entry.ko || ''));
    item.append(el('div', 'h-el', entry.el || ''));
    item.addEventListener('click', () => onSelect(entry));
    target.append(item);
  }
}

/* ── 단어장 ────────────────────────────────────────────── */

export function renderVocabulary(target, vocabulary, onSelectSource) {
  target.replaceChildren();
  if (!vocabulary.length) {
    target.append(el('p', 'empty', '조건에 맞는 낱말이 없습니다.'));
    return;
  }

  for (const item of vocabulary) {
    const row = el('div', 'vocab');

    const main = el('div', 'vocab-main');
    const title = el('span', 'vocab-base');
    title.append(document.createTextNode(item.base));
    if (nonEmpty(item.ipa)) title.append(el('span', 'word-ipa', `/${item.ipa}/`));
    const say = speakButton(item.base, { small: true });
    if (say) title.append(say);
    main.append(title);
    if (nonEmpty(item.pos)) main.append(el('span', 'vocab-pos', item.pos));
    row.append(main);

    row.append(el('div', 'vocab-meaning', item.meanings.join('; ')));

    // 이 낱말이 나온 문장들 — 눌러서 원래 항목으로 간다.
    const sources = el('div', 'vocab-sources');
    for (const source of item.sources) {
      const link = el('button', 'vocab-source', source.el);
      link.type = 'button';
      link.title = source.ko;
      link.addEventListener('click', () => onSelectSource(source.id));
      sources.append(link);
    }
    row.append(sources);

    target.append(row);
  }
}

/* ── 집계 줄 ───────────────────────────────────────────── */

/**
 * 사이트에 들어온 문장이 몇 개인지 한눈에 보여 준다.
 * 새 문장을 더 넣을지 판단하려면 지금 몇 개인지가 먼저 보여야 한다.
 */
export function renderSummary(target, stats) {
  target.replaceChildren();

  const figures = [
    ['문장', stats.sentences],
    ['낱말', stats.vocabularyWords],
    ['분류', stats.categories],
  ];

  for (const [label, value] of figures) {
    const unit = el('span', 'summary-unit');
    unit.append(el('span', 'summary-value', String(value)));
    unit.append(el('span', 'summary-label', label));
    target.append(unit);
  }

  if (nonEmpty(stats.latest)) {
    target.append(el('span', 'summary-updated', `마지막 추가 ${stats.latest}`));
  }

  target.hidden = false;
}

/* ── 분류 칩 ───────────────────────────────────────────── */

/**
 * @param {HTMLElement} target
 * @param {Array<{name: string, count: number}>} categories
 * @param {string} active 현재 고른 분류 이름, 또는 'all'
 * @param {(name: string) => void} onSelect
 */
export function renderCategoryChips(target, categories, active, onSelect) {
  target.replaceChildren();

  const total = categories.reduce((sum, item) => sum + item.count, 0);
  const rows = [{ name: 'all', label: '전체', count: total }, ...categories.map((item) => ({ ...item, label: item.name }))];

  for (const row of rows) {
    const chip = el('button', 'chip');
    chip.type = 'button';
    chip.dataset.category = row.name;
    chip.classList.toggle('is-active', row.name === active);
    chip.append(el('span', null, row.label));
    chip.append(el('span', 'chip-count', String(row.count)));
    chip.addEventListener('click', () => onSelect(row.name));
    target.append(chip);
  }
}
