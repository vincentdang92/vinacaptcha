import { useState, useEffect } from "react";
import { useLogin } from "@refinedev/core";
import { Form, Input, Button, Typography, Alert, Divider, theme } from "antd";
import { MailOutlined, LockOutlined, GoogleOutlined, TwitterOutlined } from "@ant-design/icons";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { AuthLayout } from "../auth/AuthLayout";
import axios from "axios";
import { API_BASE_URL } from "../../config";
import { executeSliderCaptcha } from "../../utils/captcha";

const { Title, Text } = Typography;

export const LoginPage = () => {
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const navigate = useNavigate();
  const loginResult = useLogin() as any;
  const { mutate: login } = loginResult;
  const isLoading = loginResult?.isPending || loginResult?.isLoading;
  const isActivated = searchParams.get("activated") === "true";
  const isRegistered = searchParams.get("registered") === "true";
  const registeredEmail = searchParams.get("email") || "";

  // Kiểm tra nếu hệ thống chưa setup -> chuyển hướng sang /setup
  useEffect(() => {
    const API_ROOT = API_BASE_URL.replace("/admin/v1", "") + "/admin/v1";
    axios
      .get(`${API_ROOT}/setup/status`)
      .then((res) => {
        if (res.data && res.data.is_setup === false) {
          navigate("/setup");
        }
      })
      .catch(() => {});
  }, [navigate]);

  const handleSubmit = async (values: any) => {
    setErrorMessage("");
    setVerifyingCaptcha(true);
    let captchaToken = "";
    try {
      captchaToken = await executeSliderCaptcha("login");
    } catch (cErr: any) {
      setErrorMessage("Bạn chưa hoàn thành xác thực Slider Captcha. Vui lòng thử lại.");
      setVerifyingCaptcha(false);
      return;
    }

    login(
      { ...values, captcha_token: captchaToken },
      {
        onError: (err: any) => {
          setErrorMessage(err?.message || "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
        },
        onSettled: () => {
          setVerifyingCaptcha(false);
        },
      }
    );
  };

  const { token } = theme.useToken();
  const inputStyle = {
    padding: "10px 16px",
    borderRadius: "8px",
    borderColor: token.colorBorder,
  };

  return (
    <AuthLayout>
      <Title level={2} style={{ fontWeight: 700, marginBottom: "8px" }}>Đăng Nhập</Title>
      <Text type="secondary" style={{ fontSize: "16px", display: "block", marginBottom: "32px" }}>
        Nhập email và mật khẩu để đăng nhập vào trang quản trị
      </Text>

      <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
        <Button 
          icon={<GoogleOutlined style={{ color: "#ea4335" }} />} 
          style={{ flex: 1, height: "48px", borderRadius: "8px", fontWeight: 500 }}
        >
          Sign in with Google
        </Button>
        <Button 
          icon={<TwitterOutlined style={{ color: "#1da1f2" }} />} 
          style={{ flex: 1, height: "48px", borderRadius: "8px", fontWeight: 500 }}
        >
          Sign in with X
        </Button>
      </div>

      <Divider style={{ fontSize: "14px", margin: "24px 0" }} plain>Hoặc đăng nhập bằng Email</Divider>

      {isActivated && (
        <Alert
          message="Kích hoạt tài khoản thành công!"
          description="Tài khoản của bạn đã được kích hoạt. Hãy nhập thông tin bên dưới để đăng nhập."
          type="success"
          showIcon
          style={{ marginBottom: 20, borderRadius: 6 }}
        />
      )}

      {isRegistered && !isActivated && (
        <Alert
          message="Đăng ký tài khoản thành công!"
          description={
            <span>
              Chúng tôi đã gửi email kích hoạt tới <strong>{registeredEmail || "hộp thư của bạn"}</strong>. Vui lòng kiểm tra hộp thư (bao gồm cả thư mục Spam) và bấm vào liên kết kích hoạt trước khi đăng nhập.
            </span>
          }
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 6 }}
        />
      )}

      {errorMessage && (
        <Alert
          message={errorMessage}
          type="error"
          showIcon
          style={{ marginBottom: 20, borderRadius: 6 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ email: registeredEmail }}
        requiredMark={false}
      >
        <Form.Item
          label={<Text style={{ fontWeight: 500 }}>Email<span style={{ color: token.colorError }}>*</span></Text>}
          name="email"
          rules={[
            { required: true, message: "Vui lòng nhập email" },
            { type: "email", message: "Email không đúng định dạng" },
          ]}
        >
          <Input 
            prefix={<MailOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
            placeholder="Enter your email" 
            style={inputStyle}
          />
        </Form.Item>

        <Form.Item
          label={<Text style={{ fontWeight: 500 }}>Password<span style={{ color: token.colorError }}>*</span></Text>}
          name="password"
          rules={[{ required: true, message: "Vui lòng nhập mật khẩu" }]}
        >
          <Input.Password 
            prefix={<LockOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
            placeholder="Enter your password" 
            style={inputStyle}
          />
        </Form.Item>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" style={{ width: 16, height: 16, accentColor: token.colorPrimary }} />
            <Text type="secondary">Keep me logged in</Text>
          </label>
          <a href="#" style={{ color: token.colorPrimary, textDecoration: "none" }}>Forgot password?</a>
        </div>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={isLoading || verifyingCaptcha}
            block
            style={{
              height: "48px",
              fontWeight: 600,
              fontSize: "16px",
              borderRadius: "8px",
              boxShadow: "none",
            }}
          >
            {verifyingCaptcha ? "Đang xác thực Captcha..." : "Sign In"}
          </Button>
        </Form.Item>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <Text type="secondary">Don't have an account? </Text>
          <Link to="/register" style={{ color: token.colorPrimary, fontWeight: 500 }}>Sign Up</Link>
        </div>
      </Form>
    </AuthLayout>
  );
};
