const { StorefrontReview } = require('../../../models');
const {
  attachServiceReviewSummaries,
} = require('../../../services/storefrontReviewService');

describe('storefrontReviewService service reviews', () => {
  const services = [{ id: '00000000-0000-0000-0000-000000000001', title: 'Haircut' }];
  let findAll;

  beforeEach(() => {
    findAll = jest.spyOn(StorefrontReview, 'findAll');
  });

  afterEach(() => {
    findAll.mockRestore();
  });

  it('returns services unchanged when no listing ids are provided', async () => {
    const unlisted = [{ id: null, title: 'Test' }];
    const result = await attachServiceReviewSummaries(unlisted);
    expect(result).toEqual(unlisted);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('attaches default review summary shape when services have ids but reviews table is unavailable', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('missing table'), { original: { code: '42P01' } }));
    const result = await attachServiceReviewSummaries(services);
    expect(result[0]).toMatchObject({ title: 'Haircut', reviewsCount: 0 });
    expect(result[0].reviewSummary).toBeDefined();
  });

  it('attaches the review summary of each service', async () => {
    findAll.mockResolvedValue([
      { serviceListingId: services[0].id, reviewsCount: '4', avgRating: '4.25', positiveCount: '3' },
    ]);
    const [service] = await attachServiceReviewSummaries(services);
    expect(service.reviewsCount).toBe(4);
    expect(service.reviewSummary).toMatchObject({ reviewsCount: 4, positiveReviewsPercent: 75 });
  });

  it('does not hide other database errors', async () => {
    findAll.mockRejectedValue(new Error('connection lost'));
    await expect(attachServiceReviewSummaries(services)).rejects.toThrow('connection lost');
  });
});
