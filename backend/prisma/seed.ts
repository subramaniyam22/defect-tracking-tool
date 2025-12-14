import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await argon2.hash('password123');

  // Create Admin user
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { role: 'ADMIN' },
    create: {
      username: 'admin',
      password: hashedPassword,
      role: 'ADMIN',
      fullName: 'System Administrator',
      email: 'admin@example.com',
      isActive: true,
    },
  });

  // Create Project Manager user
  const pmUser = await prisma.user.upsert({
    where: { username: 'pm' },
    update: { role: 'PROJECT_MANAGER' },
    create: {
      username: 'pm',
      password: hashedPassword,
      role: 'PROJECT_MANAGER',
      fullName: 'Project Manager',
      email: 'pm@example.com',
      isActive: true,
    },
  });

  // Create QC user
  const qcUser = await prisma.user.upsert({
    where: { username: 'qc' },
    update: { role: 'QC' },
    create: {
      username: 'qc',
      password: hashedPassword,
      role: 'QC',
      fullName: 'QC Analyst',
      email: 'qc@example.com',
      isActive: true,
    },
  });

  // Create WIS user
  const wisUser = await prisma.user.upsert({
    where: { username: 'wis' },
    update: { role: 'WIS' },
    create: {
      username: 'wis',
      password: hashedPassword,
      role: 'WIS',
      fullName: 'WIS Developer',
      email: 'wis@example.com',
      isActive: true,
    },
  });

  console.log('Seeded users:', { adminUser, pmUser, qcUser, wisUser });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

