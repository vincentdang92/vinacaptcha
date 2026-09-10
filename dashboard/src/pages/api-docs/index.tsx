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
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

const BASE_URL = "https://captcha.nhanhoa.com"; // Production URL — đổi lại khi deploy

const SKILL_MD_TEXT = `---
name: vina-captcha-integration
description: Hướng dẫn tích hợp hệ thống xác thực chống bot VinaCaptcha vào đa nền tảng (Web, Laravel, WordPress, NodeJS, Python, Mobile App).
---

# VinaCaptcha Integration Skill for AI Coding Agents

Tài liệu này cung cấp hướng dẫn đầy đủ và các đoạn mã mẫu chuẩn để AI Coding Agent (Cursor, Claude Code, Copilot, Antigravity,...) tự động tích hợp VinaCaptcha vào bất kỳ codebase nào.

---

## 1. Nguyên Lý Tích Hợp (2 Bước Bắt Buộc)

1. **Frontend (Client)**:
   - Nhúng Widget JS \`vina-captcha.js\` vào form.
   - Khi user tương tác/submit form, Widget tự động tạo một \`verify_token\` ngắn hạn (60s) gắn vào field ẩn \`vina_captcha_token\` trong form.
2. **Backend (Server)**:
   - Server nhận \`vina_captcha_token\` từ request client.
   - Gửi request \`POST \${BASE_URL}/v1/siteverify\` kèm \`secret_key\` để xác minh token hợp lệ.
   - Nếu \`success: true\` → Cho phép xử lý tiếp (Login, Register, Thanh toán...).
   - Nếu \`success: false\` → Chặn và báo lỗi "Xác thực Captcha thất bại".

---

## 2. Mã Mẫu Tích Hợp Cho Từng Nền Tảng

### 🚀 1. PHP / Laravel Framework

#### Validation Rule (\`app/Rules/VinaCaptcha.php\`):
\`\`\`php
<?php
namespace App\\Rules;

use Closure;
use Illuminate\\Contracts\\Validation\\ValidationRule;
use Illuminate\\Support\\Facades\\Http;

class VinaCaptcha implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $response = Http::asJson()->post(config('services.vinacaptcha.base_url', 'https://captcha.nhanhoa.com') . '/v1/siteverify', [
            'secret_key' => config('services.vinacaptcha.secret_key'),
            'token' => $value,
            'remoteip' => request()->ip(),
        ]);

        if (!$response->successful() || !($response->json('success') ?? false)) {
            $fail('Xác thực bảo mật VinaCaptcha không hợp lệ hoặc đã hết hạn.');
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
        'vina_captcha_token' => ['required', new \\App\\Rules\\VinaCaptcha],
    ]);

    // Tiến hành xác thực đăng nhập...
}
\`\`\`

---

### 🌐 2. WordPress (functions.php hoặc Custom Plugin)

Thêm đoạn code sau vào file \`functions.php\` của theme đang dùng:

\`\`\`php
// 1. Nhúng Widget JS vào trang Login / Register
add_action('login_enqueue_scripts', function() {
    wp_enqueue_script('vina-captcha', 'https://captcha.nhanhoa.com/widget/vina-captcha.js', [], null, true);
});

// 2. Thêm container vào Form Login
add_action('login_form', function() {
    echo '<div id="vinacaptcha-box" style="margin-bottom: 16px;"></div>';
    echo '<input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />';
    echo '<script>
        document.addEventListener("DOMContentLoaded", function() {
            new VinaCaptcha("vinacaptcha-box", {
                siteKey: "YOUR_SITE_API_KEY",
                onSuccess: function(token) {
                    document.getElementById("vina_captcha_token").value = token;
                }
            });
        });
    </script>';
});

// 3. Xác thực Token trước khi cho phép Login
add_filter('authenticate', function($user, $username, $password) {
    if (empty($username) || empty($password)) return $user;

    $token = $_POST['vina_captcha_token'] ?? '';
    if (empty($token)) {
        return new WP_Error('captcha_missing', '<strong>Lỗi</strong>: Vui lòng hoàn thành xác thực Captcha.');
    }

    $response = wp_remote_post('https://captcha.nhanhoa.com/v1/siteverify', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode([
            'secret_key' => 'YOUR_SECRET_KEY',
            'token' => $token,
            'remoteip' => $_SERVER['REMOTE_ADDR'] ?? ''
        ]),
        'timeout' => 5
    ]);

    if (is_wp_error($response)) {
        return new WP_Error('captcha_failed', 'Lỗi kết nối máy chủ Captcha.');
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

#### Express Middleware:
\`\`\`typescript
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

export async function verifyVinaCaptcha(req: Request, res: Response, next: NextFunction) {
  const token = req.body.vina_captcha_token || req.headers['x-vina-token'];
  if (!token) {
    return res.status(400).json({ error: 'Missing VinaCaptcha token' });
  }

  try {
    const response = await axios.post('https://captcha.nhanhoa.com/v1/siteverify', {
      secret_key: process.env.VINACAPTCHA_SECRET_KEY,
      token,
      remoteip: req.ip,
    });

    if (response.data?.success) {
      return next();
    }
    return res.status(403).json({ error: 'Captcha verification failed' });
  } catch (err) {
    return res.status(500).json({ error: 'Captcha verification server error' });
  }
}
\`\`\`

---

### 🐍 4. Python (Django / FastAPI)

#### FastAPI Dependency:
\`\`\`python
import httpx
from fastapi import HTTPException, Header, Body

VINACAPTCHA_VERIFY_URL = "https://captcha.nhanhoa.com/v1/siteverify"
SECRET_KEY = "YOUR_SECRET_KEY"

async def verify_captcha(vina_captcha_token: str = Body(..., embed=True)):
    async with httpx.AsyncClient() as client:
        res = await client.post(VINACAPTCHA_VERIFY_URL, json={
            "secret_key": SECRET_KEY,
            "token": vina_captcha_token
        })
        data = res.json()
        if not data.get("success"):
            raise HTTPException(status_code=400, detail="Invalid Captcha token")
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
            message="Yêu cầu: Bạn cần có API Key. Vào mục Quản lý Sites → Tạo Site → Tạo API Key để lấy."
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
  <div id="vinacaptcha-container"></div>

  <!-- Hidden input sẽ được Widget tự điền khi pass -->
  <input type="hidden" name="vina_token" id="vina_token" />

  <button type="submit">Đăng nhập</button>
</form>`} />

          {/* Bước 3 */}
          <Title level={5} style={{ color: "#7367f0" }}>Bước 3 — Khởi tạo Widget</Title>
          <CodeBlock lang="js" code={`<script>
  document.addEventListener('DOMContentLoaded', () => {
    const captcha = new VinaCaptcha('vinacaptcha-container', {
      siteKey: 'cap_live_YOUR_API_KEY_HERE',  // Thay bằng API Key thật
      baseUrl: '${BASE_URL}',
      onSuccess: (token) => {
        // Widget tự điền vào hidden input #vina_token
        document.getElementById('vina_token').value = token;
        console.log('Captcha pass! Token:', token);
      },
      onError: (err) => {
        console.error('Captcha lỗi:', err);
      },
      debug: false  // Tắt khi đưa lên production
    });
  });
</script>`} />

          {/* Bước 4 */}
          <Title level={5} style={{ color: "#7367f0" }}>Bước 4 — Xác thực Token ở Backend (Server-to-Server)</Title>
          <Paragraph type="secondary">
            Sau khi user submit form, server của bạn nhận được <Text code>vina_token</Text>. 
            Phải gọi <Text code>/v1/siteverify</Text> để xác nhận token hợp lệ — <strong>không bao giờ tin vào token từ phía client</strong>.
          </Paragraph>

          <Tabs
            defaultActiveKey="nodejs"
            size="small"
            items={[
              {
                key: "nodejs",
                label: "Node.js",
                children: (
                  <CodeBlock lang="js" code={`const verifyToken = async (vinaToken, siteSecretKey) => {
  const resp = await fetch('${BASE_URL}/v1/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: siteSecretKey,    // API Key của bạn (giữ bí mật ở server)
      verify_token: vinaToken   // Token nhận từ form submit
    })
  });
  const data = await resp.json();
  return data.success === true;
};

// Trong route xử lý login:
app.post('/login', async (req, res) => {
  const vinaToken = req.body.vina_token;
  const isValid = await verifyToken(vinaToken, process.env.VINA_SECRET_KEY);
  if (!isValid) {
    return res.status(400).json({ error: 'Captcha không hợp lệ hoặc đã hết hạn' });
  }
  // Tiếp tục xử lý đăng nhập...
});`} />
                ),
              },
              {
                key: "php",
                label: "PHP",
                children: (
                  <CodeBlock lang="php" code={`<?php
function verifyVinaCaptcha(string $vinaToken, string $siteSecret): bool {
    $payload = json_encode([
        'secret'       => $siteSecret,
        'verify_token' => $vinaToken,
    ]);

    $context = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\\r\\n",
            'content' => $payload,
        ]
    ]);

    $result = file_get_contents('${BASE_URL}/v1/siteverify', false, $context);
    if ($result === false) return false;

    $data = json_decode($result, true);
    return ($data['success'] ?? false) === true;
}

// Trong form handler:
if (!verifyVinaCaptcha($_POST['vina_token'], $_ENV['VINA_SECRET_KEY'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Captcha không hợp lệ']);
    exit;
}
// Tiếp tục xử lý...`} />
                ),
              },
              {
                key: "python",
                label: "Python",
                children: (
                  <CodeBlock lang="python" code={`import requests, os

def verify_vina_captcha(vina_token: str) -> bool:
    resp = requests.post(
        '${BASE_URL}/v1/siteverify',
        json={
            'secret': os.environ['VINA_SECRET_KEY'],
            'verify_token': vina_token,
        },
        timeout=5
    )
    data = resp.json()
    return data.get('success') is True

# Django/Flask view:
@app.route('/login', methods=['POST'])
def login():
    vina_token = request.form.get('vina_token', '')
    if not verify_vina_captcha(vina_token):
        return jsonify({'error': 'Captcha không hợp lệ'}), 400
    # Tiếp tục xử lý...`} />
                ),
              },
            ]}
          />

          {/* Bước 5 */}
          <Title level={5} style={{ color: "#7367f0", marginTop: 24 }}>Bước 5 — Xử lý Reset Captcha (Cho SPA / AJAX Form)</Title>
          <Paragraph type="secondary">
            Token của VinaCaptcha là dạng <strong>one-time-use (sử dụng một lần)</strong>. Nếu form của bạn gửi bằng AJAX (không reload trang) và bị lỗi (vd: sai mật khẩu), bạn bắt buộc phải gọi hàm <Text code>reset()</Text> để Captcha đánh giá lại rủi ro và sinh token mới.
          </Paragraph>
          <CodeBlock lang="js" code={`// Lấy instance captcha đã khởi tạo từ trước
const captcha = new VinaCaptcha('vinacaptcha-container', { siteKey: '...' });

async function handleAjaxSubmit() {
  const token = document.getElementById('vina_token').value;
  
  try {
    const res = await fetch('/api/login', { 
      method: 'POST', 
      body: JSON.stringify({ vina_token: token, username: '...' }) 
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
      key: "public-api",
      label: (
        <span><ApiOutlined /> Public API</span>
      ),
      children: (
        <div>
          <Title level={4}>Public API — Widget gọi trực tiếp</Title>
          <Paragraph type="secondary">
            Base URL: <Text code>{BASE_URL}</Text> — Auth bằng header <Text code>X-Api-Key</Text>
          </Paragraph>

          <EndpointCard method="POST" path="/v1/issue" desc="Gọi khi form load, đánh giá rủi ro và cấp session">
            <Divider style={{ margin: "10px 0" }} />
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>REQUEST</Text>
                <CodeBlock lang="json" code={`// Header
X-Api-Key: cap_live_xxxxxxxxxxxx

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
  "expires_in": 60
}

