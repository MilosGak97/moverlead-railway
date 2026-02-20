import {DataSource, Repository} from 'typeorm';
import {User} from '../entities/user.entity';
import {BadRequestException, HttpException, HttpStatus, Injectable,} from '@nestjs/common';
import {RegisterDto} from '../api/auth/dto/register.dto';
import * as bcrypt from 'bcryptjs';
import {ValidateUserDto} from '../api/auth/dto/validate-user-dto';
import {MessageResponseDto} from '../dto/message-response.dto';
import {GetCompanyResponseDto} from '../api/settings/dto/get-company-response.dto';
import {ChangePasswordDto} from '../api/settings/dto/change-password.dto';
import {PatchCompanyDto} from '../api/settings/dto/patch-company.dto';
import {UserStatus} from "../enums/user-status.enum";
import {ResetPasswordDto} from "../api/auth/dto/reset-password.dto";

@Injectable()
export class UserRepository extends Repository<User> {
    constructor(private readonly dataSource: DataSource) {
        super(User, dataSource.createEntityManager());
    }

    // used in local.strategy.ts
    async validateUser(validateUserDto: ValidateUserDto): Promise<User> {
        const {email, password} = validateUserDto;
        const user = await this.findOneBy({email});
        if (!user) {
            throw new HttpException('Check your credentials', HttpStatus.BAD_REQUEST);
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            throw new HttpException('Check your credentials', HttpStatus.BAD_REQUEST);
        }
        return user;
    }

    async register(registerDto: RegisterDto): Promise<{
        email: string;
        id: string;
    }> {
        if (registerDto.password !== registerDto.repeatPassword) {
            throw new BadRequestException('Both password fields must match.');
        }

        const userExist: User = await this.findOne({
            where: {email: registerDto.email},
        });
        if (userExist) {
            throw new BadRequestException('This email address is already associated with an account.');
        }

        const salt: string = await bcrypt.genSalt(10);
        // @ts-ignore
        const hashedPassword: string = await bcrypt.hash(
            registerDto.password,
            salt,
        );
        const user = new User();

        const {firstName, lastName, email, companyName, phoneNumber} = registerDto;
        Object.assign(user, {firstName, lastName, email, companyName});

        user.password = hashedPassword;
        user.phoneNumber = phoneNumber;
        user.status = UserStatus.NOT_VERIFIED;

        await this.save(user);
        return {
            id: user.id,
            email: registerDto.email,
        };
    }

    async verifyEmail(userId: string): Promise<MessageResponseDto> {
        const user = await this.findOne({where: {id: userId}})
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }
        user.status = UserStatus.ACTIVE;
        await this.save(user);
        return {
            message: "Email is verified."
        }
    }

    async forgotPasswordValidation(id) {
        const user = await this.findOne({where: {id}})
        if (!user) {
            throw new BadRequestException('User does not exist with ID provided from token')
        }
        user.status = UserStatus.FORGOT_PASSWORD;
        await this.save(user);
        return {
            email: user.email
        }
    }

    async resetPassword(resetPasswordDto: ResetPasswordDto, userId: string) {
        const {password, repeatPassword} = resetPasswordDto;
        if (password !== repeatPassword) {
            throw new BadRequestException('Passwords do not match');
        }
        const user = await this.findOne({where: {id: userId}})
        if (!user) {
            throw new BadRequestException('User does not exist with provided ID from UserId decorator')
        }
        const salt: string = await bcrypt.genSalt(10)
        user.password = await bcrypt.hash(password, salt)
        user.status = UserStatus.ACTIVE;
        await this.save(user)
        return {
            message: "Password changed successfully",
        }

    }

    async getCompany(userId: string): Promise<GetCompanyResponseDto> {
        const user = await this.findOne({where: {id: userId}});
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }

        return {
            companyName: user.companyName,
            address: user.address,
            address2: user.address2,
            city: user.city,
            state: user.state,
            zip: user.zip,
            website: user.website,
            phoneNumber: user.phoneNumber,
        };
    }

    // Change password of user function
    async changePassword(
        userId: string,
        changePasswordDto: ChangePasswordDto,
    ): Promise<MessageResponseDto> {
        const user = await this.findOne({where: {id: userId}});
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }
        const {password, newPassword, newPasswordRepeat} = changePasswordDto;
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new HttpException(
                'Your old password is not correct',
                HttpStatus.BAD_REQUEST,
            );
        }
        if (newPassword !== newPasswordRepeat) {
            throw new HttpException(
                'Password is not matching',
                HttpStatus.BAD_REQUEST,
            );
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await this.save(user);
        return {
            message: 'Password changed successfully.',
        };
    }

    async patchCompany(
        userId: string,
        patchCompanyDto: PatchCompanyDto,
    ): Promise<MessageResponseDto> {
        const user = await this.findOne({where: {id: userId}});
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }

        Object.assign(user, patchCompanyDto);
        await this.save(user);
        return {
            message: 'Successfully updated changed successfully.',
        };
    }

    async getUserByStripeUserId(stripeId: string) {
        return this.findOne({where: {stripeId}});
    }
}
