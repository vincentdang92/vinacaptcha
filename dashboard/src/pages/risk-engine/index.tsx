import React from 'react';
import { Card, Typography, Row, Col, Alert, Timeline, Tag, Descriptions } from 'antd';
import { ControlOutlined, RobotOutlined, WarningOutlined, ApiOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const RiskEnginePage: React.FC = () => {
  return (
    <div style={{ padding: "0 0 24px" }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ControlOutlined style={{ fontSize: 28, color: '#7367f0' }} />
        <div>
          <Title level={3} style={{ margin: 0 }}>Nguyên Tắc Đánh Giá (Risk Engine)</Title>
          <Text type="secondary">Tài liệu nội bộ về cách hệ thống chấm điểm và phân loại traffic</Text>
        </div>
      </div>

      <Alert 
        message="Thông báo nội bộ" 
        description="Các thông số dưới đây được hardcode trong engine hiện tại nhằm đối phó với các kịch bản tấn công cơ bản. Ở các phiên bản sau, admin sẽ có thể điều chỉnh trọng số trực tiếp trên giao diện này mà không cần khởi động lại Backend." 
        type="info" 
        showIcon 
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card title={<><RobotOutlined /> 1. Client Behavior (Hành vi trên trình duyệt)</>} variant="borderless">
            <Paragraph>
              Widget nhúng trên trình duyệt sẽ âm thầm thu thập thông tin tương tác của người dùng. Mọi hành vi bất thường sẽ bị cộng điểm rủi ro. <b>Điểm rủi ro (Risk Score) càng cao, nguy cơ là Bot càng lớn.</b>
            </Paragraph>
            <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }} size="small">
              <Descriptions.Item label="Trường bẫy (Honeypot)">
                Widget tạo ra một trường input ẩn đối với người thật nhưng hiển thị với Bot (DOM scraper). Nếu trường này bị điền dữ liệu ➔ <Tag color="error">+80 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Webdriver Flag">
                Kiểm tra thuộc tính <Text code>navigator.webdriver</Text>. Dấu hiệu điển hình của Puppeteer/Selenium. ➔ <Tag color="error">+60 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tốc độ Submit">
                Thời gian từ khi tải form đến lúc gửi đi quá nhanh: <br/>
                - Dưới 600ms ➔ <Tag color="error">+30 điểm</Tag> <br/>
                - Dưới 1500ms ➔ <Tag color="warning">+15 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Chỉ số tương tác (Human-like)">
                Nếu không có bất kỳ di chuyển chuột nào (<Text code>mouse_moves = 0</Text>) VÀ không có phím nào được gõ (<Text code>key_strokes = 0</Text>) ➔ <Tag color="error">+25 điểm</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<><WarningOutlined /> 2. Threat Intelligence (Danh sách đen IP)</>} variant="borderless">
            <Paragraph>
              Hệ thống đồng bộ dữ liệu IP xấu từ nhiều nguồn mở và cập nhật liên tục qua Background Cron Jobs.
            </Paragraph>
            <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }} size="small">
              <Descriptions.Item label="Spam / Attacks">
                IP nằm trong danh sách Spamhaus DROP hoặc AbuseIPDB (Bị báo cáo tấn công). ➔ <Tag color="error">+80 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tor / Proxy Ẩn Danh">
                IP là node thoát của mạng Tor (Tor Exit Node). ➔ <Tag color="error">+60 điểm</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Datacenter / Cloud">
                IP thuộc về dải mạng máy chủ của AWS, GCP, Azure, DigitalOcean. Người dùng thật hiếm khi lướt web bằng IP máy chủ. ➔ <Tag color="warning">+35 điểm</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<><SafetyCertificateOutlined /> 3. IP Reputation (Uy tín liên-site)</>} variant="borderless">
            <Paragraph>
              Đây là hệ thống <b>chia sẻ dữ liệu</b> độc quyền của NhanHoaCaptcha. Thay vì chỉ học trên 1 site, hệ thống học từ mọi site đang tích hợp captcha.
            </Paragraph>
            <ul style={{ paddingLeft: 20 }}>
              <li>Nếu 1 IP giải captcha thất bại (hoặc bị phát hiện là Bot) ở Site A, nó sẽ bị ghi nhận điểm xấu. Khi IP đó sang Site B, điểm xấu này vẫn đi theo.</li>
              <li>Nếu IP giải thất bại liên tiếp <b>&ge; 10 lần</b> ➔ <Tag color="error">Banned (+50 điểm)</Tag> ➔ Ép buộc luôn luôn phải vượt PoW cực khó.</li>
              <li>Nếu IP bị phát hiện có hành vi xấu trên <b>từ 2 Site trở lên</b>, điểm hình phạt sẽ bị <b>nhân 1.5 lần</b> (phát hiện mẻ lưới diện rộng).</li>
            </ul>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<><ApiOutlined /> Kết Quả (Phân Loại Challenge)</>} variant="borderless">
            <Paragraph>
              Tổng điểm của 3 bước trên sẽ dao động từ <b>0 đến 100</b>. Dựa vào điểm số này, hệ thống sẽ quyết định hành động:
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
                      <Text type="secondary">Được tin tưởng là người dùng thật. Trả về token thành công ngay lập tức mà không hiển thị bất kỳ Challenge nào.</Text>
                    </>
                  ),
                },
                {
                  color: 'orange',
                  children: (
                    <>
                      <Text strong style={{ fontSize: 16 }}>Từ 30 đến 69 điểm (MEDIUM RISK)</Text>
                      <br/>
                      <Tag color="warning">Trạng thái: Yêu cầu giải Slider (Kéo mảnh ghép)</Tag>
                      <br/>
                      <Text type="secondary">Có dấu hiệu đáng ngờ nhưng chưa đủ chắc chắn. Widget sẽ hiện lên yêu cầu người dùng kéo thanh trượt để chứng minh.</Text>
                    </>
                  ),
                },
                {
                  color: 'red',
                  children: (
                    <>
                      <Text strong style={{ fontSize: 16 }}>Từ 70 điểm trở lên (HIGH RISK)</Text>
                      <br/>
                      <Tag color="error">Trạng thái: Ép buộc giải PoW (Proof of Work)</Tag>
                      <br/>
                      <Text type="secondary">Gần như chắc chắn là Bot. Trình duyệt sẽ phải giải thuật toán đào coin (hash) làm treo CPU của Bot nhằm tăng chi phí vận hành tấn công. (Score &ge; 90 sẽ chịu độ khó PoW cực cao).</Text>
                    </>
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
