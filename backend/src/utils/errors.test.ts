import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
} from './errors.js';

describe('Custom Error Classes', () => {
  describe('AppError', () => {
    it('should default to status 500', () => {
      const error = new AppError('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Something went wrong');
      expect(error.name).toBe('AppError');
    });

    it('should accept a custom status code', () => {
      const error = new AppError('Teapot', 418);
      expect(error.statusCode).toBe(418);
    });

    it('should be an instance of Error', () => {
      const error = new AppError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('should have status 404 and default message', () => {
      const error = new NotFoundError();
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should accept a custom message', () => {
      const error = new NotFoundError('User not found');
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
    });

    it('should be instanceof AppError and Error', () => {
      const error = new NotFoundError();
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConflictError', () => {
    it('should have status 409 and default message', () => {
      const error = new ConflictError();
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource already exists');
    });

    it('should accept a custom message', () => {
      const error = new ConflictError('Folder name taken');
      expect(error.message).toBe('Folder name taken');
    });
  });

  describe('UnauthorizedError', () => {
    it('should have status 401 and default message', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });
  });

  describe('ForbiddenError', () => {
    it('should have status 403 and default message', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
    });
  });

  describe('BadRequestError', () => {
    it('should have status 400 and default message', () => {
      const error = new BadRequestError();
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
    });
  });
});
