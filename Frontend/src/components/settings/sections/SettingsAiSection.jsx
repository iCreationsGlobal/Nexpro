import { Eye, EyeOff, Lightbulb, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSettingsAI } from '../../../hooks/useSettingsAI';

/**
 * Workspace Anthropic API key settings.
 */
const SettingsAiSection = () => {
  const {
    canManageOrganization,
    loadingAISettings,
    aiSettings,
    aiSourceText,
    aiApiKey,
    setAiApiKey,
    showAiApiKey,
    setShowAiApiKey,
    updateAISettingsMutation,
    deleteAISettingsMutation,
    handleSaveAISettings,
    handleRemoveAISettings,
  } = useSettingsAI();

  if (!canManageOrganization) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription>
              You need admin or manager permissions to configure AI settings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base md:text-2xl flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          AI Settings
        </CardTitle>
        <CardDescription className="text-xs md:text-sm mt-1">
          Add a workspace Anthropic API key for growth and strategy questions in Ask Ayebia (required). The same key also powers smart report narratives and automation drafting, and overrides the system default when set. Live sales, stock, and receivables answers work without a key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingAISettings ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {aiSettings.encryptionConfigured === false ? (
              <Alert variant="destructive">
                <AlertTitle>AI key storage unavailable</AlertTitle>
                <AlertDescription>
                  AI key storage is not configured on this server. Contact your administrator or ABS support.
                </AlertDescription>
              </Alert>
            ) : null}
            <Alert>
              <AlertTitle>Active AI source: {aiSourceText}</AlertTitle>
              <AlertDescription>
                {aiSettings.apiKeyConfigured ? (
                  <>This workspace key is saved as <strong>{aiSettings.apiKeyMasked || '••••'}</strong>. It is required for open-ended advice and overrides the system default for other AI features.</>
                ) : aiSettings.systemConfigured ? (
                  <>No workspace key is saved. Product how-tos and drafts can use the system default; growth and strategy questions need a workspace key.</>
                ) : (
                  <>No workspace or system key is configured. Add a workspace key to unlock Ask Ayebia advice, smart report AI, and automation drafting.</>
                )}
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="ai-api-key">Anthropic API key</Label>
              <div className="flex gap-2">
                <Input
                  id="ai-api-key"
                  name="ai-api-key"
                  type={showAiApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder={aiSettings.apiKeyConfigured ? 'Enter a new key to replace the saved key' : 'sk-ant-api03-...'}
                  data-form-type="other"
                  data-lpignore="true"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAiApiKey((value) => !value)}
                  aria-label={showAiApiKey ? 'Hide AI API key' : 'Show AI API key'}
                >
                  {showAiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The key is encrypted before storage and is never shown again after saving.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRemoveAISettings}
                disabled={!aiSettings.apiKeyConfigured || deleteAISettingsMutation.isPending}
              >
                {deleteAISettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Remove workspace key
              </Button>
              <Button
                type="button"
                onClick={handleSaveAISettings}
                disabled={updateAISettingsMutation.isPending || aiSettings.encryptionConfigured === false}
              >
                {updateAISettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> : null}
                Save AI key
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SettingsAiSection;
