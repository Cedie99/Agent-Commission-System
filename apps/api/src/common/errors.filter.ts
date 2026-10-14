import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Maps Prisma / Postgres errors to sensible HTTP codes. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      res.status(err.getStatus()).json(typeof body === 'string' ? { statusCode: err.getStatus(), message: body } : body);
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return void res.status(409).json({ statusCode: 409, message: `Duplicate: ${String(err.meta?.target ?? '')}` });
      if (err.code === 'P2025') return void res.status(404).json({ statusCode: 404, message: 'Not found' });
      if (err.code === 'P2003') return void res.status(409).json({ statusCode: 409, message: 'Referenced by other records' });
    }
    const msg = err instanceof Error ? err.message : String(err);
    // DB trigger (locked run / append-only audit) → 409
    if (/is LOCKED|immutable|append-only/.test(msg)) {
      return void res.status(409).json({ statusCode: 409, message: msg.split('\n').find((l) => /LOCKED|immutable|append-only/.test(l))?.trim() ?? msg });
    }
    console.error(err);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Internal server error' });
  }
}
