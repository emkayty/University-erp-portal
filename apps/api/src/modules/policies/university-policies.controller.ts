import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import type { JwtPayload } from "@uniportal/types";
import { Authenticated, CurrentUser, Roles, SelfScoped } from "../../common/decorators";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  CreateUniversityPolicyDto,
  ListPolicyAcknowledgementsDto,
  ListUniversityPoliciesDto,
  PublishUniversityPolicyDto,
  ReviewUniversityPolicyDto,
  UpdateUniversityPolicyDto,
} from "./dto/university-policy.dto";
import { UniversityPoliciesService } from "./university-policies.service";

@ApiTags("University Policies")
@Controller({ path: "university-policies", version: "1" })
@UseGuards(RolesGuard)
@ApiBearerAuth("access-token")
export class UniversityPoliciesController {
  constructor(private readonly svc: UniversityPoliciesService) {}

  @Authenticated()
  @Get("published")
  @ApiOperation({
    summary: "List published university policies available to the current user",
  })
  async listPublished(@CurrentUser() user: JwtPayload) {
    return {
      success: true,
      data: await this.svc.listPublishedForUser(user.sub),
    };
  }

  @Authenticated()
  @Get("published/:id")
  @ApiOperation({
    summary: "Read a published university policy and acknowledgement state",
  })
  async getPublished(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return {
      success: true,
      data: await this.svc.getPublishedForUser(id, user.sub),
    };
  }

  @SelfScoped()
  @Post("published/:id/acknowledge")
  @ApiOperation({
    summary:
      "Acknowledge a published university policy that requires acknowledgement",
  })
  async acknowledge(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const userAgentHeader = request.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader[0]
      : userAgentHeader;
    return {
      success: true,
      data: await this.svc.acknowledge(id, user.sub, request.ip, userAgent),
    };
  }

  @Get()
  @Roles("SUPER_ADMIN", "VC", "REGISTRAR")
  @ApiOperation({
    summary: "List all university policy records and lifecycle states",
  })
  async list(@Query() query: ListUniversityPoliciesDto) {
    return { success: true, data: await this.svc.list(query) };
  }

  @Get(":id")
  @Roles("SUPER_ADMIN", "VC", "REGISTRAR")
  @ApiOperation({
    summary: "Read a university policy including draft/review content",
  })
  async get(@Param("id") id: string) {
    return { success: true, data: await this.svc.getAdminPolicy(id) };
  }

  @Post()
  @Roles("SUPER_ADMIN", "REGISTRAR")
  @ApiOperation({ summary: "Create a draft university policy" })
  async create(
    @Body() dto: CreateUniversityPolicyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.svc.create(dto, user.sub) };
  }

  @Patch(":id")
  @Roles("SUPER_ADMIN", "REGISTRAR")
  @ApiOperation({ summary: "Update a draft or rejected university policy" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUniversityPolicyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.svc.update(id, dto, user.sub) };
  }

  @Post(":id/revisions")
  @Roles("SUPER_ADMIN", "REGISTRAR")
  @ApiOperation({
    summary: "Create the next draft revision of a published or archived policy",
  })
  async createRevision(
    @Param("id") id: string,
    @Body() dto: UpdateUniversityPolicyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.svc.createRevision(id, dto, user.sub),
    };
  }

  @Post(":id/submit")
  @Roles("SUPER_ADMIN", "REGISTRAR")
  @ApiOperation({ summary: "Submit a policy draft for independent approval" })
  async submit(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.svc.submit(id, user.sub) };
  }

  @Post(":id/review")
  @Roles("SUPER_ADMIN", "VC")
  @ApiOperation({
    summary:
      "Approve or reject a submitted policy; author self-approval is blocked",
  })
  async review(
    @Param("id") id: string,
    @Body() dto: ReviewUniversityPolicyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.svc.review(id, dto, user.sub) };
  }

  @Post(":id/publish")
  @Roles("SUPER_ADMIN", "VC")
  @ApiOperation({
    summary:
      "Publish an approved policy and archive the prior published version with the same code",
  })
  async publish(
    @Param("id") id: string,
    @Body() dto: PublishUniversityPolicyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.svc.publish(id, dto, user.sub) };
  }

  @Post(":id/archive")
  @Roles("SUPER_ADMIN", "VC")
  @ApiOperation({
    summary: "Archive a reviewed or published university policy",
  })
  async archive(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.svc.archive(id, user.sub) };
  }

  @Get(":id/acknowledgements")
  @Roles("SUPER_ADMIN", "VC", "REGISTRAR")
  @ApiOperation({ summary: "List users who acknowledged a policy version" })
  async acknowledgements(
    @Param("id") id: string,
    @Query() query: ListPolicyAcknowledgementsDto,
  ) {
    return {
      success: true,
      data: await this.svc.listAcknowledgements(id, query),
    };
  }
}
