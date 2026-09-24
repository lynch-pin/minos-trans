/**
 * 발음 듣기.
 *
 * 두 가지 방법을 순서대로 시도한다.
 *
 *  1) 브라우저 내장 음성 합성(Web Speech API) — 기기에 그리스어 목소리가
 *     있으면 이쪽을 우선 쓴다. 대개 음질이 더 자연스럽다.
 *  2) `data/audio/` 에 미리 만들어 둔 mp3 — espeak-ng 로 제작 시점에 생성해
 *     레포에 넣어 둔 파일이다(`tools/gen-audio.py`). 기기에 그리스어 목소리가
 *     없어도 항상 동작하므로, 듣기 버튼이 기기에 따라 사라지는 문제가 없다.
 *
 * 둘 다 외부 서버나 API 키 없이 동작한다 — mp3 는 이미 레포 안에 들어 있는
 * 정적 파일이다.
 *
 * 주의: Web Speech 의 voice 객체를 오래 들고 있으면 안 된다. 브라우저가
 * 목록을 다시 채울 때 예전 객체가 무효가 되고, 조용히 시스템 기본 음성
 * (한국 사용자면 한국어)으로 넘어가 버린다. 그래서 읽기 직전에 항상
 * getVoices() 에서 새로 찾는다.
 */

const LANG = 'el-GR';
const PREF_KEY = 'accurate-translator:voiceName';
const AUDIO_MANIFEST_URL = 'data/audio/manifest.json';
const AUDIO_DIR = 'data/audio/';

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

/* ── 미리 만들어 둔 오디오(대체 수단) ────────────────────── */

let audioManifest = {};
let manifestLoaded = false;
let manifestPromise = null;

/**
 * data/audio/manifest.json 을 한 번만 읽는다. 텍스트 원문 → mp3 파일명 맵이다.
 * 화면이 뜨자마자 init() 에서 불러 두면, 카드를 그릴 때는 이미 준비돼 있다.
 */
export function loadAudioManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(AUDIO_MANIFEST_URL, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => {
      audioManifest = data && typeof data === 'object' ? data : {};
    })
    .catch(() => {
      audioManifest = {};
    })
    .finally(() => {
      manifestLoaded = true;
      notify();
    });
  return manifestPromise;
}

function localAudioUrl(text) {
  const filename = audioManifest[text];
  return filename ? AUDIO_DIR + filename : null;
}

let currentAudio = null;

/** 기기 음성도 미리 만든 오디오도 하나도 없는가 — 이때만 안내 문구를 띄운다. */
export function hasNoAudioAtAll() {
  return resolveVoice() === null && manifestLoaded && Object.keys(audioManifest).length === 0;
}

/* ── 공용 API ──────────────────────────────────────────── */

/** 이 텍스트를 읽어 줄 수 있는 상태인가 (기기 음성 또는 미리 만든 오디오). */
export function canSpeak(text) {
  if (resolveVoice() !== null) return true;
  return Boolean(text && localAudioUrl(text));
}

/** 목소리·오디오 목록 상태가 바뀌면 알려 준다. 화면이 버튼을 다시 그리는 데 쓴다. */
export function onVoiceChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 지금 실제로 쓰이는 기기 음성. 설정 화면이 보여 준다. null 이면 대체 오디오를 쓴다는 뜻. */
export function currentVoice() {
  const voice = resolveVoice();
  return voice ? { name: voice.name, lang: voice.lang } : null;
}

/** 기기가 가진 음성 총 개수 — 진단용. */
export function voiceCount() {
  return allVoices().length;
}

export function stop() {
  if (supported()) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
}

/**
 * 읽어 준다. 기기에 그리스어 음성이 있으면 그걸, 없으면 미리 만든 오디오를 쓴다.
 * @param {string} text
 * @param {{rate?: number, onStart?: () => void, onEnd?: () => void}} [options]
 * @returns {boolean} 읽기를 시작했는지
 */
export function speak(text, options = {}) {
  if (!text) return false;
  stop(); // 앞의 것이 남아 있으면 겹쳐 들린다. 항상 끊고 시작한다.

  const voice = resolveVoice();
  if (voice) {
    if (!supported()) return false;
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

  const url = localAudioUrl(text);
  if (!url) return false;
  const audio = new Audio(url);
  audio.playbackRate = options.rate || 1;
  currentAudio = audio;
  if (options.onStart) audio.addEventListener('play', options.onStart);
  if (options.onEnd) {
    audio.addEventListener('ended', options.onEnd);
    audio.addEventListener('error', options.onEnd);
  }
  // 자동재생 정책 등으로 play() 가 거부될 수 있다 — 조용히 실패하고 버튼 상태만 되돌린다.
  audio.play().catch(() => {
    if (options.onEnd) options.onEnd();
  });
  return true;
}

/** 배우는 사람이 따라 하기 좋은 느린 속도. */
export const SLOW_RATE = 0.65;
