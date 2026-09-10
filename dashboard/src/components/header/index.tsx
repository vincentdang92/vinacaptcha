import React, { useContext, useEffect, useState } from "react";
import { Layout, Space, Button, Dropdown, Avatar, Typography, Tag, Divider, theme } from "antd";
import type { MenuProps } from "antd";
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
  PieChartOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useGetIdentity, useLogout } from "@refinedev/core";
import axios from "axios";
import { ColorModeContext } from "../../contexts/color-mode";

import { API_BASE_URL } from "../../config";

const { Text } = Typography;

export const Header: React.FC = () => {
  const { mode, setMode } = useContext(ColorModeContext);
  const { token } = theme.useToken();
  const { data: user } = useGetIdentity<any>();
  const { mutate: logout } = useLogout();
  const [quota, setQuota] = useState<any>(null);

  useEffect(() => {
    const jwtToken = localStorage.getItem("vinacaptcha_token");
    if (jwtToken) {
      axios
        .get(`${API_BASE_URL}/accounts/quota-status`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        })
        .then((res) => {
          if (res?.data && typeof res.data.used_requests === "number") {
            setQuota(res.data);
          }
        })
        .catch(() => {});
    }
  }, []);

  const menuItems: MenuProps["items"] = [
    {
      key: "user-info-header",
      label: (
        <div style={{ padding: "8px 4px", minWidth: "220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <Avatar
              size={40}
              style={{
                backgroundColor: user?.role === "admin" ? "#ea5455" : "#7367f0",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : <UserOutlined />}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", lineHeight: "1.2" }}>
                {user?.name || "Người dùng"}
              </div>
              <Text type="secondary" style={{ fontSize: "12px" }}>
                {user?.email}
              </Text>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
            <Tag color={user?.role === "admin" ? "red" : "blue"} style={{ margin: 0 }}>
              {user?.role === "admin" ? "👑 Admin" : "👤 User"}
            </Tag>
            <Tag color="purple" style={{ margin: 0 }}>
              {quota?.plan_name || "Gói Trải Nghiệm"}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      type: "divider",
    },
    {
      key: "quota-info",
      icon: <PieChartOutlined style={{ color: "#7367f0" }} />,
      label: (
        <div style={{ fontSize: "13px" }}>
          <div>Hạn mức Captcha tháng:</div>
          <Text strong style={{ color: "#7367f0" }}>
            {quota && quota.used_requests != null && quota.max_requests != null
              ? `${Number(quota.used_requests).toLocaleString()} / ${Number(quota.max_requests).toLocaleString()}`
              : "—"} reqs
          </Text>
        </div>
      ),
    },
    {
      key: "status-info",
      icon: <SafetyCertificateOutlined style={{ color: "#28c76f" }} />,
      label: (
        <div style={{ fontSize: "13px" }}>
          Trạng thái: <Text style={{ color: "#28c76f", fontWeight: 500 }}>Hoạt động</Text>
        </div>
      ),
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      icon: <LogoutOutlined style={{ color: "#ea5455" }} />,
      danger: true,
      label: "Đăng xuất",
      onClick: () => logout(),
    },
  ];

  return (
    <Layout.Header
      style={{
        backgroundColor: token.colorBgContainer,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0px 24px",
        height: "64px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        borderBottom: `1px solid ${mode === "light" ? "#e9ebec" : "#434968"}`,
      }}
    >
      <Space size="middle">
        <Button
          type="text"
          icon={mode === "light" ? <MoonOutlined /> : <SunOutlined />}
          onClick={() => {
            setMode(mode === "light" ? "dark" : "light");
          }}
          style={{ color: token.colorTextBase }}
        />

        <Divider type="vertical" style={{ height: "24px" }} />

        <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={["click"]}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "8px",
              transition: "background 0.2s",
            }}
          >
            <Avatar
              size="default"
              style={{
                backgroundColor: user?.role === "admin" ? "#ea5455" : "#7367f0",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : <UserOutlined />}
            </Avatar>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
              <Text strong style={{ fontSize: "13px", lineHeight: "1.2" }}>
                {user?.name || "Tài khoản"}
              </Text>
              <Text type="secondary" style={{ fontSize: "11px" }}>
                {user?.role === "admin" ? "Admin" : "User"}
              </Text>
            </div>
          </div>
        </Dropdown>
      </Space>
    </Layout.Header>
  );
};
