import { Row, Col, Card, Typography, Table, Spin, Tag, Tooltip, Progress } from "antd";
import { 
  UserOutlined, 
  GlobalOutlined, 
  ClockCircleOutlined, 
  StopOutlined,
  CompassOutlined,
  MobileOutlined,
  LaptopOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Title, Text } = Typography;

const STATS_URL = `${API_BASE_URL}/dashboard/stats`;

interface StatsData {
  totalRequests: number;
  totalSites: number;
  activeSites: number;
  knowledgeBaseIps: number;
  bannedIps: number;
  recentLogs: Array<{
    ip: string;
    site_domain?: string;
    challenge_type: string;
    result: string;
    risk_score: string;
    risk_breakdown: any;
    created_at: string;
  }>;
  chartData: Array<{
    date: string;
    passed: number;
    failed: number;
  }>;
  marketingStats?: {
    utmCampaigns: Array<{ campaign: string; source: string; total: number; passCount: number; failCount: number }>;
    deviceBreakdown: { mobile: number; desktop: number; touchScreenPct: number };
    userEngagement: { avgTimeOnPageMs: number; avgScrollDepthPct: number; pasteDetectedCount: number };
  };
}

const defaultStats: StatsData = {
  totalRequests: 0,
  totalSites: 0,
  activeSites: 0,
  knowledgeBaseIps: 0,
  bannedIps: 0,
  recentLogs: [],
  chartData: [],
  marketingStats: {
    utmCampaigns: [],
    deviceBreakdown: { mobile: 0, desktop: 0, touchScreenPct: 0 },
    userEngagement: { avgTimeOnPageMs: 0, avgScrollDepthPct: 0, pasteDetectedCount: 0 },
  },
};

