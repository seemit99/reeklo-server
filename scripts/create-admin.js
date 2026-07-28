const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin0429'
  const email = process.env.ADMIN_EMAIL || 'admin0429@reeklo.com'
  const nickname = process.env.ADMIN_NICKNAME || '관리자'
  const password = process.env.ADMIN_PASSWORD

  if (!password || password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be set to at least 12 characters.')
  }

  const existing = await prisma.users.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true, username: true, email: true, role: true },
  })
  if (existing && existing.role !== 'ADMIN') {
    throw new Error('A non-admin account already uses the requested username or email.')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = existing
    ? await prisma.users.update({
        where: { id: existing.id },
        data: {
          password: passwordHash,
          nickname,
          role: 'ADMIN',
          use_yn: 'Y',
          session_version: { increment: 1 },
        },
      })
    : await prisma.users.create({
        data: {
          username,
          email,
          nickname,
          password: passwordHash,
          role: 'ADMIN',
          use_yn: 'Y',
          privacy_consent_yn: 'Y',
          privacy_consent_at: new Date(),
          privacy_policy_version: '2026-07-28',
        },
      })

  console.log(`Admin account is ready: ${admin.username} (${admin.email})`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
