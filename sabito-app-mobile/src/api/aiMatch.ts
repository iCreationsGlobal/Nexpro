/** Stub — AI match is not available on ABS marketer mobile. */
export const requestAIMatch = async () => {
  throw new Error('AI match is not available');
};
export const getAIMatchUsage = async () => ({ remaining: 0, limit: 0 });
export const saveAIMatch = async () => {
  throw new Error('AI match is not available');
};

export default { requestAIMatch, getAIMatchUsage, saveAIMatch };
