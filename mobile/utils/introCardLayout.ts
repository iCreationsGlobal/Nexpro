/** Shared frame dimensions for every marketing intro slide. */
export function getIntroCardLayout(width: number, stageHeight: number) {
  const cardWidth = Math.max(1, width - 34);
  const preferredHeight = ((cardWidth - 22) / 350) * 400 + 70;
  return {
    cardWidth,
    cardHeight: Math.max(1, Math.min(preferredHeight, stageHeight - 48)),
  };
}

/** Soft, consistent card elevation on iOS and Android. */
export const INTRO_CARD_SHADOW = {
  shadowColor: '#163d29',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 4,
};
