import {BadRequestException, HttpException, HttpStatus, Injectable, Res} from '@nestjs/common';
import {RegisterDto} from './dto/register.dto';
import {UserRepository} from '../../repositories/user.repository';
import {JwtService} from '@nestjs/jwt';
import {EmailService} from '../aws/services/email.service';
import {ValidateUserDto} from './dto/validate-user-dto';
import {MessageResponseDto} from '../../dto/message-response.dto';
import {WhoAmIResponse} from './dto/who-am-i.response.dto';
import {ForgotPasswordRequestDto} from "./dto/forgot-password-request.dto";
import {User} from '../../entities/user.entity'
import {ResetPasswordDto} from "./dto/reset-password.dto";
import {SendVerificationEmailDto} from "./dto/send-verification-email.dto";
import {JwtPayload} from "./dto/jwt-payload.interface";
import {UserSubscription} from "../../entities/user-subscription.entity";
import {County} from "../../entities/county.entity";

const ADMIN_LOGIN_AS_USER_ID = '1ee59cd0-88ad-4b49-9b5a-4e8db4690a1e';
const EXCLUDED_ADMIN_USERS_LIST_USER_ID = '7d49a6e2-bcb2-46d6-81d8-67ad002ce6ff';

@Injectable()
export class AuthService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly jwtService: JwtService,
        private readonly emailService: EmailService,
    ) {
    }

    async setLoginCookies(email: string, id: string, @Res() res: any) {
        const payload: JwtPayload = {email: email, id: id};
        const access_token: string = this.jwtService.sign(payload, {
            expiresIn: 24 * 60 * 60 * 1000, // 1day
        });
        const refresh_token: string = this.jwtService.sign(payload, {
            expiresIn: '7d',
        });

        const isProduction = process.env.NODE_ENV === 'production';

        res.cookie('access_token', access_token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'None' : 'Lax',
            maxAge: 24 * 60 * 60 * 1000, // 1day
        });

        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'None' : 'Lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        console.log('REFRESH TOKEN: ' + refresh_token);
    }

    async refreshAccessToken(token: string): Promise<string> {
        // 1) Verify incoming refresh token
        const validToken = this.jwtService.verify<JwtPayload>(token);

        // 2) Look up the user
        const user = await this.userRepository.findOne({
            where: { id: validToken.id },
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }

        // 3) Build a fresh payload (only your own claims—no exp/iat)
        const newPayload = { id: validToken.id };

        // 4) Sign a brand-new token with a new expiry
        return this.jwtService.sign(newPayload, {
            expiresIn: '7d',
        });
    }


    async validateUser(validateUserDto: ValidateUserDto) {
        return this.userRepository.validateUser(validateUserDto);
    }

    ensureLoginAsAdminAccess(requestingUserId: string | null) {
        if (!requestingUserId || requestingUserId !== ADMIN_LOGIN_AS_USER_ID) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }
    }

    async getUserById(userId: string): Promise<User> {
        const user = await this.userRepository.findOne({where: {id: userId}});
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }
        return user;
    }

    async getUsersWithActiveCountyCounts(onlyWithActiveCounties = false): Promise<Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        companyName: string;
        status: string | null;
        activeCountiesCount: number;
    }>> {
        const query = this.userRepository
            .createQueryBuilder('u')
            .where('u.id != :excludedUserId', {
                excludedUserId: EXCLUDED_ADMIN_USERS_LIST_USER_ID,
            })
            .leftJoin(
                UserSubscription,
                'us',
                'us.user_id = u.id AND us.status = :activeStatus',
                {activeStatus: 'active'},
            )
            .leftJoin(County, 'c', 'c.price_id = us.price_id')
            .select('u.id', 'id')
            .addSelect('u.firstName', 'firstName')
            .addSelect('u.lastName', 'lastName')
            .addSelect('u.email', 'email')
            .addSelect('u.companyName', 'companyName')
            .addSelect('u.status', 'status')
            .addSelect('COUNT(DISTINCT c.id)', 'activeCountiesCount')
            .groupBy('u.id')
            .addGroupBy('u.firstName')
            .addGroupBy('u.lastName')
            .addGroupBy('u.email')
            .addGroupBy('u.companyName')
            .addGroupBy('u.status')
            .orderBy('u.firstName', 'ASC')
            .addOrderBy('u.lastName', 'ASC');

        if (onlyWithActiveCounties) {
            query.having('COUNT(DISTINCT c.id) > 0');
        }

        const rows = await query.getRawMany<{
            id: string;
            firstName: string;
            lastName: string;
            email: string;
            companyName: string;
            status: string | null;
            activeCountiesCount: string;
        }>();

        return rows.map((row) => ({
            ...row,
            activeCountiesCount: Number(row.activeCountiesCount) || 0,
        }));
    }

    async register(registerDto: RegisterDto): Promise<MessageResponseDto> {
        const {email, id} =
            await this.userRepository.register(registerDto);
        const payload = {
            email: email,
            id: id,
            tokenType: 'emailVerification'
        }
        const registerToken: string = this.jwtService.sign(payload)
        const verifyEmailLink: string = `${process.env.FRONTEND_URL}/verify-email?token=${registerToken}`;
        await this.emailService.sendWelcomeEmail(email, verifyEmailLink);
        return {
            message: "Account has been successfully created, check your email."
        }
    }

    async sendVerificationEmail(userId: string) {

        const user = await this.userRepository.findOne({where: {id: userId}})
        if(!user){
            throw new HttpException('User is not found', HttpStatus.BAD_REQUEST)
        }
        const payload= {
            email: user.email,
            id: user.id,
            tokenType: 'emailVerification'
        }
        const emailVerificationToken: string = this.jwtService.sign(payload)
        const verifyEmailLink: string = `${process.env.FRONTEND_URL}/verify-email?token=${emailVerificationToken}`;
    await this.emailService.resendEmailVerification(user.email, verifyEmailLink)
        return {
        message: "Verification email is successfully sent."
        }

    }

    async verifyEmail(token: string): Promise<MessageResponseDto> {
        const {id, tokenType} = await this.jwtService.verify(token)

        if (!id) {
            throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST)
        }
        if (tokenType !== 'emailVerification') {
            throw new HttpException('Invalid or expired token', HttpStatus.BAD_REQUEST)
        }

        return this.userRepository.verifyEmail(id)

    }


    async forgotPassword(forgotPasswordRequestDto: ForgotPasswordRequestDto) {
        const {email} = forgotPasswordRequestDto;
        const user: User = await this.userRepository.findOne({where: {email}});
        if (!user) {
            throw new BadRequestException('User with provided email does not exist');
        }
        const payload = {email: email, id: user.id, tokenType: 'forgotPassword'};
        const resetPasswordToken: string = this.jwtService.sign(payload, {
            expiresIn: '24h',
        });
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetPasswordToken}`;
        await this.emailService.forgotPasswordEmail(email, resetLink);
        return {
            message: "Password reset link is successfully sent"
        }
    }

    async forgotPasswordValidation(token: string) {
        const {id, tokenType} = await this.jwtService.verify(token)
        if (!id) {
            throw new BadRequestException('Invalid or expired token');
        }
        if (tokenType !== 'forgotPassword') {
            throw new BadRequestException('Invalid or expired token');
        }
        const {email} = await this.userRepository.forgotPasswordValidation(id)
        return {email, id};
    }

    async resetPassword(resetPasswordDto: ResetPasswordDto, userId: string) {
        return await this.userRepository.resetPassword(resetPasswordDto, userId);
    }

    async whoAmI(token: string): Promise<WhoAmIResponse> {
        if (!token) {
            throw new HttpException('Token not provided', HttpStatus.UNAUTHORIZED);
        }
        const payload = await this.jwtService.verify(token);
        if (!payload) {
            throw new HttpException('Token not verified', HttpStatus.UNAUTHORIZED);
        }
        const {id} = payload;
        const user: User = await this.userRepository.findOne({where: {id: id}});
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }
        return {
            email: user.email,
            companyName: user.companyName,
            logoUrl: user.logoUrl,
            status: user.status,
            id: user.id,
            iat: payload.iat,
            exp: payload.exp,
        }
    }

}
