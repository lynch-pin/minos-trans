/**
 * 화면 배선.
 *
 * 기본 동작은 data/entries.json 만 있으면 된다 — API 키도 네트워크도 필요 없다.
 * 번역기 탭만 선택적으로 Claude API 를 부른다.
 */

import { apiKey, settings } from './store.js';
import { translate, describeError, setUsageListener } from './api.js';
import { MODELS, findModel } from './models.js';
import { getTotals, getRateLimit, resetTotals, formatUsd } from './usage.js';
import {
  loadEntries,
  pickForDate,
  nextPhrase,
  search,
  buildVocabulary,
  searchVocabulary,
  categoriesOf,
  summarize,
} from './entries.js';
import {
  renderEntry,
  renderEntryList,
  renderVocabulary,
  renderSummary,
  renderCategoryChips,
  renderTranslation,
  renderUsage,
  showLoading,
  showError,
  hideStatus,
} from './render.js';

const $ = (selector) => document.querySelector(selector);

/**
 * 이벤트를 안전하게 건다. 요소가 없으면 조용히 넘어간다.
 *
 * 예전에는 `$('#x').addEventListener(...)` 를 죽 늘어놓았는데, 캐시가 엇갈려
 * HTML 과 JS 의 판본이 다르면 그 한 줄에서 예외가 나고 init 이 통째로
 * 멈췄다. 그러면 문장 데이터조차 안 불러온다. 한 부분이 없어도 나머지는
 * 돌아가야 한다.
 */
function on(selector, event, handler) {
  const node = $(selector);
  if (node) node.addEventListener(event, handler);
  return Boolean(node);
}

/** 읽어 온 항목들. 첫 렌더 전까지는 빈 배열. */
let entries = [];
let vocabulary = [];
let categories = [];

/* ── 날짜 ──────────────────────────────────────────────── */

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDateLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

/* ── 테마 ──────────────────────────────────────────────── */

function applyTheme() {
  const theme = settings.getTheme();
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

function prefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function toggleTheme() {
  const current = settings.getTheme();
  const effective = current === 'auto' ? (prefersDark() ? 'dark' : 'light') : current;
  settings.setTheme(effective === 'dark' ? 'light' : 'dark');
  applyTheme();
}

/* ── 복사 ──────────────────────────────────────────────── */

async function copyToClipboard(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = '복사했습니다';
  } catch {
    button.textContent = '복사하지 못했습니다';
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1600);
}

/* ── 키에 딸린 화면 ────────────────────────────────────── */

function refreshKeyDependentUi() {
  const hasKey = Boolean(apiKey.get());
  // 키는 번역기 탭에서만 쓰이므로, 배너와 사용량도 그 탭에서만 의미가 있다.
  $('#key-banner').hidden = hasKey || $('#panel-translate').hidden;
  $('#usage-box').hidden = !hasKey;
}

function refreshUsage() {
  if (!apiKey.get()) return;
  const model = findModel(settings.getModel());
  const totals = getTotals();
  renderUsage($('#usage-body'), { model, totals, rateLimit: getRateLimit() });
  $('#usage-brief').textContent =
    `${model.label} · 이번 달 ${formatUsd(totals.costUsd)} · ${totals.requests}회`;
}

/* ── 탭 ────────────────────────────────────────────────── */

const TABS = [
  ['#tab-daily', '#panel-daily'],
  ['#tab-browse', '#panel-browse'],
  ['#tab-vocab', '#panel-vocab'],
  ['#tab-translate', '#panel-translate'],
];

function selectTab(tabSelector) {
  for (const [tab, panel] of TABS) {
    const isActive = tab === tabSelector;
    $(tab).classList.toggle('is-active', isActive);
    $(tab).setAttribute('aria-selected', String(isActive));
    $(panel).hidden = !isActive;
  }
  refreshKeyDependentUi();
}

/* ── 오늘의 숙어 ───────────────────────────────────────── */

let shownPhrase = null;

function showEntryInDaily(entry) {
  shownPhrase = entry;
  if (!entry) {
    $('#daily-card').hidden = true;
    showError($('#daily-status'), 'data/entries.json 에 표현 항목이 아직 없습니다.');
    return;
  }
  hideStatus($('#daily-status'));
  renderEntry($('#daily-card'), entry, {
    onCopy: (button) => copyToClipboard([entry.ko, entry.el, entry.meaning].filter(Boolean).join('\n'), button),
  });
}

function loadDaily() {
  const date = today();
  $('#daily-date').textContent = formatDateLabel(date);
  showEntryInDaily(pickForDate(entries, date));
}

/* ── 모아보기 ──────────────────────────────────────────── */

let browseCategory = 'all';

