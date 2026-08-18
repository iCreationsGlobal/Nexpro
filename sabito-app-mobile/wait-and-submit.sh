#!/bin/bash

# Script to wait for EAS build to complete and then submit automatically

BUILD_ID="f8218850-3769-47c8-bd9d-13e6895fe7d1"
MAX_WAIT_TIME=3600  # 60 minutes max wait
CHECK_INTERVAL=60   # Check every 60 seconds
ELAPSED=0

echo "🔍 Monitoring build: $BUILD_ID"
echo "📊 Check status: https://expo.dev/accounts/eamankyim/projects/sabito/builds/$BUILD_ID"
echo ""

while [ $ELAPSED -lt $MAX_WAIT_TIME ]; do
  STATUS=$(eas build:list --platform ios --limit 1 --non-interactive --json 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -z "$STATUS" ]; then
    STATUS="unknown"
  fi
  
  echo "[$(date +%H:%M:%S)] Build status: $STATUS"
  
  case "$STATUS" in
    "finished")
      echo ""
      echo "✅ Build completed successfully!"
      echo "📤 Submitting to App Store Connect..."
      eas submit --platform ios --profile production --non-interactive --latest
      if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Submission successful!"
        echo "📱 Check App Store Connect for processing status"
        exit 0
      else
        echo ""
        echo "❌ Submission failed. Please check the error above."
        exit 1
      fi
      ;;
    "errored"|"canceled")
      echo ""
      echo "❌ Build failed or was canceled. Status: $STATUS"
      echo "📊 Check logs: https://expo.dev/accounts/eamankyim/projects/sabito/builds/$BUILD_ID"
      exit 1
      ;;
    "new"|"in-progress"|"in-queue")
      echo "⏳ Build still in progress... (${ELAPSED}s elapsed)"
      sleep $CHECK_INTERVAL
      ELAPSED=$((ELAPSED + CHECK_INTERVAL))
      ;;
    *)
      echo "⏳ Waiting... (${ELAPSED}s elapsed)"
      sleep $CHECK_INTERVAL
      ELAPSED=$((ELAPSED + CHECK_INTERVAL))
      ;;
  esac
done

echo ""
echo "⏰ Timeout reached. Build may still be processing."
echo "📊 Check manually: https://expo.dev/accounts/eamankyim/projects/sabito/builds/$BUILD_ID"
exit 2
