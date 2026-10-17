import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shared layout for settings detail pages with back navigation to hub.
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {import('react').ReactNode} props.children
 */
const SettingsLayout = ({ title, description, children }) => {
  const navigate = useNavigate();

  return (
    <div className="px-0 md:px-0">
      <div className="mb-3 md:mb-6">
        {/* Phones/tablets: the app header already has the back button and the title. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground shell:hidden"
          onClick={() => navigate('/settings')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Settings
        </Button>
        <h2 className="text-xl md:text-2xl font-semibold mb-1 md:mb-2 shell:sr-only">{title}</h2>
        {description ? (
          <p className="text-xs md:text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
};

export default SettingsLayout;
