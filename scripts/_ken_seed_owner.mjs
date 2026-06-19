import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const db = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const email = 'dennis.kotlenko@gmail.com';
let user = await db.user.findUnique({ where: { email } });
if (!user) {
  user = await db.user.create({ data: { email, emailVerified: true, authProvider: 'email', sessionVersion: 0 } });
  console.log('CREATED user', user.id);
} else {
  console.log('EXISTS user', user.id, 'ver', user.sessionVersion);
}
const token = jwt.sign({ userId: user.id, email, ver: user.sessionVersion }, JWT_SECRET, { expiresIn: '24h' });
console.log('TOKEN=' + token);
await db.$disconnect();