function refreshBrowse() {
  const query = $('#browse-search').value;
  let list = search(entries, query);
  if (browseCategory !== 'all') list = list.filter((entry) => entry.category === browseCategory);

  $('#browse-count').textContent = `전체 ${entries.length}개 중 ${list.length}개`;
  renderCategoryChips($('#browse-filters'), categories, browseCategory, (name) => {
    browseCategory = name;
    refreshBrowse();
  });
  renderEntryList($('#browse-list'), list, (entry) => {
    renderEntry($('#browse-detail'), entry, {
      onCopy: (button) => copyToClipboard([entry.ko, entry.el].filter(Boolean).join('\n'), button),
    });
    $('#browse-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** 단어장에서 눌렀을 때 그 낱말이 나온 항목을 모아보기에서 펼친다. */
function openEntryById(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  selectTab('#tab-browse');
  $('#browse-search').value = '';
  browseCategory = 'all';
  refreshBrowse();
  renderEntry($('#browse-detail'), entry, {
    onCopy: (button) => copyToClipboard([entry.ko, entry.el].filter(Boolean).join('\n'), button),
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── 단어장 ────────────────────────────────────────────── */

function refreshVocabulary() {
  const list = searchVocabulary(vocabulary, $('#vocab-search').value);
  $('#vocab-count').textContent = `낱말 ${vocabulary.length}개 중 ${list.length}개`;
  renderVocabulary($('#vocab-list'), list, openEntryById);
}

/* ── 번역기 (키가 있을 때만) ───────────────────────────── */

let translateInFlight = false;

async function runTranslation(event) {
  if (event) event.preventDefault();
  if (translateInFlight) return;

  const text = $('#source-text').value.trim();
  const status = $('#translate-status');
  const result = $('#translate-result');

  if (!text) {
    showError(status, '번역할 내용을 입력해 주세요.');
    result.hidden = true;
    return;
  }

  const direction = document.querySelector('input[name="direction"]:checked').value;

  translateInFlight = true;
  $('#translate-btn').disabled = true;
  result.hidden = true;
  showLoading(status, '번역하고 낱말을 풀이하는 중입니다…');

  try {
    const data = await translate({ text, direction });
    hideStatus(status);
    renderTranslation(result, data, {
      onCopy: (button) => copyToClipboard(data.translation || '', button),
    });
  } catch (error) {
    showError(status, describeError(error));
    refreshKeyDependentUi();
  } finally {
    translateInFlight = false;
    $('#translate-btn').disabled = false;
  }
}

/* ── 설정 ──────────────────────────────────────────────── */

function describeModelPrice(modelId) {
  const model = findModel(modelId);
  return `${model.blurb} · 입력 $${model.inputPerMTok} / 출력 $${model.outputPerMTok} (100만 토큰당)`;
}

function buildModelOptions() {
  const select = $('#model-select');
  select.replaceChildren();
  for (const model of MODELS) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = `${model.label} — ${model.blurb}`;
    select.append(option);
  }
  select.addEventListener('change', () => {
    $('#model-price').textContent = describeModelPrice(select.value);
  });
}

function openSettings() {
  $('#api-key').value = apiKey.get();
  $('#model-select').value = settings.getModel();
  $('#model-price').textContent = describeModelPrice(settings.getModel());
  $('#effort-select').value = settings.getEffort();
  $('#settings-dialog').showModal();
}

function saveSettings() {
  apiKey.set($('#api-key').value.trim());
  settings.setModel($('#model-select').value);
  settings.setEffort($('#effort-select').value);
  $('#settings-dialog').close();
  refreshKeyDependentUi();
  refreshUsage();
}

/* ── 초기화 ────────────────────────────────────────────── */

async function init() {
  applyTheme();
  buildModelOptions();
  setUsageListener(refreshUsage);

  on('#theme-toggle', 'click', toggleTheme);
  on('#open-settings', 'click', openSettings);
  for (const button of document.querySelectorAll('[data-open-settings]')) {
    button.addEventListener('click', openSettings);
  }
  on('#settings-save', 'click', saveSettings);
  on('#settings-cancel', 'click', () => $('#settings-dialog').close());
  on('#clear-key', 'click', () => {
    apiKey.clear();
    $('#api-key').value = '';
    refreshKeyDependentUi();
  });

  for (const [tab] of TABS) {
    $(tab).addEventListener('click', () => selectTab(tab));
  }

  on('#daily-refresh', 'click', () => {
    showEntryInDaily(nextPhrase(entries, shownPhrase && shownPhrase.id));
  });

  on('#browse-search', 'input', refreshBrowse);

  on('#vocab-search', 'input', refreshVocabulary);

  on('#translate-form', 'submit', runTranslation);
  on('#clear-btn', 'click', () => {
    $('#source-text').value = '';
    $('#char-count').textContent = '0자';
    hideStatus($('#translate-status'));
    $('#translate-result').hidden = true;
    $('#source-text').focus();
  });
  on('#source-text', 'input', (event) => {
    $('#char-count').textContent = `${event.target.value.length}자`;
  });
  on('#source-text', 'keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runTranslation();
  });

  on('#usage-reset', 'click', () => {
    if (!window.confirm('이번 달 누적 사용량 기록을 지울까요? 실제 청구액과는 무관합니다.')) return;
    resetTotals();
    refreshUsage();
  });

  refreshKeyDependentUi();
  refreshUsage();

  // 데이터가 사이트의 본체다. 이것만 읽히면 키 없이 전부 동작한다.
  showLoading($('#daily-status'), '문장을 불러오는 중입니다…');
  try {
    entries = await loadEntries();
    vocabulary = buildVocabulary(entries);
    categories = categoriesOf(entries);
    renderSummary($('#summary'), summarize(entries, vocabulary));
    loadDaily();
    refreshBrowse();
    refreshVocabulary();
  } catch (error) {
    showError($('#daily-status'), error.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
