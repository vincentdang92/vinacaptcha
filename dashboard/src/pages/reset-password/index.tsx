import React, { useState } from 'react';
import { Typography, Form, Input, Button, Alert, theme } from 'antd';
import { LockOutlined, CheckCircleFilled, WarningOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AuthLayout } from '../auth/AuthLayout';
import { executeSliderCaptcha } from '../../utils/captcha';
import { API_BASE_URL } from '../../config';

const { Title, Text } = Typography;

export const ResetPasswordPage: React.FC = () => {
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');

  const [isLoading, setIsLoading] = useState(false);
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { token } = theme.useToken();

  const inputStyle = {
    padding: '10px 16px',
    borderRadius: '8px',
    borderColor: token.colorBorder,
  };

  const handleSubmit = async (values: { password: string }) => {
    if (!tokenParam) {
      setErrorMessage('Mã xác thực không hợp lệ. Vui lòng yêu cầu một liên kết mới.');
      return;
    }

    setErrorMessage(null);
    setVerifyingCaptcha(true);

    let captchaToken = '';
    try {
      captchaToken = await executeSliderCaptcha('reset_password');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Xác thực Slider Captcha thất bại. Vui lòng thử lại.');
      setVerifyingCaptcha(false);
      return;
    }

    setVerifyingCaptcha(false);
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/reset-password`, {
        token: tokenParam.trim(),
        password: values.password.trim(),
        captcha_token: captchaToken,
      });

      if (response.data?.success || response.status === 200 || response.status === 201) {
        setIsSuccess(true);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        err.message ||
        'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      {!tokenParam ? (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <WarningOutlined style={{ fontSize: 48, color: token.colorWarning, marginBottom: 16 }} />
            <Title level={2} style={{ fontWeight: 700, marginBottom: 8 }}>
              Liên Kết Không Hợp Lệ
            </Title>
            <Text type="secondary" style={{ fontSize: '15px', display: 'block', lineHeight: 1.6 }}>
              Mã xác thực đặt lại mật khẩu bị thiếu hoặc không đúng định dạng.
            </Text>
          </div>

          <Alert
            message="Yêu cầu liên kết mới"
            description="Để bảo mật, vui lòng truy cập trang Quên mật khẩu để nhận lại một liên kết xác thực an toàn mới."
            type="warning"
            showIcon
            style={{ marginBottom: 24, borderRadius: 8 }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/forgot-password">
              <Button type="primary" block style={{ height: 44, borderRadius: 8, fontWeight: 600 }}>
                Gửi Lại Yêu Cầu Đặt Lại Mật Khẩu
              </Button>
            </Link>

            <Link to="/login">
              <Button type="text" block style={{ color: token.colorTextSecondary }}>
                Quay lại trang Đăng nhập
              </Button>
            </Link>
          </div>
        </div>
      ) : isSuccess ? (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <CheckCircleFilled style={{ fontSize: 48, color: token.colorSuccess, marginBottom: 16 }} />
            <Title level={2} style={{ fontWeight: 700, marginBottom: 8 }}>
              Đặt Lại Mật Khẩu Thành Công!
            </Title>
            <Text type="secondary" style={{ fontSize: '15px', display: 'block', lineHeight: 1.6 }}>
              Mật khẩu tài khoản của bạn đã được cập nhật thành công. Bạn có thể đăng nhập ngay với mật khẩu mới.
            </Text>
          </div>

          <Alert
            message="Bảo mật tài khoản"
            description="Mật khẩu mới đã có hiệu lực ngay lập tức. Tất cả các phiên làm việc trước đó sẽ yêu cầu đăng nhập lại."
            type="success"
            showIcon
            style={{ marginBottom: 24, borderRadius: 8 }}
          />

          <Link to="/login">
            <Button type="primary" block style={{ height: 46, borderRadius: 8, fontWeight: 600, fontSize: '15px' }}>
              Đăng Nhập Ngay →
            </Button>
          </Link>
        </div>
      ) : (
        <div>
          <Title level={2} style={{ fontWeight: 700, marginBottom: '8px' }}>
            Đặt Lại Mật Khẩu
          </Title>
          <Text type="secondary" style={{ fontSize: '15px', display: 'block', marginBottom: '28px', lineHeight: 1.5 }}>
            Nhập mật khẩu mới cho tài khoản của bạn (tối thiểu 6 ký tự).
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
              label={<Text style={{ fontWeight: 500 }}>Mật khẩu mới<span style={{ color: token.colorError }}>*</span></Text>}
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />}
                placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                style={inputStyle}
                autoFocus
              />
            </Form.Item>

            <Form.Item
              label={<Text style={{ fontWeight: 500 }}>Xác nhận mật khẩu mới<span style={{ color: token.colorError }}>*</span></Text>}
              name="confirm_password"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Vui lòng nhập lại mật khẩu mới' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: token.colorTextPlaceholder, marginRight: 8 }} />}
                placeholder="Nhập lại mật khẩu mới"
                style={inputStyle}
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
                {verifyingCaptcha ? 'Đang xác thực Captcha...' : isLoading ? 'Đang cập nhật...' : 'Cập Nhật Mật Khẩu Mới →'}
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
