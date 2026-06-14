import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Güvende Yöneticisi';

  if (!email || !password || password.length < 8) {
    throw new Error('ADMIN_EMAIL ve en az 8 karakterli ADMIN_PASSWORD tanımlanmalıdır.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: 'admin' },
    create: { name, email, passwordHash, role: 'admin' },
    select: { email: true },
  });
  console.log(`Admin hazır: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
