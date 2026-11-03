type AnyVariant = { name?: unknown; attributes?: { size?: string; color?: string } | null } & Record<string, unknown>;
export type OptionCombo = { key: string; name: string; size: string; color: string };

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** Typed sizes or colours ("Size 5, Size 6, Size 7"): split on commas or new lines, trimmed, each kept once. */
export function splitOptionList(text: unknown): string[] {
  const seen = new Set<string>();
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
export const optionName = (size?: unknown, color?: unknown) =>
  [size, color].map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ');

/** The sizes and colours a product's options already have, as text for the two boxes. */
export function optionListsFromVariants(variants: AnyVariant[] = []) {
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
 */
export function newOptionCombos(sizesText: unknown, colorsText: unknown, existingVariants: AnyVariant[] = []): OptionCombo[] {
  const sizes = splitOptionList(sizesText);
  const colors = splitOptionList(colorsText);
  const rows = Array.isArray(existingVariants) ? existingVariants : [];
  const takenPairs = new Set<string>();
  const takenNames = new Set<string>();
  const knownSizes = new Set<string>();
  const knownColors = new Set<string>();
  rows.forEach((v) => {
    const size = v?.attributes?.size;
    const color = v?.attributes?.color;
    if (size || color) takenPairs.add(`${lower(size)}|${lower(color)}`);
    if (v?.name) takenNames.add(lower(v.name));
    if (size) knownSizes.add(lower(size));
    if (color) knownColors.add(lower(color));
  });

  const pairs: Array<[string, string]> = sizes.length && colors.length
    ? sizes.flatMap((size) => colors.map((color): [string, string] => [size, color]))
    : [...sizes.map((size): [string, string] => [size, '']), ...colors.map((color): [string, string] => ['', color])];

  return pairs
    .filter(([size, color]) => {
      if (takenPairs.has(`${lower(size)}|${lower(color)}`) || takenNames.has(lower(optionName(size, color)))) return false;
      if (rows.length === 0) return true;
      return Boolean((size && !knownSizes.has(lower(size))) || (color && !knownColors.has(lower(color))));
    })
    .map(([size, color]) => ({ key: `${lower(size)}|${lower(color)}`, name: optionName(size, color), size, color }));
}

/**
 * Options grouped under their size (the main option) when they also have a colour, e.g.
 * Size 5 → Blue, Black. Options with only a size or only a colour share one group with no size.
 */
export function groupOptionsBySize(options: OptionCombo[] = []) {
  return options.reduce<Array<{ size: string; options: OptionCombo[] }>>((groups, option) => {
    const size = option.size && option.color ? option.size : '';
    const last = groups[groups.length - 1];
    if (last && last.size === size) last.options.push(option);
    else groups.push({ size, options: [option] });
    return groups;
  }, []);
}
