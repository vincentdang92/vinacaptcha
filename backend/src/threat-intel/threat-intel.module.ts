import { Module } from '@nestjs/common';
import { ThreatIntelService } from './threat-intel.service.js';
import { AwsIpProvider } from './providers/aws-ip.provider.js';
import { TorExitProvider } from './providers/tor-exit.provider.js';
import { MockThreatProvider } from './providers/mock-threat.provider.js';
import { SpamhausProvider } from './providers/spamhaus.provider.js';
import { GoogleCloudProvider } from './providers/google-cloud.provider.js';
import { AbusechProvider } from './providers/abusech.provider.js';
import { AbuseIpDbProvider } from './providers/abuseipdb.provider.js';
import { EmergingThreatsProvider } from './providers/emerging-threats.provider.js';
import { BlocklistDeProvider } from './providers/blocklist-de.provider.js';
import { CinsArmyProvider } from './providers/cins-army.provider.js';
import { GreenSnowProvider } from './providers/greensnow.provider.js';
import { DigitalOceanProvider } from './providers/digitalocean.provider.js';

@Module({
  providers: [
    ThreatIntelService,
    // Tầng CỨNG — sync 1 lần/ngày
    AwsIpProvider,
    GoogleCloudProvider,
    DigitalOceanProvider,
    TorExitProvider,
    SpamhausProvider,
    MockThreatProvider,      // FireHOL Level 1
    AbusechProvider,         // Feodo Tracker + URLhaus (botnet C2)
    EmergingThreatsProvider, // Proofpoint ET Open (Compromised IPs)
    BlocklistDeProvider,     // Blocklist.de Fail2ban attackers
    CinsArmyProvider,        // CINS Army CI Bad Guys
    GreenSnowProvider,       // GreenSnow web scanners
    // Tầng VỪA — batch cron 6-12h, cần API key
    AbuseIpDbProvider,
  ],
  exports: [ThreatIntelService],
})
export class ThreatIntelModule {}
