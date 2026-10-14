import { Global, Injectable, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';

export const QUEUES = {
  IMPORT_VALIDATE: 'import-validate',
  RUN_COMPUTE: 'run-compute',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

type Handler<T> = (data: T) => Promise<void>;

/** Thin wrapper over pg-boss (same Postgres; no Redis). */
@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(JobsService.name);
  private boss!: PgBoss;
  private ready!: Promise<void>;

  onModuleInit() {
    this.boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: 'pgboss' });
    this.boss.on('error', (e) => this.log.error(e));
    this.ready = (async () => {
      await this.boss.start();
      for (const q of Object.values(QUEUES)) await this.boss.createQueue(q);
      this.log.log('pg-boss started');
    })();
    return this.ready;
  }

  async onApplicationShutdown() {
    await this.boss?.stop({ graceful: true, wait: true }).catch(() => undefined);
  }

  async send<T extends object>(queue: QueueName, data: T): Promise<string | null> {
    await this.ready;
    return this.boss.send(queue, data, { retryLimit: 0, expireInSeconds: 60 * 30 });
  }

  /** Register a worker. Errors are logged; the handler is responsible for marking its entity FAILED. */
  async work<T extends object>(queue: QueueName, handler: Handler<T>) {
    await this.ready;
    await this.boss.work<T>(queue, { pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await handler(job.data);
        } catch (e) {
          this.log.error(`job ${queue} ${job.id} failed: ${e instanceof Error ? e.stack : String(e)}`);
          throw e;
        }
      }
    });
  }
}

@Global()
@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
