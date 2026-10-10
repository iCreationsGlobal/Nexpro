const {
  collapseRepeatedDialCode,
  cleanPhoneFieldsOnSave,
  formatToE164,
  normalizePhoneNumber,
} = require('../../../utils/phoneUtils');

describe('collapseRepeatedDialCode', () => {
  it.each([
    ['+233+233555155979', '+233555155979'],
    ['+233 +233 55 515 5979', '+233 55 515 5979'],
    ['+233+233+233555155979', '+233555155979'],
    ['+1+15551234567', '+15551234567'],
    ['+233233555155979', '+233555155979'],
    ['233233555155979', '+233555155979'],
    ['  +233+233555155979  ', '+233555155979'],
  ])('collapses %s to %s', (input, expected) => {
    expect(collapseRepeatedDialCode(input)).toBe(expected);
  });

  it.each([
    '+233555155979',
    '0555155979',
    '+233 233 555 155', // national number that happens to start with 233
    '+44 7700 900123',
    '',
  ])('leaves %p unchanged', (input) => {
    expect(collapseRepeatedDialCode(input)).toBe(input.trim());
  });

  it('treats null and undefined as empty', () => {
    expect(collapseRepeatedDialCode(null)).toBe('');
    expect(collapseRepeatedDialCode(undefined)).toBe('');
  });
});

describe('phone normalizers with a doubled dial code', () => {
  it('formats a doubled number to valid E.164 instead of rejecting it', () => {
    expect(formatToE164('+233+233555155979')).toBe('+233555155979');
    expect(formatToE164('+233 +233 55 515 5979')).toBe('+233555155979');
  });

  it('strips formatting after collapsing', () => {
    expect(normalizePhoneNumber('+233 +233 55 515 5979')).toBe('+233555155979');
  });
});

describe('cleanPhoneFieldsOnSave', () => {
  const makeModel = () => {
    const hooks = {};
    return {
      hooks,
      addHook: jest.fn((name, _label, fn) => {
        hooks[name] = fn;
      }),
    };
  };

  const makeInstance = (values) => ({
    values: { ...values },
    get(field) {
      return this.values[field];
    },
    set(field, value) {
      this.values[field] = value;
    },
  });

  it('cleans phone fields on save, bulk create and bulk update', () => {
    const Model = makeModel();
    cleanPhoneFieldsOnSave(Model, ['phone', 'whatsappNumber']);

    const instance = makeInstance({ phone: '+233+233555155979', whatsappNumber: '+233241234567', name: 'Ama' });
    Model.hooks.beforeSave(instance);
    expect(instance.values).toEqual({ phone: '+233555155979', whatsappNumber: '+233241234567', name: 'Ama' });

    const imported = [makeInstance({ phone: '+233 +233 24 123 4567' })];
    Model.hooks.beforeBulkCreate(imported);
    expect(imported[0].values.phone).toBe('+233 24 123 4567');

    const options = { attributes: { phone: '+233+233555155979', name: 'Kofi' } };
    Model.hooks.beforeBulkUpdate(options);
    expect(options.attributes).toEqual({ phone: '+233555155979', name: 'Kofi' });
  });

  it('leaves correct numbers and non-string values untouched', () => {
    const Model = makeModel();
    cleanPhoneFieldsOnSave(Model, ['phone']);

    const instance = makeInstance({ phone: ' +233555155979 ' });
    Model.hooks.beforeSave(instance);
    expect(instance.values.phone).toBe(' +233555155979 ');

    const empty = makeInstance({ phone: null });
    Model.hooks.beforeSave(empty);
    expect(empty.values.phone).toBeNull();
  });
});
