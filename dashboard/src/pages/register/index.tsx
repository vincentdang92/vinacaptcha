import { Form, Input, Button, Typography, Divider, Row, Col, message, theme } from "antd";
import { MailOutlined, LockOutlined, GoogleOutlined, TwitterOutlined, UserOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../auth/AuthLayout";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Title, Text } = Typography;

export const RegisterPage = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const handleSubmit = async (values: any) => {
    try {
      await axios.post(`${API_BASE_URL}/auth/register`, {
        email: values.email,
        password: values.password,
        name: `${values.firstName} ${values.lastName}`,
      });
      message.success("Đăng ký thành công! Vui lòng kiểm tra email để kích hoạt tài khoản.");
      navigate("/login");
    } catch (err: any) {
      message.error(err.response?.data?.message || "Đăng ký thất bại");
    }
  };

  const { token } = theme.useToken();
  const inputStyle = {
    padding: "10px 16px",
    borderRadius: "8px",
    borderColor: token.colorBorder,
  };

  return (
    <AuthLayout>
      <Title level={2} style={{ fontWeight: 700, marginBottom: "8px" }}>Sign Up</Title>
      <Text type="secondary" style={{ fontSize: "16px", display: "block", marginBottom: "32px" }}>
        Enter your email and password to sign up!
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

      <Divider style={{ fontSize: "14px", margin: "24px 0" }} plain>Or</Divider>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={<Text style={{ fontWeight: 500 }}>First Name<span style={{ color: token.colorError }}>*</span></Text>}
              name="firstName"
              rules={[{ required: true, message: "Required" }]}
            >
              <Input 
                prefix={<UserOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
                placeholder="Enter your first name" 
                style={inputStyle}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={<Text style={{ fontWeight: 500 }}>Last Name<span style={{ color: token.colorError }}>*</span></Text>}
              name="lastName"
              rules={[{ required: true, message: "Required" }]}
            >
              <Input 
                prefix={<UserOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />} 
                placeholder="Enter your last name" 
                style={inputStyle}
              />
            </Form.Item>
          </Col>
        </Row>

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

        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "24px" }}>
          <input type="checkbox" style={{ width: 16, height: 16, accentColor: token.colorPrimary, marginTop: "4px" }} />
          <Text type="secondary" style={{ lineHeight: "1.5" }}>
            By creating an account means you agree to the <strong style={{ color: token.colorText }}>Terms and Conditions</strong>, and our <strong style={{ color: token.colorText }}>Privacy Policy</strong>
          </Text>
        </div>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            style={{
              height: "48px",
              fontWeight: 600,
              fontSize: "16px",
              borderRadius: "8px",
              boxShadow: "none",
            }}
          >
            Sign Up
          </Button>
        </Form.Item>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <Text type="secondary">Already have an account? </Text>
          <Link to="/login" style={{ color: token.colorPrimary, fontWeight: 500 }}>Sign In</Link>
        </div>
      </Form>
    </AuthLayout>
  );
};
