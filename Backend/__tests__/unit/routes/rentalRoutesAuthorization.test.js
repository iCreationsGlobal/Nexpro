const fs = require('fs');
const path = require('path');

const ROUTES_PATH = path.join(__dirname, '../../../routes/rentalRoutes.js');

describe('rentalRoutes role authorization', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(ROUTES_PATH, 'utf8');
  });

  it('restricts notification trigger to manager and admin', () => {
    expect(source).toMatch(
      /router\.post\(\s*'\/notifications\/run',\s*authorize\(\s*'admin',\s*'manager'\s*\)/
    );
  });

  it('restricts late charge waive to manager and admin', () => {
    expect(source).toMatch(
      /router\.patch\(\s*'\/:id\/late-charges\/:chargeId\/waive',\s*authorize\(\s*'admin',\s*'manager'\s*\)/
    );
  });

  it('restricts deposit refund and apply to manager and admin', () => {
    expect(source).toMatch(
      /router\.post\(\s*'\/:id\/deposit\/refund',\s*authorize\(\s*'admin',\s*'manager'\s*\)/
    );
    expect(source).toMatch(
      /router\.post\(\s*'\/:id\/deposit\/apply',\s*authorize\(\s*'admin',\s*'manager'\s*\)/
    );
  });

  it('restricts pre-booking confirm and cancel to manager and admin', () => {
    expect(source).toMatch(
      /router\.post\(\s*'\/pre-bookings\/:id\/confirm',\s*authorize\(\s*'admin',\s*'manager'\s*\)/
    );
    expect(source).toMatch(
      /router\.post\(\s*'\/pre-bookings\/:id\/cancel',\s*authorize\(\s*'admin',\s*'manager'\s*\)/
    );
    expect(source).not.toMatch(
      /pre-bookings\/:id\/confirm',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/
    );
    expect(source).not.toMatch(
      /pre-bookings\/:id\/cancel',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/
    );
  });

  it('allows staff on core rental operations', () => {
    expect(source).toMatch(/\.post\(authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\),\s*createRental\)/);
    expect(source).toMatch(/\.post\(\s*'\/:id\/checkout',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/);
    expect(source).toMatch(/\.post\(\s*'\/:id\/return',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/);
    expect(source).toMatch(/\.post\(\s*'\/:id\/payment',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/);
    expect(source).toMatch(/\.post\(\s*'\/:id\/extend',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/);
    expect(source).toMatch(/\.post\(\s*'\/:id\/damage',\s*authorize\(\s*'admin',\s*'manager',\s*'staff'\s*\)/);
  });
});
