// NhanHoaCaptcha Widget Core — Complete Multi-Challenge Engine (v3 Invisible / PoW / Slider)
// Bundle target: < 15KB gzip

interface NhanHoaCaptchaConfig {
  siteKey: string;
  baseUrl?: string;
  onSuccess?: (token: string, score: number) => void;
  onError?: (err: Error) => void;
  debug?: boolean;
  hideBadge?: boolean;
  forceChallenge?: 'none' | 'slider' | 'pow';
}

type BadgeState = 'idle' | 'loading' | 'success' | 'error';

interface SliderChallengeData {
  x?: number;
  y: number;
  seed: number;
  puzzle_size: number;
}

interface SliderResult {
  final_position: number;
  drag_duration_ms: number;
  trajectory: Array<{ x: number; y: number; t: number }>;
}

function getDefaultBaseUrl(): string {
  if (typeof document !== 'undefined') {
    const currentScript = document.currentScript as HTMLScriptElement | null;
    if (currentScript && currentScript.src) {
      try {
        return new URL(currentScript.src).origin;
      } catch {}
    }
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src;
      if (src && src.includes('vina-captcha')) {
        try {
          return new URL(src).origin;
        } catch {}
      }
    }
  }
  return typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3068';
}

// ─── Global Telemetry & Marketing Analytics Engine (Zero-Friction / Passive) ──
let globalMouseMoves = 0;
let globalMouseClicks = 0;
let globalKeyStrokes = 0;
let globalPasteCount = 0;
let globalTabSwitchCount = 0;
let globalMaxScrollPct = 0;
let globalFirstInputFocusTime: number | null = null;
let globalTicking = false;
let globalScrollTicking = false;
const globalScriptStartTime = Date.now();

// Execution Snapshot tracking (Interval delta between consecutive submissions)
let lastExecutionTimestamp = globalScriptStartTime;
let lastExecutionMouseMoves = 0;
let lastExecutionMouseClicks = 0;
let lastExecutionKeyStrokes = 0;
let lastExecutionPasteCount = 0;
let executionCount = 0;

if (typeof window !== 'undefined') {
  // 1. Mouse movements
  window.addEventListener('mousemove', () => {
    if (!globalTicking) {
      window.requestAnimationFrame(() => {
        globalMouseMoves++;
        globalTicking = false;
      });
      globalTicking = true;
    }
  }, { passive: true });

  // 2. Mouse clicks
  window.addEventListener('click', (e) => {
    globalMouseClicks++;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      if (globalFirstInputFocusTime === null) {
        globalFirstInputFocusTime = Date.now();
      }
    }
  }, { passive: true });

  // 3. Keystrokes
  window.addEventListener('keydown', (e) => {
    globalKeyStrokes++;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (globalFirstInputFocusTime === null) {
        globalFirstInputFocusTime = Date.now();
      }
    }
  }, { passive: true });

  // 4. Paste detection
  window.addEventListener('paste', () => {
    globalPasteCount++;
  }, { passive: true });

  // 5. Tab switching (Page Visibility)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        globalTabSwitchCount++;
      }
    }, { passive: true });

    // Focus on inputs
    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        if (globalFirstInputFocusTime === null) {
          globalFirstInputFocusTime = Date.now();
        }
      }
    }, { passive: true });
  }

  // 6. Scroll depth tracking
  const updateScrollDepth = () => {
    if (typeof document === 'undefined') return;
    const docHeight = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0,
      document.body?.offsetHeight || 0,
      document.documentElement?.offsetHeight || 0,
      document.body?.clientHeight || 0,
      document.documentElement?.clientHeight || 0
    );
    const winHeight = window.innerHeight || 800;
    const scrollable = docHeight - winHeight;
    const currentScroll = window.scrollY || window.pageYOffset || 0;
    const pct = scrollable > 0 ? Math.min(100, Math.round((currentScroll / scrollable) * 100)) : 100;
    if (pct > globalMaxScrollPct) {
      globalMaxScrollPct = pct;
    }
  };

  window.addEventListener('scroll', () => {
    if (!globalScrollTicking) {
      window.requestAnimationFrame(() => {
        updateScrollDepth();
        globalScrollTicking = false;
      });
      globalScrollTicking = true;
    }
  }, { passive: true });
}

function getGlobalTimeOnPageMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round(performance.now());
  }
  return Date.now() - globalScriptStartTime;
}

function getUnmaskedGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return 'unsupported';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'unknown';
    return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
  } catch {
    return 'error';
  }
}

function parseMarketingParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (typeof window === 'undefined' || !window.location) return params;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    for (const key of utmKeys) {
      const val = searchParams.get(key);
      if (val) params[key] = val.substring(0, 100);
    }
  } catch {}
  return params;
}

function collectClientTelemetry(customSignals?: any) {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const scr = typeof window !== 'undefined' && window.screen ? window.screen : ({} as any);

  let timezone = 'UTC';
  let timezoneOffset = 0;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    timezoneOffset = new Date().getTimezoneOffset();
  } catch {}

  const utm = parseMarketingParams();
  const now = Date.now();
  executionCount++;
  const isFirstExecution = executionCount === 1;

  // Tính toán delta tương tác giữa các lần submit liên tiếp
  const timeOnPageMs = isFirstExecution
    ? getGlobalTimeOnPageMs()
    : Math.max(0, now - lastExecutionTimestamp);

  const mouseMoves = isFirstExecution
    ? globalMouseMoves
    : Math.max(0, globalMouseMoves - lastExecutionMouseMoves);

  const mouseClicks = isFirstExecution
    ? globalMouseClicks
    : Math.max(0, globalMouseClicks - lastExecutionMouseClicks);

  const keyStrokes = isFirstExecution
    ? globalKeyStrokes
    : Math.max(0, globalKeyStrokes - lastExecutionKeyStrokes);

  const pasteDetected = isFirstExecution
    ? globalPasteCount > 0
    : (globalPasteCount - lastExecutionPasteCount) > 0;

  const formFocusDelayMs =
    globalFirstInputFocusTime !== null
      ? Math.max(0, globalFirstInputFocusTime - globalScriptStartTime)
      : undefined;

  // Cập nhật snapshot cho lần submit tiếp theo
  lastExecutionTimestamp = now;
  lastExecutionMouseMoves = globalMouseMoves;
  lastExecutionMouseClicks = globalMouseClicks;
  lastExecutionKeyStrokes = globalKeyStrokes;
  lastExecutionPasteCount = globalPasteCount;

  return {
    // Core Security & Timing (Interval delta between submissions)
    webdriver: nav.webdriver || false,
    time_on_page_ms: timeOnPageMs,
    mouse_moves: mouseMoves,
    mouse_clicks: mouseClicks,
    key_strokes: keyStrokes,
    paste_detected: pasteDetected,
    tab_switch_count: globalTabSwitchCount,
    scroll_depth_pct: globalMaxScrollPct,
    form_focus_delay_ms: formFocusDelayMs,
    execution_count: executionCount,
    total_page_duration_ms: getGlobalTimeOnPageMs(),

    // Device & Screen
    screen_width: scr.width || 0,
    screen_height: scr.height || 0,
    color_depth: scr.colorDepth || 24,
    pixel_ratio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
    device_memory: nav.deviceMemory || undefined,
    hardware_concurrency: nav.hardwareConcurrency || undefined,
    touch_support: nav.maxTouchPoints > 0,
    gpu_renderer: getUnmaskedGpuRenderer(),

    // Localization
    timezone,
    timezone_offset: timezoneOffset,
    languages: nav.languages ? Array.from(nav.languages).slice(0, 5) : (nav.language ? [nav.language] : ['vi-VN']),

    // Network
    connection_type: nav.connection?.effectiveType || undefined,
    rtt_ms: nav.connection?.rtt || undefined,

    // Marketing Attribution
    referrer: typeof document !== 'undefined' && document.referrer ? document.referrer.substring(0, 250) : undefined,
    landing_path: typeof window !== 'undefined' && window.location ? window.location.pathname.substring(0, 150) : undefined,
    ...utm,

    ...(customSignals || {}),
  };
}

class NhanHoaCaptcha {
  private container: HTMLElement;
  private config: NhanHoaCaptchaConfig;
  private form: HTMLFormElement | null = null;
  private isSubmitting: boolean = false;

  constructor(containerId: string, config: NhanHoaCaptchaConfig | string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`[NhanHoaCaptcha] Container '${containerId}' not found`);
    this.container = el;

    const defaultBase = getDefaultBaseUrl();
    if (typeof config === 'string') {
      this.config = { siteKey: config, baseUrl: defaultBase, debug: false };
    } else {
      this.config = {
        ...config,
        baseUrl: config.baseUrl || defaultBase,
        debug: config.debug !== undefined ? config.debug : false,
      };
    }

    this.form = this.container.closest('form');
    this.init();

