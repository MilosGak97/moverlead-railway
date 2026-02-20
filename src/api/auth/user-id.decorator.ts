import { createParamDecorator, ExecutionContext } from '@nestjs/common';


export const UserId = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext) => {
        const req: any = ctx.switchToHttp().getRequest();
        console.log('🎯 @UserId decorator sees req.userId =', req.userId);
        return req.userId ?? null;
    },
);