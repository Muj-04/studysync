/** Prompt input lengths, measured in JavaScript UTF-16 code units on both sides. */
export const AI_TEXT_LIMITS = {
  summary: 8000,
  flashcards: 6000,
  translate: 2000,
  explain: 2000,
  chat: 6000,
} as const;
export const AI_CHAT_MESSAGE_LIMIT = 1000;
export const AI_LANGUAGE_LIMIT = 100;
// Even worst-case JSON escaping (six bytes per code unit) fits these input limits.
export const AI_REQUEST_MAX_BYTES = 65536;
