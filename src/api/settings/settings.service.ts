import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../repositories/user.repository';
import { GetCompanyResponseDto } from './dto/get-company-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MessageResponseDto } from '../../dto/message-response.dto';
import { PatchCompanyDto } from './dto/patch-company.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly userRepository: UserRepository) {}

  async getCompany(userId: string): Promise<GetCompanyResponseDto> {
    return this.userRepository.getCompany(userId);
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    return await this.userRepository.changePassword(userId, changePasswordDto);
  }

  async patchCompany(
    userId: string,
    patchCompanyDto: PatchCompanyDto,
  ): Promise<MessageResponseDto> {
    return await this.userRepository.patchCompany(userId, patchCompanyDto);
  }
}
