import {
    Body,
    Controller,
    Delete,
    Get, HttpException, HttpStatus, NotFoundException, Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import {ApiOkResponse, ApiOperation, ApiTags} from '@nestjs/swagger';
import {AuthService} from './auth.service';
import {RegisterDto} from './dto/register.dto';
import {MessageResponseDto} from '../../dto/message-response.dto';
import {JwtAuthGuard} from './jwt-auth.guard';
import {EmailService} from '../aws/services/email.service';
import {ValidateUserDto} from './dto/validate-user-dto';
import {User} from '../../entities/user.entity';
import {Request, Response} from 'express';
import {WhoAmIResponse} from './dto/who-am-i.response.dto';
import {ForgotPasswordRequestDto} from "./dto/forgot-password-request.dto";
import {ResetPasswordDto} from "./dto/reset-password.dto";
import {UserId} from "./user-id.decorator";

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly emailService: EmailService,
    ) {
    }

    @Post()
    @ApiOperation({summary: 'Login with a password'})
    @ApiOkResponse({type: MessageResponseDto})
    async login(@Body() validateUserDto: ValidateUserDto, @Res() res: any) {
        const user: User = await this.authService.validateUser(validateUserDto);

        await this.authService.setLoginCookies(user.email, user.id, res);
        return res.json({message: 'Logged in'});
    }

    @UseGuards(JwtAuthGuard)
    @Get('admin/users')
    @ApiOperation({summary: 'List users with active counties count'})
    async getUsersWithActiveCountyCount(
        @UserId() requestingUserId: string,
        @Query('onlyWithActiveCounties') onlyWithActiveCounties?: string,
    ) {
        this.authService.ensureLoginAsAdminAccess(requestingUserId);

        const shouldFilterByActiveCounties = ['true', '1', 'yes'].includes(
            (onlyWithActiveCounties ?? '').toLowerCase(),
        );

        return await this.authService.getUsersWithActiveCountyCounts(
            shouldFilterByActiveCounties,
        );
    }

    @UseGuards(JwtAuthGuard)
    @Post('admin/login-as/:userId')
    @ApiOperation({summary: 'Login as selected user'})
    async loginAsUser(
        @UserId() requestingUserId: string,
        @Param('userId', new ParseUUIDPipe()) userId: string,
        @Res() res: Response,
    ): Promise<Response<MessageResponseDto>> {
        this.authService.ensureLoginAsAdminAccess(requestingUserId);

        const user = await this.authService.getUserById(userId);
        await this.authService.setLoginCookies(user.email, user.id, res);
        return res.json({message: `Logged in as ${user.email}`});
    }

    @Post('register')
    @ApiOperation({summary: 'Register a user'})
    @ApiOkResponse({type: MessageResponseDto})
    async register(
        @Body()
        registerDto: RegisterDto,
    ): Promise<MessageResponseDto> {
        return await this.authService.register(registerDto);
    }

    @UseGuards(JwtAuthGuard)
    @Post('verify/verify-email')
    @ApiOperation({summary: 'Send a verification email'})
    @ApiOkResponse({type: MessageResponseDto})
    async sendVerificationEmail(@UserId() userId: string) {
        console.log(userId)
        return await this.authService.sendVerificationEmail(userId)
    }

    @Get('verify/verify-email/:token')
    @ApiOperation({summary: 'Endpoint for JWT token from verify email link'})
    @ApiOkResponse({type: MessageResponseDto})
    async verifyEmail(@Param('token') token: string) {
        return await this.authService.verifyEmail(token)
    }

    @Post('forgot-password')
    @ApiOperation({summary: 'Forgot password'})
    @ApiOkResponse({type: MessageResponseDto})
    async forgotPassword(
        @Body() forgotPasswordRequestDto: ForgotPasswordRequestDto,
    ): Promise<MessageResponseDto> {
        return await this.authService.forgotPassword(forgotPasswordRequestDto)
    }

    @Get('reset-password/:token')
    @ApiOperation({summary: 'Reset password validation'})
    @ApiOkResponse({type: MessageResponseDto})
    async forgotPasswordValidation(
        @Param('token') token: string,
        @Res() res: any,
    ): Promise<MessageResponseDto> {
        const {email, id} = await this.authService.forgotPasswordValidation(token)
        await this.authService.setLoginCookies(email, id, res);
        return res.json({message: 'Token is valid. Reset your password'});
    }

    @UseGuards(JwtAuthGuard)
    @Post('reset-password')
    @ApiOperation({summary: 'Reset password after token validation'})
    @ApiOkResponse({type: MessageResponseDto})
    async resetPassword(
        @Body() resetPasswordDto: ResetPasswordDto,
        @UserId() userId: string
    ): Promise<MessageResponseDto> {
        return await this.authService.resetPassword(resetPasswordDto, userId)
    }

    @UseGuards(JwtAuthGuard)
    @Delete('logout')
    @ApiOperation({summary: 'Logout'})
    async logout(@Res() res: any): Promise<{ message: string }> {
        const isProduction = process.env.NODE_ENV === 'production';

        res.clearCookie('access_token', {
            httpOnly: true,
            secure: isProduction, // Secure only in production
            sameSite: isProduction ? 'None' : 'Lax', // 'None' for cross-site cookies, 'Lax' for local dev
        });

        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: isProduction, // Secure only in production
            sameSite: isProduction ? 'None' : 'Lax',
        });
        return res.json({message: 'User is logged out.'});
    }

    @Get('who-am-i')
    @ApiOperation({summary: "who-am-i endpoint"})
    @ApiOkResponse({type: WhoAmIResponse})
    async getProfile(@Req() req: Request): Promise<WhoAmIResponse> {
        const token = req.cookies['access_token'];
        return await this.authService.whoAmI(token);
    }


    // new endpoint
    @ApiOperation({ summary: 'Refresh Access Token' })
    @ApiOkResponse({ type: MessageResponseDto })
    @Post('token')
    async refreshAccesToken(
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response<MessageResponseDto>> {
        const refreshToken = req.cookies['refresh_token'];
        if (!refreshToken) {
            throw new HttpException('No token found', HttpStatus.BAD_REQUEST);
        }

        const newAccessToken: string =
            await this.authService.refreshAccessToken(refreshToken);

        // Set the HTTP-only cookie for the access token
        res.cookie('access_token', newAccessToken, {
            httpOnly: true,
            secure: true, // Use secure cookies in production
            sameSite:  'none', // Adjust as necessary
            maxAge: 60 * 60 * 1000, // 1 hour for access token
        });

        return res.json({ message: 'Token is refreshed.' });
    }
}
