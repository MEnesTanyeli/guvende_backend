import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { LocationRateLimitException } from './location-rate-limit.service';

@Catch(LocationRateLimitException)
export class LocationRateLimitFilter implements ExceptionFilter {
  catch(exception: LocationRateLimitException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response
      .setHeader('Retry-After', String(exception.retryAfterSeconds))
      .status(exception.getStatus())
      .json(exception.getResponse());
  }
}
