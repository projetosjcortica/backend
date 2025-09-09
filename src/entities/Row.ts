import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Batch } from './Batch';

@Entity()
export class Row {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Batch as any, (b: any) => b.rows)
  batch!: Batch;

  @Column({ type: 'timestamptz', nullable: true })
  datetime!: Date | null;

  @Column({ nullable: true })
  label!: string | null;

  @Column({ type: 'int', nullable: true })
  group!: number | null;

  @Column({ type: 'int', nullable: true })
  flag!: number | null;

  @Column({ type: 'simple-json', nullable: true })
  values!: number[] | null;
}
