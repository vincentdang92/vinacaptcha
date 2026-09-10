import { useState, useEffect } from "react";
import { useLogin } from "@refinedev/core";
import { Form, Input, Button, Typography, Alert, Divider, theme } from "antd";
import { MailOutlined, LockOutlined, GoogleOutlined, TwitterOutlined } from "@ant-design/icons";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { AuthLayout } from "../auth/AuthLayout";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Title, Text } = Typography;

export const LoginPage = () => {
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();
  const loginResult = useLogin() as any;
  const { mutate: login } = loginResult;
  const isLoading = loginResult?.isPending || loginResult?.isLoading;
  const isActivated = searchParams.get("activated") === "true";

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

  const handleSubmit = (values: any) => {
    setErrorMessage("");
    login(values, {
      onError: (err: any) => {
        setErrorMessage(err?.message || "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.");
      },
    });
  };

  const { token } = theme.useToken();
  const inputStyle = {
    padding: "10px 16px",
    borderRadius: "8px",
    borderColor: token.colorBorder,
  };

  return (
    <AuthLayout>
      <Title level={2} style={{ fontWeight: 700, marginBottom: "8px" }}>Sign In</Title>
      <Text type="secondary" style={{ fontSize: "16px", display: "block", marginBottom: "32px" }}>
        Enter your email and password to sign in!
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

      <Divider style={{ fontSize: "14px", margin: "24px 0" }} plain>Or</Divider>

      {isActivated && (
        <Alert
          message="Tài khoản kích hoạt thành công! Bạn có thể đăng nhập ngay bây giờ."
          type="success"
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
            loading={isLoading}
            block
            style={{
              height: "48px",
              fontWeight: 600,
              fontSize: "16px",
              borderRadius: "8px",
              boxShadow: "none",
            }}
          >
            Sign In
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
