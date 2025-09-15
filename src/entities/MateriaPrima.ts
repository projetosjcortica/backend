import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Entidade simples que mapeia a "máscara" das colunas de valores (Prod_1..Prod_40)
 * para um nome amigável (matéria-prima).
 */
@Entity({ name: 'materia_prima' })
export class MateriaPrima {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Nome da coluna no repositório (ex: Prod_1, Prod_2, ... ) */
  @Column({ type: 'varchar', length: 50 })
  coluna!: string;

  /** Nome amigável/descritivo da matéria-prima */
  @Column({ type: 'varchar', length: 100 })
  nome!: string;
}
