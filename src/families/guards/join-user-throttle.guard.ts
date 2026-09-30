import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user';

const JOIN_USER_THROTTLE_LIMIT = 5;
const JOIN_USER_THROTTLE_TTL_MS = 60_000;
const JOIN_USER_THROTTLE_NAME = 'families-join-user';

type AuthenticatedRequest = Request & {
  user?: Pick<AuthenticatedUser, 'id'>;
};

@Injectable()
export class JoinUserThrottleGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage()
    private readonly throttlerStorage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Kimlik dogrulama gerekli.');
    }

    const key = `families.join.user:${userId}`;
    const result = await this.throttlerStorage.increment(
      key,
      JOIN_USER_THROTTLE_TTL_MS,
      JOIN_USER_THROTTLE_LIMIT,
      JOIN_USER_THROTTLE_TTL_MS,
      JOIN_USER_THROTTLE_NAME,
    );

    if (result.isBlocked) {
      throw new ThrottlerException();
    }

    return true;
  }
}
