/**
 * 발음 듣기 — 브라우저에 내장된 음성 합성(Web Speech API)을 쓴다.
 *
 * 외부 API 도 키도 쓰지 않는다. 목소리는 사용자의 운영체제가 제공하므로
 * 기기에 그리스어 목소리가 없으면 동작하지 않는다. 그 경우 조용히 실패하지
 * 않고 버튼을 감춘 뒤 안내를 띄운다 — 엉뚱한 언어 목소리로 그리스어를
 * 읽어 주면 발음을 배우는 데 해롭기 때문이다.
 *
 * 주의: voice 객체를 오래 들고 있으면 안 된다. 브라우저가 목록을 다시 채울 때
 * 예전 객체를 무효로 보고 조용히 시스템 기본 음성(한국 사용자면 한국어)으로
 * 넘어가 버린다. 그래서 읽기 직전에 항상 getVoices() 에서 새로 찾는다.
 */

const LANG = 'el-GR';
const PREF_KEY = 'accurate-translator:voiceName';

const listeners = new Set();
let lastCount = -1;

function supported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function allVoices() {
  if (!supported()) return [];
  return window.speechSynthesis.getVoices() || [];
}

/** 기기에 있는 그리스어 목소리들. */
export function greekVoices() {
  return allVoices().filter((voice) => (voice.lang || '').toLowerCase().startsWith('el'));
}

/** 사용자가 설정에서 고른 목소리 이름. 없으면 ''. */
function preferredName() {
  try {
    return localStorage.getItem(PREF_KEY) || '';
  } catch {
    return '';
  }
}

export function setPreferredVoice(name) {
  try {
    if (name) localStorage.setItem(PREF_KEY, name);
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* 저장 불가 환경 — 이번 세션만 기본값으로 동작한다. */
  }
  notify();
}

/**
 * 지금 쓸 그리스어 목소리를 **그 자리에서** 고른다.
 * 캐시하지 않는 것이 핵심이다. 위 주석 참고.
 */
function resolveVoice() {
  const greek = greekVoices();
  if (!greek.length) return null;

  const wanted = preferredName();
  if (wanted) {
    const hit = greek.find((voice) => voice.name === wanted);
    if (hit) return hit;
  }
  // 기기에 딸려 오는 목소리(localService)가 대개 더 빠르고 안정적이다.
  return greek.find((voice) => voice.localService) || greek[0];
}

function notify() {
  for (const listener of listeners) listener();
}

function pollVoices() {
  const count = allVoices().length;
  if (count !== lastCount) {
    lastCount = count;
    notify();
  }
}

if (supported()) {
  lastCount = allVoices().length;
  // 목록은 비동기로 채워진다. voiceschanged 를 안 쏘는 브라우저가 있어
  // 잠깐 동안만 함께 폴링한다.
  window.speechSynthesis.addEventListener('voiceschanged', pollVoices);
  let ticks = 0;
  const timer = setInterval(() => {
    pollVoices();
    if (++ticks >= 10 || greekVoices().length) clearInterval(timer);
  }, 250);
}

/** 그리스어를 읽어 줄 수 있는 상태인가. */
export function canSpeak() {
  return supported() && resolveVoice() !== null;
}

/** 목소리 목록이 바뀌면 알려 준다. 화면이 버튼을 다시 그리는 데 쓴다. */
export function onVoiceChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 지금 실제로 쓰이는 목소리. 설정 화면이 보여 준다. */
export function currentVoice() {
  const voice = resolveVoice();
  return voice ? { name: voice.name, lang: voice.lang } : null;
}

/** 기기가 가진 목소리 총 개수 — 진단용. */
export function voiceCount() {
  return allVoices().length;
}

export function stop() {
  if (supported()) window.speechSynthesis.cancel();
}

/**
 * 읽어 준다.
 * @param {string} text
 * @param {{rate?: number, onStart?: () => void, onEnd?: () => void}} [options]
 * @returns {boolean} 읽기를 시작했는지
 */
export function speak(text, options = {}) {
  if (!supported() || !text) return false;

  const voice = resolveVoice();
  if (!voice) return false;

  // 앞의 것이 남아 있으면 겹쳐 들린다. 항상 끊고 시작한다.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  // voice 를 무시하고 lang 으로만 고르는 엔진이 있어 둘 다 지정한다.
  utterance.lang = voice.lang || LANG;
  utterance.rate = options.rate || 1;

  if (options.onStart) utterance.addEventListener('start', options.onStart);
  if (options.onEnd) {
    utterance.addEventListener('end', options.onEnd);
    utterance.addEventListener('error', options.onEnd);
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

/** 배우는 사람이 따라 하기 좋은 느린 속도. */
export const SLOW_RATE = 0.65;
