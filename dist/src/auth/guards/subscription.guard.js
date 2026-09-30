"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionGuard = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let SubscriptionGuard = class SubscriptionGuard {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user || !user.id) {
            return false;
        }
        const dbUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            include: {
                memberships: {
                    include: {
                        family: {
                            include: {
                                owner: true,
                            },
                        },
                    },
                },
            },
        });
        if (!dbUser) {
            return false;
        }
        if (process.env.EARLY_ACCESS_ENABLED === 'true') {
            return true;
        }
        const now = new Date();
        const userTrialActive = dbUser.trialEndsAt > now;
        const userPremiumActive = dbUser.isPremium &&
            dbUser.premiumExpiresAt &&
            dbUser.premiumExpiresAt > now;
        if (userTrialActive || userPremiumActive) {
            return true;
        }
        for (const membership of dbUser.memberships) {
            const owner = membership.family.owner;
            const ownerTrialActive = owner.trialEndsAt > now;
            const ownerPremiumActive = owner.isPremium &&
                owner.premiumExpiresAt &&
                owner.premiumExpiresAt > now;
            if (ownerTrialActive || ownerPremiumActive) {
                return true;
            }
        }
        throw new common_1.ForbiddenException({
            statusCode: 403,
            message: 'Uygulama kullanım süreniz dolmuştur. Devam etmek için lütfen premium üyelik alınız.',
            error: 'TRIAL_EXPIRED',
        });
    }
};
exports.SubscriptionGuard = SubscriptionGuard;
exports.SubscriptionGuard = SubscriptionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SubscriptionGuard);
//# sourceMappingURL=subscription.guard.js.map