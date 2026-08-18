/**
 * Ratings are not part of ABS marketer API yet.
 * Stub keeps orphaned review modals from breaking Metro if imported.
 */
export const submitBusinessRating = async () => {
  throw new Error('Business ratings are not available yet');
};

export const getMyBusinessRating = async () => null;

export const submitMarketerRating = async () => {
  throw new Error('Marketer ratings are not available yet');
};

export const getMyMarketerRating = async () => null;

export default {
  submitBusinessRating,
  getMyBusinessRating,
  submitMarketerRating,
  getMyMarketerRating,
};
