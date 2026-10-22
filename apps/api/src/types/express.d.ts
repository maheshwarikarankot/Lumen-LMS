import type { UserRole } from '@lumen/shared';

// `authenticate` puts the caller here. Deliberately small: a permission check needs the role and
// nothing else, and a thin object cannot leak a password hash if someone sends it by mistake.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: UserRole };
    }
  }
}

export {};
