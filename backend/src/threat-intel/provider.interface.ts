/**
 * Interface chuẩn cho mọi nguồn Threat Intel (Connector Pattern theo ARCHITECTURE.md mục 3.6)
 * Mỗi provider độc lập, thêm nguồn mới chỉ cần tạo 1 file implement interface này.
 */
export interface ThreatIntelSourceProvider {
  sourceKey: string; // VD: 'aws', 'tor_exit', 'firehol_level1', 'test_bad_ips'
  fetch(): Promise<{ cidr: string; category: string }[]>;
}
