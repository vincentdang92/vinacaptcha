import { useState } from "react";
import { Form, Input, Button, Typography, Divider, Row, Col, message, theme } from "antd";
import { MailOutlined, LockOutlined, GoogleOutlined, TwitterOutlined, UserOutlined, CheckCircleOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../auth/AuthLayout";
import axios from "axios";
import { API_BASE_URL } from "../../config";
import { executeSliderCaptcha } from "../../utils/captcha";

const { Title, Text, Paragraph } = Typography;

export const RegisterPage = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const { token } = theme.useToken();

  const handleSubmit = async (values: any) => {
    setVerifyingCaptcha(true);
    let captchaToken = "";
    try {
      captchaToken = await executeSliderCaptcha("register");
    } catch (cErr: any) {
      message.warning("Bạn chưa hoàn tất xác thực Slider Captcha. Vui lòng thử lại.");
      setVerifyingCaptcha(false);
      return;
    }
    setVerifyingCaptcha(false);

    setSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/auth/register`, {
        email: values.email?.trim().toLowerCase(),
        password: values.password,
        name: `${values.firstName?.trim()} ${values.lastName?.trim()}`,
        captcha_token: captchaToken,
      });
      
      setSuccessEmail(values.email?.trim().toLowerCase());
      message.success("Đăng ký thành công! Vui lòng kiểm tra email để kích hoạt tài khoản.");
    } catch (err: any) {
      message.error(err.response?.data?.message || "Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    padding: "10px 16px",
    borderRadius: "8px",
    borderColor: token.colorBorder,
  };

  // Nếu đăng ký thành công -> Hiển thị Màn hình thông báo kích hoạt tài khoản
  if (successEmail) {
    return (
      <AuthLayout>
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: token.colorSuccessBg || "rgba(40, 199, 111, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <CheckCircleOutlined style={{ fontSize: 38, color: token.colorSuccess }} />
          </div>

          <Title level={2} style={{ fontWeight: 700, marginBottom: "8px" }}>
            Đăng Ký Thành Công!
          </Title>
          <Paragraph style={{ fontSize: "15px", color: token.colorTextSecondary, marginBottom: "24px", lineHeight: "1.6" }}>
            Hệ thống đã gửi email chứa liên kết kích hoạt tài khoản tới:
            <br />
            <Text strong style={{ color: token.colorPrimary, fontSize: "16px" }}>
              {successEmail}
            </Text>
          </Paragraph>

          <div
            style={{
              background: token.colorBgLayout,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: "10px",
              padding: "16px 20px",
              textAlign: "left",
              marginBottom: "28px",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>🛡️</span>
              <div>
                <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                  Hướng dẫn kích hoạt tài khoản:
                </Text>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: token.colorTextSecondary, lineHeight: 1.8 }}>
                  <li>Mở hộp thư đến của bạn và tìm email từ <strong>NhanHoaCaptcha System</strong>.</li>
                  <li>Bấm vào nút <strong>"Kích Hoạt Tài Khoản Ngay"</strong> trong email.</li>
                  <li>Nếu không tìm thấy, vui lòng kiểm tra thêm trong thư mục <strong>Spam / Thư rác</strong>.</li>
                </ul>
              </div>
            </div>
          </div>

          <Button
            type="primary"
            size="large"
            block
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(`/login?registered=true&email=${encodeURIComponent(successEmail)}`)}
            style={{
              height: "48px",
              fontWeight: 600,
              fontSize: "16px",
              borderRadius: "8px",
              background: token.colorPrimary,
              borderColor: token.colorPrimary,
            }}
          >
            Đến Trang Đăng Nhập
          </Button>

          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Button type="link" onClick={() => setSuccessEmail(null)} style={{ color: token.colorTextSecondary, fontSize: 13 }}>
              ← Đăng ký tài khoản khác
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Title level={2} style={{ fontWeight: 700, marginBottom: "8px" }}>Tạo Tài Khoản</Title>
      <Text type="secondary" style={{ fontSize: "16px", display: "block", marginBottom: "32px" }}>
        Đăng ký tài khoản để bắt đầu tích hợp VinaCaptcha bảo vệ website
      </Text>

      <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
        <Button 
          icon={<GoogleOutlined style={{ color: "#ea4335" }} />} 
          style={{ flex: 1, height: "48px", borderRadius: "8px", fontWeight: 500 }}
        >
          Sign up with Google
        </Button>
        <Button 
          icon={<TwitterOutlined style={{ color: "#1da1f2" }} />} 
          style={{ flex: 1, height: "48px", borderRadius: "8px", fontWeight: 500 }}
        >
          Sign up with X
        </Button>
      </div>

      <Divider style={{ fontSize: "14px", margin: "24px 0" }} plain>Hoặc đăng ký bằng Email</Divider>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={<Text style={{ fontWeight: 500 }}>Họ & Tên đệm<span style={{ color: token.colorError }}>*</span></Text>}
              name="firstName"
              rules={[{ required: true, message: "Vui lòng nhập họ" }]}
            >
              <Input 
                prefix={<UserOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
                placeholder="VD: Nguyễn Văn" 
                style={inputStyle}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={<Text style={{ fontWeight: 500 }}>Tên<span style={{ color: token.colorError }}>*</span></Text>}
              name="lastName"
              rules={[{ required: true, message: "Vui lòng nhập tên" }]}
            >
              <Input 
                prefix={<UserOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
                placeholder="VD: An" 
                style={inputStyle}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label={<Text style={{ fontWeight: 500 }}>Email Đăng Ký<span style={{ color: token.colorError }}>*</span></Text>}
          name="email"
          rules={[
            { required: true, message: "Vui lòng nhập email" },
            { type: "email", message: "Email không đúng định dạng" },
          ]}
        >
          <Input 
            prefix={<MailOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
            placeholder="VD: user@yourdomain.com" 
            style={inputStyle}
          />
        </Form.Item>

        <Form.Item
          label={<Text style={{ fontWeight: 500 }}>Mật Khẩu<span style={{ color: token.colorError }}>*</span></Text>}
          name="password"
          rules={[
            { required: true, message: "Vui lòng nhập mật khẩu" },
            { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự" },
          ]}
        >
          <Input.Password 
            prefix={<LockOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
            placeholder="Nhập ít nhất 6 ký tự" 
            style={inputStyle}
          />
        </Form.Item>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "24px" }}>
          <input type="checkbox" defaultChecked style={{ width: 16, height: 16, accentColor: token.colorPrimary, marginTop: "4px" }} />
          <Text type="secondary" style={{ lineHeight: "1.5", fontSize: 13 }}>
            Bằng việc đăng ký, bạn đồng ý với <strong style={{ color: token.colorText }}>Điều khoản dịch vụ</strong> và <strong style={{ color: token.colorText }}>Chính sách bảo mật</strong> của hệ thống.
          </Text>
        </div>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting || verifyingCaptcha}
            block
            style={{
              height: "48px",
              fontWeight: 600,
              fontSize: "16px",
              borderRadius: "8px",
              background: token.colorPrimary,
              borderColor: token.colorPrimary,
              boxShadow: "none",
            }}
          >
            {verifyingCaptcha ? "Đang xác thực Captcha..." : (submitting ? "Đang xử lý đăng ký..." : "Đăng Ký Tài Khoản")}
          </Button>
        </Form.Item>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <Text type="secondary">Đã có tài khoản? </Text>
          <Link to="/login" style={{ color: token.colorPrimary, fontWeight: 600 }}>Đăng Nhập Ngay</Link>
        </div>
      </Form>
    </AuthLayout>
  );
};
