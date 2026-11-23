/* Shared settings for the My Orders, tracking and courier pages. */
window.PP = {
  // Google Apps Script web app that stores orders (same URL the checkout page uses).
  ordersEndpoint: 'https://script.google.com/macros/s/AKfycbxm8HTo7xghfsbAbJPx1jZUoPAj-VsDuLsxB_F_UiZZCOFLyoU1JTKpU3UJyZGeFLDrvA/exec',
  // Google sign-in: the OAuth Web client ID from Google Cloud Console (APIs & Services > Credentials). It is public, not a secret.
  googleClientId: '',
  // Firebase web config (public values). On Vercel they come from FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN and FIREBASE_PROJECT_ID.
  firebase: { apiKey: '', authDomain: '', projectId: '' },
  // Payment window (assets/pay.js). mode 'demo' = test mode, nothing is charged. mode 'live' = only UPI to your own UPI ID and cash on delivery are real.
  // On Vercel these come from PAYMENT_MODE, UPI_ID, UPI_PAYEE and EMI_MIN (see build-config.js).
  pay: { mode: 'demo', upiId: '', payee: 'Vitame', emiMin: 3000 },
  // The shop owner's login email. The admin portal opens only when the server accepts this email with its password.
  adminEmail: 'i25rishabhj@iimidr.ac.in',
  // Mapbox public token (pk.). On Vercel it is filled in at deploy time from the MAPBOX_TOKEN environment variable (see build-config.js).
  mapboxToken: '',
  mapStyle: 'mapbox://styles/mapbox/light-v11'
};
