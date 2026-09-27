import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '@/context/BrandingContext';
import { TourContext, useTourInternal } from '../../hooks/useTour';
import { getJoyrideConfig, TOUR_IDS } from '../../config/tours';
import { loadTourImageByIndex, loadTourWelcomeImage } from '../../config/tourImages';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const Joyride = lazy(() => import('react-joyride').then((m) => ({ default: m.default })));
const STATUS = { FINISHED: 'finished', SKIPPED: 'skipped' };

/**
 * Renders a tour step with an optional screenshot and body text.
 */
function TourStepContent({ content, imageSrc }) {
  return (
    <div className="tour-step-content flex flex-col gap-4 w-full">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="tour-step-image w-full rounded-md border border-gray-200 object-contain bg-gray-50"
          style={{ minHeight: '200px', maxHeight: '280px' }}
        />
      ) : null}
      <p className="text-left text-gray-700 text-[15px] leading-relaxed">{content}</p>
    </div>
  );
}

/**
 * TourProvider - Manages app tours and provides tour context
 */
export default function TourProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeTenant, suppressAppGuidance } = useAuth();
  const { isSimple: isSimpleMode } = useSimpleMode();
  const { primaryColor: brandPrimaryHex } = useBranding();
  const tourValue = useTourInternal();
  const {
    runningTour,
    tourStepIndex,
    setTourStepIndex,
    startTour,
    stopTour,
    completeTour,
    isTourStatusReady,
    tourStatus,
  } = tourValue;

  const [showTourPrompt, setShowTourPrompt] = useState(false);
  const [welcomeImage, setWelcomeImage] = useState(null);
  const [stepImages, setStepImages] = useState({});
  const suppressAutoCompleteRef = useRef(false);

  const silentCompleteStorageKey = activeTenant?.id
    ? `tourSilentComplete:${activeTenant.id}`
    : null;

  const mainTourCompleted =
    isTourStatusReady &&
    (tourStatus[TOUR_IDS.MAIN_TOUR]?.completed === true ||
      (silentCompleteStorageKey &&
        sessionStorage.getItem(silentCompleteStorageKey) === '1'));

  const businessType = activeTenant?.businessType || 'shop';
  const isRunning = runningTour === TOUR_IDS.MAIN_TOUR;
  const tourConfig = getJoyrideConfig(businessType, isRunning, brandPrimaryHex);

  useEffect(() => {
    if (!showTourPrompt) return;
    loadTourWelcomeImage().then((url) => {
      if (url) setWelcomeImage(url);
    });
  }, [showTourPrompt]);

  useEffect(() => {
    if (!isRunning) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        tourConfig.steps.map((_, index) =>
          loadTourImageByIndex(index).then((url) => [index, url])
        )
      );
      if (!cancelled) {
        setStepImages(Object.fromEntries(entries.filter(([, url]) => url)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRunning, businessType, tourConfig.steps.length]);

  const stepsWithImages = tourConfig.steps.map((step, index) => ({
    ...step,
    content: (
      <TourStepContent
        content={step.content}
        imageSrc={stepImages[index] ?? null}
      />
    ),
  }));

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[TourProvider] state:', {
      pathname: location.pathname,
      runningTour,
      isRunning,
      tourStepIndex,
      businessType,
    });
  }, [location.pathname, runningTour, isRunning, tourStepIndex, businessType]);

  const handleTourCallback = useCallback(
    (data) => {
      const { status, type, index, action } = data;

      if (import.meta.env.DEV) {
        console.log('[TourProvider] Joyride callback:', { status, type, index, action });
      }

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        if (status === STATUS.FINISHED && runningTour === TOUR_IDS.MAIN_TOUR) {
          completeTour(TOUR_IDS.MAIN_TOUR, '1.0.0');
        } else {
          stopTour();
        }
      } else if (type === 'step:after') {
        if (action === 'prev') {
          setTourStepIndex(Math.max(0, index - 1));
        } else {
          setTourStepIndex(index + 1);
        }
      }
    },
    [runningTour, completeTour, stopTour, setTourStepIndex]
  );

  useEffect(() => {
    if (runningTour === TOUR_IDS.MAIN_TOUR && location.pathname !== '/dashboard') {
      navigate('/dashboard');
    }
  }, [runningTour, location.pathname, navigate]);

  useEffect(() => {
    suppressAutoCompleteRef.current = false;
  }, [activeTenant?.id]);

  useEffect(() => {
    if (!isTourStatusReady || !suppressAppGuidance || mainTourCompleted) return;
    if (suppressAutoCompleteRef.current) return;
    if (silentCompleteStorageKey && sessionStorage.getItem(silentCompleteStorageKey) === '1') {
      return;
    }

    suppressAutoCompleteRef.current = true;
    if (silentCompleteStorageKey) {
      sessionStorage.setItem(silentCompleteStorageKey, '1');
    }

    completeTour(TOUR_IDS.MAIN_TOUR, '1.0.0', { persistOnError: true }).catch(() => {});
  }, [
    isTourStatusReady,
    suppressAppGuidance,
    mainTourCompleted,
    completeTour,
    silentCompleteStorageKey,
  ]);

  useEffect(() => {
    if (
      !isTourStatusReady ||
      suppressAppGuidance ||
      isSimpleMode ||
      location.pathname !== '/dashboard' ||
      mainTourCompleted
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const alreadyPrompted = sessionStorage.getItem('mainTourPromptedThisSession');
      if (!alreadyPrompted) {
        setShowTourPrompt(true);
        sessionStorage.setItem('mainTourPromptedThisSession', 'true');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [location.pathname, isTourStatusReady, suppressAppGuidance, isSimpleMode, mainTourCompleted]);

  const handleStartTour = useCallback(() => {
    setShowTourPrompt(false);
    startTour(TOUR_IDS.MAIN_TOUR);
  }, [startTour]);

  const handleSkipTour = useCallback(() => {
    setShowTourPrompt(false);
    sessionStorage.setItem('tourDismissedThisSession', 'true');
  }, []);

  return (
    <TourContext.Provider value={tourValue}>
      {children}

      <Dialog open={showTourPrompt} onOpenChange={setShowTourPrompt}>
        <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden border border-border">
          <div className="px-6 pt-6 pb-4">
            {welcomeImage ? (
              <img
                src={welcomeImage}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full rounded-lg border border-border object-contain mb-5 bg-muted"
                style={{ height: 160 }}
              />
            ) : null}

            <DialogTitle className="text-lg font-semibold text-foreground text-center mb-2">
              Welcome to African Business Suite!
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              You can continue the tour to learn how to use the platform. If you wish, you can exit from the tour by clicking the button.
            </p>

            <div className="flex justify-center gap-1.5 mt-5">
              <span className="w-2 h-2 rounded-full bg-foreground/20" aria-hidden />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brandPrimaryHex }} aria-hidden />
              <span className="w-2 h-2 rounded-full bg-foreground/20" aria-hidden />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleSkipTour} className="border-border text-muted-foreground w-full">
              Maybe Later
            </Button>
            <Button onClick={handleStartTour} className="text-white gap-1 w-full bg-brand hover:bg-brand-dark border-0">
              Start Tour
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isRunning && (
        <Suspense fallback={null}>
          <Joyride
            {...tourConfig}
            steps={stepsWithImages}
            callback={handleTourCallback}
            stepIndex={tourStepIndex}
            floaterProps={{
              disableAnimation: true,
            }}
          />
        </Suspense>
      )}
    </TourContext.Provider>
  );
}
