const { applySmsTemplate, estimateSmsSegments } = require('../../../utils/smsTemplateMerge');

describe('smsTemplateMerge', () => {
  it('replaces known placeholders and blanks unknown ones', () => {
    expect(applySmsTemplate('Hi {{name}} from {{businessName}} {{missing}}', {
      name: 'Ama',
      businessName: 'ABS Shop',
    })).toBe('Hi Ama from ABS Shop ');
  });

  it('estimates GSM-7 segments', () => {
    expect(estimateSmsSegments('Hello').segments).toBe(1);
    expect(estimateSmsSegments('a'.repeat(161)).segments).toBe(2);
  });
});
