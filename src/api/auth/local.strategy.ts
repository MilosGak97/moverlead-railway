import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service';
import { ValidateUserDto } from './dto/validate-user-dto';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string): Promise<any> {
    const validateUserDto = new ValidateUserDto();
    validateUserDto.email = email;
    validateUserDto.password = password;
    const user = await this.authService.validateUser(validateUserDto);
    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}