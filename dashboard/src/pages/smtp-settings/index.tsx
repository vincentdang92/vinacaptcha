import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Typography, 
  Row, 
  Col, 
  Tag, 
  Button, 
  Input, 
  InputNumber, 
  Form, 
  Switch, 
  Alert, 
  Tabs, 
  Divider, 
  message, 
  Spin, 
  Tooltip 
} from 'antd';
import { 
  MailOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  SendOutlined, 
  SettingOutlined, 
  InfoCircleOutlined, 
  SafetyCertificateOutlined, 
  BellOutlined, 
  ThunderboltOutlined, 
  SaveOutlined, 
  ReloadOutlined, 
  DatabaseOutlined, 
  KeyOutlined, 
  CloudServerOutlined, 
  QuestionCircleOutlined 
} from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../../config';

const { Title, Text, Paragraph } = Typography;

interface SmtpStatus {
  is_configured: boolean;
  source: 'database' | 'env' | 'none';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_name: string;
  from_email: string;
  ignore_tls: boolean;
  has_password: boolean;
}

const PRESET_CONFIGS: Record<string, {
  name: string;
  icon: string;
  host: string;
  port: number;
  secure: boolean;
  ignore_tls: boolean;
  user_placeholder: string;
  pass_placeholder: string;
  hint: string;
}> = {
  nhanhoa: {
    name: 'Mail Server Nhân Hòa',
    icon: '🏢',
    host: 'mail.nhanhoa.com',
    port: 465,
    secure: true,
    ignore_tls: false,
    user_placeholder: 'no-reply@yourdomain.com',
    pass_placeholder: 'Nhập mật khẩu hộp thư Nhân Hòa',
    hint: 'Sử dụng tài khoản email doanh nghiệp đăng ký tại Nhân Hòa. Cổng 465 yêu cầu SSL/TLS.',
  },
  gmail: {
    name: 'Google Workspace / Gmail',
    icon: '📮',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    ignore_tls: false,
    user_placeholder: 'your_email@gmail.com',
    pass_placeholder: 'Nhập App Password 16 ký tự (xxxx xxxx xxxx xxxx)',
    hint: 'Yêu cầu bật 2-Step Verification trên tài khoản Google và tạo "Mật khẩu ứng dụng" (App Password).',
  },
  office365: {
    name: 'Microsoft 365 / Outlook',
    icon: '💼',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    ignore_tls: false,
    user_placeholder: 'no-reply@yourcompany.com',
    pass_placeholder: 'Nhập mật khẩu tài khoản Microsoft 365',
    hint: 'Sử dụng cổng 587 STARTTLS với tài khoản Microsoft 365 có quyền gửi thư SMTP Relay.',
  },
  sendgrid: {
    name: 'SendGrid Transactional Email',
    icon: '⚡',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    ignore_tls: false,
    user_placeholder: 'apikey',
    pass_placeholder: 'SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    hint: 'Tên đăng nhập cố định là "apikey", mật khẩu là SendGrid API Key bắt đầu bằng "SG.".',
  },
  ses: {
    name: 'Amazon Simple Email Service (SES)',
    icon: '☁️',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
    ignore_tls: false,
    user_placeholder: 'AKIAIOSFODNN7EXAMPLE',
    pass_placeholder: 'Nhập AWS SES SMTP Password',
    hint: 'Tạo SMTP Credentials trong AWS SES Console (khác với AWS Access Key thông thường).',
  },
  onpremise: {
    name: 'Mail Relay Nội Bộ / Postfix',
    icon: '🖥️',
    host: '10.0.0.10',
    port: 25,
    secure: false,
    ignore_tls: true,
    user_placeholder: '(Tùy chọn nếu không xác thực)',
    pass_placeholder: '(Tùy chọn nếu không xác thực)',
    hint: 'Dành cho máy chủ Relay trong mạng LAN / DMZ không yêu cầu mật khẩu hoặc dùng SSL tự ký.',
  },
};

