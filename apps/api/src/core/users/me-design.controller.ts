import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { MeDesignService } from './me-design.service.js';

class ChooseDesignDto {
  /** null returns to the organization's or the platform's design. */
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9-]{1,39}$/) key!: string | null;
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeDesignController {
  constructor(@Inject(MeDesignService) private readonly design: MeDesignService) {}

  @Get('design')
  @ApiOperation({ summary: 'The design the current user picked for themselves, if any.' })
  async current(@CurrentUser() user: AuthUser) {
    return { data: await this.design.current(user.userId) };
  }

  @Get('designs')
  @ApiOperation({ summary: 'The designs the current user may choose from, with their current choice.' })
  async options(@CurrentUser() user: AuthUser) {
    return { data: await this.design.options(user.userId) };
  }

  @Put('design')
  @ApiOperation({ summary: 'Choose a design (or null to follow the organization or platform design).' })
  async choose(@CurrentUser() user: AuthUser, @Body() dto: ChooseDesignDto) {
    return { data: await this.design.choose(user.userId, dto.key ?? null) };
  }
}