    if (this.config.debug) {
      console.log(`[NhanHoaCaptcha] Khởi tạo tại #${containerId}. Hỗ trợ: Invisible, PoW, Slider.`);
    }
  }

  private init() {
    // 1. Shadow DOM cách ly CSS honeypot
    const shadow = this.container.attachShadow({ mode: 'closed' });

    // 2. Honeypot field — bẫy bot điền form tự động
    const honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'email_hp_vina';
    honeypot.style.cssText = 'opacity:0;position:absolute;top:0;left:0;height:1px;width:1px;z-index:-1;';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    shadow.appendChild(honeypot);

    // 3. Badge góc dưới phải trang
    if (!this.config.hideBadge) {
      NhanHoaCaptcha.ensureBadge();
    }

    // 4. Móc vào form submit
    if (this.form) {
      let tokenInput = this.form.querySelector<HTMLInputElement>('input[name="vina_captcha_token"]');
      if (!tokenInput) {
        tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.name = 'vina_captcha_token';
        tokenInput.id = 'vina_captcha_token';
        this.form.appendChild(tokenInput);
      }
      this.form.addEventListener('submit', (e) => this.handleSubmit(e, honeypot, tokenInput as HTMLInputElement));
    } else if (this.config.debug && !this.config.hideBadge) {
      console.warn('[NhanHoaCaptcha] Không tìm thấy form cha. Chạy ở chế độ manual.');
    }
  }

  // ─── Badge UI (Floating Singleton) ──────────────────────────────────────────

  public static ensureBadge(options?: { hideBadge?: boolean }): { badge: HTMLElement; badgeText: HTMLElement } | null {
    if (typeof document === 'undefined') return null;
    if (options?.hideBadge || (window as any).vinaCaptchaHideBadge) return null;

    let badge = document.getElementById('vina-captcha-badge');
    let text = badge?.querySelector<HTMLElement>('.vina-badge-text');

    if (badge && text) {
      return { badge, badgeText: text };
    }

    // Inject CSS styling once for badge animation & responsive slider out
    if (!document.getElementById('vina-captcha-badge-style')) {
      const style = document.createElement('style');
      style.id = 'vina-captcha-badge-style';
      style.textContent = `
        #vina-captcha-badge {
          position: fixed !important;
          bottom: 16px !important;
          right: 16px !important;
          z-index: 2147483647 !important;
          display: inline-flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: flex-end !important;
          height: 38px !important;
          min-width: 38px !important;
          max-width: fit-content !important;
          padding: 0 10px !important;
          margin: 0 !important;
          background: #ffffff !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          border: 1px solid rgba(0, 0, 0, 0.12) !important;
          border-radius: 19px !important;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          color: #374151 !important;
          cursor: pointer !important;
          user-select: none !important;
          text-decoration: none !important;
          box-sizing: border-box !important;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
          overflow: hidden !important;
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          pointer-events: auto !important;
        }

        #vina-captcha-badge:hover,
        #vina-captcha-badge.vina-badge-expanded {
          padding-left: 14px !important;
          padding-right: 10px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18) !important;
          border-color: rgba(37, 99, 235, 0.35) !important;
          background: #ffffff !important;
        }

        #vina-captcha-badge .vina-badge-text {
          max-width: 0 !important;
          opacity: 0 !important;
          overflow: hidden !important;
          white-space: nowrap !important;
          margin: 0 !important;
          margin-right: 0 !important;
          padding: 0 !important;
          color: #374151 !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          line-height: 1 !important;
          transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin-right 0.35s ease !important;
          pointer-events: none !important;
          display: inline-block !important;
        }

        #vina-captcha-badge:hover .vina-badge-text,
        #vina-captcha-badge.vina-badge-expanded .vina-badge-text {
          max-width: 250px !important;
          opacity: 1 !important;
          margin-right: 8px !important;
          pointer-events: auto !important;
        }

        #vina-captcha-badge .vina-badge-icon {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 18px !important;
          height: 18px !important;
          color: #2563eb !important;
          flex-shrink: 0 !important;
          transition: transform 0.3s ease, color 0.3s ease !important;
        }

        #vina-captcha-badge:hover .vina-badge-icon {
          transform: scale(1.1) !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    if (!document.body) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => NhanHoaCaptcha.ensureBadge(options));
      }
      return null;
    }

    badge = document.createElement('div');
    badge.id = 'vina-captcha-badge';
    badge.setAttribute('title', 'Protected by NhanHoaCaptcha');

    // 1. Text description on the left (slides out smoothly when hovered)
    text = document.createElement('span');
    text.className = 'vina-badge-text';
    text.textContent = 'Protected by NhanHoaCaptcha';

    // 2. Shield icon on the right
    const icon = document.createElement('span');
    icon.className = 'vina-badge-icon';
    icon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    `;

    badge.appendChild(text);
    badge.appendChild(icon);

    badge.addEventListener('click', () => {
      window.open('https://nhanhoa.com', '_blank', 'noopener');
    });

    document.body.appendChild(badge);
    return { badge, badgeText: text };
  }

  public static setBadgeState(state: BadgeState, customText?: string) {
    const badgeInfo = NhanHoaCaptcha.ensureBadge();
    if (!badgeInfo) return;
    const { badge, badgeText } = badgeInfo;

    const styles: Record<BadgeState, { color: string; text: string }> = {
      idle:    { color: '#2563eb', text: 'Protected by NhanHoaCaptcha' },
      loading: { color: '#7367f0', text: 'Đang xác thực...' },
      success: { color: '#16a34a', text: '✓ Đã xác thực' },
      error:   { color: '#dc2626', text: '⚠ Không thể kết nối' },
    };

    const s = styles[state];
    badgeText.textContent = customText || s.text;

    const iconEl = badge.querySelector<HTMLElement>('.vina-badge-icon');
    if (iconEl) iconEl.style.color = s.color;
    badge.style.borderColor = state === 'idle' ? 'rgba(0,0,0,0.12)' : s.color + '66';

    // Tự động mở rộng badge khi trạng thái thay đổi để user nhận biết
    if (state !== 'idle') {
      badge.classList.add('vina-badge-expanded');
    }

    if (state === 'success' || state === 'error') {
      setTimeout(() => {
        badge.classList.remove('vina-badge-expanded');
        if (state === 'success') {
          NhanHoaCaptcha.setBadgeState('idle');
        }
      }, 2200);
    } else if (state === 'idle') {
      badge.classList.remove('vina-badge-expanded');
    }
  }

  private setBadgeState(state: BadgeState, customText?: string) {
    NhanHoaCaptcha.setBadgeState(state, customText);
  }



  // ─── Canvas Fingerprint ──────────────────────────────────────────────────────

  private getCanvasFingerprint(): string {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'unsupported';
      canvas.width = 200; canvas.height = 50;
      ctx.textBaseline = 'alphabetic';
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('NhanHoaCaptcha,fingerprint', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('NhanHoaCaptcha,fingerprint', 4, 17);
      const data = canvas.toDataURL();
      let hash = 5381;
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) + hash) + data.charCodeAt(i);
      }
      return hash.toString(16);
    } catch { return 'error'; }
  }

  // ─── Proof-of-Work (PoW) Solver ──────────────────────────────────────────────

  private async solvePoW(sessionId: string, difficulty: number): Promise<string> {
    const encoder = new TextEncoder();
    let nonce = 0;

    const countLeadingZeros = (buf: ArrayBuffer): number => {
      const u8 = new Uint8Array(buf);
      let bits = 0;
      for (let i = 0; i < u8.length; i++) {
        const b = u8[i];
        if (b === 0) {
          bits += 8;
        } else {
          bits += Math.clz32(b) - 24;
          break;
        }
      }
      return bits;
    };

    while (true) {
      const data = encoder.encode(`${sessionId}:${nonce}`);
      const hash = await window.crypto.subtle.digest('SHA-256', data);
      if (countLeadingZeros(hash) >= difficulty) {
        return nonce.toString();
      }
      nonce++;

      // Yield mỗi 400 hashes để không block main thread
      if (nonce % 400 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  // ─── Slider Puzzle Modal & Canvas Renderer ───────────────────────────────────

  private drawPuzzlePath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const r = size / 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Top
    ctx.lineTo(x + size / 2 - r, y);
    ctx.arc(x + size / 2, y - r / 2, r, Math.PI, 0, false);
    ctx.lineTo(x + size, y);
    // Right
    ctx.lineTo(x + size, y + size / 2 - r);
    ctx.arc(x + size + r / 2, y + size / 2, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(x + size, y + size);
    // Bottom
    ctx.lineTo(x + size / 2 + r, y + size);
    ctx.arc(x + size / 2, y + size + r / 2, r, 0, Math.PI, false);
    ctx.lineTo(x, y + size);
    // Left
    ctx.lineTo(x, y + size / 2 + r);
    ctx.arc(x - r / 2, y + size / 2, r, Math.PI / 2, -Math.PI / 2, true);
    ctx.closePath();
  }

  private renderProceduralBackground(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number) {
    let s = seed;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    // 1. Gradient bầu trời
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    const hues = [200, 260, 340, 30, 160];
    const baseHue = hues[Math.floor(rnd() * hues.length)];
    skyGrad.addColorStop(0, `hsl(${baseHue}, 80%, 45%)`);
    skyGrad.addColorStop(1, `hsl(${baseHue + 40}, 85%, 20%)`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Mặt trời / Mặt trăng
    ctx.save();
    const sunX = 40 + rnd() * (width - 80);
    const sunY = 30 + rnd() * 40;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 35);
    sunGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    sunGrad.addColorStop(0.5, 'rgba(255,240,150,0.4)');
    sunGrad.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Các dãy núi / sóng dập dềnh
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = `hsla(${baseHue + layer * 20}, 60%, ${15 + layer * 10}%, 0.85)`;
      ctx.beginPath();
      ctx.moveTo(0, height);
      let py = height - (30 + layer * 25);
      ctx.lineTo(0, py);
      for (let px = 0; px <= width; px += 40) {
        py += (rnd() - 0.5) * 35;
        py = Math.max(30, Math.min(height - 10, py));
        ctx.lineTo(px, py);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    }
  }

  private showSliderModal(sliderData?: SliderChallengeData): Promise<SliderResult> {
    return new Promise((resolve, reject) => {
      const targetY = sliderData?.y ?? 50;
      const seed = sliderData?.seed ?? 12345;
      const puzzleSize = sliderData?.puzzle_size ?? 40;
      const canvasWidth = 280;
      const canvasHeight = 155;

      // Overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(5px);
        z-index: 100000; display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      // Modal Card
      const card = document.createElement('div');
      card.style.cssText = `
        background: #ffffff; border-radius: 12px; padding: 16px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.2);
        width: 312px; display: flex; flex-direction: column; gap: 12px;
        animation: vinaSlideIn 0.25s ease-out;
      `;

      // Keyframes
      const styleTag = document.createElement('style');
      styleTag.textContent = `
        @keyframes vinaSlideIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `;
      document.head.appendChild(styleTag);

      // Header
      const header = document.createElement('div');
      header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
      header.innerHTML = `
        <div style="font-size: 14px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 6px;">
          <span>🛡️</span> Xác thực bảo mật
        </div>
        <button id="vina-close-btn" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #94a3b8; line-height: 1;">✕</button>
      `;
      card.appendChild(header);

      // Canvas Box
      const canvasContainer = document.createElement('div');
      canvasContainer.style.cssText = `position: relative; width: ${canvasWidth}px; height: ${canvasHeight}px; border-radius: 8px; overflow: hidden; background: #000;`;

      // Main Background Canvas
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = canvasWidth;
      bgCanvas.height = canvasHeight;
      const bgCtx = bgCanvas.getContext('2d')!;
      this.renderProceduralBackground(bgCtx, canvasWidth, canvasHeight, seed);

      // Draw Cutout Slot (Position from sliderData)
      const slotX = sliderData?.x ?? 140;
      bgCtx.save();
      this.drawPuzzlePath(bgCtx, slotX, targetY, puzzleSize);
      bgCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      bgCtx.fill();
      bgCtx.lineWidth = 2;
      bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      bgCtx.stroke();
      bgCtx.restore();

      // Floating Piece Canvas
      const pieceCanvas = document.createElement('canvas');
      pieceCanvas.width = canvasWidth;
      pieceCanvas.height = canvasHeight;
      pieceCanvas.style.cssText = `position: absolute; top: 0; left: 0; pointer-events: none; filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.5));`;
      const pCtx = pieceCanvas.getContext('2d')!;

      // Render full background on temporary canvas then clip puzzle piece
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasWidth;
      tempCanvas.height = canvasHeight;
      const tCtx = tempCanvas.getContext('2d')!;
      this.renderProceduralBackground(tCtx, canvasWidth, canvasHeight, seed);

      pCtx.save();
      this.drawPuzzlePath(pCtx, 0, targetY, puzzleSize);
      pCtx.clip();
      pCtx.drawImage(tempCanvas, -slotX, 0);
      pCtx.lineWidth = 2;
      pCtx.strokeStyle = '#ffffff';
      pCtx.stroke();
      pCtx.restore();

      canvasContainer.appendChild(bgCanvas);
      canvasContainer.appendChild(pieceCanvas);
      card.appendChild(canvasContainer);

      // Slider Track & Thumb
      const sliderTrack = document.createElement('div');
      sliderTrack.style.cssText = `
        position: relative; width: ${canvasWidth}px; height: 42px; background: #f1f5f9;
        border: 1px solid #cbd5e1; border-radius: 21px; overflow: hidden; user-select: none;
        display: flex; align-items: center; justify-content: center;
      `;
      sliderTrack.innerHTML = `<span style="font-size: 12px; color: #64748b; pointer-events: none;">Kéo sang phải để ghép hình →</span>`;

      const progressBar = document.createElement('div');
      progressBar.style.cssText = `position: absolute; left: 0; top: 0; height: 100%; width: 0px; background: #dcfce7; pointer-events: none; border-radius: 21px;`;
      sliderTrack.appendChild(progressBar);

      const thumb = document.createElement('div');
      thumb.style.cssText = `
        position: absolute; left: 0; top: 1px; width: 40px; height: 40px; background: #2563eb;
        border-radius: 50%; box-shadow: 0 2px 6px rgba(37,99,235,0.4); cursor: grab;
        display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px;
        transition: background 0.2s;
      `;
      thumb.textContent = '➔';
      sliderTrack.appendChild(thumb);
      card.appendChild(sliderTrack);

      // Footer branding
      const footer = document.createElement('div');
      footer.style.cssText = 'font-size: 10px; color: #94a3b8; text-align: center; margin-top: -4px;';
      footer.textContent = '🔒 Bảo vệ bởi NhanHoaCaptcha';
      card.appendChild(footer);

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Drag Logic
      let isDragging = false;
      let startMouseX = 0;
      let currentX = 0;
      let startTime = 0;
      const trajectory: Array<{ x: number; y: number; t: number }> = [];
      const maxDrag = canvasWidth - puzzleSize - 10;

      const onStart = (clientX: number) => {
        isDragging = true;
        startMouseX = clientX;
        startTime = Date.now();
        thumb.style.cursor = 'grabbing';
        thumb.style.background = '#1d4ed8';
        trajectory.push({ x: 0, y: targetY, t: 0 });
      };

      const onMove = (clientX: number) => {
        if (!isDragging) return;
        const delta = clientX - startMouseX;
        currentX = Math.max(0, Math.min(maxDrag, delta));
        thumb.style.left = `${currentX}px`;
        progressBar.style.width = `${currentX + 20}px`;
        pieceCanvas.style.transform = `translateX(${currentX}px)`;
        trajectory.push({ x: currentX, y: targetY, t: Date.now() - startTime });
      };

      const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        const dragDuration = Date.now() - startTime;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        overlay.remove();

        resolve({
          final_position: currentX,
          drag_duration_ms: dragDuration,
          trajectory,
        });
      };

      const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
      const handleMouseUp = () => onEnd();

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) onMove(e.touches[0].clientX);
      };
      const handleTouchEnd = () => onEnd();

      thumb.addEventListener('mousedown', (e: MouseEvent) => onStart(e.clientX));
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      thumb.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length > 0) onStart(e.touches[0].clientX);
      }, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd);

      // Close button
      const closeBtn = card.querySelector('#vina-close-btn');
      closeBtn?.addEventListener('click', () => {
        overlay.remove();
        reject(new Error('User closed challenge'));
      });
    });
  }

  // ─── Submit Handler (Universal Flow: None / PoW / Slider) ─────────────────────

  private async handleSubmit(e: SubmitEvent, honeypot: HTMLInputElement, tokenInput: HTMLInputElement) {
    if (this.isSubmitting) { e.preventDefault(); return; }
    if (tokenInput.value) return; // Token đã có → submit bình thường

    e.preventDefault();
    this.isSubmitting = true;
    this.setBadgeState('loading');

    const clientSignals = {
      ...collectClientTelemetry(),
      canvas_fingerprint: this.getCanvasFingerprint(),
    };

    if (this.config.debug) {
      console.log('[NhanHoaCaptcha] Bắt đầu đánh giá risk score...', clientSignals);
    }

    // Fetch IP public của browser (fallback khi dev local không có proxy)
    let clientReportedIp: string | undefined;
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json() as { ip: string };
        clientReportedIp = ipData.ip;
      }
    } catch { /* bỏ qua */ }

    try {
      // ① /v1/issue — nhận risk score & loại thử thách
      const issueRes = await fetch(`${this.config.baseUrl}/v1/issue`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-Site-Key': this.config.siteKey,
          'X-Api-Key': this.config.siteKey,
        },
        body: JSON.stringify({
          domain: window.location.hostname,
          honeypot_filled: honeypot.value.length > 0,
          client_signals: clientSignals,
          ...(clientReportedIp ? { client_reported_ip: clientReportedIp } : {}),
        }),
      });

      if (!issueRes.ok) throw new Error(`Issue failed: ${issueRes.status}`);
      const issueData = await issueRes.json();

      if (this.config.debug) {
        console.log(`[NhanHoaCaptcha] Risk score: ${issueData.risk_score ?? 'N/A'}, challenge: ${issueData.challenge_type}`);
      }

      // ② Chuẩn bị payload phản hồi theo loại thử thách
      let challengeResponse: any = undefined;

      if (issueData.challenge_type === 'pow') {
        this.setBadgeState('loading', 'Đang giải mã PoW...');
        const nonce = await this.solvePoW(issueData.session_id, issueData.pow_difficulty || 12);
        challengeResponse = {
          type: 'pow',
          nonce,
        };
      } else if (issueData.challenge_type === 'slider') {
        this.setBadgeState('loading', 'Vui lòng ghép hình');
        const sliderResult = await this.showSliderModal(issueData.slider_data);
        challengeResponse = {
          type: 'slider',
          final_position: sliderResult.final_position,
          drag_duration_ms: sliderResult.drag_duration_ms,
          trajectory: sliderResult.trajectory,
        };
      }

      // ③ /v1/verify — gửi giải pháp thử thách
      const verifyRes = await fetch(`${this.config.baseUrl}/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: issueData.session_id,
          challenge_response: challengeResponse,
        }),
      });

      if (!verifyRes.ok) throw new Error(`Verify failed: ${verifyRes.status}`);
      const verifyData = await verifyRes.json();

      if (verifyData.result === 'pass') {
        tokenInput.value = verifyData.verify_token;
        this.setBadgeState('success');

        if (this.config.debug) {
          console.log(`[NhanHoaCaptcha] ✓ Pass! Token: ${verifyData.verify_token}`);
        }

        if (this.config.onSuccess) {
          this.config.onSuccess(verifyData.verify_token, issueData.risk_score ?? 0);
        }

        this.form?.submit();
      } else {
        if (this.config.debug) {
          console.warn(`[NhanHoaCaptcha] Verify failed: ${verifyData.result} (${verifyData.reason})`);
        }
        this.setBadgeState('error', 'Xác thực thất bại');
        this.isSubmitting = false;

        // Nếu là slider kéo sai -> Cho phép submit lại
        setTimeout(() => this.setBadgeState('idle'), 2000);
      }
    } catch (err) {
      console.error('[NhanHoaCaptcha] Lỗi xác thực:', err);
      this.setBadgeState('error');

      if (this.config.onError) this.config.onError(err as Error);

      setTimeout(() => {
        this.setBadgeState('idle');
        this.isSubmitting = false;
        this.form?.submit(); // Fail-open
      }, 1500);
    }
  }

  // ─── Manual Execution & Test Trigger ──────────────────────────────────────────

  public async execute(options?: { forceChallenge?: 'none' | 'slider' | 'pow'; customSignals?: any }): Promise<{
    success: boolean;
    verify_token?: string;
    score?: number;
    challenge_type?: string;
    reason?: string;
    duration_ms?: number;
  }> {
    const startTime = Date.now();
    this.setBadgeState('loading');

    const clientSignals = {
      ...collectClientTelemetry(options?.customSignals),
      canvas_fingerprint: this.getCanvasFingerprint(),
    };

    let clientReportedIp: string | undefined;
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      if (ipRes.ok) {
        const ipData = (await ipRes.json()) as { ip: string };
        clientReportedIp = ipData.ip;
      }
    } catch { /* bỏ qua */ }

    try {
      const issueRes = await fetch(`${this.config.baseUrl}/v1/issue`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'X-Site-Key': this.config.siteKey,
          'X-Api-Key': this.config.siteKey,
        },
        body: JSON.stringify({
          domain: window.location.hostname,
          honeypot_filled: false,
          client_signals: clientSignals,
          ...(clientReportedIp ? { client_reported_ip: clientReportedIp } : {}),
          ...(options?.forceChallenge ? { force_challenge: options.forceChallenge } : (this.config.forceChallenge ? { force_challenge: this.config.forceChallenge } : {})),
        }),
      });

      if (!issueRes.ok) throw new Error(`Issue failed: ${issueRes.status}`);
      const issueData = await issueRes.json();

      let challengeResponse: any = undefined;

      if (issueData.challenge_type === 'pow') {
        this.setBadgeState('loading', 'Đang giải mã PoW...');
        const nonce = await this.solvePoW(issueData.session_id, issueData.pow_difficulty || 12);
        challengeResponse = {
          type: 'pow',
          nonce,
        };
      } else if (issueData.challenge_type === 'slider') {
        this.setBadgeState('loading', 'Vui lòng ghép hình');
        const sliderResult = await this.showSliderModal(issueData.slider_data);
        challengeResponse = {
          type: 'slider',
          final_position: sliderResult.final_position,
          drag_duration_ms: sliderResult.drag_duration_ms,
          trajectory: sliderResult.trajectory,
        };
      }

      const verifyRes = await fetch(`${this.config.baseUrl}/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: issueData.session_id,
          challenge_response: challengeResponse,
        }),
      });

      if (!verifyRes.ok) throw new Error(`Verify failed: ${verifyRes.status}`);
      const verifyData = await verifyRes.json();

      const totalDuration = Date.now() - startTime;

      if (verifyData.result === 'pass') {
        this.setBadgeState('success');
        const tokenInput = this.form?.querySelector<HTMLInputElement>('input[name="vina_captcha_token"]');
        if (tokenInput) tokenInput.value = verifyData.verify_token;

        if (this.config.onSuccess) {
          this.config.onSuccess(verifyData.verify_token, issueData.risk_score ?? 0);
        }

        return {
          success: true,
          verify_token: verifyData.verify_token,
          score: issueData.risk_score ?? 0,
          challenge_type: issueData.challenge_type,
          duration_ms: totalDuration,
        };
      } else {
        this.setBadgeState('error', 'Xác thực thất bại');
        setTimeout(() => this.setBadgeState('idle'), 2000);
        return {
          success: false,
          reason: verifyData.reason,
          challenge_type: issueData.challenge_type,
          duration_ms: totalDuration,
        };
      }
    } catch (err: any) {
      this.setBadgeState('error');
      setTimeout(() => this.setBadgeState('idle'), 2000);
      if (this.config.onError) this.config.onError(err as Error);
      return {
        success: false,
        reason: err.message || 'network_error',
        duration_ms: Date.now() - startTime,
      };
    }
  }

  public reset() {
    this.isSubmitting = false;
    this.setBadgeState('idle');
    const tokenInput = this.form?.querySelector<HTMLInputElement>('input[name="vina_captcha_token"]');
    if (tokenInput) tokenInput.value = '';
  }

  // ─── Static Programmatic API (reCAPTCHA v3 Drop-in Style) ───────────────────

  public static ready(callback: () => void): void {
    if (typeof document === 'undefined') return;
    NhanHoaCaptcha.ensureBadge();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(callback, 1);
    } else {
      document.addEventListener('DOMContentLoaded', callback);
    }
  }

  public static async execute(
    siteKeyOrConfig: string | NhanHoaCaptchaConfig,
    options?: { action?: string; forceChallenge?: 'none' | 'slider' | 'pow'; baseUrl?: string }
  ): Promise<string> {
    const siteKey = typeof siteKeyOrConfig === 'string' ? siteKeyOrConfig : siteKeyOrConfig.siteKey;
    const baseUrl =
      (typeof siteKeyOrConfig === 'object' && siteKeyOrConfig.baseUrl) ||
      options?.baseUrl ||
      getDefaultBaseUrl();

    if (typeof document === 'undefined') return '';

    NhanHoaCaptcha.ensureBadge();
    NhanHoaCaptcha.setBadgeState('loading');

    const virtualContainer = document.createElement('div');
    virtualContainer.id = `nhanhoa-captcha-exec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    virtualContainer.style.display = 'none';
    document.body.appendChild(virtualContainer);

    try {
      const instance = new NhanHoaCaptcha(virtualContainer.id, {
        siteKey,
        baseUrl,
        hideBadge: false,
        forceChallenge: options?.forceChallenge,
      });

      const res = await instance.execute({
        forceChallenge: options?.forceChallenge,
        customSignals: options?.action ? { action: options.action } : undefined,
      });

      virtualContainer.remove();
      if (res.success && res.verify_token) {
        NhanHoaCaptcha.setBadgeState('success');
        return res.verify_token;
      } else {
        NhanHoaCaptcha.setBadgeState('error', res.reason || 'Xác thực thất bại');
        return '';
      }
    } catch (err) {
      virtualContainer.remove();
      NhanHoaCaptcha.setBadgeState('error', 'Lỗi kết nối');
      console.error('[NhanHoaCaptcha] Programmatic execute failed:', err);
      return '';
    }
  }
}

// Gán trực tiếp vào global window (hỗ trợ cả NhanHoaCaptcha và alias VinaCaptcha)
if (typeof window !== 'undefined') {
  (window as any).NhanHoaCaptcha = NhanHoaCaptcha;
  (window as any).VinaCaptcha = NhanHoaCaptcha;

  // Auto-mount badge on DOM ready
  NhanHoaCaptcha.ready(() => {
    NhanHoaCaptcha.ensureBadge();
  });
}
export default NhanHoaCaptcha;

