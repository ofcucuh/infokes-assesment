import './polyfill.js';

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { authController } from './controllers/auth.controller.js';
import { nodeController } from './controllers/node.controller.js';
import { shareController } from './controllers/share.controller.js';
import { AppError } from './domain/types.js';

const port = process.env.PORT || 3000;

const app = new Elysia()
  
  .use(
    cors({
      origin: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  )
  
  
  .error('APP_ERROR', AppError)
  .onError(({ code, error, set }) => {
    const timestamp = new Date().toISOString();
    let status = 500;
    let message = (error as any)?.message || 'An unexpected server error occurred';
    let errorCode = 'INTERNAL_SERVER_ERROR';

    if (code === 'APP_ERROR' && error instanceof AppError) {
      status = error.status;
      errorCode = error.code;
    } else if (code === 'VALIDATION') {
      status = 400;
      errorCode = 'VALIDATION_ERROR';
    } else if (code === 'NOT_FOUND') {
      status = 404;
      errorCode = 'NOT_FOUND';
    }

    set.status = status;
    
    if (status === 500) {
      console.error('Unhandled server error:', error);
    }

    return {
      timestamp,
      status: 'Error',
      message,
      data: {
        code: errorCode
      }
    };
  })

  .onAfterHandle(({ response, set, request }: any) => {
    if (response instanceof Response) {
      return response;
    }
    
    let message = 'Success';
    let data = response;
    
    if (response && typeof response === 'object' && 'message' in response) {
      message = (response as any).message;
    } else {
      switch (request.method) {
        case 'GET':
          message = 'Success to load data';
          break;
        case 'POST':
          message = 'Success to create data';
          break;
        case 'PUT':
        case 'PATCH':
          message = 'Success to update data';
          break;
        case 'DELETE':
          message = 'Success to delete data';
          break;
        default:
          message = 'Success';
      }
    }
    
    return {
      timestamp: new Date().toISOString(),
      status: 'Success',
      message,
      data,
    };
  })

  
  .get('/health', () => ({ status: 'healthy', timestamp: new Date() }))

  
  .group('/api/v1', (api: any) =>
    api
      .use(authController)
      .use(nodeController)
      .use(shareController)
  )

  
  .listen(port);

console.log(`🚀 Dot Traveler Elysia Backend is running at: http://localhost:${port}`);