export const DashboardPage = () => {
  const [stats, setStats] = useState<StatsData>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchStats = () => {
      const token = localStorage.getItem("vinacaptcha_token");
      axios
        .get(STATS_URL, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        .then((res) => {
          if (isMounted) {
            const data = res?.data || {};
            setStats({
              totalRequests: Number(data.totalRequests) || 0,
              totalSites: Number(data.totalSites) || 0,
              activeSites: Number(data.activeSites) || 0,
              knowledgeBaseIps: Number(data.knowledgeBaseIps) || 0,
              bannedIps: Number(data.bannedIps) || 0,
              recentLogs: Array.isArray(data.recentLogs) ? data.recentLogs : [],
              chartData: Array.isArray(data.chartData) ? data.chartData : [],
              marketingStats: data.marketingStats || {
                utmCampaigns: [],
                deviceBreakdown: { mobile: 0, desktop: 0, touchScreenPct: 0 },
                userEngagement: { avgTimeOnPageMs: 0, avgScrollDepthPct: 0, pasteDetectedCount: 0 },
              },
            });
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("[Dashboard] Không thể tải Stats:", err);
          if (isMounted) {
            setStats(defaultStats);
            setLoading(false);
          }
        });
    };

    // Lần tải đầu tiên
    fetchStats();

    // Thiết lập polling realtime mỗi 5 giây
    const interval = setInterval(() => {
      fetchStats();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading && stats.totalSites === 0) {
    return (
      <div style={{ padding: "80px", display: "flex", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  const kpiCards = [
    {
      label: "Lượng Request",
      value: (stats.totalRequests ?? 0).toLocaleString(),
      icon: <UserOutlined />,
      color: "#7367f0",
      bg: "rgba(115,103,240,0.1)",
    },
    {
      label: "Tổng Site / Active",
      value: `${stats.totalSites ?? 0} / ${stats.activeSites ?? 0}`,
      icon: <GlobalOutlined />,
      color: "#28c76f",
      bg: "rgba(40,199,111,0.1)",
    },
    {
      label: "Knowledge Base (IPs)",
      value: (stats.knowledgeBaseIps ?? 0).toLocaleString(),
      icon: <ClockCircleOutlined />,
      color: "#00cfe8",
      bg: "rgba(0,207,232,0.1)",
    },
    {
      label: "IP Bị Banned",
      value: (stats.bannedIps ?? 0).toLocaleString(),
      icon: <StopOutlined />,
      color: "#ea5455",
      bg: "rgba(234,84,85,0.1)",
    },
  ];

  const chartData = Array.isArray(stats?.chartData) ? stats.chartData : [];
  const recentLogs = Array.isArray(stats?.recentLogs) ? stats.recentLogs : [];

  // Tính max cho chart
  const maxTotal = Math.max(
    ...chartData.map((d) => (Number(d?.passed) || 0) + (Number(d?.failed) || 0)),
    1
  );

  return (
    <div style={{ padding: "0 0 24px" }}>
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.5); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        {kpiCards.map((card) => (
          <Col key={card.label} xs={24} sm={12} xl={6}>
            <Card variant="borderless">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {card.label}
                  </Text>
                  <Title level={3} style={{ margin: "6px 0 0", fontWeight: 700 }}>
                    {card.value}
                  </Title>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: card.bg, color: card.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Row 2: Chart Full Width */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: 600 }}>Lượng Verify Captcha — 7 ngày gần nhất</Text>
                <Tag color="processing" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#1890ff', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                  REALTIME
                </Tag>
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: "16px 20px" } }}
          >
            {chartData.length > 0 ? (
              <>
                {/* Legend */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#28c76f", display: "inline-block" }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>Pass</Text>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#ea5455", display: "inline-block" }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>Fail</Text>
                  </span>
                </div>

                {/* Chart bars */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 250, padding: "0 4px" }}>
                  {chartData.map((day, i) => {
                    const passed = Number(day?.passed) || 0;
                    const failed = Number(day?.failed) || 0;
                    const total = passed + failed;
                    const heightPct = maxTotal > 0 ? Math.max((total / maxTotal) * 100, total > 0 ? 3 : 0) : 0;

                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 0 }}>
                        {/* Total count label */}
                        <Text style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: total === 0 ? 0 : 1 }}>
                          {total}
                        </Text>

                        {/* Stacked bar */}
                        <div style={{
                          width: "50%",
                          maxWidth: 80,
                          height: `${heightPct}%`,
                          minHeight: total > 0 ? 4 : 0,
                          display: "flex",
                          flexDirection: "column",
                          borderRadius: "4px 4px 0 0",
                          overflow: "hidden",
                        }}>
                          {/* Fail bar (top, đỏ) */}
                          {failed > 0 && (
                            <Tooltip title={`Fail: ${failed}`}>
                              <div style={{ backgroundColor: "#ea5455", flex: failed, width: "100%" }} />
                            </Tooltip>
                          )}
                          {/* Pass bar (bottom, xanh) */}
                          {passed > 0 && (
                            <Tooltip title={`Pass: ${passed}`}>
                              <div style={{ backgroundColor: "#28c76f", flex: passed, width: "100%" }} />
                            </Tooltip>
                          )}
                        </div>

                        {/* X-axis label */}
                        <Text type="secondary" style={{ fontSize: 12, marginTop: 8, whiteSpace: "nowrap" }}>
                          {day?.date ? new Date(day.date).toLocaleDateString("vi-VN", { month: "numeric", day: "numeric" }) : ""}
                        </Text>
                      </div>
                    );
                  })}
                </div>

                {/* Summary row */}
                <div style={{ display: "flex", gap: 40, marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(128,128,128,0.15)", justifyContent: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Tổng Pass</Text>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#28c76f" }}>
                      {chartData.reduce((s, d) => s + (Number(d?.passed) || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Tổng Fail</Text>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#ea5455" }}>
                      {chartData.reduce((s, d) => s + (Number(d?.failed) || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Tỉ lệ Pass</Text>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#7367f0" }}>
                      {(() => {
                        const tp = chartData.reduce((s, d) => s + (Number(d?.passed) || 0), 0);
                        const ta = chartData.reduce((s, d) => s + (Number(d?.passed) || 0) + (Number(d?.failed) || 0), 0);
                        return ta > 0 ? `${Math.round((tp / ta) * 100)}%` : "—";
                      })()}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 250 }}>
                <Text type="secondary">Chưa có dữ liệu — hãy submit thử form Widget trước!</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Row 3: Marketing & UX Intelligence Analytics */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Col 1: UTM Campaign & Ad Fraud Monitor */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CompassOutlined style={{ color: '#7367f0' }} />
                <Text style={{ fontWeight: 600 }}>Chiến Dịch Ads & Giám Sát Click Tặc (UTM)</Text>
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: 0 } }}
            style={{ height: '100%' }}
          >
            <Table
              dataSource={stats?.marketingStats?.utmCampaigns || []}
              rowKey={(record) => record.campaign + record.source}
              pagination={false}
              size="small"
              locale={{ emptyText: "Chưa ghi nhận traffic từ chiến dịch UTM nào" }}
            >
              <Table.Column
                title="Chiến Dịch / Nguồn"
                render={(_: any, r: any) => (
                  <div>
                    <Text strong style={{ fontSize: 13 }}>{r.campaign}</Text>
                    <div><Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>{r.source}</Tag></div>
                  </div>
                )}
              />
              <Table.Column
                title="Lượt Submit"
                dataIndex="total"
                align="center"
                render={(total: number) => <Text strong>{total}</Text>}
              />
              <Table.Column
                title="Tỉ Lệ Pass"
                render={(_: any, r: any) => {
                  const passRate = r.total > 0 ? Math.round((r.passCount / r.total) * 100) : 0;
                  return (
                    <div style={{ width: 90 }}>
                      <Progress percent={passRate} size="small" strokeColor="#28c76f" />
                    </div>
                  );
                }}
              />
              <Table.Column
                title="Tỉ Lệ Click Tặc"
                render={(_: any, r: any) => {
                  const fraudRate = r.total > 0 ? Math.round((r.failCount / r.total) * 100) : 0;
                  const isHighFraud = fraudRate >= 30;
                  return (
                    <div>
                      <Tag color={isHighFraud ? "error" : fraudRate > 10 ? "warning" : "success"}>
                        {fraudRate}% Bot
                      </Tag>
                    </div>
                  );
                }}
              />
            </Table>
          </Card>
        </Col>

        {/* Col 2: Device & CRO Interaction Intelligence */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThunderboltOutlined style={{ color: '#ff9f43' }} />
                <Text style={{ fontWeight: 600 }}>Thiết Bị & Trải Nghiệm CRO</Text>
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: "16px 20px" } }}
            style={{ height: '100%' }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Mobile vs Desktop Split */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <MobileOutlined /> Mobile ({stats?.marketingStats?.deviceBreakdown?.mobile || 0})
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <LaptopOutlined /> Desktop ({stats?.marketingStats?.deviceBreakdown?.desktop || 0})
                  </Text>
                </div>
                {(() => {
                  const m = stats?.marketingStats?.deviceBreakdown?.mobile || 0;
                  const d = stats?.marketingStats?.deviceBreakdown?.desktop || 0;
                  const total = m + d;
                  const mobilePct = total > 0 ? Math.round((m / total) * 100) : 50;
                  return (
                    <Progress
                      percent={mobilePct}
                      showInfo={false}
                      strokeColor="#7367f0"
                      trailColor="#00cfe8"
                      size={["100%", 10]}
                    />
                  );
                })()}
              </div>

              {/* Interaction Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
                <div style={{ backgroundColor: "rgba(115,103,240,0.06)", borderRadius: 8, padding: "10px 12px" }}>
                  <Text type="secondary" style={{ fontSize: 11, display: "block" }}>⏱️ TG Điền Form TB</Text>
                  <Text strong style={{ fontSize: 16, color: "#7367f0" }}>
                    {stats?.marketingStats?.userEngagement?.avgTimeOnPageMs ? `${(stats.marketingStats.userEngagement.avgTimeOnPageMs / 1000).toFixed(1)}s` : "—"}
                  </Text>
                </div>
                <div style={{ backgroundColor: "rgba(40,199,111,0.06)", borderRadius: 8, padding: "10px 12px" }}>
                  <Text type="secondary" style={{ fontSize: 11, display: "block" }}>📜 Độ Sâu Cuộn TB</Text>
                  <Text strong style={{ fontSize: 16, color: "#28c76f" }}>
                    {stats?.marketingStats?.userEngagement?.avgScrollDepthPct ? `${stats.marketingStats.userEngagement.avgScrollDepthPct}%` : "—"}
                  </Text>
                </div>
                <div style={{ backgroundColor: "rgba(255,159,67,0.06)", borderRadius: 8, padding: "10px 12px" }}>
                  <Text type="secondary" style={{ fontSize: 11, display: "block" }}>📋 Lượt Paste Form</Text>
                  <Text strong style={{ fontSize: 16, color: "#ff9f43" }}>
                    {stats?.marketingStats?.userEngagement?.pasteDetectedCount || 0}
                  </Text>
                </div>
                <div style={{ backgroundColor: "rgba(0,207,232,0.06)", borderRadius: 8, padding: "10px 12px" }}>
                  <Text type="secondary" style={{ fontSize: 11, display: "block" }}>📱 Màn Hình Touch</Text>
                  <Text strong style={{ fontSize: 16, color: "#00cfe8" }}>
                    {stats?.marketingStats?.deviceBreakdown?.touchScreenPct ? `${stats.marketingStats.deviceBreakdown.touchScreenPct}%` : "—"}
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 4: Table Full Width */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title={<Text style={{ fontWeight: 600 }}>Lịch Sử Verify Gần Nhất</Text>}
            variant="borderless"
            styles={{ body: { padding: 0 } }}
            style={{ height: '100%' }}
          >
            <Table
              dataSource={recentLogs}
              rowKey={(record) => record.ip + record.created_at}
              pagination={false}
              size="small"
              scroll={{ x: true }}
            >
              <Table.Column
                title="IP / Site"
                render={(_: any, record: any) => (
                  <div>
                    <Text strong style={{ fontFamily: "monospace", fontSize: 12 }}>{record.ip}</Text>
                    {record.site_domain && <div><Text type="secondary" style={{ fontSize: 11 }}>{record.site_domain}</Text></div>}
                  </div>
                )}
              />

              <Table.Column
                title="Risk / Hành vi"
                render={(_: any, record: any) => {
                  const score = parseFloat(record.risk_score) || 0;
                  const scoreColor = score >= 70 ? "#ea5455" : score >= 30 ? "#ff9f43" : "#28c76f";
                  const levelName = score >= 70 ? "HIGH" : score >= 30 ? "MED" : "LOW";
                  const signals = record.risk_breakdown?.clientSignals;

                  return (
                    <div>
                      <Tag color={score >= 70 ? "error" : score >= 30 ? "warning" : "success"} style={{ fontSize: 11, marginBottom: 1 }}>{levelName}</Tag>
                      <div><Text style={{ color: scoreColor, fontSize: 11, fontWeight: 700 }}>{score.toFixed(0)}/100</Text></div>
                      
                      {/* Hiển thị tóm tắt Client Signals (Nguồn traffic/Hành vi) */}
                      {signals && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 190 }}>
                          {signals.webdriver && <Tag color="error" style={{ fontSize: 9, margin: 0, padding: "0 4px" }}>Bot Webdriver</Tag>}
                          {signals.execution_count && signals.execution_count > 1 && (
                            <Tooltip title={`Lượt submit thứ ${signals.execution_count} trên cùng 1 phiên trang`}>
                              <Tag color="purple" style={{ fontSize: 9, margin: 0, padding: "0 4px" }}>
                                🔁 Lặp #{signals.execution_count}
                              </Tag>
                            </Tooltip>
                          )}
                          {signals.time_on_page_ms !== undefined && (
                            <Tooltip title={`Khoảng cách submit: ${(signals.time_on_page_ms / 1000).toFixed(1)}s (Tổng thời gian trên trang: ${((signals.total_page_duration_ms || signals.time_on_page_ms) / 1000).toFixed(1)}s)`}>
                              <Tag color={signals.time_on_page_ms < 600 ? "error" : "default"} style={{ fontSize: 9, margin: 0, padding: "0 4px" }}>
                                ⏱️ {(signals.time_on_page_ms / 1000).toFixed(1)}s
                              </Tag>
                            </Tooltip>
                          )}
                          <Tooltip title={`Tương tác lượt này: ${signals.mouse_moves || 0} di chuột, ${signals.mouse_clicks || 0} click, ${signals.key_strokes || 0} phím`}>
                            <Tag color={(signals.mouse_moves === 0 && signals.key_strokes === 0) ? "error" : "default"} style={{ fontSize: 9, margin: 0, padding: "0 4px" }}>
                              🖱️ {signals.mouse_moves || 0} | ⌨️ {signals.key_strokes || 0}
                            </Tag>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Table.Column
                title="Chi Tiết Phân Tích"
                render={(_: any, record: any) => {
                  const bd = record.risk_breakdown || {};
                  const reasons: string[] = [];
                  if (bd.isBannedIp) reasons.push("IP Bị Cấm");
                  if (bd.clientBehaviorScore > 0) reasons.push(`Bot (+${bd.clientBehaviorScore})`);
                  if (bd.threatIntelScore > 0) reasons.push(`${bd.threatCategory || 'Threat'} (+${bd.threatIntelScore})`);
                  if (bd.reputationScore > 0) reasons.push(`Reputation (+${bd.reputationScore})`);
                  if (bd.rateLimitScore > 0) reasons.push(`RateLimit (+${bd.rateLimitScore})`);
                  if (reasons.length === 0) reasons.push("Bình thường");

                  return (
                    <div>
                      <Tag color={record.result === "pass" ? "success" : "error"} style={{ fontSize: 11 }}>
                        {record.result.toUpperCase()}
                      </Tag>
                      <Tooltip title={reasons.join(' | ')}>
                        <div style={{ marginTop: 1, cursor: 'help' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {reasons[0]}{reasons.length > 1 ? ' …' : ''}
                          </Text>
                        </div>
                      </Tooltip>
                    </div>
                  );
                }}
              />

              <Table.Column
                title="Thời Gian"
                dataIndex="created_at"
                render={(ts: string) => {
                  const d = new Date(ts);
                  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
                  const diffHr = Math.floor(diffMin / 60);
                  const timeAgo = diffMin < 1 ? "vừa xong"
                    : diffMin < 60 ? `${diffMin} phút trước`
                    : diffHr < 24 ? `${diffHr} giờ trước`
                    : d.toLocaleDateString("vi-VN");
                  return (
                    <div>
                      <Text style={{ fontSize: 12 }}>{timeAgo}</Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }}>{d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</Text></div>
                    </div>
                  );
                }}
              />
            </Table>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
