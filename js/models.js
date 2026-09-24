/**
 * 고를 수 있는 모델과 가격표.
 *
 * 가격 단위는 100만 토큰당 USD 이며, Anthropic 공식 가격표 기준이다.
 * 가격이 바뀌면 이 표만 고치면 된다.
 */

export const MODELS = [
  {
    id: 'claude-opus-5',
    label: 'Opus 5',
    blurb: '가장 정확 · 느리고 비쌈',
    inputPerMTok: 5,
    outputPerMTok: 25,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    blurb: '균형',
    inputPerMTok: 2,
    outputPerMTok: 10,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    blurb: '가장 빠르고 저렴',
    inputPerMTok: 1,
    outputPerMTok: 5,
  },
];

export const DEFAULT_MODEL = 'claude-opus-5';

export function findModel(id) {
  return MODELS.find((model) => model.id === id) || MODELS[0];
}

/**
 * 한 번의 응답에 대한 비용을 USD 로 추정한다.
 *
 * 이 앱은 프롬프트 캐싱을 쓰지 않아 캐시 토큰은 항상 0 이지만,
 * 값이 들어오더라도 누락되지 않도록 입력 토큰에 합산한다.
 */
export function estimateCost(modelId, usage) {
  const model = findModel(modelId);
  const input =
    (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  const output = usage.output_tokens || 0;
  return (input / 1e6) * model.inputPerMTok + (output / 1e6) * model.outputPerMTok;
}
