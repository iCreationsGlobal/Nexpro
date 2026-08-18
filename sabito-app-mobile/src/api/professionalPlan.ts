/** Stub — professional plan upgrade is not available on ABS marketer mobile. */
export const getProfessionalProfile = async () => null;
export const updateEnhancedProfile = async () => {
  throw new Error('Professional profile is not available');
};
export const getProfessionalPlanInfo = async () => ({
  currentPlan: 'free',
  professionalPlan: null,
  benefits: [],
});
export const upgradeToProfessional = async () => {
  throw new Error('Professional upgrade is not available');
};
export const refreshUserProfile = async () => null;

export default {
  getProfessionalProfile,
  updateEnhancedProfile,
  getProfessionalPlanInfo,
  upgradeToProfessional,
  refreshUserProfile,
};
