import { redirect } from "next/navigation";
import { APP_URL } from "@/lib/constants";

/**
 * Redirect /onboarding to the main app's onboarding flow.
 * Links on the marketing site use /onboarding; this sends users to the app.
 */
export default function OnboardingRedirect() {
  redirect(`${APP_URL}/onboarding`);
}
