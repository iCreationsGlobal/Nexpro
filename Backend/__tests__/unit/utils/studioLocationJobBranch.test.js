jest.mock('../../../models', () => ({ StudioLocation: {}, UserStudioLocation: {} }));

const {
  requiresExplicitStudioLocation,
  resolveStudioLocationIdForJobFromQuote,
} = require('../../../utils/studioLocationUtils');

describe('requiresExplicitStudioLocation', () => {
  it('requires a branch when viewing all of several branches', () => {
    expect(requiresExplicitStudioLocation({
      studioLocationScoped: true,
      studioLocationFilterId: null,
      allowedStudioLocationIds: ['a', 'b'],
    })).toBe(true);
  });

  it('does not block single-branch workspaces or a selected branch', () => {
    expect(requiresExplicitStudioLocation({
      studioLocationScoped: true,
      studioLocationFilterId: null,
      allowedStudioLocationIds: ['a'],
    })).toBe(false);
    expect(requiresExplicitStudioLocation({
      studioLocationScoped: true,
      studioLocationFilterId: 'a',
      allowedStudioLocationIds: ['a', 'b'],
    })).toBe(false);
    expect(requiresExplicitStudioLocation({ studioLocationScoped: false })).toBe(false);
  });
});

describe('resolveStudioLocationIdForJobFromQuote', () => {
  const req = (filterId) => ({
    studioLocationScoped: true,
    studioLocationFilterId: filterId,
    defaultStudioLocationId: 'main',
  });

  it('uses the selected branch first', () => {
    expect(resolveStudioLocationIdForJobFromQuote(req('b'), { studioLocationId: 'c' })).toBe('b');
  });

  it("keeps the quote's branch when viewing all branches instead of the main branch", () => {
    expect(resolveStudioLocationIdForJobFromQuote(req(null), { studioLocationId: 'c' })).toBe('c');
  });

  it('falls back to the default branch when the quote has none', () => {
    expect(resolveStudioLocationIdForJobFromQuote(req(null), { studioLocationId: null })).toBe('main');
  });
});
