import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum EmploymentTypeEnum { FULL_TIME='FULL_TIME', PART_TIME='PART_TIME', CONTRACT='CONTRACT', ADJUNCT='ADJUNCT', VISITING='VISITING' }
enum LeaveTypeEnum { ANNUAL='ANNUAL', SICK='SICK', MATERNITY='MATERNITY', PATERNITY='PATERNITY', STUDY='STUDY', COMPASSIONATE='COMPASSIONATE', SABBATICAL='SABBATICAL' }
enum LeaveActionEnum { APPROVE='APPROVE', REJECT='REJECT' }

export class CreateStaffDto {
  @ApiProperty() @IsUUID('4') userId: string;
  @ApiProperty() @IsString() @Length(2,20) employeeNo: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2,20) ippisNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rsaPin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pfaCode?: string;
  @ApiProperty() @IsString() @Length(1,100) firstName: string;
  @ApiProperty() @IsString() @Length(1,100) lastName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() middleName?: string;
  @ApiProperty() @IsDateString() dateOfBirth: string;
  @ApiProperty() @IsString() gender: string;
  @ApiProperty() @IsString() @Matches(/^0\d{10}$/, { message: '11-digit Nigerian number' }) phone: string;
  @ApiProperty() @IsString() @Length(2,255) email: string;
  @ApiProperty() @IsString() @Length(2,150) designation: string;
  @ApiProperty() @IsUUID('4') departmentId: string;
  @ApiProperty() @IsUUID('4') salaryGradeId: string;
  @ApiProperty({ enum: EmploymentTypeEnum }) @IsEnum(EmploymentTypeEnum) employmentType: EmploymentTypeEnum;
  @ApiProperty() @IsDateString() appointmentDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10,10) accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankCode?: string;
}

export class CreateSalaryGradeDto {
  @ApiProperty({ example: 'GL-07' }) @IsString() @Length(2,10) gradeLevel: string;
  @ApiProperty() basicSalary: number;
  @ApiPropertyOptional({ default: 15 }) housingAllowancePct?: number;
  @ApiPropertyOptional({ default: 10 }) transportAllowancePct?: number;
  @ApiPropertyOptional({ default: 5  }) medicalAllowancePct?: number;
}

export class RequestLeaveDto {
  @ApiProperty({ enum: LeaveTypeEnum }) @IsEnum(LeaveTypeEnum) leaveType: LeaveTypeEnum;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiProperty() @IsString() @Length(10,500) reason: string;
}

export class LeaveDecisionDto {
  @ApiProperty({ enum: LeaveActionEnum }) @IsEnum(LeaveActionEnum) action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,500) note?: string;
}
