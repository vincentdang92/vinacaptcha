import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Typography, 
  Row, 
  Col, 
  Tag, 
  Button, 
  Input, 
  Form, 
  Descriptions, 
  Alert, 
  Tabs, 
  Divider, 
  message, 
  Spin 
} from 'antd';
import { 
  MailOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  SendOutlined, 
  SettingOutlined, 
  CopyOutlined, 
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  BellOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../../config';

const { Title, Text, Paragraph } = Typography;

interface SmtpStatus {
  is_configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_name: string;
  from_email: string;
  ignore_tls: boolean;
}

export const SmtpSettingsPage: React.FC = () => {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [form] = Form.useForm();

  const fetchStatus = () => {
    setLoading(true);
    axios
      .get(`${API_BASE_URL}/smtp/status`)
      .then((res) => {
        setStatus(res.data);
      })
      .catch((err) => {
        message.error('Không thể lấy thông tin cấu hình SMTP');
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTestMail = async (values: { email: string }) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/smtp/test`, { email: values.email });
      setTestResult(res.data);
      if (res.data?.success) {
        message.success(res.data.message || 'Gửi email thử nghiệm thành công!');
      } else {
        message.error(res.data.message || 'Kiểm tra kết nối thất bại');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Lỗi khi kiểm tra kết nối SMTP';
      setTestResult({ success: false, message: msg });
      message.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Đã sao chép vào bộ nhớ tạm!');
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
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <MailOutlined style={{ fontSize: 28, color: '#7367f0' }} />
        <div>
          <Title level={3} style={{ margin: 0 }}>Cấu Hình Cổng Email SMTP</Title>
          <Text type="secondary">Quản lý máy chủ gửi email kích hoạt tài khoản và thông báo cảnh báo hạn mức (Quota)</Text>
        </div>
      </div>

      {/* Row 1: Connection Status & Test Tool */}
      <Row gutter={[24, 24]}>
        {/* Col 1: Current Status Card */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SettingOutlined style={{ color: '#7367f0' }} />
                <Text style={{ fontWeight: 600 }}>Trạng Thái Cổng SMTP Hiện Tại</Text>
              </div>
            }
            variant="borderless"
            style={{ height: '100%' }}
          >
            {status?.is_configured ? (
              <Alert
                message="Cổng SMTP Đang Sẵn Sàng"
                description="Hệ thống đã cấu hình đầy đủ tài khoản gửi email và sẵn sàng phục vụ kích hoạt người dùng & cảnh báo quota."
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: 20 }}
              />
            ) : (
              <Alert
                message="Chưa Cấu Hình Tài Khoản SMTP"
                description="Chưa tìm thấy thông tin SMTP_USER hoặc SMTP_PASS trong file cấu hình .env. Vui lòng khai báo để kích hoạt tính năng gửi email."
                type="warning"
                showIcon
                icon={<CloseCircleOutlined />}
                style={{ marginBottom: 20 }}
              />
            )}

            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Trạng thái xác thực">
                {status?.is_configured ? (
                  <Tag color="success">ĐÃ CẤU HÌNH</Tag>
                ) : (
                  <Tag color="warning">CHƯA CẤU HÌNH</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Máy chủ SMTP (Host)">
                <Text strong style={{ fontFamily: 'monospace' }}>{status?.host || 'smtp.gmail.com'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Cổng kết nối (Port)">
                <Text strong>{status?.port}</Text>{' '}
                <Tag color={status?.port === 465 ? 'purple' : 'blue'}>
                  {status?.port === 465 ? 'SSL (465)' : status?.port === 587 ? 'STARTTLS (587)' : `Port ${status?.port}`}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Bảo mật SSL/TLS">
                <Tag color={status?.secure ? 'green' : 'default'}>
                  {status?.secure ? 'SSL/TLS Bắt buộc' : 'STARTTLS Tự động'}
                </Tag>
                {status?.ignore_tls && <Tag color="orange">Bỏ qua lỗi chứng chỉ</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Tài khoản gửi (User)">
                <Text code>{status?.user || '(Chưa cấu hình)'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Tên người gửi (From Name)">
                <Text strong>{status?.from_name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ gửi (From Email)">
                <Text code>{status?.from_email}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* Col 2: Send Test Email */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SendOutlined style={{ color: '#28c76f' }} />
                <Text style={{ fontWeight: 600 }}>Kiểm Tra Kết Nối & Gửi Thử</Text>
              </div>
            }
            variant="borderless"
            style={{ height: '100%' }}
          >
            <Paragraph type="secondary">
              Nhập địa chỉ email nhận để hệ thống kiểm tra bắt tay (handshake) với máy chủ SMTP và gửi 1 email thử nghiệm xác nhận cấu hình.
            </Paragraph>

            <Form form={form} layout="vertical" onFinish={handleTestMail} initialValues={{ email: '' }}>
              <Form.Item
                label="Email Người Nhận Kiểm Tra"
                name="email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email nhận thử nghiệm!' },
                  { type: 'email', message: 'Email không đúng định dạng!' },
                ]}
              >
                <Input 
                  size="large" 
                  prefix={<MailOutlined style={{ color: '#7367f0' }} />} 
                  placeholder="VD: kythuat@nhanhoa.com, admin@yourdomain.com..." 
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  size="large" 
                  icon={<SendOutlined />} 
                  loading={testing}
                  style={{ background: '#7367f0', borderColor: '#7367f0' }}
                >
                  {testing ? 'Đang gửi kiểm tra...' : 'Gửi Email Kiểm Tra'}
                </Button>
              </Form.Item>
            </Form>

            {testResult && (
              <div style={{ marginTop: 20 }}>
                <Alert
                  message={testResult.success ? 'Kết Quả Kiểm Tra Thành Công' : 'Kiểm Tra Thất Bại'}
                  description={testResult.message}
                  type={testResult.success ? 'success' : 'error'}
                  showIcon
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Row 2: Provider Config Guides */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThunderboltOutlined style={{ color: '#ff9f43' }} />
                <Text style={{ fontWeight: 600 }}>Mẫu Cấu Hình .env Theo Nhà Cung Cấp Mail Phổ Biến</Text>
              </div>
            }
            variant="borderless"
          >
            <Paragraph type="secondary">
              Sao chép các mẫu khai báo dưới đây vào file <Text code>backend/.env</Text> hoặc cấu hình biến môi trường Docker rồi khởi động lại dịch vụ:
            </Paragraph>

            <Tabs 
              defaultActiveKey="nhanhoa"
              items={[
                {
                  key: 'nhanhoa',
                  label: '🏢 Mail Server Nhân Hòa (mail.nhanhoa.com)',
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>Cấu hình SMTP Mail Server Nhân Hòa (Cổng 465 SSL hoặc 587 STARTTLS):</Text>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(`SMTP_HOST=mail.nhanhoa.com\nSMTP_PORT=465\nSMTP_SECURE=true\nSMTP_USER=no-reply@yourdomain.com\nSMTP_PASS=your_password\nSMTP_FROM_NAME="NhanHoaCaptcha System"\nSMTP_FROM_EMAIL=no-reply@yourdomain.com`)}>
                          Sao chép
                        </Button>
                      </div>
                      <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '16px', borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
{`SMTP_HOST=mail.nhanhoa.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@yourdomain.com
SMTP_PASS=your_nhanhoa_mail_password
SMTP_FROM_NAME="NhanHoaCaptcha System"
SMTP_FROM_EMAIL=no-reply@yourdomain.com`}
                      </pre>
                    </div>
                  ),
                },
                {
                  key: 'gmail',
                  label: '📮 Google Workspace / Gmail (Mật khẩu ứng dụng)',
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>Cấu hình Gmail SMTP (Sử dụng App Password 16 ký tự):</Text>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(`SMTP_HOST=smtp.gmail.com\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=your_email@gmail.com\nSMTP_PASS="xxxx xxxx xxxx xxxx"\nSMTP_FROM_NAME="NhanHoaCaptcha System"\nSMTP_FROM_EMAIL=your_email@gmail.com`)}>
                          Sao chép
                        </Button>
                      </div>
                      <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '16px', borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS="xxxx xxxx xxxx xxxx"    # Tạo tại Google Account -> Security -> 2-Step Verification -> App Passwords
SMTP_FROM_NAME="NhanHoaCaptcha System"
SMTP_FROM_EMAIL=your_email@gmail.com`}
                      </pre>
                    </div>
                  ),
                },
                {
                  key: 'office365',
                  label: '💼 Microsoft 365 / Outlook',
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>Cấu hình Microsoft 365 SMTP Relay:</Text>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(`SMTP_HOST=smtp.office365.com\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=no-reply@yourcompany.com\nSMTP_PASS=your_office365_password\nSMTP_FROM_NAME="NhanHoaCaptcha System"\nSMTP_FROM_EMAIL=no-reply@yourcompany.com`)}>
                          Sao chép
                        </Button>
                      </div>
                      <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '16px', borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
{`SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@yourcompany.com
SMTP_PASS=your_office365_password
SMTP_FROM_NAME="NhanHoaCaptcha System"
SMTP_FROM_EMAIL=no-reply@yourcompany.com`}
                      </pre>
                    </div>
                  ),
                },
                {
                  key: 'sendgrid',
                  label: '⚡ SendGrid / Amazon SES / Brevo',
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>Cấu hình SMTP qua Transactional Email Providers:</Text>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(`SMTP_HOST=smtp.sendgrid.net\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=apikey\nSMTP_PASS=SG.your_sendgrid_api_key\nSMTP_FROM_NAME="NhanHoaCaptcha System"\nSMTP_FROM_EMAIL=no-reply@verified-domain.com`)}>
                          Sao chép
                        </Button>
                      </div>
                      <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '16px', borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
{`# Mẫu SendGrid:
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your_sendgrid_api_key_here
SMTP_FROM_NAME="NhanHoaCaptcha System"
SMTP_FROM_EMAIL=no-reply@verified-domain.com

# Mẫu Amazon SES:
# SMTP_HOST=email-smtp.us-east-1.amazonaws.com
# SMTP_PORT=587
# SMTP_USER=your_ses_smtp_user
# SMTP_PASS=your_ses_smtp_password`}
                      </pre>
                    </div>
                  ),
                },
                {
                  key: 'onpremise',
                  label: '🖥️ Mail Server Nội Bộ / Postfix / Local Relay',
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>Cấu hình Relay nội bộ không xác thực hoặc dùng chứng chỉ tự ký (Self-signed):</Text>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(`SMTP_HOST=10.0.0.10\nSMTP_PORT=25\nSMTP_SECURE=false\nSMTP_USER=\nSMTP_PASS=\nSMTP_IGNORE_TLS=true\nSMTP_FROM_NAME="NhanHoaCaptcha System"\nSMTP_FROM_EMAIL=no-reply@nhanhoa.local`)}>
                          Sao chép
                        </Button>
                      </div>
                      <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '16px', borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
{`SMTP_HOST=10.0.0.10
SMTP_PORT=25
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_IGNORE_TLS=true             # Bỏ qua kiểm tra chứng chỉ SSL tự ký
SMTP_FROM_NAME="NhanHoaCaptcha System"
SMTP_FROM_EMAIL=no-reply@nhanhoa.local`}
                      </pre>
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
                <InfoCircleOutlined style={{ color: '#00cfe8' }} />
                <Text style={{ fontWeight: 600 }}>Xem Trước Mẫu Email Tự Động (Email Templates Preview)</Text>
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
