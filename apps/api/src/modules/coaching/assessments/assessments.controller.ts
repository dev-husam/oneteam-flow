import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { ListAssessmentsQuery, RequestAssessmentDto, SubmitAssessmentDto, TemplateDto, TrendsQuery, UpdateTemplateDto } from './assessments.dto.js';
import { AssessmentsService } from './assessments.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('coaching')
@ApiBearerAuth()
@RequiresModule('coaching')
@Controller('orgs/:orgId/coaching')
export class AssessmentsController {
  constructor(@Inject(AssessmentsService) private readonly assessments: AssessmentsService) {}

  @Get('assessment-templates')
  @RequirePermission('coaching.assessment.manage')
  async templates() {
    return { data: await this.assessments.listTemplates() };
  }

  @Post('assessment-templates')
  @RequirePermission('coaching.assessment.manage')
  async createTemplate(@Body() dto: TemplateDto) {
    return { data: await this.assessments.createTemplate(dto) };
  }

  @Patch('assessment-templates/:templateId')
  @RequirePermission('coaching.assessment.manage')
  async updateTemplate(@Param('templateId', uuid()) id: string, @Body() dto: UpdateTemplateDto) {
    return { data: await this.assessments.updateTemplate(id, dto) };
  }

  @Delete('assessment-templates/:templateId')
  @HttpCode(204)
  @RequirePermission('coaching.assessment.manage')
  async archiveTemplate(@Param('templateId', uuid()) id: string) {
    await this.assessments.archiveTemplate(id);
  }

  @Get('assessments')
  @RequirePermission('coaching.assessment.read')
  async list(@Query() q: ListAssessmentsQuery) {
    return { data: await this.assessments.list(q) };
  }

  @Get('assessments/trends')
  @RequirePermission('coaching.assessment.read')
  async trends(@Query() q: TrendsQuery) {
    return { data: await this.assessments.trends(q.clientMembershipId) };
  }

  @Get('assessments/:assessmentId')
  @RequirePermission('coaching.assessment.read')
  async get(@Param('assessmentId', uuid()) id: string) {
    return { data: await this.assessments.get(id) };
  }

  @Post('assessments')
  @RequirePermission('coaching.assessment.manage')
  async request(@Body() dto: RequestAssessmentDto) {
    return { data: await this.assessments.request(dto) };
  }

  @Post('assessments/:assessmentId/submit')
  @HttpCode(200)
  @RequirePermission('coaching.assessment.submit')
  async submit(@Param('assessmentId', uuid()) id: string, @Body() dto: SubmitAssessmentDto) {
    return { data: await this.assessments.submit(id, dto) };
  }

  @Post('assessments/:assessmentId/cancel')
  @HttpCode(200)
  @RequirePermission('coaching.assessment.manage')
  async cancel(@Param('assessmentId', uuid()) id: string) {
    return { data: await this.assessments.cancel(id) };
  }
}