// challenge_type có thể là:
// "none"   → pass ngay, không cần thử thách
// "slider" → yêu cầu kéo thanh trượt
// "pow"    → Proof-of-Work, pow_difficulty = 12-18`} />
              </Col>
            </Row>
          </EndpointCard>

          <EndpointCard method="POST" path="/v1/verify" desc="Gọi sau khi user hoàn thành challenge, nhận verify_token">
            <Divider style={{ margin: "10px 0" }} />
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>REQUEST</Text>
                <CodeBlock lang="json" code={`// Nếu challenge_type = "none":
{
  "session_id": "8f2a1c3e-..."
}

// Nếu challenge_type = "slider":
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "slider",
    "final_position": 187
  }
}

// Nếu challenge_type = "pow":
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "pow",
    "nonce": "0000a3f9..."
  }
}`} />
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>RESPONSE 200</Text>
                <CodeBlock lang="json" code={`// Pass:
{
  "result": "pass",
  "verify_token": "vt_9f8e7d..."
}

// Fail:
{
  "result": "fail",
  "reason": "challenge_incorrect"
}

// Hết hạn session:
{
  "result": "expired",
  "reason": "session_expired"
}`} />
              </Col>
            </Row>
          </EndpointCard>

          <EndpointCard method="POST" path="/v1/siteverify" desc="Server-to-server — Backend site khách xác nhận token">
            <Divider style={{ margin: "10px 0" }} />
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>REQUEST (từ backend của bạn)</Text>
                <CodeBlock lang="json" code={`{
  "secret": "cap_live_YOUR_API_KEY",
  "verify_token": "vt_9f8e7d..."
}`} />
              </Col>
              <Col xs={24} md={12}>
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>RESPONSE 200</Text>
                <CodeBlock lang="json" code={`// Hợp lệ:
{
  "success": true,
  "timestamp": "2026-09-08T16:00:00Z",
  "hostname": "shop.example.com"
}

// Đã dùng / không hợp lệ:
{
  "success": false,
  "reason": "already_used"
}`} />
              </Col>
            </Row>
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
            Sau khi load script, class <Text code>VinaCaptcha</Text> có sẵn ở global scope.
          </Paragraph>

          <Title level={5}>Constructor</Title>
          <CodeBlock lang="js" code={`const captcha = new VinaCaptcha(containerId, config);

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
                ["siteKey", "string", "✅", "API Key lấy từ Dashboard"],
                ["baseUrl", "string", "❌", `URL backend, mặc định: ${BASE_URL}`],
                ["onSuccess", "function(token)", "❌", "Callback khi captcha pass, nhận verify_token"],
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

          <Title level={5}>Methods</Title>
          <Paragraph type="secondary">
            Các phương thức công khai (public methods) của instance VinaCaptcha.
          </Paragraph>
          
          <CodeBlock lang="js" code={`// captcha.reset()
// Khởi tạo lại tiến trình Captcha, xóa token cũ, phân tích rủi ro lại từ đầu và lấy token mới.
// BẮT BUỘC DÙNG khi form submit bằng AJAX bị lỗi (vd: sai mật khẩu), để user có thể bấm Submit lại.
captcha.reset();`} />

          <Title level={5}>Ví dụ đầy đủ với callback</Title>
          <CodeBlock lang="html" code={`<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <form id="myForm">
    <input type="email" name="email" />
    <input type="password" name="password" />
    <div id="vinacaptcha-container"></div>
    <input type="hidden" id="vina_token" name="vina_token" />
    <button type="submit">Đăng nhập</button>
  </form>

  <script src="${BASE_URL}/widget/vina-captcha.js" defer></script>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const captcha = new VinaCaptcha('vinacaptcha-container', {
        siteKey: 'cap_live_YOUR_KEY',
        onSuccess: (token) => {
          document.getElementById('vina_token').value = token;
          // Form sẽ tự submit sau khi captcha pass
        },
        onError: (err) => {
          alert('Lỗi bảo mật: ' + err.message);
          captcha.reset(); // Reset để thử lại
        }
      });
    });
  </script>
