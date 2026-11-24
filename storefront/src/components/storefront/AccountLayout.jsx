import EmailVerificationPrompt from './EmailVerificationPrompt';
import { PageShell } from './StorefrontLayout';

const AccountLayout = ({
  title,
  description,
  children,
  activePath = '/account',
  showVerificationPrompt = true,
}) => {
  // Cart and checkout share this layout; Sign out belongs on the account pages only.
  const isAccountPage = activePath === '/account';

  return (
    <PageShell
      activePath={activePath}
      appMode
      buyerTitle={title}
      buyerDescription={description}
      showSignOut={isAccountPage}
    >
      {showVerificationPrompt ? <EmailVerificationPrompt /> : null}
      {children}
    </PageShell>
  );
};

export default AccountLayout;
