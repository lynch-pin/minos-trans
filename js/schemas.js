/**
 * Structured outputs 용 JSON 스키마.
 *
 * 제약(구조화 출력에서 지원하지 않는 것):
 *   - 재귀 스키마 불가
 *   - minLength / maximum 같은 수치·길이 제약 불가
 *   - 모든 object 는 additionalProperties:false, 모든 속성은 required 에 포함
 */

const str = { type: 'string' };

/** 단어 하나의 풀이. 번역기와 오늘의 숙어가 함께 쓴다. */
const wordGloss = {
  type: 'object',
  properties: {
    surface: { type: 'string', description: '원문에 나타난 그대로의 단어' },
    base_form: { type: 'string', description: '사전에 실리는 기본형. 원형과 같으면 같은 값을 넣는다.' },
    part_of_speech: { type: 'string', description: '품사를 한국어로. 예: 명사(여성), 동사, 전치사' },
    meaning: { type: 'string', description: '이 문맥에서의 한국어 뜻' },
    note: {
      type: 'string',
      description: '어형 변화, 굳어진 표현, 주의할 점 등. 덧붙일 말이 없으면 빈 문자열.',
    },
  },
  required: ['surface', 'base_form', 'part_of_speech', 'meaning', 'note'],
  additionalProperties: false,
};

/* ── 오늘의 숙어 ───────────────────────────────────────── */

export const IDIOM_SCHEMA = {
  type: 'object',
  properties: {
    korean: { type: 'string', description: '한국어 숙어·속담·관용구 원문' },
    romanization: { type: 'string', description: '국어의 로마자 표기법에 따른 발음' },
    literal_meaning: { type: 'string', description: '글자 그대로의 뜻 (한국어)' },
    figurative_meaning: { type: 'string', description: '실제로 쓰이는 속뜻 (한국어)' },
    korean_words: {
      type: 'array',
      description: '한국어 숙어를 이루는 낱말들의 풀이',
      items: wordGloss,
    },
    greek: { type: 'string', description: '그리스어로 자연스럽게 옮긴 번역' },
    greek_literal: { type: 'string', description: '한국어 표현을 직역한 그리스어. 자연스럽지 않아도 된다.' },
    greek_words: {
      type: 'array',
      description: 'greek 필드에 쓰인 그리스어 낱말들의 풀이',
      items: wordGloss,
    },
    greek_equivalent: {
      type: 'object',
      description: '뜻이 통하는 그리스 고유의 관용 표현',
      properties: {
        phrase: { type: 'string', description: '그리스어 관용구. 마땅한 것이 없으면 빈 문자열.' },
        literal_korean: { type: 'string', description: '그 관용구의 직역' },
        note: { type: 'string', description: '쓰임새의 차이나 뉘앙스 설명' },
      },
      required: ['phrase', 'literal_korean', 'note'],
      additionalProperties: false,
    },
    example: {
      type: 'object',
      description: '숙어를 쓴 짧은 예문 한 쌍',
      properties: {
        greek: str,
        korean: str,
      },
      required: ['greek', 'korean'],
      additionalProperties: false,
    },
    usage_note: { type: 'string', description: '어떤 상황에서 쓰는지, 격식 여부 등 (한국어)' },
  },
  required: [
    'korean',
    'romanization',
    'literal_meaning',
    'figurative_meaning',
    'korean_words',
    'greek',
    'greek_literal',
    'greek_words',
    'greek_equivalent',
    'example',
    'usage_note',
  ],
  additionalProperties: false,
};

/* ── 자유 번역 ─────────────────────────────────────────── */

export const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    source_language: {
      type: 'string',
      enum: ['ko', 'el', 'other'],
      description: '원문의 언어',
    },
    target_language: {
      type: 'string',
      enum: ['ko', 'el'],
      description: '번역문의 언어',
    },
    translation: { type: 'string', description: '가장 자연스러운 최종 번역문' },
    literal_translation: {
      type: 'string',
      description: '구조를 그대로 옮긴 직역. 최종 번역과 같다면 같은 값을 넣는다.',
    },
    words: {
      type: 'array',
      description: '번역문에 쓰인 낱말들을 나온 순서대로 풀이한다.',
      items: wordGloss,
    },
    grammar_notes: {
      type: 'array',
      description: '어순, 격, 관사, 동사 활용 등 짚어 둘 문법 사항 (한국어). 없으면 빈 배열.',
      items: str,
    },
    alternatives: {
      type: 'array',
      description: '문맥에 따라 쓸 수 있는 다른 번역. 없으면 빈 배열.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '대안 번역문' },
          note: { type: 'string', description: '언제 이쪽이 더 나은지 (한국어)' },
        },
        required: ['text', 'note'],
        additionalProperties: false,
      },
    },
    caution: {
      type: 'string',
      description: '원문이 모호하거나 오타로 보이는 등 알려 줄 점 (한국어). 없으면 빈 문자열.',
    },
  },
  required: [
    'source_language',
    'target_language',
    'translation',
    'literal_translation',
    'words',
    'grammar_notes',
    'alternatives',
    'caution',
  ],
  additionalProperties: false,
};
