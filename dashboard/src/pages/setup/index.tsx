import { useState, useEffect } from "react";
import { Steps, Card, Form, Input, Button, Typography, Alert, Result, Tag, Spin, message } from "antd";
import {
  SettingOutlined,
  UserOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  LockOutlined,
  MailOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Title, Text } = Typography;

export const SetupWizardPage = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [alreadySetup, setAlreadySetup] = useState(false);
  const [setupResult, setSetupResult] = useState<any>(null);
  const navigate = useNavigate();

  const API_ROOT = API_BASE_URL.replace("/admin/v1", "") + "/admin/v1";

  // Kiểm tra xem hệ thống đã được cài đặt trước đó chưa
  useEffect(() => {
    axios
      .get(`${API_ROOT}/setup/status`)
      .then((res) => {
        if (res.data?.is_setup) {
          setAlreadySetup(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        setCheckingSetup(false);
      });
  }, [API_ROOT]);

  const handleNext = async () => {
    try {
      if (currentStep === 0) {
        await form.validateFields(["app_name", "primary_domain"]);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        await form.validateFields();
        const values = form.getFieldsValue();
        setLoading(true);

        const response = await axios.post(`${API_ROOT}/setup`, values);
        if (response.data?.success) {
          // Lưu token tự động đăng nhập
          localStorage.setItem("vinacaptcha_token", response.data.access_token);
          localStorage.setItem("vinacaptcha_user", JSON.stringify(response.data.account));

          setSetupResult(response.data);
          setCurrentStep(2);
          message.success("Khởi tạo hệ thống NhanHoaCaptcha thành công!");
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Đã xảy ra lỗi khi khởi tạo";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    navigate("/sites");
  };

  if (checkingSetup) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f8f9fa" }}>
        <Spin size="large" tip="Đang kiểm tra trạng thái cài đặt..." />
      </div>
    );
  }

  if (alreadySetup) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f4f5fa", padding: "24px" }}>
        <Card style={{ maxWidth: 540, width: "100%", borderRadius: 16, textAlign: "center", padding: "16px" }}>
          <Result
            status="info"
            title="Hệ Thống Đã Được Cài Đặt"
            subTitle="NhanHoaCaptcha đã được khởi tạo và cấu hình tài khoản quản trị trước đó."
            extra={[
              <Button type="primary" key="login" size="large" onClick={() => navigate("/login")}>
                Đến Trang Đăng Nhập
              </Button>,
            ]}
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "32px 16px",
      }}
    >
      {/* Header Logo */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255, 255, 255, 0.2)", backdropFilter: "blur(10px)", padding: "10px 24px", borderRadius: 30, color: "#fff" }}>
          <ThunderboltOutlined style={{ fontSize: 24, color: "#ffd166" }} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>NhanHoaCaptcha Setup Wizard</span>
        </div>
      </div>

      <Card
        style={{
          maxWidth: 680,
          width: "100%",
          borderRadius: 16,
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
          border: "none",
        }}
        styles={{ body: { padding: "36px 32px" } }}
      >
        {/* Steps Progress */}
        <Steps
          current={currentStep}
          style={{ marginBottom: 32 }}
          items={[
            { title: "Hệ Thống & Domain", icon: <SettingOutlined /> },
            { title: "Super Admin", icon: <UserOutlined /> },
            { title: "Hoàn Tất", icon: <CheckCircleOutlined /> },
          ]}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            app_name: "NhanHoaCaptcha Gateway",
            primary_domain: window.location.hostname || "localhost",
            admin_name: "Quản Trị Viên",
          }}
        >
          {/* ── BƯỚC 1: TÊN MIỀN & HỆ THỐNG ── */}
          {currentStep === 0 && (
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                🌐 Bước 1: Cấu hình Tên miền & Hệ thống
              </Title>
              <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
                Khai báo thông tin thương hiệu và tên miền chính chạy dịch vụ Captcha trên máy chủ này.
              </Text>

              <Form.Item
                label="Tên Cổng Captcha (Tên Hệ Thống)"
                name="app_name"
                rules={[{ required: true, message: "Vui lòng nhập tên hệ thống!" }]}
              >
                <Input
                  size="large"
                  placeholder="VD: Nhân Hòa Captcha Gateway, My Company Captcha..."
                />
              </Form.Item>

              <Form.Item
                label="Tên miền chính (Primary Domain / FQDN)"
                name="primary_domain"
                extra="Tên miền hoặc IP của VPS này (VD: captcha.nhanhoa.com hoặc 103.x.x.x, localhost)."
                rules={[{ required: true, message: "Vui lòng nhập tên miền chính!" }]}
              >
                <Input
                  size="large"
                  prefix={<GlobalOutlined style={{ color: "#7367f0" }} />}
                  placeholder="VD: captcha.yourdomain.com"
                />
              </Form.Item>

              <Alert
                message="Tự Động Tạo Website Đầu Tiên"
                description="Hệ thống sẽ tự động khởi tạo 1 Website mặc định theo tên miền này và cấp sẵn API Key để bạn có thể nhúng thử nghiệm ngay sau khi cài đặt."
                type="info"
                showIcon
                style={{ marginTop: 20, marginBottom: 28 }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="primary" size="large" onClick={handleNext} icon={<ArrowRightOutlined />}>
                  Tiếp tục: Tạo tài khoản Admin
                </Button>
              </div>
            </div>
          )}

          {/* ── BƯỚC 2: TÀI KHOẢN ADMIN ── */}
          {currentStep === 1 && (
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                👑 Bước 2: Khởi tạo Tài khoản Super Admin
              </Title>
              <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
                Tài khoản này có toàn quyền quản trị, thêm bớt user, cấp phát API Key và cấu hình luật bảo mật.
              </Text>

              <Form.Item
                label="Họ và Tên Quản Trị Viên"
                name="admin_name"
                rules={[{ required: true, message: "Vui lòng nhập họ tên!" }]}
              >
                <Input
                  size="large"
                  prefix={<UserOutlined style={{ color: "#7367f0" }} />}
                  placeholder="VD: Nguyễn Văn A, Quản Trị Hệ Thống..."
                />
              </Form.Item>

              <Form.Item
                label="Email Đăng Nhập Quản Trị"
                name="admin_email"
                rules={[
                  { required: true, message: "Vui lòng nhập email admin!" },
                  { type: "email", message: "Email không đúng định dạng!" },
                ]}
              >
                <Input
                  size="large"
                  prefix={<MailOutlined style={{ color: "#7367f0" }} />}
                  placeholder="VD: admin@yourcompany.com"
                />
              </Form.Item>

              <Form.Item
                label="Mật Khẩu Quản Trị (Tối thiểu 6 ký tự)"
                name="admin_password"
                rules={[
                  { required: true, message: "Vui lòng nhập mật khẩu!" },
                  { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự!" },
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined style={{ color: "#7367f0" }} />}
                  placeholder="Nhập mật khẩu an toàn..."
                />
              </Form.Item>

              <Form.Item
                label="Xác Nhận Mật Khẩu"
                name="admin_password_confirm"
                dependencies={["admin_password"]}
                rules={[
                  { required: true, message: "Vui lòng xác nhận mật khẩu!" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("admin_password") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Mật khẩu xác nhận không khớp!"));
                    },
                  }),
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined style={{ color: "#7367f0" }} />}
                  placeholder="Nhập lại mật khẩu..."
                />
              </Form.Item>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
                <Button size="large" onClick={() => setCurrentStep(0)}>
                  Quay lại
                </Button>
                <Button
                  type="primary"
                  size="large"
                  loading={loading}
                  onClick={handleNext}
                  style={{ background: "#28c76f", borderColor: "#28c76f" }}
                >
                  🚀 Hoàn tất & Khởi tạo Hệ thống
                </Button>
              </div>
            </div>
          )}

          {/* ── BƯỚC 3: HOÀN TẤT & THÔNG TIN SẴN SÀNG ── */}
          {currentStep === 2 && (
            <div>
              <Result
                status="success"
                title="Khởi Tạo NhanHoaCaptcha Thành Công!"
                subTitle="Hệ thống đã sẵn sàng bảo vệ các website và ứng dụng của bạn."
              />

              <Card style={{ background: "#f8f9fa", borderRadius: 12, marginBottom: 24 }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                  🔑 Thông Tin Khởi Tạo Ban Đầu:
                </Title>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <Text type="secondary">Tài khoản Quản trị: </Text>
                    <Text strong>{setupResult?.account?.email}</Text>{" "}
                    <Tag color="red">Super Admin</Tag>
                  </div>
                  <div>
                    <Text type="secondary">Website mặc định: </Text>
                    <Text strong>{setupResult?.initial_site?.name}</Text> ({setupResult?.initial_site?.primary_domain})
                  </div>
                  <div>
                    <Text type="secondary">API Key tạo sẵn: </Text>
                    <Text code copyable style={{ color: "#7367f0", fontWeight: 600 }}>
                      {setupResult?.initial_site?.api_key}
                    </Text>
                  </div>
                </div>
              </Card>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  onClick={handleFinish}
                  style={{ minWidth: 220, height: 48, fontSize: 16 }}
                >
                  Đến Bảng Điều Khiển (Dashboard)
                </Button>
              </div>
            </div>
          )}
        </Form>
      </Card>
    </div>
  );
};
