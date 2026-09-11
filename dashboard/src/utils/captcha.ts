export interface SliderCaptchaOptions {
  action: 'login' | 'register';
  siteKey?: string;
  baseUrl?: string;
}

/**
 * Trigger slider captcha challenge programmatically.
 * Resolves with the verify_token upon successful completion.
 */
export const executeSliderCaptcha = async (action: 'login' | 'register' = 'login'): Promise<string> => {
  const siteKey = (import.meta as any).env?.VITE_CAPTCHA_SITE_KEY || '5ae2b566-de1b-4ce2-947a-6f9645eb1004';
  
  // Wait if document/window is still loading the script
  let retryCount = 0;
  while (!(window as any).VinaCaptcha && !(window as any).NhanHoaCaptcha && retryCount < 20) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    retryCount++;
  }

  const CaptchaEngine = (window as any).VinaCaptcha || (window as any).NhanHoaCaptcha;

  if (!CaptchaEngine || typeof CaptchaEngine.execute !== 'function') {
    console.warn('[Captcha] VinaCaptcha engine not available or failed to load. Proceeding with fallback.');
    return '';
  }

  const baseUrl = (import.meta as any).env?.VITE_API_URL
    ? (import.meta as any).env.VITE_API_URL.replace(/\/admin\/v1\/?$/, '').replace(/\/v1\/?$/, '')
    : window.location.origin;

  try {
    const token = await CaptchaEngine.execute(siteKey, {
      forceChallenge: 'slider',
      action,
      baseUrl: baseUrl || window.location.origin,
    });

    return token || '';
  } catch (err) {
    console.error('[Captcha] Slider challenge execution error:', err);
    throw err;
  }
};
