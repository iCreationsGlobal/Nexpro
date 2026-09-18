import { adinkraMotifs as motifs } from './adinkraMotifs';

/** Online-sourced Adinkra vectors, bundled locally for offline startup. */
export const bootPatternLayers = [0, 1, 2].map(layer => {
  const symbols = Array.from({ length: 35 }, (_, index) => {
    if (index % 3 !== layer) return '';
    const row = Math.floor(index / 5);
    const x = (index % 5) * 90 - 20 + (row % 2 ? 25 : 0);
    const y = row * 95 + [0, 9, -4, 6, -2][index % 5];
    const size = [1, 0.85, 0.95, 0.9][index % 4];
    return `<g transform="translate(${x} ${y}) scale(${size})" opacity="${0.3 + row * 0.09}"><use href="#motif-${layer}-${(index * 4 + Math.floor(index / motifs.length)) % motifs.length}"/></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 660"><defs>${motifs.map((motif, i) => `<g id="motif-${layer}-${i}">${motif}</g>`).join('')}</defs><g color="#21644d">${symbols}</g></svg>`;
});
