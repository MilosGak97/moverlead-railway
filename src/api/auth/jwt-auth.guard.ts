import { ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable, firstValueFrom } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
    constructor(private reflector: Reflector) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req: any = context.switchToHttp().getRequest();

        // ✅ Check @Public() before Passport tries to authenticate
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            console.log('🟢 JwtAuthGuard skipped (public route):', req.path);
            return true;
        }

        console.log('🛡️ JwtAuthGuard – incoming cookies:', req.cookies);

        // 🔹 Call Passport's built-in JWT guard
        const result = super.canActivate(context);

        // 🔹 Await result safely (Observable | Promise | boolean)
        let allowed: boolean;
        if (result instanceof Observable) {
            allowed = await firstValueFrom(result);
        } else if (result instanceof Promise) {
            allowed = await result;
        } else {
            allowed = result;
        }

        console.log('🛡️ JwtAuthGuard – passport result =', allowed);

        // 🔹 Attach userId from JWT payload (if valid)
        if (allowed) {
            console.log('🛡️ JwtAuthGuard – req.user after passport:', req.user);
            req.userId = req.user?.userId ?? req.user?.id ?? null;
            console.log('🛡️ JwtAuthGuard – assigned req.userId =', req.userId);
        }

        return allowed;
    }
}