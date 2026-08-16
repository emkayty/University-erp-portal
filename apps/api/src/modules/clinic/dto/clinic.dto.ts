import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsOptional,
  IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { DrugForm, AppointmentStatus } from '@prisma/client';

// ── Patient ───────────────────────────────────────────────────────────────────
export class RegisterPatientDto {
  @IsUUID('4') userId: string;
  @IsOptional() @IsString() @Length(1, 5) bloodGroup?: string;
  @IsOptional() @IsString() @Length(1, 5) genotype?: string;
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() chronicConditions?: string;
  @IsOptional() @IsString() @Length(1, 200) emergencyContactName?: string;
  @IsOptional() @IsString() @Length(10, 15) emergencyContactPhone?: string;
}

export class UpdatePatientDto {
  @IsOptional() @IsString() @Length(1, 5) bloodGroup?: string;
  @IsOptional() @IsString() @Length(1, 5) genotype?: string;
  @IsOptional() @IsString() allergies?: string;
  @IsOptional() @IsString() chronicConditions?: string;
  @IsOptional() @IsString() @Length(1, 200) emergencyContactName?: string;
  @IsOptional() @IsString() @Length(10, 15) emergencyContactPhone?: string;
}

// ── Appointment ───────────────────────────────────────────────────────────────
export class BookAppointmentDto {
  @IsUUID('4') patientId: string;
  @IsUUID('4') doctorUserId: string;
  @IsDateString() appointmentDate: string;
  @IsOptional() @IsString() reason?: string;
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus) status: AppointmentStatus;
  @IsOptional() @IsString() notes?: string;
}

// ── Medical Record ────────────────────────────────────────────────────────────
export class CreateMedicalRecordDto {
  @IsUUID('4') appointmentId: string;
  @IsUUID('4') patientId: string;
  // These will be encrypted before storage
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsString() treatmentNotes?: string;
  @IsOptional() @IsString() prescriptionNotes?: string;
  @IsOptional() @IsDateString() followUpDate?: string;
}

// ── Drug Inventory ────────────────────────────────────────────────────────────
export class CreateDrugDto {
  @IsString() @Length(1, 200) name: string;
  @IsOptional() @IsString() @Length(1, 200) genericName?: string;
  @IsEnum(DrugForm) form: DrugForm;
  @IsString() @Length(1, 20) unit: string;
  @IsInt() @Min(0) stockQuantity: number;
  @IsOptional() @IsInt() @Min(1) reorderLevel?: number;
  @IsString() unitCost: string;   // Decimal as string to avoid float precision
}

export class AdjustStockDto {
  @IsInt() @Min(1) quantity: number;
  @IsEnum(['ADD', 'SUBTRACT']) operation: 'ADD' | 'SUBTRACT';
  @IsOptional() @IsString() reason?: string;
}

// ── Prescription ──────────────────────────────────────────────────────────────
export class CreatePrescriptionDto {
  @IsUUID('4') medicalRecordId: string;
  @IsUUID('4') patientId: string;
  @IsUUID('4') drugId: string;
  // Dosage instructions will be encrypted before storage
  @IsString() @Length(1, 500) dosageInstructions: string;
  @IsInt() @Min(1) @Max(9999) quantity: number;
}

export class DispensePrescriptionDto {
  @IsUUID('4') prescriptionId: string;
}

// ── Query DTOs ────────────────────────────────────────────────────────────────
export class GetAppointmentsQueryDto {
  @IsOptional() @IsUUID('4') patientId?: string;
  @IsOptional() @IsUUID('4') doctorUserId?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsString() date?: string;    // YYYY-MM-DD
  @IsOptional() @IsInt() @Min(1)  page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class LowStockQueryDto {
  @IsOptional() @IsInt() @Min(1) threshold?: number;
}
