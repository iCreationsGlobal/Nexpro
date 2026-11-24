/**
 * Online Store search: finds and ranks listings by what shoppers see, name first.
 *
 * Every word must match. A name can match a whole word, the start of one, or (longer words) the inside of
 * one, so "book" finds "Notebook". A description only counts for a whole word, and ranks last: matching
 * part of a word there is how "stand" used to find every "Standard" and "Standby".
 */

const SCORE = {
  nameWord: 100, sku: 90, nameStart: 60, categoryWord: 40, categoryStart: 30, nameInside: 20, descriptionWord: 10, phrase: 50,
};
const MIN_START_LENGTH = 3;
const MIN_INSIDE_LENGTH = 4;
/** Different names shoppers and sellers use for the same thing. */
const SAME_THING = [
  [['ac'], ['aircon'], ['air', 'conditioner'], ['air', 'conditioning']],
  [['fridge'], ['refrigerator']],
  [['tv'], ['television']],
];
const FILLER_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

const normalize = (value) => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

const splitWords = (value) => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];

/** "stands" and "stand", "batteries" and "battery" are the same word. */
const singular = (word) => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
};

/** Words of a text, plus "Wi-Fi" as "wifi". */
const indexWords = (value) => {
  const joined = (normalize(value).match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu) || []).map((word) => word.replace(/-/g, ''));
  return [...splitWords(value), ...joined];
};

const buildIndex = (item) => {
  const name = item?.title || item?.name || '';
  const category = item?.category?.name || item?.categoryName || (typeof item?.category === 'string' ? item.category : '');
  const nameWords = indexWords(name);
  const categoryWords = indexWords(category);
  const description = `${item?.shortDescription || ''} ${item?.description || ''}`.replace(/<[^>]*>/g, ' ');
  return {
    nameWords,
    nameSet: new Set(nameWords.map(singular)),
    namePhrase: ` ${splitWords(name).map(singular).join(' ')} `,
    nameJoined: splitWords(name).join(''),
    categoryWords,
    categorySet: new Set(categoryWords.map(singular)),
    descriptionSet: new Set(indexWords(description).map(singular)),
    sku: splitWords(item?.sku).join(''),
  };
};

// Listings are re-filtered on every render; index each one once.
const indexCache = new WeakMap();
const getIndex = (item) => {
  if (!indexCache.has(item)) indexCache.set(item, buildIndex(item));
  return indexCache.get(item);
};

const scoreWord = (word, index, minStartLength) => {
  const base = singular(word);
  const canStart = word.length >= minStartLength;
  const canBeInside = word.length >= MIN_INSIDE_LENGTH;
  if (index.nameSet.has(base)) return SCORE.nameWord;
  if (canStart && index.sku.startsWith(word)) return SCORE.sku;
  if (canStart && index.nameWords.some((nameWord) => nameWord.startsWith(word))) return SCORE.nameStart;
  if (index.categorySet.has(base)) return SCORE.categoryWord;
  if (canStart && index.categoryWords.some((categoryWord) => categoryWord.startsWith(word))) return SCORE.categoryStart;
  // Joined, so "flashdrive" finds "Flash Drive".
  if (canBeInside && index.nameJoined.includes(word)) return SCORE.nameInside;
  if (index.descriptionSet.has(base)) return SCORE.descriptionWord;
  return 0;
};

/** A term can be written several ways; each way is a list of words that must all match. */
const scoreTerm = (ways, index, minStartLength) => Math.max(...ways.map(
  (words) => Math.min(...words.map((word) => scoreWord(word, index, minStartLength))),
));

/** "wi-fi" can be "wifi" or "wi" and "fi"; "ac" can be "air conditioner". */
const parseTerms = (query) => {
  const typed = String(query ?? '').trim().split(/\s+/).map(splitWords).filter((words) => words.length);
  const meaningful = typed.filter((words) => !FILLER_WORDS.has(words.join('')));
  const chunks = meaningful.length ? meaningful : typed;
  const terms = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const isNext = (words) => words.every((word, n) => chunks[i + n]?.length === 1 && singular(chunks[i + n][0]) === word);
    const same = SAME_THING.find((names) => names.some(isNext));
    if (same) {
      terms.push(same);
      i += same.find(isNext).length - 1;
    } else {
      const words = chunks[i];
      terms.push(words.length > 1 ? [words, [words.join('')]] : [words]);
    }
  }
  return { terms, phrase: ` ${chunks.flat().map(singular).join(' ')} ` };
};

/**
 * @param {object[]} items
 * @param {string} query
 * @returns {object[]} Matching items, best first; equally good ones keep the catalog order.
 */
export const searchStoreListings = (items, query) => {
  const list = Array.isArray(items) ? items : [];
  const { terms, phrase } = parseTerms(query);
  if (!terms.length) return String(query ?? '').trim() ? [] : list;

  const search = (minStartLength) => list
    .filter((item) => item && typeof item === 'object')
    .map((item, position) => {
      const index = getIndex(item);
      const scores = terms.map((term) => scoreTerm(term, index, minStartLength));
      if (!scores.every(Boolean)) return null;
      const bonus = terms.length > 1 && index.namePhrase.includes(phrase) ? SCORE.phrase : 0;
      return { item, position, score: scores.reduce((sum, score) => sum + score, bonus) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ item }) => item);

  // One or two letters ("hp", "tv") mean that word. Only when nothing has it, treat them as a beginning.
  const matches = search(MIN_START_LENGTH);
  return matches.length ? matches : search(1);
};
