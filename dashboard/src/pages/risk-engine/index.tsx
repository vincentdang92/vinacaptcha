import React, { useState } from 'react';
import { Card, Typography, Row, Col, Alert, Timeline, Tag, Descriptions, Switch, Slider, Select, Divider } from 'antd';
import { 
  ControlOutlined, 
  RobotOutlined, 
  WarningOutlined, 
  ApiOutlined, 
  SafetyCertificateOutlined,
  CompassOutlined,
  ExperimentOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const RiskEnginePage: React.FC = () => {
  // State for Interactive Simulator
  const [simHoneypot, setSimHoneypot] = useState(false);
  const [simWebdriver, setSimWebdriver] = useState(false);
  const [simVirtualGpu, setSimVirtualGpu] = useState(false);
  const [simZeroScreen, setSimZeroScreen] = useState(false);
  const [simTimeOnPage, setSimTimeOnPage] = useState(4500); // ms
  const [simMouseMoves, setSimMouseMoves] = useState(25);
  const [simKeyStrokes, setSimKeyStrokes] = useState(12);
  const [simScrollDepth, setSimScrollDepth] = useState(40); // %
  const [simThreatCategory, setSimThreatCategory] = useState<'none' | 'datacenter' | 'tor' | 'spam'>('none');
  const [simIpFailCount, setSimIpFailCount] = useState(0);
  const [simMultiSiteSeen, setSimMultiSiteSeen] = useState(false);

  // Calculate simulated score
  let clientBehaviorScore = 0;
  if (simHoneypot) clientBehaviorScore += 80;
  if (simWebdriver) clientBehaviorScore += 60;
  if (simVirtualGpu) clientBehaviorScore += 45;
  if (simZeroScreen) clientBehaviorScore += 20;

  if (simTimeOnPage < 600) {
    clientBehaviorScore += 30;
  } else if (simTimeOnPage < 1500) {
    clientBehaviorScore += 15;
  }

  if (simMouseMoves === 0 && simKeyStrokes === 0) {
    clientBehaviorScore += 25;
  }

  const hasRichInteraction = simMouseMoves > 10 && simKeyStrokes > 3 && simTimeOnPage > 2500 && simScrollDepth > 10;
  if (hasRichInteraction && clientBehaviorScore > 0) {
    clientBehaviorScore = Math.max(0, clientBehaviorScore - 10);
  }

  let threatIntelScore = 0;
  if (simThreatCategory === 'spam') threatIntelScore = 80;
  else if (simThreatCategory === 'tor') threatIntelScore = 60;
  else if (simThreatCategory === 'datacenter') threatIntelScore = 35;

  let reputationScore = 0;
  let isBannedIp = false;
  if (simIpFailCount >= 10) {
    reputationScore = 50;
    isBannedIp = true;
  } else if (simIpFailCount >= 5) {
    reputationScore = 35;
  } else if (simIpFailCount >= 2) {
    reputationScore = 15;
  }
  if (simMultiSiteSeen && reputationScore > 0) {
    reputationScore = Math.round(reputationScore * 1.5);
  }

  const totalSimScore = Math.min(100, Math.max(0, clientBehaviorScore + threatIntelScore + reputationScore));

  let simChallengeType: 'Invisible Pass' | 'Slider Puzzle' | 'Proof-of-Work (PoW)' = 'Invisible Pass';
  let simChallengeColor = 'success';
  let simPowDiff = null;

  if (totalSimScore >= 70 || isBannedIp) {
    simChallengeType = 'Proof-of-Work (PoW)';
    simChallengeColor = 'error';
    simPowDiff = totalSimScore >= 90 || isBannedIp ? 18 : totalSimScore >= 80 ? 14 : 12;
  } else if (totalSimScore >= 30) {
    simChallengeType = 'Slider Puzzle';
    simChallengeColor = 'warning';
  }

  return (
    <div style={{ padding: "0 0 24px" }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ControlOutlined style={{ fontSize: 28, color: '#7367f0' }} />
        <div>
          <Title level={3} style={{ margin: 0 }}>Nguyên Tắc Đánh Giá (Risk Engine)</Title>
          <Text type="secondary">Tài liệu chi tiết cơ chế chấm điểm rủi ro đa tầng, telemetry thụ động và mô phỏng đánh giá</Text>
        </div>
      </div>

      <Alert 
        message="Kiến trúc Risk Engine đa tầng" 
        description="Hệ thống kết hợp 4 trụ cột: Hành vi Client thụ động (Zero-friction Telemetry), Nguồn danh sách đen (Threat Intel), Uy tín liên-site (IP Reputation) và Tần suất truy vấn (Rate Limiting). Điểm số tổng hợp quyết định việc cho qua ẩn (Invisible Pass) hoặc leo thang thử thách (Slider / PoW)." 
        type="info" 
        showIcon 
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[24, 24]}>
        {/* 1. Client Behavior & Telemetry */}
        <Col span={24}>
          <Card title={<><RobotOutlined /> 1. Client Behavior & Passive Telemetry (Hành vi & Thiết bị thụ động)</>} variant="borderless">
            <Paragraph>
              Widget nhúng trên trang thu thập hoàn toàn tự động trong nền (không làm ảnh hưởng UI/UX). Mọi dấu hiệu bất thường của bot tự động hoặc môi trường giả lập sẽ bị cộng điểm rủi ro:
            </Paragraph>
            <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }} size="small">
              <Descriptions.Item label="Trường bẫy (Honeypot)">
                Input ẩn đối với mắt người nhưng hiển thị với Bot (DOM scraper). Nếu bị điền dữ liệu ➔ <Tag color="error">+80 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Webdriver Flag">
                Kiểm tra <Text code>navigator.webdriver</Text>. Dấu hiệu điển hình của Puppeteer/Selenium/Headless Chrome ➔ <Tag color="error">+60 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Phát hiện GPU Ảo (Virtual GPU)">
                Quét unmasked WebGL GPU renderer chứa <Text code>SwiftShader</Text>, <Text code>llvmpipe</Text>, <Text code>Mesa</Text>, <Text code>VirtualBox</Text>, <Text code>VMware</Text> ➔ <Tag color="error">+45 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tốc độ Submit (`time_on_page_ms`)">
                Thời gian từ lúc nạp trang tới lúc submit: <br/>
                - Dưới 600ms (tốc độ máy) ➔ <Tag color="error">+30 điểm</Tag> <br/>
                - Dưới 1500ms ➔ <Tag color="warning">+15 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Chỉ số Tương tác Vật lý">
                Nếu không có bất kỳ di chuyển chuột (<Text code>mouse_moves = 0</Text>) VÀ không có phím nào được gõ (<Text code>key_strokes = 0</Text>) ➔ <Tag color="error">+25 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Mâu thuẫn Môi trường Phần cứng">
                Màn hình ảo <Text code>0x0</Text> hoặc cấu hình phần cứng bất thường ➔ <Tag color="error">+20 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Fingerprint lỗi / Thiếu hỗ trợ">
                Canvas fingerprint trả về lỗi hoặc môi trường máy ảo rút gọn ➔ <Tag color="warning">+15 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Điểm thưởng Người thật (Human Bonus)">
                Khách hàng tương tác phong phú (cuộn trang &gt;10%, thời gian điền &gt;2.5s, gõ phím &gt;3) ➔ <Tag color="success">-10 điểm thưởng</Tag> (ưu tiên Invisible Pass).
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 2. Threat Intel & IP Reputation */}
        <Col xs={24} lg={12}>
          <Card title={<><WarningOutlined /> 2. Threat Intelligence (Danh sách đen IP)</>} variant="borderless" style={{ height: '100%' }}>
            <Paragraph>
              Hệ thống đồng bộ dữ liệu IP xấu từ các nguồn mở uy tín định kỳ qua Background Cron Jobs:
            </Paragraph>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Spam / Attacks (Spamhaus, AbuseIPDB)">
                IP bị báo cáo tấn công hoặc phát tán mã độc. ➔ <Tag color="error">+80 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tor / Proxy Ẩn Danh">
                IP là node thoát của mạng Tor (Tor Exit Node). ➔ <Tag color="error">+60 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Datacenter / Cloud Server">
                IP thuộc dải máy chủ AWS, GCP, Azure, DigitalOcean (Người thật hiếm khi dùng). ➔ <Tag color="warning">+35 điểm</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<><SafetyCertificateOutlined /> 3. IP Reputation & Rate Limiting</>} variant="borderless" style={{ height: '100%' }}>
            <Paragraph>
              Học máy liên-site độc quyền của NhanHoaCaptcha kết hợp bảo vệ tần suất Redis O(1):
            </Paragraph>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Lịch sử vi phạm liên-site">
                IP vi phạm ở Site A sẽ bị lưu điểm xấu sang Site B. <br/>
                - Thất bại liên tiếp &ge; 10 lần ➔ <Tag color="error">Banned (+50 điểm)</Tag> <br/>
                - Xuất hiện xấu trên &ge; 2 Site ➔ <Tag color="error">Nhân 1.5x điểm phạt</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Rate Limiting (Tần suất gọi /issue)">
                - Gọi &gt; 25 req/10s (Spam dồn dập) ➔ <Tag color="error">+50 điểm</Tag> <br/>
                - Gọi &gt; 10 req/10s ➔ <Tag color="warning">+25 điểm</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 3. Marketing & UX Intelligence */}
        <Col span={24}>
          <Card title={<><CompassOutlined /> 4. Dữ liệu Marketing & Trải nghiệm CRO (Zero-Friction)</>} variant="borderless">
            <Paragraph>
              Không chỉ phục vụ bảo mật, các thông số thụ động từ Widget còn cung cấp dữ liệu kinh doanh giá trị cao cho Admin:
            </Paragraph>
            <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }} size="small">
              <Descriptions.Item label="Giám sát Click Tặc (UTM Ad Fraud)">
                Tự động bóc tách <Text code>utm_source</Text>, <Text code>utm_campaign</Text>... Đối chiếu với Risk Score để chỉ ra chiến dịch Ads nào đang bị bot click tiêu hao ngân sách.
              </Descriptions.Item>
              <Descriptions.Item label="Độ sâu cuộn trang (Scroll Depth)">
                Đo lường tỉ lệ cuộn trang tối đa (<Text code>scroll_depth_pct</Text>) cho biết khách có đọc hết nội dung/landing page trước khi đăng ký hay không.
              </Descriptions.Item>
              <Descriptions.Item label="Độ trễ bắt đầu điền (Focus Delay)">
                Đo khoảng thời gian từ lúc nạp trang đến lần đầu click vào ô input (<Text code>form_focus_delay_ms</Text>) để phân tích độ do dự của người dùng.
              </Descriptions.Item>
              <Descriptions.Item label="Thao tác Dán & Chuyển Tab">
                Nhận diện thói quen copy/paste (<Text code>paste_detected</Text>) và số lần nhảy tab (<Text code>tab_switch_count</Text>) để so sánh giá/lấy OTP.
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 4. Escalation Tiers */}
        <Col span={24}>
          <Card title={<><ApiOutlined /> 5. Kết Quả & Phân Loại Thử Thách (Escalation Matrix)</>} variant="borderless">
            <Paragraph>
              Tổng điểm từ <b>0 đến 100</b>. Hệ thống tự động phân cấp hành động tương ứng:
            </Paragraph>
            
            <Timeline
              style={{ marginTop: 24 }}
              items={[
                {
                  color: 'green',
                  children: (
                    <>
                      <Text strong style={{ fontSize: 16 }}>Dưới 30 điểm (LOW RISK)</Text>
                      <br/>
                      <Tag color="success">Trạng thái: Vượt qua ẩn (Invisible Pass)</Tag>
                      <br/>
                      <Text type="secondary">Người dùng thật. Cấp Token thành công ngay lập tức mà không hiển thị thử thách, trải nghiệm mượt mà 100%.</Text>
                    </>
                  ),
                },
                {
                  color: 'orange',
                  children: (
                    <>
                      <Text strong style={{ fontSize: 16 }}>Từ 30 đến 69 điểm (MEDIUM RISK)</Text>
                      <br/>
                      <Tag color="warning">Trạng thái: Yêu cầu giải Slider (Kéo mảnh ghép Canvas)</Tag>
                      <br/>
                      <Text type="secondary">Có dấu hiệu đáng ngờ. Widget hiển thị popup kéo mảnh ghép hỗ trợ cả chuột và màn hình cảm ứng để người dùng chứng minh.</Text>
                    </>
                  ),
                },
                {
                  color: 'red',
                  children: (
                    <>
                      <Text strong style={{ fontSize: 16 }}>Từ 70 điểm trở lên (HIGH RISK)</Text>
                      <br/>
                      <Tag color="error">Trạng thái: Ép buộc giải Proof-of-Work (PoW Web Crypto)</Tag>
                      <br/>
                      <Text type="secondary">Xác suất cao là Bot. Trình duyệt bắt buộc phải chạy thuật toán giải mã SHA-256 tìm Nonce ngầm để làm nghẽn CPU của Bot farm. (Score &ge; 90 độ khó PoW lên đến 18).</Text>
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        {/* 5. Interactive Risk Score Simulator */}
        <Col span={24}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ExperimentOutlined style={{ color: '#7367f0' }} />
                <Text style={{ fontWeight: 600 }}>Trình Mô Phỏng Đánh Giá Rủi Ro (Interactive Risk Simulator)</Text>
              </div>
            }
            variant="borderless"
            style={{ backgroundColor: 'rgba(115,103,240,0.02)', border: '1px solid rgba(115,103,240,0.2)' }}
          >
            <Row gutter={[24, 24]}>
              {/* Controls */}
              <Col xs={24} lg={14}>
                <Title level={5}>Điều Chỉnh Tín Hiệu Client & Môi Trường</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>Điền trường bẫy (Honeypot filled)</Text>
                    <Switch checked={simHoneypot} onChange={setSimHoneypot} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>Môi trường tự động (navigator.webdriver)</Text>
                    <Switch checked={simWebdriver} onChange={setSimWebdriver} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>GPU Máy Ảo (SwiftShader / llvmpipe / Mesa)</Text>
                    <Switch checked={simVirtualGpu} onChange={setSimVirtualGpu} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>Màn hình ảo bất thường (0x0)</Text>
                    <Switch checked={simZeroScreen} onChange={setSimZeroScreen} />
                  </div>
                  
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Thời gian trên trang (`time_on_page_ms`):</Text>
                      <Text strong>{(simTimeOnPage / 1000).toFixed(1)}s</Text>
                    </div>
                    <Slider min={100} max={10000} step={100} value={simTimeOnPage} onChange={setSimTimeOnPage} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <Text style={{ fontSize: 12 }}>Di chuột: <b>{simMouseMoves}</b></Text>
                      <Slider min={0} max={100} value={simMouseMoves} onChange={setSimMouseMoves} />
                    </div>
                    <div>
                      <Text style={{ fontSize: 12 }}>Gõ phím: <b>{simKeyStrokes}</b></Text>
                      <Slider min={0} max={50} value={simKeyStrokes} onChange={setSimKeyStrokes} />
                    </div>
                    <div>
                      <Text style={{ fontSize: 12 }}>Cuộn trang: <b>{simScrollDepth}%</b></Text>
                      <Slider min={0} max={100} value={simScrollDepth} onChange={setSimScrollDepth} />
                    </div>
                  </div>

                  <Divider style={{ margin: '8px 0' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>Nguồn Threat Intel IP:</Text>
                    <Select 
                      value={simThreatCategory} 
                      onChange={setSimThreatCategory}
                      style={{ width: 180 }}
                      options={[
                        { label: 'Sạch (Clean IP)', value: 'none' },
                        { label: 'Datacenter / Cloud (+35)', value: 'datacenter' },
                        { label: 'Tor Exit Node (+60)', value: 'tor' },
                        { label: 'Spamhaus Attack (+80)', value: 'spam' },
                      ]}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>Số lần IP đã fail trước đó:</Text>
                    <Select 
                      value={simIpFailCount} 
                      onChange={setSimIpFailCount}
                      style={{ width: 180 }}
                      options={[
                        { label: '0 lần (Chưa vi phạm)', value: 0 },
                        { label: '2-4 lần (+15 điểm)', value: 2 },
                        { label: '5-9 lần (+35 điểm)', value: 5 },
                        { label: '≥ 10 lần (Banned +50)', value: 10 },
                      ]}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>IP đã bị flag trên ≥ 2 site khác nhau (x1.5 penalty):</Text>
                    <Switch checked={simMultiSiteSeen} onChange={setSimMultiSiteSeen} />
                  </div>
                </div>
              </Col>

              {/* Realtime Output Result */}
              <Col xs={24} lg={10}>
                <div style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <Title level={5} style={{ marginTop: 0 }}>Kết Quả Đánh Giá Realtime</Title>
                    
                    <div style={{ textAlign: 'center', margin: '20px 0' }}>
                      <div style={{ fontSize: 44, fontWeight: 800, color: totalSimScore >= 70 ? '#ea5455' : totalSimScore >= 30 ? '#ff9f43' : '#28c76f' }}>
                        {totalSimScore}
                        <span style={{ fontSize: 20, color: '#94a3b8' }}>/100</span>
                      </div>
                      <Tag color={simChallengeColor} style={{ fontSize: 13, padding: '4px 12px', marginTop: 8 }}>
                        {simChallengeType}
                      </Tag>
                      {simPowDiff && <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>Độ khó PoW: {simPowDiff} bits</Text></div>}
                    </div>

                    <Divider style={{ margin: '16px 0' }} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">Client Behavior Score:</Text>
                        <Text strong style={{ color: clientBehaviorScore > 0 ? '#ea5455' : '#28c76f' }}>+{clientBehaviorScore}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">Threat Intel Score:</Text>
                        <Text strong style={{ color: threatIntelScore > 0 ? '#ea5455' : '#28c76f' }}>+{threatIntelScore}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">IP Reputation Score:</Text>
                        <Text strong style={{ color: reputationScore > 0 ? '#ea5455' : '#28c76f' }}>+{reputationScore}</Text>
                      </div>
                      {isBannedIp && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="danger">Trạng thái IP:</Text>
                          <Tag color="error">BANNED</Tag>
                        </div>
                      )}
                    </div>
                  </div>

                  <Alert 
                    message={totalSimScore < 30 ? "✓ Người dùng thật - Trải nghiệm tức thì" : totalSimScore < 70 ? "⚠ Nghi ngờ - Yêu cầu giải kéo hình" : "⛔ Nguy cơ Bot cao - Bắt buộc chạy PoW"}
                    type={totalSimScore < 30 ? "success" : totalSimScore < 70 ? "warning" : "error"}
                    showIcon
                    style={{ marginTop: 16 }}
                  />
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
