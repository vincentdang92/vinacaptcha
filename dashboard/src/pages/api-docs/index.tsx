import { useState } from "react";
import { Row, Col, Card, Typography, Tag, Tabs, Divider, Alert, Button, Space, message } from 'antd';
import {
  CodeOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  RobotOutlined,
  SlidersOutlined,
  PictureOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

const BASE_URL = typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost:3068";

const SKILL_MD_TEXT = `---
name: vina-captcha-integration
description: Hướng dẫn tích hợp hệ thống xác thực chống bot NhanHoaCaptcha vào đa nền tảng (Web, Laravel, WordPress, NodeJS, Python, Mobile App, Slider Captcha).
---

# NhanHoaCaptcha Integration Skill for AI Coding Agents

Tài liệu này cung cấp hướng dẫn đầy đủ và các đoạn mã mẫu chuẩn để AI Coding Agent (Cursor, Claude Code, Copilot, Antigravity,...) tự động tích hợp NhanHoaCaptcha vào bất kỳ codebase nào.

---

## 1. Mô hình 2 Khóa Bảo Mật (2-Key Architecture)

| Loại Khóa | Nơi Lưu Trữ | Giá Trị Ví Dụ | Mục Đích |
| :--- | :--- | :--- | :--- |
| 🟢 **Public Site Key** | Frontend HTML / JS / Mobile App | UUID: \`0119c349-a104-4dd2-b4c5-...\` | Khởi tạo Widget & lấy challenge từ NhanHoaCaptcha. Được bảo vệ bởi Domain Whitelist. |
| 🔴 **Private Secret Key** | Server Backend (.env) | \`cap_live_90ee9772f1e3...\` | Server backend dùng để gọi \`/v1/siteverify\` xác minh token. **Tuyệt đối không để lộ ở client.** |

---

## 2. Nguyên Lý Tích Hợp (2 Bước Bắt Buộc)

1. **Frontend (Client) — Có 3 cách tích hợp tùy chọn**:
   - **Cách A (Tự Động — Invisible)**: Thêm \`<div id="vina-captcha-container"></div>\` vào form và gọi \`new NhanHoaCaptcha("vina-captcha-container", { siteKey: "YOUR_SITE_KEY_UUID" })\`.
   - **Cách B (Chủ Động Khi Submit — reCAPTCHA v3 Style)**: Bắt sự kiện \`form.addEventListener('submit')\`, \`e.preventDefault()\`, và gọi \`NhanHoaCaptcha.ready()\` + \`NhanHoaCaptcha.execute('YOUR_SITE_KEY_UUID', { action: 'login' }).then(token => ...)\` để nhận token và submit form.
   - **Cách C (Bắt Buộc Thử Thách Ghép Hình Slider Captcha)**: Truyền option \`forceChallenge: 'slider'\` vào Widget config hoặc gọi \`NhanHoaCaptcha.execute('YOUR_SITE_KEY_UUID', { forceChallenge: 'slider' })\`. Người dùng sẽ kéo thanh trượt khớp hình puzzle trước khi token được cấp. Hoặc đơn giản là chuyển **Challenge Mode** sang **"Luôn yêu cầu Slider Captcha"** trong Dashboard.
2. **Backend (Server) & Chiến Lược Fail-Open Fallback (Timeout > 5s)**:
   - Server nhận \`vina_captcha_token\` từ request submit của client.
   - Gửi request \`POST \${BASE_URL}/v1/siteverify\` kèm \`secret\` (Secret Key \`cap_live_...\`) và \`verify_token\` với **Timeout tối đa 5 giây (5000ms)**.
   - **Giai đoạn thử nghiệm (Testing/Trial Mode)**: Nếu request bị treo quá 5s hoặc máy chủ Captcha trả về lỗi hệ thống (5xx), Backend của bạn nên **ƯU TIÊN CHO PASS (\`success: true\`)** để không gián đoạn giao dịch của người dùng thật.
   - Nếu \`success: true\` → Cho phép xử lý tiếp (Login, Register, Thanh toán...).
   - Nếu \`success: false\` → Chặn và báo lỗi "Xác thực Captcha thất bại".

---

## 3. Hướng Dẫn Tích Hợp Slider Captcha (Ghép Hình Tương Tác)

### Cách 1: Tự động hiện Slider khi Submit (Container Form)
\`\`\`html
<form id="login-form" action="/login" method="POST">
  <input type="text" name="username" placeholder="Tên đăng nhập" required />
  <input type="password" name="password" placeholder="Mật khẩu" required />
  
  <div id="vina-captcha-box"></div>
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />
  
  <button type="submit">Đăng Nhập</button>
</form>

<script src="https://your-captcha-domain.com/widget/vina-captcha.js" defer></script>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    new NhanHoaCaptcha("vina-captcha-box", {
      siteKey: "YOUR_PUBLIC_SITE_KEY_UUID",
      forceChallenge: "slider", // Bật chế độ ghép hình
      onSuccess: (token) => {
        document.getElementById("vina_captcha_token").value = token;
      }
    });
  });
</script>
\`\`\`

### Cách 2: Gọi Chủ Động Khi Click Nút Đăng Nhập (Modal Popup)
\`\`\`javascript
document.querySelector("#login-form").addEventListener("submit", function (e) {
  e.preventDefault();
  const form = this;

  NhanHoaCaptcha.ready(() => {
    NhanHoaCaptcha.execute("YOUR_PUBLIC_SITE_KEY_UUID", {
      action: "login",
      forceChallenge: "slider" // Bật popup slider ghép hình
    }).then((token) => {
      if (token) {
        document.getElementById("vina_captcha_token").value = token;
        form.submit();
      }
    });
  });
});
\`\`\`

---

## 3. Mã Mẫu Tích Hợp Cho Từng Nền Tảng

### 🚀 1. PHP / Laravel Framework

#### Validation Rule (\`app/Rules/NhanHoaCaptcha.php\`) với 5s Timeout Fallback:
\`\`\`php
<?php
namespace App\\Rules;

use Closure;
use Illuminate\\Contracts\\Validation\\ValidationRule;
use Illuminate\\Support\\Facades\\Http;
use Illuminate\\Support\\Facades\\Log;

class NhanHoaCaptcha implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        try {
            // Cài đặt timeout 5 giây
            $response = Http::timeout(5)->asJson()->post(config('services.vinacaptcha.base_url', 'https://your-captcha-domain.com') . '/v1/siteverify', [
                'secret'       => config('services.vinacaptcha.secret_key'), // cap_live_...
                'verify_token' => $value,
            ]);

            // Nếu máy chủ captcha trả về lỗi 5xx trong giai đoạn thử nghiệm -> Ưu tiên cho pass
            if (!$response->successful()) {
                Log::warning('[NhanHoaCaptcha] Server error, fail-open fallback applied.');
                return;
            }

            // Nếu token sai hoặc đã qua sử dụng
            if (!($response->json('success') ?? false)) {
                $fail('Xác thực bảo mật NhanHoaCaptcha không hợp lệ hoặc đã hết hạn.');
            }
        } catch (\\Throwable $e) {
            // Nếu bị treo > 5s hoặc lỗi mạng -> Ưu tiên cho pass trong giai đoạn thử nghiệm
            Log::warning('[NhanHoaCaptcha] Timeout (>5s) or exception, fail-open applied: ' . $e->getMessage());
            return;
        }
    }
}
\`\`\`

#### Controller Usage:
\`\`\`php
public function login(Request $request)
{
    $request->validate([
        'email' => 'required|email',
        'password' => 'required',
        'vina_captcha_token' => ['required', new \\App\\Rules\\NhanHoaCaptcha],
    ]);

    // Tiến hành xác thực đăng nhập...
}
\`\`\`

---

### 🌐 2. WordPress (functions.php hoặc Custom Plugin)

Thêm đoạn code sau vào file \`functions.php\` của theme đang dùng (Kèm Timeout 5s & Fail-Open):

\`\`\`php
// 1. Nhúng Widget JS vào trang Login / Register
add_action('login_enqueue_scripts', function() {
    wp_enqueue_script('vina-captcha', 'https://your-captcha-domain.com/widget/vina-captcha.js', [], null, true);
});

// 2. Thêm container vào Form Login (dùng Public Site Key UUID)
add_action('login_form', function() {
    echo '<div id="vina-captcha-box" style="margin-bottom: 16px;"></div>';
    echo '<script>
        document.addEventListener("DOMContentLoaded", function() {
            new NhanHoaCaptcha("vina-captcha-box", "YOUR_PUBLIC_SITE_KEY_UUID");
        });
    </script>';
});

// 3. Xác thực Token trước khi cho phép Login (dùng Secret Key cap_live_...)
add_filter('authenticate', function($user, $username, $password) {
    if (empty($username) || empty($password)) return $user;

    $token = $_POST['vina_captcha_token'] ?? '';
    if (empty($token)) {
        return new WP_Error('captcha_missing', '<strong>Lỗi</strong>: Vui lòng hoàn thành xác thực Captcha.');
    }

    $response = wp_remote_post('https://your-captcha-domain.com/v1/siteverify', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode([
            'secret'       => 'cap_live_YOUR_SECRET_KEY',
            'verify_token' => $token,
        ]),
        'timeout' => 5 // Timeout tối đa 5 giây
    ]);

    // Fail-Open Fallback: Nếu treo quá 5s hoặc lỗi kết nối -> Ưu tiên cho pass trong giai đoạn thử nghiệm
    if (is_wp_error($response)) {
        error_log('[NhanHoaCaptcha] Siteverify timeout (>5s)/error, fail-open allowed.');
        return $user;
    }

    $status_code = wp_remote_retrieve_response_code($response);
    if ($status_code >= 500) {
        return $user; // Fallback khi máy chủ captcha quá tải
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);
    if (empty($body['success'])) {
        return new WP_Error('captcha_invalid', 'Xác thực Captcha không hợp lệ.');
    }

    return $user;
}, 30, 3);
\`\`\`

---

### 🟢 3. Node.js (Express / NestJS)

#### Express Middleware với Timeout 5s & Fail-Open Fallback:
\`\`\`typescript
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

export async function verifyNhanHoaCaptcha(req: Request, res: Response, next: NextFunction) {
  const token = req.body.vina_captcha_token || req.headers['x-vina-token'];
  if (!token) {
    return res.status(400).json({ error: 'Missing NhanHoaCaptcha token (vina_captcha_token)' });
  }

  try {
    const response = await axios.post('https://your-captcha-domain.com/v1/siteverify', {
      secret: process.env.VINACAPTCHA_SECRET_KEY, // cap_live_...
      verify_token: token,
    }, {
      timeout: 5000 // Timeout 5 giây
    });

    if (response.data?.success) {
      // Gắn thông tin score vào request để controller có thể kiểm tra thêm nếu cần
      (req as any).captchaScore = response.data.score;
      (req as any).captchaRiskLevel = response.data.risk_level;
      return next();
    }
    return res.status(403).json({ error: 'Captcha verification failed', reason: response.data?.reason });
  } catch (err: any) {
    // Fallback: Nếu hệ thống treo > 5s hoặc lỗi mạng -> Ưu tiên SUCCESS trong giai đoạn thử nghiệm
    console.warn('[NhanHoaCaptcha] Siteverify timeout (>5s) or error, applying fail-open fallback:', err.message);
    return next(); // Cho phép tiếp tục luồng xử lý
  }
}
\`\`\`

---

### 🐍 4. Python (Django / FastAPI)

#### FastAPI Dependency với Timeout 5s & Fail-Open Fallback:
\`\`\`python
import httpx
from fastapi import HTTPException, Header, Body

VINACAPTCHA_VERIFY_URL = "https://your-captcha-domain.com/v1/siteverify"
SECRET_KEY = "cap_live_YOUR_SECRET_KEY"

async def verify_captcha(vina_captcha_token: str = Body(..., embed=True)):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client: # Timeout 5 giây
            res = await client.post(VINACAPTCHA_VERIFY_URL, json={
                "secret": SECRET_KEY,
                "verify_token": vina_captcha_token
            })
            if res.status_code >= 500:
                print("[NhanHoaCaptcha] Server 5xx error, applying fail-open fallback.")
                return True
            data = res.json()
            if not data.get("success"):
                raise HTTPException(status_code=400, detail="Invalid Captcha token")
    except httpx.TimeoutException:
        # Fallback: Treo quá 5s -> Ưu tiên cho pass trong giai đoạn thử nghiệm
        print("[NhanHoaCaptcha] Timeout > 5s, applying fail-open fallback.")
        return True
    except HTTPException:
        raise
    except Exception as e:
        print(f"[NhanHoaCaptcha] Network exception: {e}, fail-open applied.")
        return True
    return True
\`\`\`

---

### 📱 5. Mobile App (Flutter / React Native / iOS / Android)

Sử dụng **WebView Component** để chạy Widget và nhận Token qua JavaScript Bridge:
\`\`\`dart
// Flutter InAppWebView ví dụ:
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri("https://yourdomain.com/captcha-embed.html")),
  onWebViewCreated: (controller) {
    controller.addJavaScriptHandler(handlerName: "onCaptchaSuccess", callback: (args) {
      String token = args[0];
      // Gửi token này lên backend của bạn khi login
      submitLoginForm(token);
    });
  },
)
\`\`\`
`;

// Thành phần hiển thị code block với nút copy
const CodeBlock = ({ code, }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={handleCopy}
        style={{ position: "absolute", top: 10, right: 10, zIndex: 1, opacity: 0.7 }}
      >
        {copied ? "Đã copy!" : "Copy"}
      </Button>
      <pre
        style={{
          background: "#1e1e2e",
          color: "#cdd6f4",
          borderRadius: 8,
          padding: "16px 48px 16px 16px",
          fontSize: 13,
          lineHeight: 1.6,
          overflowX: "auto",
          margin: 0,
          fontFamily: "'Fira Code', 'Consolas', monospace",
        }}
      >
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
};

// Thành phần hiển thị endpoint API
const EndpointCard = ({
  method,
  path,
  desc,
  children,
}: {
  method: "POST" | "GET" | "PATCH" | "DELETE";
  path: string;
  desc: string;
  children?: React.ReactNode;
}) => {
  const methodColors: Record<string, string> = {
    POST: "#28c76f",
    GET: "#00cfe8",
    PATCH: "#ff9f43",
    DELETE: "#ea5455",
  };
  return (
    <Card
      variant="borderless"
      style={{ marginBottom: 16, border: "1px solid rgba(0,0,0,0.06)" }}
      styles={{ body: { padding: "16px 20px" } }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: children ? 12 : 0 }}>
        <Tag
          style={{
            background: methodColors[method] + "22",
            color: methodColors[method],
            border: `1px solid ${methodColors[method]}44`,
            fontWeight: 700,
            fontFamily: "monospace",
            fontSize: 12,
            padding: "2px 8px",
          }}
        >
          {method}
        </Tag>
        <Text strong style={{ fontFamily: "monospace", fontSize: 14 }}>{path}</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
      </div>
      {children}
    </Card>
  );
};

