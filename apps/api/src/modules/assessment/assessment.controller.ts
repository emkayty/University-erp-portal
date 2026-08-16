import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssessmentService } from './assessment.service';
import { ComponentDto, CreateSchemeDto, CsvUploadDto, MarkDto, SaveComponentsDto } from './dto';

@ApiTags('Assessment & Gradebook') @Controller({path:'assessment',version:'1'}) @UseGuards(RolesGuard) @ApiBearerAuth('access-token')
export class AssessmentController { constructor(private readonly svc:AssessmentService){}
  @Post('schemes') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') create(@Body() d:CreateSchemeDto,@CurrentUser()u:JwtPayload){return this.svc.createScheme(d,u.sub,u.role);}
  @Post('schemes/:id/components') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') components(@Param('id',ParseUUIDPipe)id:string,@Body()d:SaveComponentsDto,@CurrentUser()u:JwtPayload){return this.svc.setComponents(id,d.components,u.sub,u.role);}
  @Post('offerings/:id/finalize') @Roles('HOD','DEAN','REGISTRAR','SUPER_ADMIN') finalize(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:JwtPayload){return this.svc.finalizeScheme(id,u.sub,u.role);}
  @Post('offerings/:id/generate-results') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') generateResults(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:JwtPayload){return this.svc.generateDraftResults(id,u.sub,u.role);}
  @Post('offerings/:id/finalize-marks') @Roles('HOD','DEAN','REGISTRAR','SUPER_ADMIN') finalizeMarks(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:JwtPayload){return this.svc.finalizeMarks(id,u.sub,u.role);}
  @Get('offerings/:id/template') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') @Header('Content-Type','text/csv; charset=utf-8') template(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:JwtPayload){return this.svc.getTemplate(id,u.sub,u.role);}
  @Post('marks') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') mark(@Body()d:MarkDto,@CurrentUser()u:JwtPayload){return this.svc.saveMark(d,u.sub,u.role);}
  @Get('offerings/:id/gradebook') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') gradebook(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:JwtPayload){return this.svc.getGradebook(id,u.sub,u.role);}
  @Get('offerings/:id/export') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') @Header('Content-Type','text/csv; charset=utf-8') export(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:JwtPayload){return this.svc.exportGradebook(id,u.sub,u.role);}
  @Post('upload/csv') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') upload(@Body()d:CsvUploadDto,@CurrentUser()u:JwtPayload){return this.svc.uploadCsv(d,u.sub,u.role);}
}
