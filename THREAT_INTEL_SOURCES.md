# THREAT_INTEL_SOURCES.md — Nguồn dữ liệu IP cộng đồng/uy tín

Chi tiết cho `ThreatIntelModule` (ARCHITECTURE.md mục 3.5.b, SCHEMA.md bảng `threat_intel_ranges`). Ưu tiên nguồn miễn phí, không cần API key, dễ cron sync trước — nguồn cần API key/rate-limit thêm sau nếu cần độ chính xác cao hơn.

## Nhóm 1 — Flat-file blocklist cộng đồng (ưu tiên tích hợp trước)

Không cần đăng ký/API key, tải trực tiếp qua HTTP, format text đơn giản (mỗi dòng 1 IP/CIDR), hợp cron.

| Nguồn | URL dạng | Update | Ghi chú |
|---|---|---|---|
| **FireHOL level1** | `iplists.firehol.org` / GitHub `firehol/blocklist-ipsets` | ~1 phút (nhưng nên cron kéo mỗi giờ là đủ) | Đã gộp sẵn Spamhaus DROP, DShield, Feodo, fullbogons — tích hợp 1 nguồn ăn nhiều nguồn |
| **FireHOL level2/level3** | cùng repo | tương tự | Mở rộng thêm bruteforce, cybercrime, malware C&C — dùng nếu muốn risk score chi tiết hơn |
| **FireHOL `abuseipdb_1d`** | cùng repo, file `abuseipdb_1d.ipset` | 1 ngày | Mirror miễn phí từ AbuseIPDB (aggregate by borestad) — lấy được tín hiệu AbuseIPDB mà KHÔNG cần đăng ký API key riêng |
| **FireHOL `firehol_anonymous`** | cùng repo | 30 ngày | Gộp sẵn Tor exit + proxy công khai — có thể dùng thay cho việc tự tải Tor list riêng |
| **Blocklist.de** | `lists.blocklist.de/lists/*.txt` (ftp, ssh, apache, mail...) | 15–48 giờ tuỳ list | Cộng đồng report theo loại tấn công cụ thể, tách theo dịch vụ |
| **CINS Army List** | `cinsscore.com/list/ci-badguys.txt` | hằng ngày | Collective Intelligence Network Security, tập trung IP tấn công đã xác thực |
| **IPsum** | GitHub `stamparm/ipsum` | hằng ngày | Aggregate nhiều blocklist, có kèm "số lượng blocklist chứa IP này" — dùng làm confidence score luôn |
| **Emerging Threats (ET open)** | `rules.emergingthreats.net/blockrules/compromised-ips.txt` | hằng ngày | Danh sách IP compromised/malicious, miễn phí bản open |
| **DShield (SANS ISC)** | `feeds.dshield.org/block.txt` | hằng ngày | Top attacker theo dữ liệu honeypot cộng đồng SANS |

→ **Khuyến nghị bắt đầu**: FireHOL level1 + `abuseipdb_1d` + `firehol_anonymous` là đủ phủ phần lớn nhu cầu (malicious IP + Tor + proxy) với 1 nguồn duy nhất cần đồng bộ, sau đó bổ sung dần các nguồn còn lại nếu cần độ phủ cao hơn.

## Nhóm 2 — Tor exit node (nếu không dùng `firehol_anonymous` ở trên)

- Tor Project bulk exit list: `check.torproject.org/torbulkexitlist`
- Onionoo API (chi tiết hơn, có thể lọc theo flag `Exit`): `onionoo.torproject.org`
- Update: theo ngày là đủ.

## Nhóm 3 — Cloud/datacenter IP range (published chính thức, không phải "cộng đồng" nhưng miễn phí)

| Nguồn | URL | Update |
|---|---|---|
| AWS | `ip-ranges.amazonaws.com/ip-ranges.json` | vài lần/tuần |
| Google Cloud | `www.gstatic.com/ipranges/cloud.json` | vài lần/tuần |
| Azure | Service Tags JSON, publish weekly trên Microsoft Download Center | hằng tuần |
| DigitalOcean / các cloud nhỏ khác | không có file chính thức — dùng MaxMind GeoLite2 ASN (nhóm 4) để suy ra theo ASN | — |

## Nhóm 4 — Nguồn cần đăng ký/API key (bổ sung sau, không bắt buộc giai đoạn đầu)

| Nguồn | Free tier | Phù hợp cho |
|---|---|---|
| **AbuseIPDB API** | có giới hạn số check/ngày | Tra cứu real-time từng IP với confidence score chi tiết hơn bản mirror ở Nhóm 1 |
| **AlienVault OTX** | miễn phí, cần đăng ký | Threat intel rộng hơn (không chỉ IP), cộng đồng lớn |
| **GreyNoise Community API** | giới hạn số query/ngày khá thấp | Phân biệt "internet scanner/bot" vs traffic thật — rất hợp với mục tiêu captcha, nhưng quota free thấp nên chỉ dùng cho IP đã bị risk engine đánh dấu nghi ngờ, không query hàng loạt |
| **MaxMind GeoLite2 ASN** | miễn phí, cần tài khoản lấy license key | Xác định ASN có phải hosting/datacenter hay không — bổ sung cho Nhóm 3 với các cloud nhỏ không có published range |

## Quy tắc tích hợp vào `threat_intel_ranges`

- Mỗi nguồn map vào `source` (VD `firehol_level1`, `firehol_abuseipdb_1d`, `tor_exit`, `aws`, `gcp`) + `category` (`attacks` | `proxy_anon` | `datacenter`).
- Job sync (cron): tải file → parse CIDR/IP từng dòng → `DELETE WHERE source = ?` rồi insert lại toàn bộ (đã note ở SCHEMA.md mục 8) — không update tại chỗ.
- Log lại `fetched_at` mỗi lần sync để dashboard admin hiển thị "dữ liệu threat-intel cập nhật lúc nào" — tránh trường hợp cron job chết âm thầm mà không ai biết.
- Với các nguồn ở Nhóm 1/2/3 (flat-file, không auth): tần suất cron 1 giờ/lần là hợp lý, không cần nhanh hơn.
- Với Nhóm 4 (có rate-limit): chỉ gọi on-demand khi risk score đã ở mức trung bình trở lên, không đưa vào batch sync định kỳ.

## Trạng thái tài liệu

- [x] AGENTS.md
- [x] ARCHITECTURE.md
- [x] SCHEMA.md
- [x] API_CONTRACT.md
- [x] THREAT_INTEL_SOURCES.md — file này
