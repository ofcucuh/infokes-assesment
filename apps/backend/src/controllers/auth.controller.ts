import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/user.repository.js';
import { BusinessConflictError, AuthenticationError } from '../domain/types.js';
import { Role } from '@prisma/client';

export const authController = new Elysia({ prefix: '/auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET || 'dot-traveler-super-secure-jwt-key-2026',
    })
  )
  .post(
    '/register',
    async ({ body }) => {
      const { email, password, role } = body;

      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        throw new BusinessConflictError('An account with this email already exists.');
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await userRepository.create({
        email,
        passwordHash,
        role: role as Role,
      });

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 6 }),
        role: t.Optional(t.Enum(Role)),
      }),
    }
  )
  .post(
    '/login',
    async ({ body, jwt }) => {
      const { email, password } = body;

      const user = await userRepository.findByEmail(email);
      if (!user) {
        throw new AuthenticationError('Invalid email or password.');
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new AuthenticationError('Invalid email or password.');
      }

      const token = await jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String(),
      }),
    }
  );
