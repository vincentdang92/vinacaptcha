import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ThreatIntelService } from './threat-intel.service.js';
import { AwsIpProvider } from './providers/aws-ip.provider.js';
import { GoogleCloudProvider } from './providers/google-cloud.provider.js';
import { DigitalOceanProvider } from './providers/digitalocean.provider.js';
import { TorExitProvider } from './providers/tor-exit.provider.js';
import { SpamhausProvider } from './providers/spamhaus.provider.js';
import { MockThreatProvider } from './providers/mock-threat.provider.js';
import { AbusechProvider } from './providers/abusech.provider.js';
import { EmergingThreatsProvider } from './providers/emerging-threats.provider.js';
import { BlocklistDeProvider } from './providers/blocklist-de.provider.js';
import { CinsArmyProvider } from './providers/cins-army.provider.js';
import { GreenSnowProvider } from './providers/greensnow.provider.js';
import { AbuseIpDbProvider } from './providers/abuseipdb.provider.js';

describe('ThreatIntelService & Providers', () => {
  let service: ThreatIntelService;
  const mockDataSource = {
    query: vi.fn(),
    transaction: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreatIntelService,
        AwsIpProvider,
        GoogleCloudProvider,
        DigitalOceanProvider,
        TorExitProvider,
        SpamhausProvider,
        MockThreatProvider,
        AbusechProvider,
        EmergingThreatsProvider,
        BlocklistDeProvider,
        CinsArmyProvider,
        GreenSnowProvider,
        AbuseIpDbProvider,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ThreatIntelService>(ThreatIntelService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined with all 12 providers registered', () => {
    expect(service).toBeDefined();
    // @ts-expect-error accessing private providers map
    expect(service.providers.size).toBe(12);
    // @ts-expect-error accessing private providers map
    expect(service.providers.has('emerging_threats')).toBe(true);
    // @ts-expect-error accessing private providers map
    expect(service.providers.has('blocklist_de')).toBe(true);
    // @ts-expect-error accessing private providers map
    expect(service.providers.has('cins_army')).toBe(true);
    // @ts-expect-error accessing private providers map
    expect(service.providers.has('greensnow')).toBe(true);
    // @ts-expect-error accessing private providers map
    expect(service.providers.has('digitalocean')).toBe(true);
  });

  describe('checkIp', () => {
    it('should return matched: false for localhost', async () => {
      const result = await service.checkIp('127.0.0.1');
      expect(result.matched).toBe(false);
    });

    it('should return matched: true with category and source when DB has match', async () => {
      mockDataSource.query.mockResolvedValue([
        { source: 'emerging_threats', category: 'botnet_c2', cidr: '185.156.73.0/24' },
      ]);

      const result = await service.checkIp('185.156.73.15');
      expect(result.matched).toBe(true);
      expect(result.category).toBe('botnet_c2');
      expect(result.source).toBe('emerging_threats');
    });
  });

  describe('New Providers Fallback & Execution', () => {
    it('EmergingThreatsProvider should parse plain text IPs correctly', async () => {
      const mockText = '# Comment\n1.2.3.4\n5.6.7.8/24\n\n';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(mockText),
      } as any);

      const provider = new EmergingThreatsProvider();
      const results = await provider.fetch();
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ cidr: '1.2.3.4/32', category: 'botnet_c2' });
      expect(results[1]).toEqual({ cidr: '5.6.7.8/24', category: 'botnet_c2' });
    });

    it('BlocklistDeProvider should parse IP list correctly', async () => {
      const mockText = '10.0.0.1\n10.0.0.2\n';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(mockText),
      } as any);

      const provider = new BlocklistDeProvider();
      const results = await provider.fetch();
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ cidr: '10.0.0.1/32', category: 'attacks' });
    });

    it('CinsArmyProvider should parse IP list correctly', async () => {
      const mockText = '192.0.2.1\n198.51.100.1\n';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(mockText),
      } as any);

      const provider = new CinsArmyProvider();
      const results = await provider.fetch();
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ cidr: '192.0.2.1/32', category: 'attacks' });
    });

    it('GreenSnowProvider should parse IP list correctly', async () => {
      const mockText = '203.0.113.1\n203.0.113.2\n';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(mockText),
      } as any);

      const provider = new GreenSnowProvider();
      const results = await provider.fetch();
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ cidr: '203.0.113.1/32', category: 'scanners' });
    });

    it('DigitalOceanProvider should parse CSV CIDRs correctly', async () => {
      const mockCsv = '# Header\n104.131.0.0/16,US,US-NY,New York,10001\n104.248.0.0/16,US,US-CA,San Francisco,94107\n';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValueOnce(mockCsv),
      } as any);

      const provider = new DigitalOceanProvider();
      const results = await provider.fetch();
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ cidr: '104.131.0.0/16', category: 'datacenter' });
      expect(results[1]).toEqual({ cidr: '104.248.0.0/16', category: 'datacenter' });
    });
  });
});
