import { Amplify } from 'aws-amplify';

// Only the kiosk needs Amplify (for AWS's <FaceLivenessDetector>), so this is
// called lazily from KioskPage.tsx rather than at app startup — keeps it out
// of every other portal's bundle. Uses an unauthenticated Cognito Identity
// Pool identity purely to get short-lived AWS credentials for the browser to
// stream to Rekognition — this is deliberately NOT our own app's JWT/RBAC
// auth, and the kiosk's static AWS access key/secret (used server-side only,
// see Backend/src/utils/rekognition.js) never reaches the browser.
let configured = false;

export function configureAmplify() {
  if (configured) return;
  const identityPoolId = import.meta.env.VITE_AWS_IDENTITY_POOL_ID;
  const region = import.meta.env.VITE_AWS_REGION;
  if (!identityPoolId || !region) {
    console.error('VITE_AWS_IDENTITY_POOL_ID / VITE_AWS_REGION are not set — kiosk face liveness cannot start.');
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        identityPoolId,
        allowGuestAccess: true,
      },
    },
  });
  configured = true;
}
