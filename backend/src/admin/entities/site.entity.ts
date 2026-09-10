import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Account } from './account.entity.js';
import { ApiKey } from './api-key.entity.js';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  account_id: string;

  @ManyToOne(() => Account, account => account.sites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: import('typeorm').Relation<Account>;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'web' })
  platform: 'web' | 'ios' | 'android';

  @Column({ type: 'text' })
  primary_domain: string;

  @Column('text', { array: true, default: '{}' })
  allowed_domains: string[];

  @Column({ type: 'varchar', length: 20, default: 'auto' })
  challenge_mode: 'auto' | 'none' | 'slider' | 'pow';

  @Column({ type: 'enum', enum: ['active', 'suspended'], default: 'active' })
  status: 'active' | 'suspended';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ApiKey, apiKey => apiKey.site)
  apiKeys: import('typeorm').Relation<ApiKey>[];
}
