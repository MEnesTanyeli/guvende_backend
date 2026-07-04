import { Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private prisma;
    private configService;
    constructor(prisma: PrismaService, configService: ConfigService);
    validate(payload: {
        sub: string;
        email: string;
        sid?: string;
        typ?: string;
    }): Promise<{
        sessionId: string;
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        createdAt: Date;
    }>;
}
export {};
