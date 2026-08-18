import { describe, expect, it } from 'vitest';
import { formatAssistantMessage } from '../../utils/assistantMessageFormatter';
import { sanitizeAssistantDisplayName } from '../../constants/ibis';

describe('sanitizeAssistantDisplayName', () => {
  it('rewrites iBIS self-introductions to Ayebia', () => {
    const raw = "Hello! I'm iBIS. 👋\n\nI'm here to help you with Campbell Italia's business strategy...";
    expect(sanitizeAssistantDisplayName(raw)).toContain("Hello! I'm Ayebia.");
    expect(sanitizeAssistantDisplayName(raw)).not.toMatch(/iBIS/i);
  });
});

describe('formatAssistantMessage', () => {
  it('renders leftover iBIS names as Ayebia in HTML', () => {
    const html = formatAssistantMessage("Hello! I'm iBIS. 👋");
    expect(html).toContain('I&#39;m Ayebia');
    expect(html).not.toContain('iBIS');
  });
});
