import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Site } from './site.entity.js';
import { Plan } from './plan.entity.js';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['active', 'suspended'], default: 'active' })
  status: 'active' | 'suspended';

  @Column({ type: 'varchar', length: 20, default: 'user' })
  role: 'admin' | 'user';

  @Column({ default: false })
  is_verified: boolean;

  @Column({ nullable: true })
  activation_token: string;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan: import('typeorm').Relation<Plan>;

  @Column({ nullable: true })
  plan_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Site, site => site.account)
  sites: import('typeorm').Relation<Site>[];
}
