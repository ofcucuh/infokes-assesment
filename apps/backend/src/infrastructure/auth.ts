import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { AuthenticationError } from '../domain/types.js';

export const authPlugin = new Elysia({ name: 'auth-plugin' })
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET || 'dot-traveler-super-secure-jwt-key-2026',
    })
  )
  .derive({ as: 'global' }, ({ jwt, headers: { authorization } }) => {
    return {
      requireUser: async () => {
        if (!authorization) {
          throw new AuthenticationError('Missing Authorization header');
        }

        const parts = authorization.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
          throw new AuthenticationError('Invalid Authorization header format. Expected Bearer <token>');
        }

        const token = parts[1];
        const payload = await jwt.verify(token);

        if (!payload) {
          throw new AuthenticationError('Invalid or expired authentication token');
        }

        
        return {
          id: payload.id as string,
          email: payload.email as string,
          role: payload.role as string,
        };
      }
    };
  });