</body>
</html>`} />
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
            VinaCaptcha được thiết kế tối ưu cho nền tảng Web thông qua giao thức phân tích DOM và trình duyệt (Widget JS). Tuy nhiên, bạn vẫn có thể tích hợp dễ dàng trên các nền tảng di động (iOS, Android, React Native, Flutter) theo 2 cách dưới đây.
          </Paragraph>

          <Title level={5} style={{ color: "#7367f0", marginTop: 24 }}>Cách 1: Sử dụng WebView (Khuyến nghị)</Title>
          <Paragraph>
            Cách tốt nhất để sử dụng toàn bộ sức mạnh đánh giá rủi ro (Risk Engine) của VinaCaptcha là nhúng một WebView ẩn vào màn hình đăng nhập / đăng ký trên App.
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
                Tải về hoặc sao chép file <Text code>SKILL.md</Text> này để cung cấp cho các AI Coding Agent (Cursor, Claude Code, GitHub Copilot, Antigravity, ChatGPT) tự động tích hợp VinaCaptcha vào dự án của bạn (Laravel, WordPress, Node.js, Python, Mobile App).
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
                  2. <strong>ChatGPT / Copilot</strong>: Dán toàn bộ nội dung file này vào khung chat kèm yêu cầu: <em>"Hãy đọc hướng dẫn VinaCaptcha trên và viết code tích hợp cho ứng dụng Laravel/WordPress/React của tôi"</em>.
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
        <Text type="secondary">Hướng dẫn tích hợp VinaCaptcha vào website của bạn</Text>
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