export const ApiDocsPage = () => {
  const [tab, setTab] = useState("quickstart");

  const tabItems = [
    {
      key: "quickstart",
      label: (
        <span><ThunderboltOutlined /> Bắt Đầu Nhanh</span>
      ),
      children: (
        <div>
          <Title level={4}>Tích hợp Widget vào Site (5 phút)</Title>

          <Alert
            type="info"
            icon={<SafetyOutlined />}
            showIcon
            message="Mô hình 2 Khóa: Dùng Public Site Key (UUID) cho mã HTML/JS ở client, và Secret Key (cap_live_...) cho Server Backend đối soát qua /v1/siteverify."
            style={{ marginBottom: 24 }}
          />

          {/* Bước 1 */}
          <Title level={5} style={{ color: "#7367f0" }}>Bước 1 — Nhúng Script vào trang HTML</Title>
          <CodeBlock lang="html" code={`<!-- Thêm trước thẻ </body> -->
<script src="${BASE_URL}/widget/vina-captcha.js" defer></script>`} />

          {/* Bước 2 */}
          <Title level={5} style={{ color: "#7367f0" }}>Bước 2 — Thêm Container vào Form</Title>
          <CodeBlock lang="html" code={`<form id="login-form" action="/login" method="POST">
  <input type="email" name="email" placeholder="Email" required />
  <input type="password" name="password" placeholder="Mật khẩu" required />

  <!-- Container captcha — đặt ngay trước nút Submit -->
  <div id="vina-captcha-container"></div>

  <!-- Hidden input sẽ được Widget tự động điền khi pass -->
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />

  <button type="submit">Đăng nhập</button>
</form>`} />

          {/* Bước 3 */}
          <Title level={5} style={{ color: "#7367f0" }}>Bước 3 — Khởi tạo Widget hoặc Gọi Chủ Động khi Submit</Title>
          <Tabs
            defaultActiveKey="auto"
            size="small"
            items={[
              {
                key: "auto",
                label: "Cách 1: Nhúng Tự Động (Auto Container)",
                children: (
                  <div>
                    <Paragraph type="secondary">
                      Widget tự động bắt sự kiện submit form, kiểm tra bot ngầm, hiện thử thách nếu cần và gán token vào form.
                    </Paragraph>
                    <CodeBlock lang="js" code={`<script>
  document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo Widget bằng Public Site Key (UUID) lấy từ mục Quản lý Sites
    const captcha = new NhanHoaCaptcha('vina-captcha-container', {
      siteKey: 'YOUR_SITE_KEY_UUID',  // Thay bằng Site Key UUID thật của bạn
      baseUrl: '${BASE_URL}',
      onSuccess: (token, score) => {
        // Widget tự điền vào hidden input #vina_captcha_token
        console.log('Captcha pass! Token:', token, 'Score:', score);
      },
      onError: (err) => {
        console.error('Captcha lỗi:', err);
      },
      debug: false  // Tắt khi đưa lên production
    });
  });
</script>`} />
                  </div>
                ),
              },
              {
                key: "programmatic",
                label: "Cách 2: Chặn & Gọi Chủ Động Khi Submit (reCAPTCHA v3 Style)",
                children: (
                  <div>
                    <Paragraph type="secondary">
                      Phù hợp cho các form sử dụng AJAX, jQuery Modal Loading, hoặc muốn chủ động kiểm soát thời điểm lấy token captcha trước khi gọi <Text code>form.submit()</Text>.
                    </Paragraph>
                    <CodeBlock lang="js" code={`<script>
  document.addEventListener("DOMContentLoaded", function () {
    // Bắt sự kiện submit của Form (Login/Register/Checkout)
    document.querySelector("form#login").addEventListener("submit", function(e) {
      e.preventDefault(); 
      const form = document.getElementById('login');
      
      // Khởi chạy lấy token xác thực từ NhanHoaCaptcha
      NhanHoaCaptcha.ready(function () {
        NhanHoaCaptcha.execute('YOUR_PUBLIC_SITE_KEY_UUID', { action: 'login' }).then(function (token) {
          if (!token) {
            alert("Xác thực Captcha thất bại. Vui lòng thử lại.");
            return;
          }

          // 1. Gán token nhận được vào field ẩn trong form (hoặc gán bằng jQuery)
          document.getElementById('vina_captcha_token').value = token;
          // $('#vina_captcha_token').val(token); // Nếu dùng jQuery

          // 2. Hiển thị modal loading / spinner (nếu có)
          if (typeof $ !== 'undefined' && $('#myModal_ticket_loading').length) {
            $("#myModal_ticket_loading").modal({
              backdrop: 'static',
              keyboard: false
            });
          }
          
          // 3. Tiến hành submit form thật lên backend
          try {
            form.submit();
          } catch (err) {
            alert("Có lỗi xảy ra! Vui lòng nhấn F5 và đăng nhập lại!");
          }
        });
      });
    });
  });
</script>`} />
                  </div>
                ),
              },
              {
                key: "slider",
                label: "Cách 3: Thử Thách Ghép Hình Slider (Interactive Puzzle)",
                children: (
                  <div>
                    <Paragraph type="secondary">
                      Ép buộc hiển thị popup ghép hình Slider Captcha tương tác cho người dùng trước khi submit form. Bạn cũng có thể bật tính năng này trực tiếp trong <strong>Quản lý Sites &rarr; Challenge Mode</strong> mà không cần đổi code.
                    </Paragraph>
                    <CodeBlock lang="js" code={`<script>
  document.addEventListener('DOMContentLoaded', () => {
    // Thêm tham số forceChallenge: 'slider'
    const captcha = new NhanHoaCaptcha('vina-captcha-container', {
      siteKey: 'YOUR_SITE_KEY_UUID',
      forceChallenge: 'slider', // Bắt buộc thử thách ghép hình
      onSuccess: (token, score) => {
        document.getElementById('vina_captcha_token').value = token;
        console.log('Slider pass! Token:', token);
      },
      onError: (err) => {
        console.error('Lỗi slider captcha:', err);
      }
    });
  });
</script>`} />
                  </div>
                ),
              },
            ]}
          />

          {/* Bước 4 */}
          <Title level={5} style={{ color: "#7367f0" }}>Bước 4 — Xác thực Token ở Backend (Server-to-Server dùng Secret Key)</Title>
          <Paragraph type="secondary">
            Sau khi user submit form, server backend nhận được <Text code>vina_captcha_token</Text>. 
            Phải gọi <Text code>/v1/siteverify</Text> kèm <Text code>secret</Text> (<Text code>cap_live_...</Text>) để xác nhận token hợp lệ — <strong>tuyệt đối không để lộ secret key ở client</strong>.
          </Paragraph>

          <Alert
            type="warning"
            showIcon
            icon={<SafetyOutlined />}
            message="Chiến Lược Dự Phòng Thất Bại (Fail-Open Fallback — Timeout 5s)"
            description={
              <div>
                Trong giai đoạn thử nghiệm (Testing/Trial Mode), nếu kết nối tới máy chủ Captcha bị <strong>treo quá 5 giây (Timeout &gt; 5s)</strong> hoặc server captcha gặp lỗi 5xx, backend của bạn nên <strong>ƯU TIÊN CHO PASS (success: true)</strong> để tránh làm gián đoạn trải nghiệm hoặc chặn người dùng thật.
              </div>
            }
            style={{ marginBottom: 16 }}
          />

          <Tabs
            defaultActiveKey="nodejs"
            size="small"
            items={[
              {
                key: "nodejs",
                label: "Node.js (Express / Fetch)",
                children: (
                  <CodeBlock lang="js" code={`const verifyToken = async (vinaToken, siteSecretKey) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // ⏱️ Timeout 5s

    const resp = await fetch('${BASE_URL}/v1/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: siteSecretKey,             // Khóa bí mật Server (cap_live_...)
        verify_token: vinaToken            // Token nhận từ client submit
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      // 🛡️ Fallback: Server lỗi 5xx trong giai đoạn thử nghiệm -> Cho qua
      console.warn('[NhanHoaCaptcha] Server status >= 500, ưu tiên cho pass trong lúc thử nghiệm.');
      return { success: true, fallback: true };
    }

    const data = await resp.json();
    return data;
  } catch (err) {
    // 🛡️ Fallback: Quá thời gian 5s hoặc lỗi mạng -> Ưu tiên SUCCESS trong lúc thử nghiệm
    console.warn('[NhanHoaCaptcha] Timeout > 5s hoặc lỗi mạng, fail-open fallback áp dụng:', err.message);
    return { success: true, fallback: true };
  }
};

// Trong route xử lý login:
app.post('/login', async (req, res) => {
  const vinaToken = req.body.vina_captcha_token;
  const result = await verifyToken(vinaToken, process.env.VINACAPTCHA_SECRET_KEY);
  
  if (!result.success) {
    return res.status(400).json({ error: 'Captcha không hợp lệ hoặc đã hết hạn', reason: result.reason });
  }
  
  // Xác thực thành công! (Điểm đánh giá: result.score, mức độ: result.risk_level)
  console.log('Xác thực hợp lệ từ hostname:', result.hostname, 'Score:', result.score);
  // Tiếp tục xử lý đăng nhập...
});`} />
                ),
              },
              {
                key: "php",
                label: "PHP / Laravel",
                children: (
                  <CodeBlock lang="php" code={`<?php
function verifyNhanHoaCaptcha(string $vinaToken, string $siteSecret): array {
    $payload = json_encode([
        'secret'       => $siteSecret,  // cap_live_...
        'verify_token' => $vinaToken,
    ]);

    $context = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\\r\\n",
            'content' => $payload,
            'timeout' => 5, // ⏱️ Timeout tối đa 5 giây
        ]
    ]);

    try {
        $result = @file_get_contents('${BASE_URL}/v1/siteverify', false, $context);
        if ($result === false) {
            // 🛡️ Fallback: Treo > 5s hoặc lỗi mạng -> Ưu tiên pass trong giai đoạn thử nghiệm
            error_log('[NhanHoaCaptcha] Timeout > 5s or connection error, fail-open applied.');
            return ['success' => true, 'fallback' => true];
        }

        $data = json_decode($result, true);
        return $data ?: ['success' => true, 'fallback' => true];
    } catch (\\Throwable $e) {
        return ['success' => true, 'fallback' => true];
    }
}

// Trong form handler:
$verify = verifyNhanHoaCaptcha($_POST['vina_captcha_token'] ?? '', $_ENV['VINACAPTCHA_SECRET_KEY']);
if (empty($verify['success'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Captcha không hợp lệ hoặc đã hết hạn']);
    exit;
}
// Tiếp tục xử lý...`} />
                ),
              },
              {
                key: "python",
                label: "Python (FastAPI / Flask)",
                children: (
                  <CodeBlock lang="python" code={`import requests, os

def verify_vina_captcha(vina_token: str) -> dict:
    try:
        resp = requests.post(
            '${BASE_URL}/v1/siteverify',
            json={
                'secret': os.environ.get('VINACAPTCHA_SECRET_KEY'), # cap_live_...
                'verify_token': vina_token,
            },
            timeout=5 # ⏱️ Timeout 5 giây
        )
        if resp.status_code >= 500:
            return {'success': True, 'fallback': True}
        return resp.json()
    except requests.exceptions.Timeout:
        # 🛡️ Fallback: Hệ thống treo > 5s -> Ưu tiên cho pass trong giai đoạn thử nghiệm
        print('[NhanHoaCaptcha] Timeout > 5s, ưu tiên pass trong lúc thử nghiệm.')
        return {'success': True, 'fallback': True}
    except Exception as e:
        print(f'[NhanHoaCaptcha] Lỗi kết nối: {e}, fail-open fallback.')
        return {'success': True, 'fallback': True}

# Django/Flask view:
@app.route('/login', methods=['POST'])
def login():
    vina_token = request.form.get('vina_captcha_token', '')
    res = verify_vina_captcha(vina_token)
    if not res.get('success'):
        return jsonify({'error': 'Captcha không hợp lệ'}), 400
    # Tiếp tục xử lý...`} />
                ),
              },
            ]}
          />

          {/* Bước 5 */}
          <Title level={5} style={{ color: "#7367f0", marginTop: 24 }}>Bước 5 — Xử lý Reset Captcha (Cho SPA / AJAX Form)</Title>
          <Paragraph type="secondary">
            Token của NhanHoaCaptcha là dạng <strong>one-time-use (sử dụng một lần)</strong>. Nếu form của bạn gửi bằng AJAX (không reload trang) và bị lỗi (vd: sai mật khẩu), bạn bắt buộc phải gọi hàm <Text code>reset()</Text> để Captcha đánh giá lại rủi ro và sinh token mới.
          </Paragraph>
          <CodeBlock lang="js" code={`// Lấy instance captcha đã khởi tạo từ trước
const captcha = new NhanHoaCaptcha('vina-captcha-container', 'YOUR_SITE_KEY_UUID');

async function handleAjaxSubmit() {
  const token = document.getElementById('vina_captcha_token').value;
  
  try {
    const res = await fetch('/api/login', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vina_captcha_token: token, username: '...' }) 
    });
    
    if (!res.ok) {
      // Đăng nhập thất bại (vd: sai mật khẩu)
      alert('Đăng nhập thất bại, vui lòng thử lại.');
      // BẮT BUỘC: Reset captcha để có thể submit lần 2!
      captcha.reset();
    }
  } catch (e) {
    // Lỗi mạng...
    captcha.reset();
  }
}`} />

          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="Hoàn tất! Widget sẽ tự động hoạt động ở chế độ invisible — người dùng thật không bị làm phiền bởi bất kỳ thử thách nào."
          />
        </div>
      ),
    },
    {
      key: "slider-captcha",
      label: (
        <span><SlidersOutlined /> Slider Captcha (Ghép Hình)</span>
      ),
      children: (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0 }}>
              🧩 Tích Hợp Thử Thách Ghép Hình (Slider Captcha)
            </Title>
            <Tag color="purple" style={{ fontWeight: 600 }}>INTERACTIVE PUZZLE</Tag>
          </div>

          <Paragraph type="secondary">
            Slider Captcha là hình thức xác thực người dùng tương tác cao cấp. Khi kích hoạt, một hộp thoại hiện đại sẽ hiển thị ảnh nền kèm mảnh ghép puzzle bị khuyết. Người dùng kéo thanh trượt từ trái sang phải để đưa mảnh ghép khớp vào ô trống.
          </Paragraph>

          {/* 3 Thẻ Đặc Điểm Nổi Bật */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={8}>
              <Card variant="borderless" style={{ background: "rgba(115, 103, 240, 0.04)", border: "1px solid rgba(115, 103, 240, 0.15)", borderRadius: 8, height: "100%" }}>
                <Title level={5} style={{ color: "#7367f0", marginTop: 0 }}>
                  <PictureOutlined style={{ marginRight: 8 }} />
                  HTML5 Canvas Tự Sinh
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Ảnh nền và đường cắt puzzle được vẽ trực tiếp bằng Canvas với mã seed ngẫu nhiên. Không load ảnh tĩnh từ server, chống hoàn toàn OCR và scraping.
                </Text>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card variant="borderless" style={{ background: "rgba(40, 199, 111, 0.04)", border: "1px solid rgba(40, 199, 111, 0.15)", borderRadius: 8, height: "100%" }}>
                <Title level={5} style={{ color: "#28c76f", marginTop: 0 }}>
                  <ExperimentOutlined style={{ marginRight: 8 }} />
                  Phân Tích Quỹ Đạo AI
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Hệ thống kiểm tra tọa độ đích (&plusmn;5px), thời gian thao tác (&ge; 200ms) và tính toán vi sai gia tốc chuột / cảm ứng để ngăn chặn bot giải tự động.
                </Text>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card variant="borderless" style={{ background: "rgba(0, 207, 232, 0.04)", border: "1px solid rgba(0, 207, 232, 0.15)", borderRadius: 8, height: "100%" }}>
                <Title level={5} style={{ color: "#00cfe8", marginTop: 0 }}>
                  <SafetyOutlined style={{ marginRight: 8 }} />
                  Hỗ Trợ Mọi Thiết Bị
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Tương thích hoàn hảo với màn hình cảm ứng (Touch Event) trên iOS/Android lẫn thao tác chuột trên máy tính để bàn. Tự động căn giữa màn hình.
                </Text>
              </Card>
            </Col>
          </Row>

          {/* 2 Cách Kích Hoạt */}
          <Title level={5} style={{ color: "#7367f0" }}>Cách 1: Kích Hoạt Qua Dashboard (Không Cần Sửa Code Frontend — Khuyến Nghị)</Title>
          <Alert
            type="info"
            showIcon
            message="Chuyển chế độ mà không cần deploy lại website:"
            description={
              <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
                <li>Truy cập mục <strong>Quản lý Sites</strong> ở menu bên trái.</li>
                <li>Bấm nút <strong>Sửa Site</strong> (biểu tượng bút chì) tại website bạn muốn cấu hình.</li>
                <li>Tại mục <strong>Chế độ Thử thách (Challenge Mode)</strong>, chọn <strong>Luôn yêu cầu Slider Captcha</strong>.</li>
                <li>Bấm <strong>Lưu thay đổi</strong>. Widget trên site của bạn sẽ lập tức kích hoạt thử thách Slider cho 100% lượt submit mà không cần sửa code!</li>
              </ol>
            }
            style={{ marginBottom: 24 }}
          />

          <Title level={5} style={{ color: "#7367f0" }}>Cách 2: Ép Buộc Hiển Thị Slider Bằng Mã Code Client (forceChallenge: 'slider')</Title>
          <Paragraph type="secondary">
            Nếu bạn chỉ muốn bật Slider Captcha cho một số Form quan trọng (như Nạp Tiền, Đăng Ký, Đổi Mật Khẩu), bạn có thể truyền tham số <Text code>forceChallenge: 'slider'</Text> trực tiếp trong code:
          </Paragraph>

          <Tabs
            defaultActiveKey="vanilla"
            size="small"
            items={[
              {
                key: "vanilla",
                label: "1. HTML & JavaScript Thuần",
                children: (
                  <CodeBlock lang="html" code={`<!-- 1. Nhúng Script Widget -->
<script src="${BASE_URL}/widget/vina-captcha.js" defer></script>

<!-- 2. Form HTML -->
<form id="login-form" action="/api/login" method="POST">
  <input type="text" name="username" placeholder="Tên đăng nhập" required />
  <input type="password" name="password" placeholder="Mật khẩu" required />

  <!-- Container Widget -->
  <div id="vina-captcha-container"></div>
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />

  <button type="submit">Đăng Nhập</button>
</form>

<script>
  document.addEventListener("DOMContentLoaded", () => {
    // Khởi tạo Widget với forceChallenge: 'slider'
    const captcha = new NhanHoaCaptcha("vina-captcha-container", {
      siteKey: "YOUR_SITE_KEY_UUID",
      forceChallenge: "slider", // BẮT BUỘC: Luôn hiển thị thử thách ghép hình
      onSuccess: (token, score) => {
        console.log("Xác thực Slider thành công! Token:", token);
        document.getElementById("vina_captcha_token").value = token;
      },
      onError: (err) => {
        console.error("Lỗi xác thực Slider:", err);
      }
    });
  });
</script>`} />
                ),
              },
              {
                key: "programmatic",
                label: "2. Chặn Submit & Mở Popup Slider (Execute Style)",
                children: (
                  <CodeBlock lang="html" code={`<!-- Phù hợp cho form AJAX / Bootstrap Modal / Custom Button -->
<script src="${BASE_URL}/widget/vina-captcha.js" defer></script>

<form id="register-form">
  <input type="email" id="email" placeholder="Email đăng ký" required />
  <input type="password" id="pwd" placeholder="Mật khẩu" required />
  <button type="submit" id="btn-submit">Tạo Tài Khoản</button>
</form>

<script>
  document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault(); // Chặn reload trang
    
    // Gọi execute với forceChallenge: 'slider'
    NhanHoaCaptcha.ready(() => {
      NhanHoaCaptcha.execute("YOUR_SITE_KEY_UUID", {
        action: "register",
        forceChallenge: "slider" // Kích hoạt popup ghép hình
      }).then(async (token) => {
        if (!token) {
          alert("Bạn chưa hoàn thành thử thách ghép hình.");
          return;
        }

        // Gửi dữ liệu kèm token lên backend của bạn
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: document.getElementById("email").value,
            password: document.getElementById("pwd").value,
            vina_captcha_token: token
          })
        });

        const data = await res.json();
        if (data.success) {
          alert("Đăng ký thành công!");
        } else {
          alert("Lỗi: " + data.message);
        }
      });
    });
  });
</script>`} />
                ),
              },
              {
                key: "react",
                label: "3. React / Next.js (TypeScript Component)",
                children: (
                  <CodeBlock lang="tsx" code={`import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    NhanHoaCaptcha?: any;
  }
}

interface SliderCaptchaProps {
  siteKey: string;
  onSuccess: (token: string) => void;
}

export const NhanHoaSliderCaptcha: React.FC<SliderCaptchaProps> = ({ siteKey, onSuccess }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const captchaInstance = useRef<any>(null);

  useEffect(() => {
    // 1. Tự động load script nếu chưa có
    if (!window.NhanHoaCaptcha) {
      const script = document.createElement('script');
      script.src = '${BASE_URL}/widget/vina-captcha.js';
      script.async = true;
      script.onload = () => initCaptcha();
      document.body.appendChild(script);
    } else {
      initCaptcha();
    }

    function initCaptcha() {
      if (containerRef.current && window.NhanHoaCaptcha && !captchaInstance.current) {
        captchaInstance.current = new window.NhanHoaCaptcha(containerRef.current, {
          siteKey,
          forceChallenge: 'slider', // Ép buộc Slider Captcha
          onSuccess: (token: string) => {
            onSuccess(token);
          },
          onError: (err: any) => {
            console.error('Slider captcha error:', err);
          }
        });
      }
    }
  }, [siteKey, onSuccess]);

  return <div ref={containerRef} id="vina-captcha-container" style={{ margin: '16px 0' }} />;
};

// Sử dụng trong Form:
export const LoginForm = () => {
  const [captchaToken, setCaptchaToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      alert('Vui lòng hoàn thành thử thách ghép hình!');
      return;
    }
    // Gửi token lên backend...
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" placeholder="Username" required />
      <input type="password" placeholder="Password" required />
      <NhanHoaSliderCaptcha
        siteKey="YOUR_SITE_KEY_UUID"
        onSuccess={(token) => setCaptchaToken(token)}
      />
      <button type="submit">Đăng Nhập</button>
    </form>
  );
};`} />
                ),
              },
              {
                key: "vue",
                label: "4. Vue.js 3 (Composition API)",
                children: (
                  <CodeBlock lang="html" code={`<template>
  <form @submit.prevent="handleLogin">
    <input v-model="username" type="text" placeholder="Username" required />
    <input v-model="password" type="password" placeholder="Password" required />
    
    <div ref="captchaContainer"></div>
    
    <button type="submit">Đăng Nhập</button>
  </form>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const username = ref('');
const password = ref('');
const captchaToken = ref('');
const captchaContainer = ref(null);

onMounted(() => {
  const init = () => {
    if (window.NhanHoaCaptcha && captchaContainer.value) {
      new window.NhanHoaCaptcha(captchaContainer.value, {
        siteKey: 'YOUR_SITE_KEY_UUID',
        forceChallenge: 'slider',
        onSuccess: (token) => {
          captchaToken.value = token;
        }
      });
    }
  };

  if (!window.NhanHoaCaptcha) {
    const script = document.createElement('script');
    script.src = '${BASE_URL}/widget/vina-captcha.js';
    script.onload = init;
    document.body.appendChild(script);
  } else {
    init();
  }
});

const handleLogin = async () => {
  if (!captchaToken.value) {
    alert('Vui lòng kéo thanh trượt ghép hình!');
    return;
  }
  // Gửi API login...
};
</script>`} />
                ),
              },
            ]}
          />

          {/* Quy Trình Xác Minh Server */}
          <Title level={5} style={{ color: "#7367f0", marginTop: 24 }}>Cơ Chế Xác Minh Phía Server (Backend Verification)</Title>
          <Paragraph type="secondary">
            Dù client sử dụng chế độ Invisible hay Slider Captcha, phía Server Backend của bạn <strong>chỉ cần xác minh duy nhất token <Text code>vina_captcha_token</Text></strong> thông qua endpoint <Text code>/v1/siteverify</Text>:
          </Paragraph>

          <CodeBlock lang="js" code={`// Backend (Node.js Express / PHP / Python)
// POST ${BASE_URL}/v1/siteverify
{
  "secret": "cap_live_YOUR_SECRET_KEY",
  "verify_token": req.body.vina_captcha_token
}

// Kết quả trả về nếu user ghép đúng:
{
  "success": true,
  "score": 10,
  "risk_level": "low",
  "hostname": "yourdomain.com",
  "timestamp": "2026-09-12T06:00:00.000Z"
}

// Nếu user giải sai tọa độ hoặc kéo bằng tool botnet:
// (Hệ thống từ chối ngay ở bước giải thử thách, token không được cấp)`} />

          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="Mẹo: Khi đăng nhập thất bại (sai mật khẩu), hãy gọi captcha.reset() để tạo mảnh ghép và ảnh nền mới cho lần đăng nhập tiếp theo."
            style={{ marginTop: 16 }}
          />
        </div>
      ),
    },
    {
      key: "public-api",
      label: (
        <span><ApiOutlined /> Public API</span>
      ),
      children: (
        <div>
          <Title level={4}>Public API — Widget & Server Siteverify</Title>
          <Paragraph type="secondary">
            Base URL: <Text code>{BASE_URL}</Text> — Hỗ trợ Header <Text code>X-Site-Key</Text> (Public Key) hoặc <Text code>X-Api-Key</Text>
          </Paragraph>

          <EndpointCard method="POST" path="/v1/issue" desc="Gọi khi form load, đánh giá rủi ro và cấp session thử thách">
            <Divider style={{ margin: "10px 0" }} />
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>REQUEST</Text>
                <CodeBlock lang="json" code={`// Header
X-Site-Key: 0119c349-a104-4dd2-b4c5-214c6656a481
Content-Type: application/json

// Body
{
  "domain": "shop.example.com",
  "honeypot_filled": false,
  "client_signals": {
    "webdriver": false,
    "canvas_fingerprint": "a1b2c3...",
    "time_on_page_ms": 4200,
    "mouse_moves": 34,
    "mouse_clicks": 2,
    "key_strokes": 18
  },
  "client_reported_ip": "14.185.x.x"
}`} />
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>RESPONSE 200</Text>
                <CodeBlock lang="json" code={`{
  "session_id": "8f2a1c3e-...",
  "challenge_type": "none",
  "pow_difficulty": null,
  "slider_data": null,
  "expires_in": 60
}

// challenge_type có thể là:
// "none"   → pass ngay, không popup
// "slider" → yêu cầu kéo thanh trượt ghép hình
// "pow"    → Proof-of-Work ngầm`} />
              </Col>
            </Row>
          </EndpointCard>

          <EndpointCard method="POST" path="/v1/verify" desc="Gọi sau khi giải quyết challenge để nhận verify_token">
            <Divider style={{ margin: "10px 0" }} />
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>REQUEST</Text>
                <CodeBlock lang="json" code={`// Nếu challenge_type = "slider":
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "slider",
    "final_position": 187,
    "drag_duration_ms": 850
  }
}

// Nếu challenge_type = "pow":
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "pow",
    "nonce": "128492"
  }
}

// Nếu challenge_type = "none":
{
  "session_id": "8f2a1c3e-..."
}`} />
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>RESPONSE 200</Text>
                <CodeBlock lang="json" code={`// Pass:
{
  "result": "pass",
  "verify_token": "vt_9f8e7d82b4c1..."
}

// Fail:
{
  "result": "fail",
  "reason": "slider_position_incorrect"
}

// Hết hạn session:
{
  "result": "expired",
  "reason": "session_expired"
}`} />
              </Col>
            </Row>
          </EndpointCard>

          <EndpointCard method="POST" path="/v1/siteverify" desc="Server-to-Server — Backend site khách xác nhận token với Secret Key">
            <Divider style={{ margin: "10px 0" }} />
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>REQUEST (từ backend của bạn)</Text>
                <CodeBlock lang="json" code={`{
  "secret": "cap_live_90ee9772f1e376bd801a2f1c",
  "verify_token": "vt_9f8e7d82b4c1..."
}`} />
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>RESPONSE 200</Text>
                <CodeBlock lang="json" code={`// Hợp lệ:
{
  "success": true,
  "score": 15,
  "risk_level": "low",
  "hostname": "shop.example.com",
  "timestamp": "2026-09-11T11:00:00.000Z"
}

// Thử nghiệm / Fallback khi hệ thống bận:
{
  "success": true,
  "score": 0,
  "risk_level": "low",
  "fallback": true,
  "warning": "system_busy_trial_fallback"
}

// Đã dùng / không hợp lệ:
{
  "success": false,
  "reason": "already_used"
}`} />
              </Col>
            </Row>
            <Alert
              type="info"
              showIcon
              message="Khuyến nghị tích hợp: Cài đặt HTTP client timeout 5000ms (5 giây). Nếu xảy ra timeout hoặc máy chủ trả mã lỗi 5xx trong giai đoạn thử nghiệm, backend khách nên ưu tiên gán { success: true } để không chặn người dùng thật."
              style={{ marginTop: 12 }}
            />
          </EndpointCard>

          <Card variant="borderless" style={{ border: "1px solid rgba(0,0,0,0.06)" }}>
            <Title level={5}>Mã lỗi thường gặp</Title>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", width: 80 }}>HTTP</th>
                  <th style={{ textAlign: "left", padding: "8px 0", width: 200 }}>Error Code</th>
                  <th style={{ textAlign: "left", padding: "8px 0" }}>Ý nghĩa</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["401", "missing_api_key", "Thiếu header X-Api-Key"],
                  ["401", "invalid_api_key", "API Key sai hoặc đã bị revoke"],
                  ["403", "domain_not_allowed", "Domain không nằm trong whitelist site"],
                  ["429", "rate_limit_exceeded", "Quá nhiều request từ IP này"],
                  ["400", "invalid_payload", "Request body không hợp lệ"],
                ].map(([code, err, desc]) => (
                  <tr key={err} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "8px 0" }}>
                      <Tag color={code === "401" || code === "403" ? "orange" : code === "429" ? "red" : "default"}>
                        {code}
                      </Tag>
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      <Text code style={{ fontSize: 12 }}>{err}</Text>
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      <Text type="secondary">{desc}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ),
    },
    {
      key: "widget-api",
      label: (
        <span><CodeOutlined /> Widget JS API</span>
      ),
      children: (
        <div>
          <Title level={4}>Widget JavaScript API</Title>
          <Paragraph type="secondary">
            Sau khi load script, class <Text code>NhanHoaCaptcha</Text> có sẵn ở global scope.
          </Paragraph>

          <Title level={5}>Constructor</Title>
          <CodeBlock lang="js" code={`const captcha = new NhanHoaCaptcha(containerId, config);

// containerId: string — ID của element chứa widget
// config: object — cấu hình widget`} />

          <Title level={5}>Config Options</Title>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Tham số</th>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Kiểu</th>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Bắt buộc</th>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Mô tả</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["siteKey", "string", "✅", "Public Site Key (UUID) lấy từ mục Quản lý Sites"],
                ["forceChallenge", "'auto' | 'slider' | 'pow' | 'none'", "❌", "Mặc định: 'auto'. Đặt 'slider' để ép buộc luôn hiển thị câu đố ghép hình Slider Captcha"],
                ["hideBadge", "boolean", "❌", "Mặc định: false. Đặt true để ẩn huy hiệu badge bảo mật ở góc dưới màn hình"],
                ["baseUrl", "string", "❌", `URL backend, mặc định: ${BASE_URL}`],
                ["onSuccess", "function(token, score)", "❌", "Callback khi captcha pass, nhận verify_token và risk score"],
                ["onError", "function(error)", "❌", "Callback khi có lỗi"],
                ["debug", "boolean", "❌", "Bật console log chi tiết (tắt trên production)"],
              ].map(([name, type, req, desc]) => (
                <tr key={name} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <td style={{ padding: "10px 12px" }}><Text code>{name}</Text></td>
                  <td style={{ padding: "10px 12px" }}><Text type="secondary">{type}</Text></td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{req}</td>
                  <td style={{ padding: "10px 12px" }}><Text type="secondary">{desc}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>

          <Title level={5}>Instance Methods & Static API</Title>
          <Paragraph type="secondary">
            Các phương thức của instance và Static API để gọi chủ động (giống reCAPTCHA v3 / grecaptcha).
          </Paragraph>
          
          <CodeBlock lang="js" code={`// 1. captcha.reset()
// Khởi tạo lại tiến trình Captcha, xóa token cũ, phân tích rủi ro lại từ đầu và lấy token mới.
// BẮT BUỘC DÙNG khi form submit bằng AJAX bị lỗi (vd: sai mật khẩu), để user có thể bấm Submit lại.
captcha.reset();

// 2. NhanHoaCaptcha.ready(callback)
// Đảm bảo DOM và Script Captcha đã sẵn sàng trước khi thực thi
NhanHoaCaptcha.ready(function() {
  console.log("NhanHoaCaptcha đã sẵn sàng!");
});

// 3. NhanHoaCaptcha.execute(siteKey, options) -> Promise<string>
// Lấy Token xác thực trực tiếp (hỗ trợ forceChallenge: 'slider' hoặc 'auto')
NhanHoaCaptcha.execute('YOUR_SITE_KEY_UUID', { action: 'login', forceChallenge: 'slider' }).then(function(token) {
  console.log("Token nhận được:", token);
});`} />

          <Title level={5} style={{ marginTop: 24 }}>Ví dụ 1: Tự động (Container trong Form)</Title>
          <CodeBlock lang="html" code={`<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <form id="myForm" action="/login" method="POST">
    <input type="email" name="email" required />
    <input type="password" name="password" required />
    
    <!-- Widget tự động quản lý -->
    <div id="vina-captcha-container"></div>
    <input type="hidden" id="vina_captcha_token" name="vina_captcha_token" />
    
    <button type="submit">Đăng nhập</button>
  </form>

  <script src="${BASE_URL}/widget/vina-captcha.js" defer></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      new NhanHoaCaptcha('vina-captcha-container', {
        siteKey: 'YOUR_SITE_KEY_UUID',
        onSuccess: (token, score) => {
          document.getElementById('vina_captcha_token').value = token;
          console.log('Xác thực hợp lệ!', token, score);
        },
        onError: (err) => {
          alert('Lỗi bảo mật: ' + err.message);
        }
      });
    });
  </script>
</body>
</html>`} />

          <Title level={5} style={{ marginTop: 24 }}>Ví dụ 2: Chặn Form Submit & Gọi Chủ Động (reCAPTCHA v3 / jQuery / Loading Modal)</Title>
          <Paragraph type="secondary">
            Mẫu code chuẩn theo phong cách chặn sự kiện <Text code>submit</Text>, gọi <Text code>NhanHoaCaptcha.ready</Text> và <Text code>NhanHoaCaptcha.execute</Text>, gán token và mở modal loading trước khi submit:
          </Paragraph>
          <CodeBlock lang="html" code={`<!-- Nhúng script widget ở header hoặc trước </body> -->
<script src="${BASE_URL}/widget/vina-captcha.js" defer></script>

<form id="login" action="/login" method="POST">
  <input type="text" name="username" placeholder="Tên đăng nhập" required />
  <input type="password" name="password" placeholder="Mật khẩu" required />
  
  <!-- Field ẩn lưu token captcha -->
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />
  
  <button type="submit" class="btn btn-primary">Đăng Nhập</button>
</form>

<script>
  document.addEventListener("DOMContentLoaded", function () {
    // 1. Chặn sự kiện submit form mặc định
    document.querySelector("form#login").addEventListener("submit", function(e) {
      e.preventDefault(); 
      const form = document.getElementById('login');
      
      // 2. Chờ Captcha sẵn sàng và thực thi lấy Token
      NhanHoaCaptcha.ready(function () {
        NhanHoaCaptcha.execute('YOUR_PUBLIC_SITE_KEY_UUID', { action: 'login' }).then(function (token) {
          if (!token) {
            alert("Xác thực Captcha thất bại. Vui lòng thử lại.");
            return;
          }

          // 3. Gán token nhận được vào input ẩn của form
          document.getElementById('vina_captcha_token').value = token;
          // Hoặc dùng jQuery: $('#vina_captcha_token').val(token);

          // 4. Hiển thị modal loading / spinner chờ phản hồi từ server (nếu có)
          if (typeof $ !== 'undefined' && $('#myModal_ticket_loading').length) {
            $("#myModal_ticket_loading").modal({
              backdrop: 'static',
              keyboard: false
            });
          }
          
          // 5. Tiến hành submit form lên backend
          try {
            form.submit();
          } catch (err) {
            alert("Có lỗi xảy ra! Vui lòng nhấn F5 và đăng nhập lại!");
          }
        });
      });
    });
  });
</script>`} />

          <Title level={5} style={{ marginTop: 24 }}>Ví dụ 3: Bắt Buộc Thử Thách Ghép Hình Slider (forceChallenge: 'slider')</Title>
          <Paragraph type="secondary">
            Mẫu code nhúng trực tiếp cấu hình yêu cầu người dùng kéo mảnh ghép Slider Puzzle:
          </Paragraph>
          <CodeBlock lang="html" code={`<!-- Nhúng script widget -->
<script src="${BASE_URL}/widget/vina-captcha.js" defer></script>

<form id="payment-form" action="/pay" method="POST">
  <input type="text" name="amount" placeholder="Số tiền thanh toán" required />
  
  <!-- Container chứa captcha -->
  <div id="vina-captcha-box"></div>
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />

  <button type="submit">Xác Nhận Giao Dịch</button>
</form>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    new NhanHoaCaptcha('vina-captcha-box', {
      siteKey: 'YOUR_SITE_KEY_UUID',
      forceChallenge: 'slider', // BẮT BUỘC HIỆN SLIDER GHÉP HÌNH
      onSuccess: (token) => {
        document.getElementById('vina_captcha_token').value = token;
        console.log('Slider pass! Token:', token);
      },
      onError: (err) => {
        console.error('Lỗi slider captcha:', err);
      }
    });
  });
</script>`} />
        </div>
      ),
    },
    {
      key: "mobile-app",
      label: (
        <span>📱 Mobile App (iOS/Android)</span>
      ),
      children: (
        <div>
          <Title level={4}>Tích hợp cho Ứng dụng Di động (Mobile App)</Title>
          <Paragraph type="secondary">
            NhanHoaCaptcha được thiết kế tối ưu cho nền tảng Web thông qua giao thức phân tích DOM và trình duyệt (Widget JS). Tuy nhiên, bạn vẫn có thể tích hợp dễ dàng trên các nền tảng di động (iOS, Android, React Native, Flutter) theo 2 cách dưới đây.
          </Paragraph>

          <Title level={5} style={{ color: "#7367f0", marginTop: 24 }}>Cách 1: Sử dụng WebView (Khuyến nghị)</Title>
          <Paragraph>
            Cách tốt nhất để sử dụng toàn bộ sức mạnh đánh giá rủi ro (Risk Engine) của NhanHoaCaptcha là nhúng một WebView ẩn vào màn hình đăng nhập / đăng ký trên App.
          </Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            <li>Tạo một trang HTML trống chứa mã nhúng Widget JS (tương tự Web) và host nó trên server của bạn (VD: <Text code>https://app.yourdomain.com/captcha.html</Text>).</li>
            <li>Trong mã HTML đó, lắng nghe sự kiện <Text code>onSuccess(token)</Text> của Widget, và truyền token về lại Native App thông qua JavaScript Bridge (VD: <Text code>window.webkit.messageHandlers</Text> trên iOS, hoặc <Text code>JavascriptInterface</Text> trên Android).</li>
            <li>Native App nhận được token, gửi kèm token này trong body khi gọi API login lên Backend của bạn.</li>
          </ul>

          <Title level={5} style={{ color: "#7367f0", marginTop: 24 }}>Cách 2: Gọi trực tiếp Public API từ Native Code</Title>
          <Paragraph>
            Nếu bạn không muốn sử dụng WebView, App của bạn có thể gọi trực tiếp API cấp token.
            <br />
            <Text type="danger">Lưu ý: Bỏ qua Widget đồng nghĩa với việc mất đi một số Client Signals (như Mouse/Touch tracking, Canvas), điểm rủi ro có thể bị đánh giá gắt gao hơn so với thông thường.</Text>
          </Paragraph>
          
          <CodeBlock lang="js" code={`// Bước 1: Native App gọi API xin cấp Token trước khi submit form
// POST ${BASE_URL}/v1/issue
{
  "domain": "com.yourcompany.appname", // Khai báo Bundle ID hoặc Package Name thay cho Domain
  "honeypot_filled": false,
  "client_signals": {
    "webdriver": false,
    "time_on_page_ms": 3500 // Tự đếm thời gian user dừng ở màn hình (ms)
  }
}

// Bước 2: Server trả về challenge_type
// Nếu là "none": Gọi luôn API /v1/verify
// POST ${BASE_URL}/v1/verify
{
  "session_id": "8f2a1c3e-..."
}

// Trả về verify_token: "vt_9f8e7d..."
// Bước 3: Đính kèm verify_token vào API Login gửi lên Backend của bạn như bình thường.`} />
        </div>
      )
    },
    {
      key: "ai-skill",
      label: (
        <span>
          <RobotOutlined style={{ marginRight: 6, color: "#7367f0" }} />
          AI Agent Skill (SKILL.md)
        </span>
      ),
      children: (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                🤖 AI Coding Agent Integration Skill
              </Title>
              <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                Tải về hoặc sao chép file <Text code>SKILL.md</Text> này để cung cấp cho các AI Coding Agent (Cursor, Claude Code, GitHub Copilot, Antigravity, ChatGPT) tự động tích hợp NhanHoaCaptcha vào dự án của bạn (Laravel, WordPress, Node.js, Python, Mobile App).
              </Paragraph>
            </div>
            <Space>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => {
                  const blob = new Blob([SKILL_MD_TEXT], { type: "text/markdown;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "vina-captcha-skill.md";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  message.success("Đã tải xuống file vina-captcha-skill.md thành công!");
                }}
              >
                Tải về SKILL.md
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(SKILL_MD_TEXT);
                  message.success("Đã sao chép toàn bộ nội dung SKILL.md vào clipboard!");
                }}
              >
                Sao chép Skill
              </Button>
            </Space>
          </div>

          <Alert
            message="Cách sử dụng với AI Agent"
            description={
              <div>
                <p style={{ margin: "4px 0" }}>
                  1. <strong>Cursor / Claude Code / Antigravity</strong>: Đặt file <Text code>vina-captcha-skill.md</Text> vào thư mục <Text code>.cursor/rules/</Text>, <Text code>.skills/</Text> hoặc gõ lệnh <Text code>@vina-captcha-skill.md Hãy tích hợp captcha vào trang đăng nhập</Text>.
                </p>
                <p style={{ margin: "4px 0" }}>
                  2. <strong>ChatGPT / Copilot</strong>: Dán toàn bộ nội dung file này vào khung chat kèm yêu cầu: <em>"Hãy đọc hướng dẫn NhanHoaCaptcha trên và viết code tích hợp cho ứng dụng Laravel/WordPress/React của tôi"</em>.
                </p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 20 }}
          />

          <CodeBlock lang="markdown" code={SKILL_MD_TEXT} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 0 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ApiOutlined style={{ marginRight: 8, color: "#7367f0" }} />
          API Documentation
        </Title>
        <Text type="secondary">Hướng dẫn tích hợp NhanHoaCaptcha vào website của bạn</Text>
      </div>

      <Card variant="borderless">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={tabItems}
          size="large"
        />
      </Card>
    </div>
  );
};
