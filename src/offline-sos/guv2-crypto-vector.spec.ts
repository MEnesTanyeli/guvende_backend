import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
} from 'node:crypto';

const FAMILY_PRIVATE = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgYnRwUQT8WtbzPHnS8kgy4HPPexTMRD95bbHoxRJO28OhRANCAASYDX_YnFloMQBOedPekgy9I3KlJiiKz4peDPe4okqPH_HmRxhXPJEQB3r9EGIBvvn20Jg43ACA2Cs6t_HhRHT0';
const FAMILY_PUBLIC = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmA1_2JxZaDEATnnT3pIMvSNypSYois-KXgz3uKJKjx_x5kcYVzyREAd6_RBiAb759tCYONwAgNgrOrfx4UR09A';
const EPHEMERAL_PRIVATE = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg8MVV0VpOSSBZrgbzAdeHxinxjRm-sDT3fQBXhuQv0JuhRANCAARTvggOOSizt3zBF2FZRW8lBE84dOlmCJ7K7i2jWTf_lK2pH5AUTRlQL-uHvuOrSDZufXkzVKLa8J6PHy7nscY6';
const EPHEMERAL_PUBLIC = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEU74IDjkos7d8wRdhWUVvJQRPOHTpZgieyu4to1k3_5StqR-QFE0ZUC_rh77jq0g2bn15M1Si2vCejx8u57HGOg';
const FAMILY = 'AQIDBAUGBwgJCgsMDQ4PEA';
const EVENT = 'ERITFBUWFxgZGhscHR4fIA';
const SENDER = 'ISIjJCUmJygpKissLS4vMA';
const FORMAT_VERSION = 1;
const HEADER_BYTES = 39;
const ENVELOPE_BYTES = 191;
const AAD = Buffer.alloc(HEADER_BYTES);
AAD[0] = FORMAT_VERSION; AAD[1] = 0; AAD[2] = 2;
AAD.writeUInt32BE(7, 3);
Buffer.from(FAMILY, 'base64url').copy(AAD, 7);
Buffer.from(EVENT, 'base64url').copy(AAD, 23);
const WRAP_IV = Buffer.alloc(12, 3);
const PAYLOAD_IV = Buffer.alloc(12, 4);
const SOS_KEY = Buffer.alloc(32, 5);
const PAYLOAD = Buffer.alloc(31);
Buffer.from(SENDER, 'base64url').copy(PAYLOAD, 0);
PAYLOAD.writeUInt32BE(1_790_000_000, 16);
PAYLOAD.writeInt32BE(39_925_000, 20);
PAYLOAD.writeInt32BE(32_836_900, 24);
PAYLOAD.writeUInt16BE(125, 28);
PAYLOAD[30] = 73;

function derive(privateKey: string, publicKey: string) {
  const shared = diffieHellman({
    privateKey: createPrivateKey({ key: Buffer.from(privateKey, 'base64url'), format: 'der', type: 'pkcs8' }),
    publicKey: createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' }),
  });
  return Buffer.from(hkdfSync('sha256', shared, Buffer.from(FAMILY, 'base64url'), Buffer.from('GUV2-WRAP|7'), 32));
}
function seal(plain: Buffer, aesKey: Buffer, iv: Buffer, aad: Buffer) {
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv); cipher.setAAD(aad);
  return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}
function open(ciphertext: Buffer, aesKey: Buffer, iv: Buffer, aad: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv); decipher.setAAD(aad);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  return Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
}

describe('GUV2 deterministic crypto vector', () => {
  const wrapKey = derive(EPHEMERAL_PRIVATE, FAMILY_PUBLIC);
  const wrapped = seal(SOS_KEY, wrapKey, WRAP_IV, AAD);
  const ciphertext = seal(PAYLOAD, SOS_KEY, PAYLOAD_IV, AAD);
  const rawEphemeral = Buffer.from(createPublicKey({ key: Buffer.from(EPHEMERAL_PUBLIC, 'base64url'), format: 'der', type: 'spki' }).export({ format: 'der', type: 'spki' })).subarray(-65);
  const compressed = Buffer.concat([Buffer.from([(rawEphemeral[64] & 1) ? 3 : 2]), rawEphemeral.subarray(1, 33)]);
  const envelope = Buffer.concat([AAD, compressed, WRAP_IV, wrapped, PAYLOAD_IV, ciphertext]);

  it('matches P-256 ECDH on sender and guardian and decrypts the payload', () => {
    const guardianWrapKey = derive(FAMILY_PRIVATE, EPHEMERAL_PUBLIC);
    expect(guardianWrapKey).toEqual(wrapKey);
    const unwrapped = open(wrapped, guardianWrapKey, WRAP_IV, AAD);
    expect(open(ciphertext, unwrapped, PAYLOAD_IV, AAD)).toEqual(PAYLOAD);
    expect(envelope).toHaveLength(ENVELOPE_BYTES);
  });

  it('produces a two-segment canonical GSM-7 message', () => {
    const message = `GUVENDE-SOS\nGUV2.${envelope.toString('base64url')}`;
    expect(message).toHaveLength(272);
    expect(message).toMatch(/^[A-Za-z0-9_.\n-]+$/);
    expect(Math.ceil(message.length / 153)).toBe(2);
  });

  it('has strict fixed offsets and no trailing-data allowance', () => {
    expect(AAD).toHaveLength(39); expect(compressed).toHaveLength(33);
    expect(WRAP_IV).toHaveLength(12); expect(wrapped).toHaveLength(48);
    expect(PAYLOAD_IV).toHaveLength(12); expect(ciphertext).toHaveLength(47);
    expect(Buffer.concat([envelope, Buffer.from([0])])).toHaveLength(ENVELOPE_BYTES + 1);
  });

  it.each(['ciphertext', 'AAD', 'wrapped key'])('rejects modified %s', (part) => {
    const changedAad = Buffer.from(AAD); const changedWrapped = Buffer.from(wrapped); const changedCipher = Buffer.from(ciphertext);
    if (part === 'AAD') changedAad[0] ^= 1;
    if (part === 'wrapped key') changedWrapped[0] ^= 1;
    if (part === 'ciphertext') changedCipher[0] ^= 1;
    expect(() => {
      const unwrapped = open(changedWrapped, wrapKey, WRAP_IV, changedAad);
      open(changedCipher, unwrapped, PAYLOAD_IV, changedAad);
    }).toThrow();
  });
});
