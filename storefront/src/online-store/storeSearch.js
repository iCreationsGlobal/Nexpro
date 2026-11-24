/**
 * Online Store search: finds and ranks listings by what shoppers see, name first.
 *
 * Every word must match. A name can match a whole word, the start of one, or (longer words) the inside of
 * one, so "book" finds "Notebook". A description only counts for a whole word, and ranks last: matching
 * part of a word there is how "stand" used to find every "Standard" and "Standby".
 */

// === Search core: keep identical in storefront/src/online-store/storeSearch.js and Backend/utils/listingSearch.js
const SCORE = {
  nameWord: 100, sku: 90, nameStart: 60, categoryWord: 40, categoryStart: 30, seller: 25, nameInside: 20, descriptionWord: 10, phrase: 50,
};
const MAX_QUERY_LENGTH = 100;
const MAX_TERMS = 8;
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
const indexWords = (value) => normalize(value).split(/[^\p{L}\p{N}-]+/u).flatMap((chunk) => {
  const parts = chunk.split('-').filter(Boolean);
  return parts.length > 1 ? [...parts, parts.join('')] : parts;
});

const buildIndex = ({ name, category, seller, description, sku }) => {
  const nameWords = indexWords(name);
  const categoryWords = indexWords(category);
  return {
    nameWords,
    nameSet: new Set(nameWords.map(singular)),
    namePhrase: ` ${splitWords(name).map(singular).join(' ')} `,
    nameJoined: splitWords(name).join(''),
    categoryWords,
    categorySet: new Set(categoryWords.map(singular)),
    sellerSet: new Set(indexWords(seller).map(singular)),
    descriptionSet: new Set(indexWords(String(description ?? '').replace(/<[^>]*>/g, ' ')).map(singular)),
    sku: splitWords(sku).join(''),
  };
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
  if (index.sellerSet.has(base)) return SCORE.seller;
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
  const typed = String(query ?? '').slice(0, MAX_QUERY_LENGTH).split(/\s+/).map(splitWords).filter((words) => words.length);
  const meaningful = typed.filter((words) => !FILLER_WORDS.has(words.join('')));
  const chunks = (meaningful.length ? meaningful : typed).slice(0, MAX_TERMS);
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
 * @param {(item: object) => { name?: string, category?: string, seller?: string, description?: string, sku?: string }} readFields
 * @returns {(items: object[], query: string) => object[]} Matching items, best first; equally good ones keep their order.
 */
const createListingSearch = (readFields) => {
  const indexes = new WeakMap();
  const getIndex = (item) => {
    if (!indexes.has(item)) indexes.set(item, buildIndex(readFields(item)));
    return indexes.get(item);
  };

  return (items, query) => {
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
};
// === End of search core

/** Online Store listings: products, or services (whose category is plain text). */
export const searchStoreListings = createListingSearch((item) => ({
  name: item.title || item.name,
  category: item.category?.name || item.categoryName || (typeof item.category === 'string' ? item.category : ''),
  description: `${item.shortDescription || ''} ${item.description || ''}`,
  sku: item.sku,
}));
