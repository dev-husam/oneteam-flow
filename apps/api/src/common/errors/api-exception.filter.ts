import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_MESSAGES_EN, type ApiErrorBody, type ErrorCode } from '@pt/domain';
import type { Response } from 'express';
import { requestContext } from '../context/request-context.js';
import { AppError } from './app-error.js';

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

/** One error path: everything becomes `{ error: { code, message, details?, requestId } }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = requestContext.requestId();

    let status = 500;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      details = exception.details;
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      code = 'RATE_LIMITED';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = statusToCode(status);
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }

    const body: ApiErrorBody = {
      error: {
        code,
        message: ERROR_MESSAGES_EN[code],
        ...(details === undefined ? {} : { details }),
        requestId,
      },
    };
    if (!res.headersSent) res.status(status).json(body);
  }
}
