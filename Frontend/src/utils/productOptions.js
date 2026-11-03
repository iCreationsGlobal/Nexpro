const lower = (value) => String(value ?? '').trim().toLowerCase();

/** Typed sizes or colours ("Size 5, Size 6, Size 7"): split on commas or new lines, trimmed, each kept once. */
export function splitOptionList(text) {
  const seen = new Set();
  return String(text ?? '')
    .split(/[,\n]/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => {
      const key = part.toLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** An option's name from its size and colour, e.g. "Size 5 / Blue". */
export const optionName = (size, color) => [size, color].map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ');

/** The sizes and colours a product's options already have, as text for the two boxes. */
export function optionListsFromVariants(variants = []) {
  const rows = Array.isArray(variants) ? variants : [];
  return {
    sizes: splitOptionList(rows.map((v) => v?.attributes?.size || '').join('\n')).join(', '),
    colors: splitOptionList(rows.map((v) => v?.attributes?.color || '').join('\n')).join(', '),
  };
}

/**
 * The options to add for the typed sizes and colours: every size in every colour, or each one on its
 * own when only one box is filled, leaving out those the product already has. When it already has
 * options, only ones using a newly typed size or colour are added, so a gap left on purpose stays.
 *
 * @returns {Array<{ key: string, name: string, size: string, color: string }>}
 */
export function newOptionCombos(sizesText, colorsText, existingVariants = []) {
  const sizes = splitOptionList(sizesText);
  const colors = splitOptionList(colorsText);
  const rows = Array.isArray(existingVariants) ? existingVariants : [];
  const takenPairs = new Set();
  const takenNames = new Set();
  const knownSizes = new Set();
  const knownColors = new Set();
  rows.forEach((v) => {
    const size = v?.attributes?.size;
    const color = v?.attributes?.color;
    if (size || color) takenPairs.add(`${lower(size)}|${lower(color)}`);
    if (v?.name) takenNames.add(lower(v.name));
    if (size) knownSizes.add(lower(size));
    if (color) knownColors.add(lower(color));
  });

  const pairs = sizes.length && colors.length
    ? sizes.flatMap((size) => colors.map((color) => [size, color]))
    : [...sizes.map((size) => [size, '']), ...colors.map((color) => ['', color])];

  return pairs
    .filter(([size, color]) => {
      if (takenPairs.has(`${lower(size)}|${lower(color)}`) || takenNames.has(lower(optionName(size, color)))) return false;
      if (rows.length === 0) return true;
      return (size && !knownSizes.has(lower(size))) || (color && !knownColors.has(lower(color)));
    })
    .map(([size, color]) => ({ key: `${lower(size)}|${lower(color)}`, name: optionName(size, color), size, color }));
}

/**
 * Options grouped under their size (the main option) when they also have a colour, e.g.
 * Size 5 → Blue, Black. Options with only a size or only a colour share one group with no size.
 */
export function groupOptionsBySize(options = []) {
  return options.reduce((groups, option) => {
    const size = option.size && option.color ? option.size : '';
    const last = groups[groups.length - 1];
    if (last && last.size === size) last.options.push(option);
    else groups.push({ size, options: [option] });
    return groups;
  }, []);
}
