import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

// O seed é deliberadamente independente do runtime HTTP. Em uma instalação com
// Prisma Client configurado, substitua este ponto pela criação transacional.
const demoPassword = bcrypt.hashSync('demo-password-123', 12);
console.log(JSON.stringify({ user: { id: randomUUID(), name: 'Demo User', email: 'demo@example.com', passwordHash: demoPassword }, note: 'Use pnpm db:migrate antes de conectar o seed ao banco.' }, null, 2));
