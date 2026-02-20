import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          console.log('🍪 extractor sees req.cookies =', req?.cookies);
          if (!req || !req.cookies) return null;
          const token = req.cookies['access_token'];
          console.log('🔑 extractor returning token =', token);
          return token;
        },
      ]),
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    console.log('✅ JwtStrategy.validate got payload =', payload);
    return {
      userId: payload.id,
      email:  payload.email,
    };
  }
}
