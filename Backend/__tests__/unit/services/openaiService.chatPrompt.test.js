jest.mock('../../../models', () => ({}));
jest.mock('../../../services/tenantAiSettingsService', () => ({
  getTenantAnthropicApiKey: jest.fn(),
}));

const { buildChatSystemPrompt } = require('../../../services/openaiService');

describe('buildChatSystemPrompt identity', () => {
  const context = {
    tenantName: 'Campbell Italia',
    businessType: 'shop',
    workspaceContact: { businessName: 'Campbell Italia' },
  };

  it('names Ayebia in advisory mode and never iBIS', () => {
    const prompt = buildChatSystemPrompt(context, { mode: 'advisory', businessType: 'shop' });
    expect(prompt).toMatch(/^You are Ayebia, the business intelligence assistant for Campbell Italia/);
    expect(prompt).toMatch(/I'm Ayebia/);
    expect(prompt).toMatch(/Never call yourself iBIS/);
    expect(prompt).toMatch(/1–2 short sentences as Ayebia/);
    expect(prompt).toMatch(/Do not write a strategy/);
    expect(prompt).not.toMatch(/I'm iBIS/);
    expect(prompt).not.toMatch(/You are iBIS/);
  });

  it('names Ayebia in support mode and never iBIS', () => {
    const prompt = buildChatSystemPrompt(context, { mode: 'support', businessType: 'shop' });
    expect(prompt).toMatch(/^You are Ayebia, the business intelligence assistant for Campbell Italia/);
    expect(prompt).toMatch(/I'm Ayebia/);
    expect(prompt).toMatch(/1–2 short sentences as Ayebia/);
    expect(prompt).toMatch(/Do not write a strategy/);
    expect(prompt).not.toMatch(/I'm iBIS/);
    expect(prompt).not.toMatch(/You are iBIS/);
  });
});
