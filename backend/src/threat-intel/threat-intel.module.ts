import { Module } from '@nestjs/common';
import { ThreatIntelService } from './threat-intel.service.js';
import { AwsIpProvider } from './providers/aws-ip.provider.js';
import { TorExitProvider } from './providers/tor-exit.provider.js';
import { MockThreatProvider } from './providers/mock-threat.provider.js';
import { SpamhausProvider } from './providers/spamhaus.provider.js';
import { GoogleCloudProvider } from './providers/google-cloud.provider.js';
import { AbusechProvider } from './providers/abusech.provider.js';
import { AbuseIpDbProvider } from './providers/abuseipdb.provider.js';

@Module({
  providers: [
    ThreatIntelService,
    // Tầng CỨNG — cache 1 lần/ngày, block ngay
    AwsIpProvider,
    GoogleCloudProvider,
    TorExitProvider,
    SpamhausProvider,
    MockThreatProvider,      // FireHOL Level 1
    AbusechProvider,         // Feodo Tracker + URLhaus (botnet C2, malware host)
    // Tầng VỪA — batch cron 6-12h, cần API key
    AbuseIpDbProvider,
  ],
  exports: [ThreatIntelService],
})
export class ThreatIntelModule {}
