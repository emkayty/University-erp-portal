import {
  Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe,
  Patch, Post, Query, DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { CurrentUser, FeatureFlag, Roles, StaffScopes } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '@uniportal/types';
import { ClinicService } from './clinic.service';
import type {
  AdjustStockDto, BookAppointmentDto, CreateDrugDto, CreateMedicalRecordDto,
  CreatePrescriptionDto, GetAppointmentsQueryDto, RegisterPatientDto,
  UpdateAppointmentStatusDto, UpdatePatientDto,
} from './dto/clinic.dto';

@FeatureFlag('module_health')
@UseGuards(RolesGuard)
@Controller({ path: 'clinic', version: '1' })
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  // ── Patients ──────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/clinic/patients
   * Register a student or staff member as a patient.
   * Auth: staff with health scope.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Post('patients')
  register(@Body() dto: RegisterPatientDto, @CurrentUser() user: JwtPayload) {
    return this.clinic.registerPatient(dto, user.sub);
  }

  /**
   * GET /api/v1/clinic/patients
   * List all patients (clinic staff only).
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('patients')
  listPatients(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.clinic.getPatients(page, pageSize);
  }

  /**
   * GET /api/v1/clinic/patients/me
   * Get the current user's patient profile.
   */
  @Get('patients/me')
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.clinic.getPatientByUserId(user.sub);
  }

  /**
   * GET /api/v1/clinic/patients/:id
   * Get patient profile (non-sensitive). Clinic staff or the patient themselves.
   */
  @Roles('STAFF', 'STUDENT', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('patients/:id')
  getPatient(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinic.getPatientById(id, user);
  }

  /**
   * PATCH /api/v1/clinic/patients/:id
   * Update patient profile fields (non-medical). Health staff or the patient.
   */
  @Roles('STAFF', 'STUDENT', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Patch('patients/:id')
  updatePatient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinic.updatePatient(id, dto, user);
  }

  // ── Appointments ──────────────────────────────────────────────────────────

  /**
   * POST /api/v1/clinic/appointments
   * Book an appointment. Any authenticated user (student or staff) can book.
   */
  @Post('appointments')
  bookAppointment(@Body() dto: BookAppointmentDto, @CurrentUser() user: JwtPayload) {
    return this.clinic.bookAppointment(dto, user);
  }

  /**
   * GET /api/v1/clinic/appointments
   * Query appointments. Health staff see all; patients filter by own patientId.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('appointments')
  getAppointments(@Query() query: GetAppointmentsQueryDto) {
    return this.clinic.getAppointments(query);
  }

  /**
   * GET /api/v1/clinic/appointments/:id
   * Get single appointment with patient summary.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('appointments/:id')
  getAppointment(@Param('id', ParseUUIDPipe) id: string) {
    return this.clinic.getAppointmentById(id);
  }

  /**
   * PATCH /api/v1/clinic/appointments/:id/status
   * Update appointment status (COMPLETED, CANCELLED, NO_SHOW).
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Patch('appointments/:id/status')
  updateAppointmentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinic.updateAppointmentStatus(id, dto, user.sub);
  }

  // ── Medical Records (ENCRYPTED) ───────────────────────────────────────────

  /**
   * POST /api/v1/clinic/records
   * Create a medical record (encrypted). Only the assigned doctor.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Post('records')
  createRecord(@Body() dto: CreateMedicalRecordDto, @CurrentUser() user: JwtPayload) {
    return this.clinic.createMedicalRecord(dto, user.sub);
  }

  /**
   * GET /api/v1/clinic/records/:id
   * Get a single medical record (decrypted). Assigned doctor OR patient only.
   */
  @StaffScopes('health')
  @Get('records/:id')
  getRecord(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinic.getMedicalRecord(id, user);
  }

  /**
   * GET /api/v1/clinic/patients/:id/history
   * Get medical record list for a patient (metadata only, no encrypted content).
   * Deep-audit fix (Aug 2026): this route previously had no @Roles()
   * decorator at all — any authenticated user could pull any patient's
   * visit metadata. Now scoped the same as the sibling patient-profile
   * routes, with the actual self-or-staff check enforced in
   * ClinicService.getPatientMedicalHistory() via assertSelfOrClinicStaff().
   */
  @Roles('STAFF', 'STUDENT', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('patients/:id/history')
  getHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinic.getPatientMedicalHistory(id, user);
  }

  // ── Drug Inventory ────────────────────────────────────────────────────────

  /**
   * POST /api/v1/clinic/drugs
   * Add a new drug to the inventory.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Post('drugs')
  createDrug(@Body() dto: CreateDrugDto, @CurrentUser() user: JwtPayload) {
    return this.clinic.createDrug(dto, user.sub);
  }

  /**
   * GET /api/v1/clinic/drugs
   * List all active drugs with stock levels.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('drugs')
  getDrugs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.clinic.getDrugs(page, pageSize);
  }

  /**
   * GET /api/v1/clinic/drugs/low-stock
   * List drugs at or below reorder level.
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Get('drugs/low-stock')
  getLowStock(@Query('threshold') threshold?: string) {
    return this.clinic.getLowStockDrugs(threshold ? parseInt(threshold, 10) : undefined);
  }

  /**
   * PATCH /api/v1/clinic/drugs/:id/stock
   * Adjust drug stock (receive new supply or write-off).
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Patch('drugs/:id/stock')
  adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clinic.adjustStock(id, dto, user.sub);
  }

  // ── Prescriptions ─────────────────────────────────────────────────────────

  /**
   * POST /api/v1/clinic/prescriptions
   * Create and dispense a prescription (decrements drug stock).
   */
  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('health')
  @Post('prescriptions')
  createPrescription(@Body() dto: CreatePrescriptionDto, @CurrentUser() user: JwtPayload) {
    return this.clinic.createPrescription(dto, user.sub);
  }

  /**
   * GET /api/v1/clinic/patients/:id/prescriptions
   * Get a patient's prescription history (dosage decrypted).
   */
  @StaffScopes('health')
  @Get('patients/:id/prescriptions')
  @Roles('STAFF','STUDENT','SUPER_ADMIN')
  getPatientPrescriptions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.clinic.getPatientPrescriptions(id, user);
  }
}
