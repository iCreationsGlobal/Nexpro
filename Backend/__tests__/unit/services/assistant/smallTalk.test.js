const {
  classifySmallTalk,
  trySmallTalk,
  SMALL_TALK_INTENTS,
} = require('../../../../services/assistant/smallTalk');

describe('smallTalk', () => {
  describe('classifySmallTalk', () => {
    it.each([
      'hello',
      'hi',
      'Hi!',
      'Hello.',
      'good morning',
      'good day',
      'gm',
      'morning',
      'afternoon',
      'evening',
      'hi ayebia',
      'hey ayebia',
      'hello ayebia',
      'Hi 👋',
    ])('matches greeting: %s', (msg) => {
      const r = classifySmallTalk(msg);
      expect(r).toEqual({
        intent: SMALL_TALK_INTENTS.GREETING,
        confidence: expect.any(Number),
      });
    });

    it.each([
      'how are you',
      'How are you?',
      'hi, how are you',
      'how far',
      'you good?',
      'you dey?',
      'wassup',
      "what's up",
      'sup',
    ])('matches how-are-you: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.HOW_ARE_YOU);
    });

    it.each(['who are you', 'who are you?', 'Who are you'])(
      'matches identity: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.IDENTITY);
      }
    );

    it.each(['tell me about you', 'tell me about yourself'])(
      'matches identity bio: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.IDENTITY_BIO);
      }
    );

    it.each([
      'are you smart?',
      'how smart are you?',
      'are you AI?',
      'are you a bot?',
      'are you human?',
      'can you think?',
      'do you have feelings?',
    ])('matches intelligence: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.INTELLIGENCE);
    });

    it.each(['talk to me', "let's talk", "I'm bored"])(
      'matches chatter: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.CHATTER);
      }
    );

    it.each(['what do you know?', 'what do you know about me?'])(
      'matches knowledge: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.KNOWLEDGE);
      }
    );

    it.each(['who made you?', 'who built you?'])('matches creator: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.CREATOR);
    });

    it.each(['can you see my sales?', 'can you see my data?'])(
      'matches see-data capability: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.SEE_DATA);
      }
    );

    it.each([
      'wow',
      'Wow!',
      'thanks',
      'thank you',
      'amazing',
      'impressive',
      'nice one',
      'well done',
      'congratulations',
      'congrats',
    ])('matches acknowledgement: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.ACK);
    });

    it.each(['I love you', "you're the best", 'this is great'])(
      'matches praise: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.PRAISE);
      }
    );

    it.each(['this is wrong', "you're useless"])('matches complaint: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.COMPLAINT);
    });

    it.each(['pls', 'please', 'sorry', 'excuse me', 'pardon'])(
      'matches courtesy: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.COURTESY);
      }
    );

    it.each(['yes', 'yeah', 'yep', 'no', 'nope'])('matches short affirm: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.AFFIRM);
    });

    it.each(['bye', 'goodbye', 'see you', 'later'])('matches farewell: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.FAREWELL);
    });

    it.each(['whatsapp', 'is this whatsapp?'])('matches whatsapp chat: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.WHATSAPP);
    });

    it.each(['what can you do?', 'What can you do', 'how can you help', 'help'])(
      'matches help: %s',
      (msg) => {
        expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.HELP);
      }
    );

    it.each(['what time is it?'])('matches time: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.TIME);
    });

    it.each(['happy new year', 'merry christmas'])('matches seasonal: %s', (msg) => {
      expect(classifySmallTalk(msg)?.intent).toBe(SMALL_TALK_INTENTS.SEASONAL);
    });

    it.each([
      'how are sales',
      'who owes me',
      'how do I create an invoice',
      'hi, how are sales',
      'How much did I sell today?',
      'Who owes me money?',
      'How do I create an invoice?',
      'Why are sales down?',
      'draft a whatsapp',
      'how do I send whatsapp',
      'whatsapp reminder',
    ])('does not steal business or support questions: %s', (msg) => {
      expect(classifySmallTalk(msg)).toBeNull();
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
    it('builds a hi welcome without inventing numbers or naming iBIS', () => {
      const out = trySmallTalk('hi', { businessType: 'shop' });
      expect(out.matched).toBe(true);
      expect(out.intent).toBe(SMALL_TALK_INTENTS.GREETING);
      expect(out.answerMarkdown).toContain("Hi 👋 I'm **Ayebia**, your business intelligence assistant.");
      expect(out.answerMarkdown).toContain('understand and manage your business with ABS');
      expect(out.answerMarkdown).toContain('draft a message');
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
      expect(out.answerMarkdown).not.toMatch(/GHS|\$\d|revenue of|sold \d/i);
      expect(out.answerMarkdown).not.toMatch(/Try asking/i);
      expect(out.meta.source).toBe('small_talk');
      expect(out.meta.suggestedQuestions?.length).toBeGreaterThan(0);
    });

    it('echoes hello the same way as hi', () => {
      const out = trySmallTalk('hello');
      expect(out.answerMarkdown).toContain("Hi 👋 I'm **Ayebia**, your business intelligence assistant.");
    });

    it('echoes hi ayebia with the same welcome', () => {
      const out = trySmallTalk('hi ayebia');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.GREETING);
      expect(out.answerMarkdown).toContain("Hi 👋 I'm **Ayebia**, your business intelligence assistant.");
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
    });

    it('echoes good morning in 1–2 sentences', () => {
      const out = trySmallTalk('good morning');
      expect(out.answerMarkdown).toBe("Good morning. I'm **Ayebia** — happy to help.");
    });

    it('treats gm and morning as good morning', () => {
      expect(trySmallTalk('gm').answerMarkdown).toBe("Good morning. I'm **Ayebia** — happy to help.");
      expect(trySmallTalk('morning').answerMarkdown).toBe(
        "Good morning. I'm **Ayebia** — happy to help."
      );
    });

    it('uses Africa/Accra clock for good day', () => {
      const morning = new Date('2026-08-18T08:00:00Z');
      const out = trySmallTalk('good day', { now: morning, timeZone: 'Africa/Accra' });
      expect(out.matched).toBe(true);
      expect(out.answerMarkdown).toBe("Good morning. I'm **Ayebia** — happy to help.");
    });

    it('answers how are you without a strategy dump', () => {
      const out = trySmallTalk('how are you', { businessType: 'shop' });
      expect(out.intent).toBe(SMALL_TALK_INTENTS.HOW_ARE_YOU);
      expect(out.answerMarkdown).toBe("I'm doing well, thanks. How can I help the shop today?");
    });

    it('answers you dey in the how-are-you voice', () => {
      const out = trySmallTalk('you dey?', { businessType: 'shop' });
      expect(out.intent).toBe(SMALL_TALK_INTENTS.HOW_ARE_YOU);
      expect(out.answerMarkdown).toBe("I'm doing well, thanks. How can I help the shop today?");
    });

    it('introduces itself for who are you', () => {
      const out = trySmallTalk('who are you?', { businessType: 'printing_press' });
      expect(out.matched).toBe(true);
      expect(out.intent).toBe(SMALL_TALK_INTENTS.IDENTITY);
      expect(out.answerMarkdown).toBe(
        "I'm **Ayebia**, your assistant in African Business Suite. I read your live workspace — I don't invent numbers."
      );
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
    });

    it('gives a slightly longer bio for tell me about you', () => {
      const out = trySmallTalk('tell me about you', { businessType: 'printing_press' });
      expect(out.intent).toBe(SMALL_TALK_INTENTS.IDENTITY_BIO);
      expect(out.answerMarkdown).toMatch(/Ayebia/);
      expect(out.answerMarkdown).toMatch(/jobs/i);
      expect(out.answerMarkdown).toMatch(/don't invent numbers/i);
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
    });

    it('names iCreations when asked who made her, not iBIS', () => {
      const out = trySmallTalk('who made you?');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.CREATOR);
      expect(out.answerMarkdown).toBe(
        "I'm **Ayebia**, built into African Business Suite by iCreations. What would you like to check?"
      );
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
    });

    it('answers are you smart without a pitch dump', () => {
      const out = trySmallTalk('are you smart?');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.INTELLIGENCE);
      expect(out.answerMarkdown).toBe(
        "I'm built to read your live workspace and help with the business. Ask a numbers question — I'll use real data, not invented figures."
      );
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
    });

    it('says she is not human', () => {
      const out = trySmallTalk('are you human?');
      expect(out.answerMarkdown).toBe("I'm not human — I'm **Ayebia**, your AI assistant in ABS.");
    });

    it('invites a topic when the user is bored', () => {
      const out = trySmallTalk("I'm bored");
      expect(out.intent).toBe(SMALL_TALK_INTENTS.CHATTER);
      expect(out.answerMarkdown).toBe(
        "I'm here. I can check the business or help with ABS — what do you feel like?"
      );
    });

    it('does not invent personal facts for what do you know about me', () => {
      const out = trySmallTalk('what do you know about me?');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.KNOWLEDGE);
      expect(out.answerMarkdown).toBe(
        "I know what's in your live workspace — not personal details unless they're in ABS. What should we check?"
      );
      expect(out.answerMarkdown).not.toMatch(/GHS|\$\d/i);
    });

    it('confirms live workspace for can you see my sales without inventing figures', () => {
      const out = trySmallTalk('can you see my sales?');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.SEE_DATA);
      expect(out.answerMarkdown).toBe(
        "Yes — I can see your live workspace. I don't invent figures. What should I check?"
      );
      expect(out.answerMarkdown).not.toMatch(/GHS|\$\d|sold \d/i);
    });

    it('answers wow without inventing numbers', () => {
      const out = trySmallTalk('wow');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.ACK);
      expect(out.answerMarkdown).toBe(
        'Glad that landed. Want to look at sales, who owes you, or something else?'
      );
    });

    it('answers congrats without inventing numbers', () => {
      const out = trySmallTalk('congrats');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.ACK);
      expect(out.answerMarkdown).toBe(
        'Well done. Want to look at sales, who owes you, or something else?'
      );
    });

    it('takes praise without restarting a pitch', () => {
      const out = trySmallTalk("you're the best");
      expect(out.intent).toBe(SMALL_TALK_INTENTS.PRAISE);
      expect(out.answerMarkdown).toBe("Thanks — that means a lot. What should we look at next?");
    });

    it('handles complaint calmly', () => {
      const out = trySmallTalk("you're useless");
      expect(out.intent).toBe(SMALL_TALK_INTENTS.COMPLAINT);
      expect(out.answerMarkdown).toBe(
        'Sorry that missed. Try another question — I can check the business or walk you through ABS.'
      );
    });

    it('treats please as a cue to go ahead', () => {
      const out = trySmallTalk('please');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.COURTESY);
      expect(out.answerMarkdown).toBe('Go ahead — what do you need?');
    });

    it('invites the next need for yes without a pitch', () => {
      const out = trySmallTalk('yes');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.AFFIRM);
      expect(out.answerMarkdown).toBe('Okay. What do you need?');
      expect(out.answerMarkdown).not.toMatch(/I'm \*\*Ayebia\*\*/);
    });

    it('invites an alternative for no', () => {
      const out = trySmallTalk('nope');
      expect(out.answerMarkdown).toBe('Alright. What would you like instead?');
    });

    it('says goodbye without a restart pitch', () => {
      const out = trySmallTalk('bye', { businessType: 'shop' });
      expect(out.intent).toBe(SMALL_TALK_INTENTS.FAREWELL);
      expect(out.answerMarkdown).toBe("See you. I'm here when you need the shop.");
    });

    it('explains bare whatsapp', () => {
      const out = trySmallTalk('whatsapp');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.WHATSAPP);
      expect(out.answerMarkdown).toBe(
        "This isn't WhatsApp — you're chatting with **Ayebia** in ABS. I can still draft a WhatsApp to a customer if you want."
      );
    });

    it('explains is this whatsapp the same way', () => {
      const out = trySmallTalk('is this whatsapp?');
      expect(out.intent).toBe(SMALL_TALK_INTENTS.WHATSAPP);
      expect(out.answerMarkdown).toMatch(/Ayebia/);
      expect(out.answerMarkdown).toMatch(/isn't WhatsApp/i);
    });

    it('describes capabilities for help questions (retail mentions stock)', () => {
      const out = trySmallTalk('what can you do?', { businessType: 'shop' });
      expect(out.matched).toBe(true);
      expect(out.intent).toBe(SMALL_TALK_INTENTS.HELP);
      expect(out.answerMarkdown).toBe(
        'I can check your live workspace (sales, collections, stock), walk you through ABS, and draft short messages. What do you want to look at?'
      );
      expect(out.answerMarkdown).not.toMatch(/iBIS/i);
    });

    it('answers what time is it in Accra unless another zone is passed', () => {
      const now = new Date('2026-08-18T17:56:00Z');
      const accra = trySmallTalk('what time is it?', { now });
      expect(accra.intent).toBe(SMALL_TALK_INTENTS.TIME);
      expect(accra.answerMarkdown).toBe(
        "It's 5:56 pm in Accra. What would you like to check in the business?"
      );

      const lagos = trySmallTalk('what time is it?', { now, timeZone: 'Africa/Lagos' });
      expect(lagos.answerMarkdown).toBe(
        "It's 6:56 pm in Lagos. What would you like to check in the business?"
      );
    });

    it('answers happy new year then invites business help', () => {
      const out = trySmallTalk('happy new year', { businessType: 'shop' });
      expect(out.intent).toBe(SMALL_TALK_INTENTS.SEASONAL);
      expect(out.answerMarkdown).toBe("Happy New Year. When you're ready, I can help with the shop.");
    });
  });
});
