import { useEffect, useRef, useState } from "react";
import { Button, Result, Spin } from "antd";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { AuthLayout } from "../auth/AuthLayout";
import { API_BASE_URL } from "../../config";

type ActivationStatus = "loading" | "error";

// Trang đích của link kích hoạt trong email: /activate?token=...
export const ActivatePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activationToken = searchParams.get("token")?.trim() || "";
  const [status, setStatus] = useState<ActivationStatus>(activationToken ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState(
    activationToken ? "" : "Liên kết kích hoạt bị thiếu mã xác thực."
  );
  // Token chỉ dùng được 1 lần — StrictMode chạy effect 2 lần ở dev nên phải chặn gọi lặp
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!activationToken || requestedRef.current) return;
    requestedRef.current = true;

    axios
      .post(`${API_BASE_URL}/auth/activate`, { token: activationToken })
      .then(() => {
        navigate("/login?activated=true", { replace: true });
      })
      .catch((err: any) => {
        setErrorMessage(
          err.response?.data?.message ||
            err.response?.data?.error?.message ||
            "Không thể kích hoạt tài khoản. Vui lòng thử lại sau."
        );
        setStatus("error");
      });
  }, [activationToken, navigate]);

  return (
    <AuthLayout>
      {status === "loading" ? (
        <Result icon={<Spin size="large" />} title="Đang kích hoạt tài khoản..." />
      ) : (
        <Result
          status="error"
          title="Kích hoạt tài khoản thất bại"
          subTitle={`${errorMessage} Nếu bạn đã kích hoạt trước đó, hãy đăng nhập bình thường.`}
          extra={[
            <Link to="/login" key="login">
              <Button type="primary">Đến trang Đăng nhập</Button>
            </Link>,
            <Link to="/register" key="register">
              <Button>Đăng ký lại</Button>
            </Link>,
          ]}
        />
      )}
    </AuthLayout>
  );
};
