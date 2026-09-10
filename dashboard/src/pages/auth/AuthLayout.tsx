import { Row, Col, Typography, theme } from "antd";
import { useContext } from "react";
import { ColorModeContext } from "../../contexts/color-mode";

const { Title, Text } = Typography;

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  const { mode, setMode } = useContext(ColorModeContext);
  const { token } = theme.useToken();

  const isDark = mode === "dark";

  return (
    <Row style={{ minHeight: "100vh", backgroundColor: token.colorBgContainer }}>
      {/* Cột trái: Form */}
      <Col xs={24} md={12} lg={10} style={{ padding: "40px", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: "auto" }}>
          <a href="/" style={{ color: token.colorTextSecondary, textDecoration: "none", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>&lt;</span> Back to dashboard
          </a>
        </div>
        
        <div style={{ maxWidth: 440, width: "100%", margin: "0 auto", padding: "20px 0" }}>
          {children}
        </div>

        <div style={{ marginTop: "auto" }}></div>
      </Col>

      {/* Cột phải: Illustration */}
      <Col xs={0} md={12} lg={14} style={{ position: "relative", backgroundColor: isDark ? "#1c2033" : "#1c2434", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Lưới Grid Pattern background */}
        <div 
          style={{ 
            position: "absolute", 
            inset: 0, 
            opacity: 0.1,
            backgroundImage: "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            backgroundPosition: "center center"
          }}
        />
        {/* Các ô vuông mờ trang trí */}
        <div style={{ position: "absolute", width: 80, height: 80, backgroundColor: "rgba(255,255,255,0.05)", left: "20%", top: "40%" }} />
        <div style={{ position: "absolute", width: 40, height: 40, backgroundColor: "rgba(255,255,255,0.05)", left: "25%", top: "45%" }} />
        <div style={{ position: "absolute", width: 80, height: 80, backgroundColor: "rgba(255,255,255,0.05)", right: "15%", top: "50%" }} />
        <div style={{ position: "absolute", width: 40, height: 40, backgroundColor: "rgba(255,255,255,0.05)", right: "20%", top: "55%" }} />

        {/* Nội dung Logo & Title */}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: "#ffffff", padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "16px" }}>
            <div style={{ width: 48, height: 48, backgroundColor: token.colorPrimary, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="12" width="4" height="8" rx="2" fill="white"/>
                <rect x="10" y="8" width="4" height="12" rx="2" fill="white"/>
                <rect x="17" y="4" width="4" height="16" rx="2" fill="white"/>
              </svg>
            </div>
            <Title level={2} style={{ color: "#ffffff", margin: 0, fontWeight: 700 }}>VinaCaptcha</Title>
          </div>
          <Text style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "16px", maxWidth: 400, display: "inline-block" }}>
            Hệ thống quản trị xác thực Captcha & phòng thủ Botnet
          </Text>
        </div>

        {/* Nút dark mode ở góc dưới (mockup) -> Đã gán function đổi mode */}
        <div 
          onClick={() => setMode(isDark ? "light" : "dark")}
          style={{ position: "absolute", bottom: "32px", right: "32px", width: 40, height: 40, backgroundColor: token.colorPrimary, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={isDark ? "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" : "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"}></path>
          </svg>
        </div>
      </Col>
    </Row>
  );
};