export const SmtpSettingsPage: React.FC = () => {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [form] = Form.useForm();
  const [testEmail, setTestEmail] = useState('');

  const getAuthHeaders = () => {
    const token = localStorage.getItem('vinacaptcha_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/smtp/status`, {
        headers: getAuthHeaders(),
      });
      const data: SmtpStatus = res.data;
      setStatus(data);

      // Điền dữ liệu vào form
      form.setFieldsValue({
        host: data.host || '',
        port: data.port || 587,
        secure: data.secure ?? false,
        user: data.user || '',
        pass: '', // Không bao giờ trả plaintext pass
        from_name: data.from_name || 'NhanHoaCaptcha System',
        from_email: data.from_email || '',
        ignore_tls: data.ignore_tls ?? false,
      });

      // Tự động nhận diện preset nếu khớp host
      const matched = Object.entries(PRESET_CONFIGS).find(([_, p]) => p.host === data.host);
      if (matched) {
        setSelectedPreset(matched[0]);
      } else {
        setSelectedPreset('custom');
      }
    } catch (err: any) {
      message.error('Không thể lấy thông tin cấu hình SMTP');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleApplyPreset = (key: string) => {
    setSelectedPreset(key);
    if (key === 'custom') return;

    const preset = PRESET_CONFIGS[key];
    if (preset) {
      form.setFieldsValue({
        host: preset.host,
        port: preset.port,
        secure: preset.secure,
        ignore_tls: preset.ignore_tls,
        user: key === 'sendgrid' ? 'apikey' : form.getFieldValue('user') || '',
      });
      message.info(`Đã áp dụng mẫu cấu hình: ${preset.name}`);
    }
  };

  const handleSaveToDb = async (values: any) => {
    setSaving(true);
    try {
      const payload = {
        host: values.host,
        port: values.port,
        secure: values.secure,
        user: values.user,
        pass: values.pass || undefined, // Nếu rỗng backend sẽ tự động giữ pass cũ trong DB
        from_name: values.from_name,
        from_email: values.from_email,
        ignore_tls: values.ignore_tls,
      };

      const res = await axios.post(`${API_BASE_URL}/smtp/config`, payload, {
        headers: getAuthHeaders(),
      });

      if (res.data?.success) {
        message.success(res.data.message || 'Đã lưu cấu hình SMTP vào database thành công!');
        setStatus(res.data.config || null);
        form.setFieldValue('pass', ''); // Reset password input
      } else {
        message.error(res.data?.message || 'Lỗi khi lưu cấu hình');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Lỗi khi lưu cấu hình SMTP vào Database';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const formValues = await form.validateFields();
      setTesting(true);
      setTestResult(null);

      const payload = {
        email: testEmail.trim() || undefined,
        config: {
          host: formValues.host,
          port: formValues.port,
          secure: formValues.secure,
          user: formValues.user,
          pass: formValues.pass || undefined,
          from_name: formValues.from_name,
          from_email: formValues.from_email,
          ignore_tls: formValues.ignore_tls,
        },
      };

      const res = await axios.post(`${API_BASE_URL}/smtp/test`, payload, {
        headers: getAuthHeaders(),
      });

      setTestResult(res.data);
      if (res.data?.success) {
        message.success(res.data.message || 'Kiểm tra kết nối SMTP thành công!');
      } else {
        message.error(res.data.message || 'Kiểm tra kết nối thất bại');
      }
    } catch (err: any) {
      if (err.errorFields) {
        message.warning('Vui lòng kiểm tra các trường bắt buộc trên biểu mẫu trước khi gửi thử.');
      } else {
        const msg = err.response?.data?.message || err.message || 'Lỗi khi kiểm tra kết nối SMTP';
        setTestResult({ success: false, message: msg });
        message.error(msg);
      }
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '80px', display: 'flex', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MailOutlined style={{ fontSize: 28, color: '#7367f0' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Cấu Hình Cổng Email SMTP</Title>
            <Text type="secondary">
              Lưu trực tiếp vào Cơ sở dữ liệu (PostgreSQL) để gửi email kích hoạt tài khoản & cảnh báo Quota tự động
            </Text>
          </div>
        </div>

        {/* Source & Status Badges */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status?.source === 'database' ? (
            <Tag color="purple" icon={<DatabaseOutlined />} style={{ padding: '4px 10px', fontSize: 13 }}>
              Nguồn: CSDL PostgreSQL
            </Tag>
          ) : status?.source === 'env' ? (
            <Tag color="cyan" icon={<SettingOutlined />} style={{ padding: '4px 10px', fontSize: 13 }}>
              Nguồn: Biến môi trường .env (Fallback)
            </Tag>
          ) : (
            <Tag color="default" style={{ padding: '4px 10px', fontSize: 13 }}>
              Chưa lưu cấu hình
            </Tag>
          )}

          {status?.is_configured ? (
            <Tag color="success" icon={<CheckCircleOutlined />} style={{ padding: '4px 10px', fontSize: 13 }}>
              Cổng Email Sẵn Sàng
            </Tag>
          ) : (
            <Tag color="warning" icon={<CloseCircleOutlined />} style={{ padding: '4px 10px', fontSize: 13 }}>
              Chưa Hoàn Tất Cấu Hình
            </Tag>
          )}
        </div>
      </div>

      {/* Preset Fast Selector */}
      <Card
        size="small"
        style={{ marginBottom: 24, background: '#f8fafc', borderColor: '#e2e8f0' }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <ThunderboltOutlined style={{ color: '#ff9f43' }} />
            <Text strong>Chọn Nhanh Mẫu Nhà Cung Cấp Mail Phổ Biến:</Text>
          </div>
        }
      >
        <Row gutter={[10, 10]}>
          {Object.entries(PRESET_CONFIGS).map(([key, item]) => {
            const isSelected = selectedPreset === key;
            return (
              <Col xs={24} sm={12} md={8} lg={4} key={key}>
                <Button
                  block
                  type={isSelected ? 'primary' : 'default'}
                  onClick={() => handleApplyPreset(key)}
                  style={{
                    height: 'auto',
                    padding: '8px 10px',
                    textAlign: 'left',
                    borderRadius: 8,
                    background: isSelected ? '#7367f0' : '#ffffff',
                    borderColor: isSelected ? '#7367f0' : '#e2e8f0',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{item.icon}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name.split('(')[0]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                    Port {item.port} {item.secure ? 'SSL' : 'TLS'}
                  </div>
                </Button>
              </Col>
            );
          })}
        </Row>
        {selectedPreset !== 'custom' && PRESET_CONFIGS[selectedPreset] && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
            💡 <strong>Gợi ý:</strong> {PRESET_CONFIGS[selectedPreset].hint}
          </div>
        )}
      </Card>

      {/* Main Form: Settings & Test Tool */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSaveToDb}
        initialValues={{
          port: 587,
          secure: false,
          ignore_tls: false,
          from_name: 'NhanHoaCaptcha System',
        }}
      >
        <Row gutter={[24, 24]}>
          {/* Col 1: Server & Connection Parameters */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudServerOutlined style={{ color: '#7367f0' }} />
                  <Text style={{ fontWeight: 600 }}>Thông Số Máy Chủ SMTP</Text>
                </div>
              }
              variant="borderless"
              style={{ height: '100%' }}
            >
              <Row gutter={16}>
                <Col span={16}>
                  <Form.Item
                    label={
                      <span>
                        Máy Chủ SMTP (Host){' '}
                        <Tooltip title="Địa chỉ máy chủ gửi thư, ví dụ: mail.nhanhoa.com, smtp.gmail.com">
                          <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                        </Tooltip>
                      </span>
                    }
                    name="host"
                    rules={[{ required: true, message: 'Vui lòng nhập địa chỉ máy chủ SMTP!' }]}
                  >
                    <Input placeholder="VD: mail.nhanhoa.com hoặc smtp.gmail.com" size="large" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="Cổng (Port)"
                    name="port"
                    rules={[{ required: true, message: 'Vui lòng nhập cổng SMTP!' }]}
                  >
                    <InputNumber style={{ width: '100%' }} size="large" min={1} max={65535} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Bảo Mật SSL/TLS"
                    name="secure"
                    valuePropName="checked"
                    extra="Bật SSL/TLS cho Port 465, tắt cho Port 587 (STARTTLS)"
                  >
                    <Switch checkedChildren="SSL/TLS (465)" unCheckedChildren="STARTTLS (587)" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Bỏ Qua Lỗi Chứng Chỉ"
                    name="ignore_tls"
                    valuePropName="checked"
                    extra="Cho phép cert tự ký (Self-signed cert)"
                  >
                    <Switch checkedChildren="Bỏ qua TLS" unCheckedChildren="Kiểm tra TLS" />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: '16px 0' }} />

              <Form.Item
                label="Tên Người Gửi Hiển Thị (From Name)"
                name="from_name"
                rules={[{ required: true, message: 'Vui lòng nhập tên người gửi!' }]}
              >
                <Input placeholder="VD: NhanHoaCaptcha System hoặc Trung Tâm Hỗ Trợ" size="large" />
              </Form.Item>

              <Form.Item
                label={
                  <span>
                    Địa Chỉ Email Người Gửi (From Email){' '}
                    <Tooltip title="Địa chỉ email xuất hiện tại trường From trong hòm thư người nhận">
                      <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                    </Tooltip>
                  </span>
                }
                name="from_email"
                rules={[{ type: 'email', message: 'Email không đúng định dạng!' }]}
              >
                <Input placeholder="VD: no-reply@yourdomain.com (mặc định lấy theo tài khoản đăng nhập)" size="large" />
              </Form.Item>
            </Card>
          </Col>

          {/* Col 2: Authentication & Realtime Test Card */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KeyOutlined style={{ color: '#28c76f' }} />
                  <Text style={{ fontWeight: 600 }}>Tài Khoản Xác Thực & Thử Nghiệm</Text>
                </div>
              }
              variant="borderless"
              style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <div>
                <Form.Item
                  label="Tên Đăng Nhập SMTP (Username / Email)"
                  name="user"
                >
                  <Input 
                    placeholder="VD: user@yourdomain.com hoặc apikey" 
                    size="large" 
                    prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                  />
                </Form.Item>

                <Form.Item
                  label={
                    <span>
                      Mật Khẩu / App Password{' '}
                      {status?.has_password && (
                        <Tag color="green" style={{ fontSize: 11, marginLeft: 6 }}>
                          ✓ Đã có mật khẩu trong CSDL
                        </Tag>
                      )}
                    </span>
                  }
                  name="pass"
                  extra={status?.has_password ? 'Để trống trường này nếu muốn tiếp tục sử dụng mật khẩu đã lưu trước đó.' : 'Nhập mật khẩu hộp thư hoặc App Password 16 ký tự.'}
                >
                  <Input.Password 
                    placeholder={status?.has_password ? '•••••••••••• (Giữ nguyên mật khẩu cũ)' : 'Nhập mật khẩu hoặc API Key'} 
                    size="large" 
                  />
                </Form.Item>

                {/* Sub-Card: Realtime Test Email Box */}
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: 16, marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <SendOutlined style={{ color: '#7367f0' }} />
                    <Text strong style={{ fontSize: 13 }}>Gửi Email Kiểm Tra Kết Nối Trực Tiếp:</Text>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                      placeholder="Nhập email nhận thử (VD: admin@yourdomain.com)"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      size="middle"
                      style={{ flex: 1 }}
                      prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                    />
                    <Button
                      type="default"
                      icon={<SendOutlined />}
                      loading={testing}
                      onClick={handleTestConnection}
                      style={{ borderColor: '#7367f0', color: '#7367f0' }}
                    >
                      {testing ? 'Đang gửi...' : 'Gửi Thử'}
                    </Button>
                  </div>

                  {testResult && (
                    <div style={{ marginTop: 12 }}>
                      <Alert
                        message={testResult.success ? 'Kiểm Tra Thành Công' : 'Kiểm Tra Thất Bại'}
                        description={testResult.message}
                        type={testResult.success ? 'success' : 'error'}
                        showIcon
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Buttons inside Form */}
              <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <Button 
                  icon={<ReloadOutlined />} 
                  size="large"
                  onClick={fetchStatus}
                >
                  Khôi Phục
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  size="large"
                  loading={saving}
                  style={{ background: '#7367f0', borderColor: '#7367f0', minWidth: 200 }}
                >
                  {saving ? 'Đang lưu vào CSDL...' : 'Lưu Cấu Hình (Database)'}
                </Button>
              </div>
            </Card>
          </Col>
        </Row>
      </Form>

      {/* Row 2: Provider Manual References & Guides */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <InfoCircleOutlined style={{ color: '#00cfe8' }} />
                <Text style={{ fontWeight: 600 }}>Tài Liệu Hướng Dẫn Lấy Mật Khẩu / API Key Từng Nhà Cung Cấp</Text>
              </div>
            }
            variant="borderless"
          >
            <Tabs 
              defaultActiveKey="nhanhoa"
              items={[
                {
                  key: 'nhanhoa',
                  label: '🏢 Mail Server Nhân Hòa',
                  children: (
                    <div>
                      <Paragraph>
                        Để cấu hình email gửi qua dịch vụ Email Doanh Nghiệp tại Nhân Hòa:
                      </Paragraph>
                      <ul style={{ paddingLeft: 20, color: '#334155', lineHeight: 1.8 }}>
                        <li><strong>Máy chủ SMTP:</strong> <Text code>mail.nhanhoa.com</Text> (hoặc theo tên miền riêng dạng <Text code>mail.yourdomain.com</Text> nếu đã trỏ bản ghi).</li>
                        <li><strong>Cổng SSL khuyến nghị:</strong> <Text strong>465</Text> (Bật chế độ SSL/TLS) hoặc cổng <Text strong>587</Text> (STARTTLS).</li>
                        <li><strong>Tài khoản đăng nhập:</strong> Địa chỉ email đầy đủ của hộp thư (VD: <Text code>no-reply@yourdomain.com</Text>).</li>
                        <li><strong>Mật khẩu:</strong> Mật khẩu quản trị hộp thư do Nhân Hòa cấp hoặc bạn đã đặt.</li>
                      </ul>
                    </div>
                  ),
                },
                {
                  key: 'gmail',
                  label: '📮 Google Workspace / Gmail',
                  children: (
                    <div>
                      <Paragraph>
                        Google không cho phép đăng nhập SMTP bằng mật khẩu tài khoản chính nếu chưa tạo <strong>Mật khẩu ứng dụng (App Password)</strong>:
                      </Paragraph>
                      <ol style={{ paddingLeft: 20, color: '#334155', lineHeight: 1.8 }}>
                        <li>Truy cập <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Google Account Security</a>.</li>
                        <li>Bật <strong>Xác minh 2 bước (2-Step Verification)</strong> nếu chưa bật.</li>
                        <li>Tìm mục <strong>Mật khẩu ứng dụng (App passwords)</strong> và tạo một mật khẩu mới cho ứng dụng "VinaCaptcha".</li>
                        <li>Sao chép chuỗi 16 ký tự (VD: <Text code>abcd efgh ijkl mnop</Text>) dán vào ô Mật khẩu ở trên.</li>
                        <li>Thiết lập Cổng: <Text strong>587</Text>, Chế độ bảo mật: <Text strong>STARTTLS (Tắt SSL 465)</Text>.</li>
                      </ol>
                    </div>
                  ),
                },
                {
                  key: 'office365',
                  label: '💼 Microsoft 365 / Outlook',
                  children: (
                    <div>
                      <Paragraph>
                        Cấu hình gửi thư qua Microsoft 365 Exchange Online:
                      </Paragraph>
                      <ul style={{ paddingLeft: 20, color: '#334155', lineHeight: 1.8 }}>
                        <li><strong>Máy chủ SMTP:</strong> <Text code>smtp.office365.com</Text></li>
                        <li><strong>Cổng:</strong> <Text strong>587</Text> (STARTTLS).</li>
                        <li><strong>Tài khoản:</strong> Email người dùng Microsoft 365 có gán License Exchange Online.</li>
                        <li><strong>Lưu ý:</strong> Cần đảm bảo tính năng <em>Authenticated SMTP</em> đã được bật cho tài khoản trong Microsoft 365 Admin Center (Active Users &gt; Mail &gt; Manage email apps).</li>
                      </ul>
                    </div>
                  ),
                },
                {
                  key: 'sendgrid',
                  label: '⚡ SendGrid / Transactional API',
                  children: (
                    <div>
                      <Paragraph>
                        Cấu hình gửi email giao dịch qua dịch vụ SendGrid:
                      </Paragraph>
                      <ul style={{ paddingLeft: 20, color: '#334155', lineHeight: 1.8 }}>
                        <li><strong>Máy chủ SMTP:</strong> <Text code>smtp.sendgrid.net</Text> (Cổng 587).</li>
                        <li><strong>Tên đăng nhập (Username):</strong> Cố định là <Text code>apikey</Text>.</li>
                        <li><strong>Mật khẩu:</strong> API Key được tạo từ SendGrid Dashboard (bắt đầu bằng <Text code>SG....</Text>) với quyền <em>Mail Send</em>.</li>
                        <li><strong>From Email:</strong> Phải là địa chỉ email thuộc Domain đã được xác thực (Domain Authentication) trên SendGrid.</li>
                      </ul>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Row 3: Email Templates Preview */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SafetyCertificateOutlined style={{ color: '#7367f0' }} />
                <Text style={{ fontWeight: 600 }}>Xem Trước Mẫu Email Tự Động Sẽ Được Gửi (Preview)</Text>
              </div>
            }
            variant="borderless"
          >
            <Tabs 
              items={[
                {
                  key: 'activation',
                  label: (
                    <span>
                      <SafetyCertificateOutlined /> Email Kích Hoạt Tài Khoản (Đăng ký mới)
                    </span>
                  ),
                  children: (
                    <div style={{ maxWidth: 580, margin: '16px auto', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, background: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <span style={{ fontSize: 24 }}>🛡️</span>
                        <Text strong style={{ color: '#2563eb', fontSize: 18 }}>NhanHoaCaptcha</Text>
                      </div>
                      <p style={{ color: '#334155' }}>Xin chào <strong>Nguyễn Văn A</strong>,</p>
                      <p style={{ color: '#334155', fontSize: 13, lineHeight: 1.6 }}>
                        Cảm ơn bạn đã đăng ký tài khoản trên hệ thống cổng bảo vệ Captcha nội bộ <strong>NhanHoaCaptcha</strong>.
                      </p>
                      <p style={{ color: '#334155', fontSize: 13 }}>Vui lòng bấm vào nút bên dưới để kích hoạt tài khoản của bạn và bắt đầu tích hợp:</p>
                      <div style={{ textAlign: 'center', margin: '24px 0' }}>
                        <Button type="primary" size="large" style={{ background: '#2563eb', height: 42, padding: '0 28px', borderRadius: 8 }}>
                          Kích Hoạt Tài Khoản Ngay →
                        </Button>
                      </div>
                      <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '10px 14px', margin: '20px 0', borderLeft: '4px solid #3b82f6' }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
                          🎁 Tài khoản của bạn được khởi tạo với <strong>Gói Trải Nghiệm (Free Trial)</strong>: Hỗ trợ tối đa 2 tên miền và 10.000 requests/tháng.
                        </p>
                      </div>
                      <Divider style={{ margin: '16px 0' }} />
                      <Text type="secondary" style={{ fontSize: 11 }}>Trân trọng,<br/>Đội ngũ Phát triển NhanHoaCaptcha</Text>
                    </div>
                  ),
                },
                {
                  key: 'quota',
                  label: (
                    <span>
                      <BellOutlined /> Email Cảnh Báo Hạn Mức Quota (80% & 100%)
                    </span>
                  ),
                  children: (
                    <div style={{ maxWidth: 580, margin: '16px auto', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, background: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <Text strong style={{ color: '#ea5455', fontSize: 18 }}>Thông Báo Dung Lượng Captcha</Text>
                      </div>
                      <p style={{ color: '#334155' }}>Xin chào <strong>Nguyễn Văn A</strong>,</p>
                      <p style={{ color: '#334155', fontSize: 13 }}>Hệ thống NhanHoaCaptcha xin thông báo tài khoản của bạn đã đạt mốc <strong>80%</strong> hạn mức sử dụng trong tháng:</p>
                      <div style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid #ff9f43', padding: 14, margin: '16px 0', borderRadius: 4, border: '1px solid #e2e8f0', borderLeftWidth: 4 }}>
                        <p style={{ margin: '3px 0', fontSize: 13 }}><strong>Gói cước:</strong> Gói Trải Nghiệm</p>
                        <p style={{ margin: '3px 0', fontSize: 13 }}><strong>Đã sử dụng:</strong> 8,000 / 10,000 requests</p>
                        <p style={{ margin: '3px 0', fontSize: 13 }}><strong>Tỷ lệ tiêu thụ:</strong> 80%</p>
                      </div>
                      <p style={{ color: '#475569', fontSize: 13 }}>
                        Để đảm bảo hoạt động xác thực của website không bị gián đoạn, bạn có thể liên hệ Quản trị viên để nâng cấp gói cước cao hơn.
                      </p>
                      <Divider style={{ margin: '16px 0' }} />
                      <Text type="secondary" style={{ fontSize: 11 }}>Trân trọng,<br/>Đội ngũ Kỹ thuật NhanHoaCaptcha</Text>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
