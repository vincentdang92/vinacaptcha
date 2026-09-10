import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Site } from './site.entity.js';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  site_id: string;

  @ManyToOne(() => Site, site => site.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'site_id' })
  site: import('typeorm').Relation<Site>;

  @Column({ unique: true })
  key_hash: string;

  @Column()
  key_prefix: string;

  @Column({ nullable: true })
  label: string;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
