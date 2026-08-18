const {
  classifySmallTalk,
  trySmallTalk,
  SMALL_TALK_INTENTS,
} = require('../../../../services/assistant/smallTalk');

describe('smallTalk', () => {
  describe('classifySmallTalk', () => {
    it.each(['hi', 'hello', 'hey', 'Hi!', 'Hello.', 'good morning', 'thanks', 'thank you'])(
      'matches greeting: %s',
      (msg) => {
        const r = classifySmallTalk(msg);
        expect(r).toEqual({
          intent: SMALL_TALK_INTENTS.GREETING,
          confidence: expect.any(Number),
        });
      }
    );

    it.each(['who are you?', 'Who are you', "what's your name", 'what are you'])(
      'matches identity: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.IDENTITY);
      }
    );

    it.each(['what can you do?', 'What can you do', 'how can you help', 'help'])(
      'matches help: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.HELP);
      }
    );

    it('does not steal analysis or support questions', () => {
      expect(classifySmallTalk('How much did I sell today?')).toBeNull();
      expect(classifySmallTalk('Who owes me money?')).toBeNull();
      expect(classifySmallTalk('How do I create an invoice?')).toBeNull();
      expect(classifySmallTalk('Why are sales down?')).toBeNull();
    });

    it('returns null for empty or long non-small-talk text', () => {
      expect(classifySmallTalk('')).toBeNull();
      expect(classifySmallTalk('   ')).toBeNull();
      expect(
        classifySmallTalk(
          'hello I need a detailed forecast of next quarter revenue with predictions and inventory planning across all shops'
        )
      ).toBeNull();
    });
  });

  describe('trySmallTalk', () => {
    it('builds a warm greeting without inventing numbers', () => {
      const out = trySmallTalk('hi', { businessType: 'shop' });
      expect(out.matched).toBe(true);
      expect(out.intent).toBe(SMALL_TALK_INTENTS.GREETING);
      expect(out.answerMarkdown).toMatch(/Ayebia/i);
      expect(out.answerMarkdown).not.toMatch(/GHS|\$\d|revenue of|sold \d/i);
      expect(out.meta.source).toBe('small_talk');
      expect(out.meta.suggestedQuestions?.length).toBeGreaterThan(0);
    });

    it('introduces itself for identity questions', () => {
      const out = trySmallTalk('who are you?', { businessType: 'printing_press' });
      expect(out.matched).toBe(true);
      expect(out.intent).toBe(SMALL_TALK_INTENTS.IDENTITY);
      expect(out.answerMarkdown).toMatch(/Ayebia/i);
      expect(out.answerMarkdown).toMatch(/jobs/i);
    });

    it('describes capabilities for help questions (retail mentions stock)', () => {
      const out = trySmallTalk('what can you do?', { businessType: 'shop' });
      expect(out.matched).toBe(true);
      expect(out.intent).toBe(SMALL_TALK_INTENTS.HELP);
      expect(out.answerMarkdown).toMatch(/stock/i);
      expect(out.answerMarkdown).toMatch(/Try asking/i);
    });
  });
});
