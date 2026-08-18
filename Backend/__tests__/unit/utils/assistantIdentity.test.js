const {
  ASSISTANT_DISPLAY_NAME,
  ASSISTANT_IDENTITY_RULES,
  sanitizeAssistantDisplayName,
} = require('../../../utils/assistantIdentity');

describe('assistantIdentity', () => {
  it('uses Ayebia as the user-facing name', () => {
    expect(ASSISTANT_DISPLAY_NAME).toBe('Ayebia');
    expect(ASSISTANT_IDENTITY_RULES).toMatch(/I'm Ayebia/);
    expect(ASSISTANT_IDENTITY_RULES).toMatch(/Never call yourself iBIS/);
  });

  it('rewrites the Campbell Italia-style iBIS greeting', () => {
    const raw = `Hello! I'm iBIS. 👋

I'm here to help you with Campbell Italia's business strategy...`;
    const out = sanitizeAssistantDisplayName(raw);
    expect(out).toContain("Hello! I'm Ayebia. 👋");
    expect(out).not.toMatch(/iBIS/i);
  });
});
