import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { GetCompanyResponseDto } from './dto/get-company-response.dto';
import {ApiOkResponse, ApiTags} from '@nestjs/swagger';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MessageResponseDto } from '../../dto/message-response.dto';
import { PatchCompanyDto } from './dto/patch-company.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('company')
  @ApiOkResponse({ type: GetCompanyResponseDto })
  async getCompany(@UserId() userId: string): Promise<GetCompanyResponseDto> {
    return this.settingsService.getCompany(userId);
  }

  @Patch('company')
  @ApiOkResponse({ type: MessageResponseDto })
  async patchCompany(
    @UserId() userId: string,
    @Body() patchCompanyDto: PatchCompanyDto,
  ) {
    return await this.settingsService.patchCompany(userId, patchCompanyDto);
  }

  @Patch('password')
  @ApiOkResponse({ type: MessageResponseDto })
  async changePassword(
    @UserId() userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    return await this.settingsService.changePassword(userId, changePasswordDto);
  }
}
