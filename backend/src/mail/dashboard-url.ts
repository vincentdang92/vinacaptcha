/**
 * Xác định URL công khai của Dashboard để dựng link gửi qua email
 * (kích hoạt tài khoản, đặt lại mật khẩu).
 *
 * Link trong email phải trỏ về đúng nơi người dùng mở Dashboard, KHÔNG phải host của
 * backend API (ở môi trường dev, Dashboard chạy port 3069 còn API chạy port 3068).
 *
 * Không tin tùy tiện header từ client (X-Forwarded-Host, Origin lạ...): kẻ tấn công có thể
 * khiến hệ thống gửi email thật chứa link trỏ tới domain của chúng (host header poisoning)
 * và lấy trộm token kích hoạt / đặt lại mật khẩu của nạn nhân.
 */

type HeaderValue = string | string[] | undefined;
export type RequestHeaders = Record<string, HeaderValue>;

const DEV_DASHBOARD_URL = 'http://localhost:3069';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function firstHeaderValue(value: HeaderValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(',')[0]?.trim();
  return first || undefined;
}

function parseHttpUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * URL Dashboard cấu hình qua env (DASHBOARD_URL ưu tiên hơn APP_URL).
 * Mặc định bỏ qua giá trị localhost vì .env dev thường để APP_URL trỏ vào backend
 * (http://localhost:3068) — dùng nó làm link Dashboard sẽ sai port.
 */
export function getConfiguredDashboardUrl(): string | undefined {
  for (const value of [process.env.DASHBOARD_URL, process.env.APP_URL]) {
    const url = parseHttpUrl(value?.trim());
    if (url && !isLoopback(url.hostname)) return trimTrailingSlash(value as string);
  }
  return undefined;
}

/**
 * Thứ tự ưu tiên:
 * 1. DASHBOARD_URL / APP_URL (không phải localhost) — cấu hình của quản trị viên, tin cậy tuyệt đối.
 * 2. Header Origin của trình duyệt — chỉ nhận khi cùng hostname với Host (gateway phục vụ chung
 *    Dashboard + API) hoặc cả hai đều là loopback (dev). Origin giữ được port và scheme thật,
 *    trong khi nginx `$host` làm mất port.
 * 3. `${proto}://${Host}` — không dùng X-Forwarded-Host vì client tự gửi được qua gateway.
 * 4. DASHBOARD_URL localhost (dev), cuối cùng là Dashboard dev mặc định. Không lùi về APP_URL
 *    localhost vì đó thường là host backend.
 */
export function resolveDashboardBaseUrl(headers: RequestHeaders = {}): string {
  const configured = getConfiguredDashboardUrl();
  if (configured) return configured;

  const hostHeader = firstHeaderValue(headers['host']);
  const forwardedProto = firstHeaderValue(headers['x-forwarded-proto'])?.toLowerCase();
  const proto = forwardedProto === 'https' ? 'https' : 'http';
  const requestUrl = hostHeader ? parseHttpUrl(`${proto}://${hostHeader}`) : undefined;

  const originUrl = parseHttpUrl(firstHeaderValue(headers['origin']));
  if (originUrl && requestUrl) {
    const originHost = originUrl.hostname.toLowerCase();
    const requestHost = requestUrl.hostname.toLowerCase();
    if (originHost === requestHost || (isLoopback(originHost) && isLoopback(requestHost))) {
      return originUrl.origin;
    }
  }

  if (requestUrl && !isLoopback(requestUrl.hostname)) {
    return requestUrl.origin;
  }

  const devDashboardUrl = process.env.DASHBOARD_URL?.trim();
  return parseHttpUrl(devDashboardUrl) ? trimTrailingSlash(devDashboardUrl as string) : DEV_DASHBOARD_URL;
}
