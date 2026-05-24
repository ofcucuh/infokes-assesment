import { db } from '../infrastructure/db.js';
import { Role } from '@prisma/client';

export class UserRepository {
  async findByEmail(email: string) {
    return db.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return db.user.findUnique({
      where: { id },
    });
  }

  async create(data: { email: string; passwordHash: string; role?: Role }) {
    return db.user.create({
      data: {
        email: data.email,
        password: data.passwordHash,
        role: data.role || Role.VIEWER,
      },
    });
  }
}

export const userRepository = new UserRepository();
