/** Google auth removed for ABS marketer mobile (email/password only). */
export const useGoogleAuth = () => ({
  request: null,
  response: null,
  promptAsync: async () => ({ type: 'dismiss' }),
});

export default { useGoogleAuth };
