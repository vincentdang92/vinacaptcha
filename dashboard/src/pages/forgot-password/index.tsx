import React, { useState } from 'react';
import { Typography, Form, Input, Button, Alert, theme } from 'antd';
import { MailOutlined, ArrowLeftOutlined, CheckCircleFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AuthLayout } from '../auth/AuthLayout';
import { executeSliderCaptcha } from '../../utils/captcha';
import { API_BASE_URL } from '../../config';

const { Title, Text } = Typography;

export const ForgotPasswordPage: React.FC = () => {
  const [form] = Form.useForm();
  const [isLoading, setIsLoading] = useState(false);
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { token } = theme.useToken();

  const inputStyle = {
    padding: '10px 16px',
    borderRadius: '8px',
    borderColor: token.colorBorder,
  };

  const handleSubmit = async (values: { email: string }) => {
    setErrorMessage(null);
    setVerifyingCaptcha(true);

    let captchaToken = '';
    try {
      captchaToken = await executeSliderCaptcha('forgot_password');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Xác thực Slider Captcha thất bại. Vui lòng thử lại.');
      setVerifyingCaptcha(false);
      return;
    }

    setVerifyingCaptcha(false);
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/forgot-password`, {
        email: values.email?.trim(),
        captcha_token: captchaToken,
      });

      if (response.data?.success || response.status === 200 || response.status === 201) {
        setSubmittedEmail(values.email);
        setIsSuccess(true);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || err.message || 'Không thể gửi yêu cầu đặt lại mật khẩu.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      {isSuccess ? (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <CheckCircleFilled style={{ fontSize: 48, color: token.colorSuccess, marginBottom: 16 }} />
            <Title level={2} style={{ fontWeight: 700, marginBottom: 8 }}>
              Kiểm Tra Hộp Thư Của Bạn
            </Title>
            <Text type="secondary" style={{ fontSize: '15px', display: 'block', lineHeight: 1.6 }}>
              Chúng tôi đã gửi hướng dẫn và liên kết đặt lại mật khẩu tới địa chỉ:
            </Text>
            <Text strong style={{ fontSize: '16px', color: token.colorPrimary, display: 'block', margin: '8px 0 16px' }}>
              {submittedEmail}
            </Text>
          </div>

          <Alert
            message="Lưu ý bảo mật"
            description="Liên kết đặt lại mật khẩu chỉ có hiệu lực trong vòng 15 phút. Nếu không thấy trong Hộp thư đến (Inbox), vui lòng kiểm tra thêm thư mục Spam hoặc Thư rác."
            type="info"
            showIcon
            style={{ marginBottom: 24, borderRadius: 8 }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/login">
              <Button type="primary" block style={{ height: 44, borderRadius: 8, fontWeight: 600 }}>
                Quay Lại Trang Đăng Nhập
              </Button>
            </Link>

            <Button
              type="text"
              block
              onClick={() => {
                setIsSuccess(false);
                form.resetFields();
              }}
              style={{ color: token.colorTextSecondary }}
            >
              Gửi lại với email khác
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Title level={2} style={{ fontWeight: 700, marginBottom: '8px' }}>
            Quên Mật Khẩu
          </Title>
          <Text type="secondary" style={{ fontSize: '15px', display: 'block', marginBottom: '28px', lineHeight: 1.5 }}>
            Nhập địa chỉ email tài khoản của bạn. Hệ thống sẽ gửi một liên kết an toàn để bạn thiết lập mật khẩu mới.
          </Text>

          {errorMessage && (
            <Alert
              message={errorMessage}
              type="error"
              showIcon
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
          >
            <Form.Item
              label={<Text style={{ fontWeight: 500 }}>Email tài khoản<span style={{ color: token.colorError }}>*</span></Text>}
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập địa chỉ email' },
                { type: 'email', message: 'Email không đúng định dạng' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />}
                placeholder="name@company.com"
                style={inputStyle}
                autoFocus
              />
            </Form.Item>

            <Form.Item style={{ marginTop: 24, marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading || verifyingCaptcha}
                block
                style={{ height: '46px', borderRadius: '8px', fontWeight: 600, fontSize: '15px' }}
              >
                {verifyingCaptcha ? 'Đang xác thực Captcha...' : isLoading ? 'Đang gửi yêu cầu...' : 'Gửi Yêu Cầu Đặt Lại Mật Khẩu →'}
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link
              to="/login"
              style={{
                color: token.colorTextSecondary,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '14px',
              }}
            >
              <ArrowLeftOutlined /> Quay lại trang Đăng nhập
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};
