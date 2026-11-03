import { describe, expect, it } from 'vitest';
import { groupOptionsBySize, newOptionCombos, optionListsFromVariants, optionName, splitOptionList } from '../../utils/productOptions';

describe('splitOptionList', () => {
  it('splits on commas and new lines, trims, and keeps each one once', () => {
    expect(splitOptionList(' Size 5,size 6 ,, Size  7\nSIZE 5 ')).toEqual(['Size 5', 'size 6', 'Size 7']);
    expect(splitOptionList(undefined)).toEqual([]);
  });

  it('keeps dashes and slashes inside a name', () => {
    expect(splitOptionList('Off-white, Black/White')).toEqual(['Off-white', 'Black/White']);
  });
});

describe('newOptionCombos', () => {
  it('puts every colour under every size', () => {
    const combos = newOptionCombos('Size 5, Size 6', 'Blue, Red');
    expect(combos.map((c) => c.name)).toEqual(['Size 5 / Blue', 'Size 5 / Red', 'Size 6 / Blue', 'Size 6 / Red']);
    expect(combos[0]).toMatchObject({ size: 'Size 5', color: 'Blue' });
  });

  it('uses one list on its own when the other box is empty', () => {
    expect(newOptionCombos('', 'Blue, Black, Red').map((c) => c.name)).toEqual(['Blue', 'Black', 'Red']);
    expect(newOptionCombos('5, 6', ' ').map((c) => c.size)).toEqual(['5', '6']);
  });

  it('leaves out options already there and only adds ones with a newly typed value', () => {
    const existing = [
      { id: 'a', name: 'Size 5 / Blue', attributes: { size: 'Size 5', color: 'Blue' } },
      { id: 'b', name: 'Size 6 / Red', attributes: { size: 'Size 6', color: 'Red' } },
    ];
    const { sizes, colors } = optionListsFromVariants(existing);
    expect([sizes, colors]).toEqual(['Size 5, Size 6', 'Blue, Red']);
    // Nothing typed yet: the gaps (Size 5 / Red, Size 6 / Blue) are not filled by themselves.
    expect(newOptionCombos(sizes, colors, existing)).toEqual([]);
    expect(newOptionCombos(`${sizes}, Size 7`, colors, existing).map((c) => c.name)).toEqual(['Size 7 / Blue', 'Size 7 / Red']);
  });

  it('matches options by name when they have no size or colour saved', () => {
    expect(newOptionCombos('large, Small', '', [{ id: 'a', name: 'Large' }]).map((c) => c.name)).toEqual(['Small']);
  });
});

describe('groupOptionsBySize', () => {
  it('groups colours under their size, and single options together', () => {
    expect(groupOptionsBySize(newOptionCombos('5, 6', 'Blue, Red')).map((g) => [g.size, g.options.map((o) => o.color)]))
      .toEqual([['5', ['Blue', 'Red']], ['6', ['Blue', 'Red']]]);
    expect(groupOptionsBySize(newOptionCombos('', 'Blue, Red'))).toHaveLength(1);
  });
});

describe('optionName', () => {
  it('joins size and colour', () => {
    expect(optionName('Size 5', 'Blue')).toBe('Size 5 / Blue');
    expect(optionName('', 'Blue')).toBe('Blue');
  });
});
