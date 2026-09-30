import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MemberType, Prisma } from '@prisma/client';
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class OfflineSosService {
  static readonly protocolVersion = 2;
  static readonly previousKeyLimit = 2;
  static readonly previousKeyGraceMs = 7 * 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private masterKey(): Buffer {
    const encoded = process.env.OFFLINE_SOS_MASTER_KEY || '';
    let key: Buffer;
    try {
      key = Buffer.from(encoded, 'base64url');
    } catch {
      key = Buffer.alloc(0);
    }
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'Offline SOS anahtar servisi yapilandirilmamis.',
      );
    }
    return key;
  }

  familyBinding(familyId: string): string {
    return createHmac('sha256', this.masterKey())
      .update(`family:${familyId}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }

  senderBinding(familyId: string, membershipId: string): string {
    return createHmac('sha256', this.masterKey())
      .update(`sender:${familyId}:${membershipId}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }

  private sealPrivateKey(privateKey: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(privateKey), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private openPrivateKey(envelope: string): Buffer {
    const [version, iv, tag, ciphertext] = envelope.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new ServiceUnavailableException('Offline SOS private key kaydi gecersiz.');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.masterKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]);
    } catch {
      throw new ServiceUnavailableException('Offline SOS private key acilamadi.');
    }
  }

  private generateFamilyKey() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' });
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'der' });
    return {
      publicKey: Buffer.from(publicKey).toString('base64url'),
      encryptedPrivateKey: this.sealPrivateKey(Buffer.from(privateKey)),
    };
  }

  async createInitialKey(tx: DbClient, familyId: string): Promise<void> {
    const key = this.generateFamilyKey();
    await tx.familyOfflineSosKey.create({
      data: { familyId, version: 1, ...key },
    });
  }

  async rotateKey(tx: DbClient, familyId: string): Promise<number> {
    const active = await tx.familyOfflineSosKey.findFirst({
      where: { familyId, status: 'active' },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (active?.version || 0) + 1;
    await tx.familyOfflineSosKey.updateMany({
      where: { familyId, status: 'active' },
      data: { status: 'retired', retiredAt: new Date() },
    });
    await tx.familyOfflineSosKey.create({
      data: { familyId, version: nextVersion, ...this.generateFamilyKey() },
    });
    return nextVersion;
  }

  private wrapForDevice(privateKey: Buffer, wrappingPublicKey: string): string {
    try {
      return publicEncrypt(
        {
          key: createPublicKey({
            key: Buffer.from(wrappingPublicKey, 'base64url'),
            format: 'der',
            type: 'spki',
          }),
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        privateKey,
      ).toString('base64url');
    } catch {
      throw new ForbiddenException('Cihaz wrapping public key gecersiz.');
    }
  }

  async provision(
    userId: string,
    sessionId: string,
    familyId: string,
    deviceWrappingPublicKey?: string,
  ) {
    const membership = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
      select: {
        id: true,
        memberType: true,
        family: {
          select: {
            members: {
              where: { memberType: MemberType.guardian },
              select: { user: { select: { name: true, phone: true } } },
            },
            offlineSosKeys: {
              where: {
                OR: [
                  { status: 'active' },
                  {
                    status: 'retired',
                    retiredAt: {
                      gte: new Date(Date.now() - OfflineSosService.previousKeyGraceMs),
                    },
                  },
                ],
              },
              orderBy: { version: 'desc' },
              take: OfflineSosService.previousKeyLimit + 1,
            },
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Offline SOS provisioning yetkiniz yok.');
    }
    const active = membership.family.offlineSosKeys.find(
      (key) => key.status === 'active',
    );
    if (!active) {
      throw new ServiceUnavailableException('Offline SOS active key bulunamadi.');
    }
    const base = {
      protocolVersion: OfflineSosService.protocolVersion,
      familyBinding: this.familyBinding(familyId),
      senderBinding: this.senderBinding(familyId, membership.id),
      keyVersion: active.version,
      familyPublicEncryptionKey: active.publicKey,
      emergencyContacts: membership.family.members
        .filter((member) => !!member.user.phone)
        .map((member) => ({
          displayName: member.user.name,
          phone: String(member.user.phone).replace(/[^+\d]/g, ''),
        })),
      issuedAt: new Date().toISOString(),
      refreshAfter: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    if (membership.memberType !== MemberType.guardian) return base;
    if (!deviceWrappingPublicKey) {
      throw new ForbiddenException('Guardian cihaz wrapping key zorunludur.');
    }
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { deviceId: true },
    });
    const deviceId = session?.deviceId || sessionId;
    await this.prisma.offlineSosDeviceKey.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, wrappingPublicKey: deviceWrappingPublicKey },
      update: { wrappingPublicKey: deviceWrappingPublicKey, revokedAt: null },
    });
    return {
      ...base,
      decryptionKeys: membership.family.offlineSosKeys.map((key) => ({
        keyVersion: key.version,
        status: key.status,
        retiredAt: key.retiredAt?.toISOString() || null,
        wrappedPrivateKey: this.wrapForDevice(
          this.openPrivateKey(key.encryptedPrivateKey),
          deviceWrappingPublicKey,
        ),
      })),
    };
  }
}
