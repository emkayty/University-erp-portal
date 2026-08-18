import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AppointmentStatus, Prisma } from '@prisma/client';
import { decryptPii, encryptPii, maskPiiFields } from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  AdjustStockDto, BookAppointmentDto, CreateDrugDto, CreateMedicalRecordDto,
  CreatePrescriptionDto, GetAppointmentsQueryDto, RegisterPatientDto,
  UpdateAppointmentStatusDto, UpdatePatientDto,
} from './dto/clinic.dto';

/** Low-stock alert threshold default (overridden per-drug by Drug.reorderLevel) */
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class ClinicService {
  private readonly logger = new Logger(ClinicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private decryptSensitive(value: string | null): string | null {
    if (!value) return value;
    try {
      return decryptPii(value);
    } catch {
      // Legacy plaintext rows remain readable during the migration window.
      return value;
    }
  }

  private patientResponse<T extends { genotype: string | null; allergies: string | null; chronicConditions: string | null }>(patient: T): T {
    return {
      ...patient,
      genotype: this.decryptSensitive(patient.genotype),
      allergies: this.decryptSensitive(patient.allergies),
      chronicConditions: this.decryptSensitive(patient.chronicConditions),
    };
  }

  // ── Patient Registration ──────────────────────────────────────────────────

  async registerPatient(dto: RegisterPatientDto, actorId: string) {
    const existing = await this.prisma.patient.findUnique({ where: { userId: dto.userId } });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Patient already registered for this user' });

    const patient = await this.prisma.patient.create({
      data: {
        userId:                 dto.userId,
        bloodGroup:             dto.bloodGroup ?? null,
        genotype:               dto.genotype ? encryptPii(dto.genotype) : null,
        allergies:              dto.allergies ? encryptPii(dto.allergies) : null,
        chronicConditions:      dto.chronicConditions ? encryptPii(dto.chronicConditions) : null,
        emergencyContactName:   dto.emergencyContactName ?? null,
        emergencyContactPhone:  dto.emergencyContactPhone ?? null,
      },
    });

    await this.audit.log({
      action:      AuditAction.CREATE,
      targetTable: 'patients',
      targetId:    patient.id,
      newValues:   { userId: dto.userId },
    }, actorId);

    return this.patientResponse(patient);
  }

  /**
   * Deep-audit fix (Aug 2026): patient-facing reads/writes must be
   * restricted to the patient themself or clinic staff. Previously
   * documented only in a comment on getPatientMedicalHistory() ("Allow:
   * the patient's own userId... or clinic staff") but never actually
   * enforced anywhere — getPatientById(), updatePatient(), and
   * getPatientMedicalHistory() all executed unconditionally for any
   * caller the controller-level @Roles() list let through, which for
   * getPatientMedicalHistory() specifically was every authenticated user
   * (no @Roles() decorator existed on that route at all). Mirrors the
   * self-or-DPO pattern already used in privacy.controller.ts.
   */
  private assertSelfOrClinicStaff(
    patientUserId: string,
    requestingUser: { sub: string; role: string },
  ): void {
    if (requestingUser.role === 'SUPER_ADMIN' || requestingUser.role === 'STAFF') return;
    if (requestingUser.sub === patientUserId) return;
    throw new ForbiddenException({
      code: 'RBAC_FORBIDDEN',
      message: 'You may only access your own clinic records',
    });
  }

  async updatePatient(
    patientId: string,
    dto: UpdatePatientDto,
    requestingUser: { sub: string; role: string },
  ) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    this.assertSelfOrClinicStaff(patient.userId, requestingUser);

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        bloodGroup:            dto.bloodGroup ?? patient.bloodGroup,
        genotype:              dto.genotype !== undefined ? encryptPii(dto.genotype) : patient.genotype,
        allergies:             dto.allergies !== undefined ? encryptPii(dto.allergies) : patient.allergies,
        chronicConditions:     dto.chronicConditions !== undefined ? encryptPii(dto.chronicConditions) : patient.chronicConditions,
        emergencyContactName:  dto.emergencyContactName ?? patient.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone ?? patient.emergencyContactPhone,
      },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'patients', targetId: patientId,
      // maskPiiFields() alone previously left allergies/chronicConditions
      // unmasked in the audit trail — its field-name list didn't match
      // these columns (see packages/utils/src/encryption.ts fix) AND these
      // two columns are stored as plaintext (unlike diagnosis/treatment
      // notes, which are pre-encrypted before this point). Both gaps are
      // now fixed, but belt-and-braces: still redact explicitly here too,
      // matching how createMedicalRecord()/createPrescription() already
      // hardcode '[ENCRYPTED]' below rather than relying solely on the
      // generic masker.
      newValues: maskPiiFields({ ...dto, allergies: dto.allergies !== undefined ? '[REDACTED]' : undefined,
        chronicConditions: dto.chronicConditions !== undefined ? '[REDACTED]' : undefined }),
    }, requestingUser.sub);

    return this.patientResponse(updated);
  }

  async getPatientByUserId(userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    return patient ? this.patientResponse(patient) : null;
  }

  async getPatients(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [patients, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        skip, take: pageSize,
        // Sensitive health fields are encrypted and intentionally excluded from list responses.
        select: { id: true, userId: true, bloodGroup: true, emergencyContactName: true, emergencyContactPhone: true, isActive: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.patient.count({ where: { isActive: true } }),
    ]);
    return { patients, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPatientById(patientId: string, requestingUser: { sub: string; role: string }) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    this.assertSelfOrClinicStaff(patient.userId, requestingUser);
    return this.patientResponse(patient);
  }

  // ── Appointments ──────────────────────────────────────────────────────────

  async bookAppointment(dto: BookAppointmentDto, requestingUser: { sub: string; role: string }) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: dto.patientId } });
    this.assertSelfOrClinicStaff(patient.userId, requestingUser);

    const apptDate = new Date(dto.appointmentDate);
    if (apptDate <= new Date()) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Appointment date must be in the future' });
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId:       dto.patientId,
        doctorUserId:    dto.doctorUserId,
        appointmentDate: apptDate,
        reason:          dto.reason ?? null,
        status:          AppointmentStatus.SCHEDULED,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'appointments', targetId: appointment.id,
      newValues: { patientId: dto.patientId, doctorUserId: dto.doctorUserId, date: dto.appointmentDate },
    }, requestingUser.sub);

    return appointment;
  }

  async updateAppointmentStatus(apptId: string, dto: UpdateAppointmentStatusDto, actorId: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });

    if (appt.status === AppointmentStatus.CANCELLED) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Cannot update a cancelled appointment' });
    }

    const updated = await this.prisma.appointment.update({
      where: { id: apptId },
      data:  { status: dto.status, notes: dto.notes ?? null },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'appointments', targetId: apptId,
      oldValues: { status: appt.status }, newValues: { status: dto.status },
    }, actorId);

    return updated;
  }

  async getAppointments(
    query: GetAppointmentsQueryDto,
    requestingUser?: { sub: string; role: string },
  ) {
    const { patientId, doctorUserId, status, date, page = 1, pageSize = 20 } = query;
    const where: Record<string, unknown> = {};

    if (requestingUser?.role === 'STUDENT') {
      const ownPatient = await this.prisma.patient.findUnique({
        where: { userId: requestingUser.sub },
        select: { id: true },
      });
      if (!ownPatient) {
        return { appointments: [], total: 0, page, pageSize, totalPages: 0 };
      }
      // Never trust a student-supplied patientId: force the authenticated
      // student’s own patient scope at the service boundary.
      where['patientId'] = ownPatient.id;
    } else if (patientId) {
      where['patientId'] = patientId;
    }

    if (doctorUserId) where['doctorUserId'] = doctorUserId;
    if (status)       where['status']       = status;
    if (date) {
      const d = new Date(date);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      where['appointmentDate'] = { gte: d, lt: next };
    }

    const [appointments, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where: where as Prisma.AppointmentWhereInput,
        orderBy: { appointmentDate: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
        // Patient profile info (NON-medical) included — no decryption needed
        include: { patient: { select: { userId: true, bloodGroup: true } } },
      }),
      this.prisma.appointment.count({
        where: where as Prisma.AppointmentWhereInput,
      }),
    ]);

    return { appointments, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getAppointmentById(apptId: string) {
    return this.prisma.appointment.findUniqueOrThrow({
      where: { id: apptId },
      include: { patient: true, medicalRecords: true },
    });
  }

  // ── Medical Records (ENCRYPTED at service layer) ──────────────────────────

  /**
   * Creates a medical record with AES-256-GCM encryption on sensitive fields.
   * Only a doctor (staff with 'health' scope) may create records.
   * The actorId MUST match appointment.doctorUserId for access control.
   */
  async createMedicalRecord(dto: CreateMedicalRecordDto, actorId: string) {
    // Verify appointment exists and actor is the assigned doctor
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: dto.appointmentId },
    });

    if (appt.doctorUserId !== actorId) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: 'Only the assigned doctor may create a medical record for this appointment',
      });
    }

    if (appt.patientId !== dto.patientId) {
      throw new BadRequestException({ code: 'MEDICAL_RECORD_PATIENT_MISMATCH', message: 'The medical record patient must match the appointment patient.' });
    }

    if (appt.status !== AppointmentStatus.COMPLETED && appt.status !== AppointmentStatus.SCHEDULED) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: 'Medical records can only be created for active or completed appointments',
      });
    }

    // Check for existing record for this appointment
    const existing = await this.prisma.medicalRecord.findUnique({
      where: { appointmentId: dto.appointmentId },
    });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Medical record already exists for this appointment' });

    // ⚠ ENCRYPT sensitive fields before DB insert
    const record = await this.prisma.medicalRecord.create({
      data: {
        appointmentId:     dto.appointmentId,
        patientId:         dto.patientId,
        diagnosis:         dto.diagnosis    ? encryptPii(dto.diagnosis)         : null,
        treatmentNotes:    dto.treatmentNotes    ? encryptPii(dto.treatmentNotes)    : null,
        prescriptionNotes: dto.prescriptionNotes ? encryptPii(dto.prescriptionNotes) : null,
        followUpDate:      dto.followUpDate ? new Date(dto.followUpDate) : null,
        createdById:       actorId,
      },
    });

    // Auto-mark appointment as COMPLETED when record is created
    await this.prisma.appointment.update({
      where: { id: dto.appointmentId },
      data:  { status: AppointmentStatus.COMPLETED },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'medical_records', targetId: record.id,
      // ⚠ PII fields MUST NOT appear in audit log — use placeholder
      newValues: { appointmentId: dto.appointmentId, patientId: dto.patientId, diagnosis: '[ENCRYPTED]' },
    }, actorId);

    this.logger.log(`Medical record created for appointment ${dto.appointmentId} by doctor ${actorId}`);
    return { id: record.id, appointmentId: record.appointmentId, createdAt: record.createdAt };
  }

  /**
   * Retrieves a medical record and decrypts sensitive fields.
   * Access restricted: only assigned doctor OR the patient themselves.
   * This must be enforced at controller layer (JWT claims) AND here.
   */
  async getMedicalRecord(recordId: string, requestingUser: { sub: string; role: string }) {
    const record = await this.prisma.medicalRecord.findUniqueOrThrow({
      where: { id: recordId },
      include: { appointment: { select: { doctorUserId: true } }, patient: { select: { userId: true } } },
    });

    const isDoctor  = record.appointment.doctorUserId === requestingUser.sub;
    const isPatient = record.patient.userId === requestingUser.sub;
    if (!isDoctor && !isPatient) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Access denied to this medical record' });
    }

    // ⚠ DECRYPT sensitive fields at read time
    return {
      id:                record.id,
      appointmentId:     record.appointmentId,
      patientId:         record.patientId,
      diagnosis:         record.diagnosis    ? decryptPii(record.diagnosis)         : null,
      treatmentNotes:    record.treatmentNotes    ? decryptPii(record.treatmentNotes)    : null,
      prescriptionNotes: record.prescriptionNotes ? decryptPii(record.prescriptionNotes) : null,
      followUpDate:      record.followUpDate,
      createdById:       record.createdById,
      createdAt:         record.createdAt,
    };
  }

  async getPatientMedicalHistory(
    patientId: string,
    requestingUser: { sub: string; role: string },
  ) {
    // Allow: the patient's own userId (patient accessing own records),
    // or clinic staff (doctorUserId will be checked per-record if decrypted)
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    this.assertSelfOrClinicStaff(patient.userId, requestingUser);

    const records = await this.prisma.medicalRecord.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, appointmentId: true, patientId: true,
        followUpDate: true, createdById: true, createdAt: true,
        // Do NOT include encrypted fields in list view — fetch individually for read
      },
    });
    return records;
  }

  // ── Drug Inventory ────────────────────────────────────────────────────────

  async createDrug(dto: CreateDrugDto, actorId: string) {
    const drug = await this.prisma.drug.create({
      data: {
        name:          dto.name,
        genericName:   dto.genericName ?? null,
        form:          dto.form,
        unit:          dto.unit,
        stockQuantity: dto.stockQuantity,
        reorderLevel:  dto.reorderLevel ?? DEFAULT_LOW_STOCK_THRESHOLD,
        unitCost:      dto.unitCost,
        isActive:      true,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'drugs', targetId: drug.id,
      newValues: { name: dto.name, stockQuantity: dto.stockQuantity },
    }, actorId);

    return drug;
  }

  async adjustStock(drugId: string, dto: AdjustStockDto, actorId: string) {
    const drug = await this.prisma.drug.findUniqueOrThrow({ where: { id: drugId } });

    const newQty = dto.operation === 'ADD'
      ? drug.stockQuantity + dto.quantity
      : drug.stockQuantity - dto.quantity;

    if (newQty < 0) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Insufficient drug stock' });
    }

    const updated = await this.prisma.drug.update({
      where: { id: drugId },
      data:  { stockQuantity: newQty },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'drugs', targetId: drugId,
      oldValues: { stockQuantity: drug.stockQuantity },
      newValues:  { stockQuantity: newQty, operation: dto.operation, reason: dto.reason },
    }, actorId);

    // Low-stock alert (emitted as log warning — P9 adds BullMQ notification)
    if (newQty <= drug.reorderLevel) {
      this.logger.warn(`LOW STOCK ALERT: Drug "${drug.name}" (${drug.id}) has ${newQty} units remaining (reorder level: ${drug.reorderLevel})`);
    }

    return updated;
  }

  async getDrugs(page = 1, pageSize = 50) {
    const [drugs, total] = await this.prisma.$transaction([
      this.prisma.drug.findMany({
        where: { isActive: true }, orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.drug.count({ where: { isActive: true } }),
    ]);
    return { drugs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getLowStockDrugs(threshold?: number) {
    // Return drugs at or below their own reorderLevel (or provided threshold)
    const drugs = await this.prisma.drug.findMany({
      where: {
        isActive: true,
        ...(threshold !== undefined
          ? { stockQuantity: { lte: threshold } }
          : undefined),
      },
      orderBy: { stockQuantity: 'asc' },
    });

    // If no custom threshold, filter by each drug's own reorderLevel
    if (threshold === undefined) {
      return drugs.filter((d) => d.stockQuantity <= d.reorderLevel);
    }

    return drugs;
  }

  // ── Prescriptions ─────────────────────────────────────────────────────────

  async createPrescription(dto: CreatePrescriptionDto, actorId: string) {
    // Verify drug exists and has stock
    const drug = await this.prisma.drug.findUniqueOrThrow({ where: { id: dto.drugId } });
    if (drug.stockQuantity < dto.quantity) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Insufficient stock for ${drug.name}. Available: ${drug.stockQuantity}, requested: ${dto.quantity}`,
      });
    }

    // Verify medical record exists and actor is the creator (doctor)
    const record = await this.prisma.medicalRecord.findUniqueOrThrow({ where: { id: dto.medicalRecordId } });
    if (record.createdById !== actorId) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the attending doctor may prescribe medication' });
    }
    if (record.patientId !== dto.patientId) {
      throw new BadRequestException({ code: 'PRESCRIPTION_PATIENT_MISMATCH', message: 'The prescription patient must match the medical record patient.' });
    }

    const prescription = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM drugs WHERE id = ${dto.drugId} FOR UPDATE`;
      const lockedDrug = await tx.drug.findUniqueOrThrow({ where: { id: dto.drugId } });
      if (lockedDrug.stockQuantity < dto.quantity) {
        throw new UnprocessableEntityException({ code: 'INSUFFICIENT_STOCK', message: `Insufficient stock for ${lockedDrug.name}. Available: ${lockedDrug.stockQuantity}, requested: ${dto.quantity}` });
      }
      const p = await tx.prescription.create({
        data: {
          medicalRecordId:     dto.medicalRecordId,
          patientId:           dto.patientId,
          drugId:              dto.drugId,
          // ⚠ ENCRYPT dosage instructions
          dosageInstructions:  encryptPii(dto.dosageInstructions),
          quantity:            dto.quantity,
          dispensedAt:         new Date(),
          dispensedById:       actorId,
        },
      });

      // Decrement stock atomically
      await tx.drug.update({
        where: { id: dto.drugId },
        data:  { stockQuantity: { decrement: dto.quantity } },
      });

      return p;
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'prescriptions', targetId: prescription.id,
      newValues: { drugId: dto.drugId, quantity: dto.quantity, dosageInstructions: '[ENCRYPTED]' },
    }, actorId);

    // Low-stock alert after dispensing
    const updatedDrug = await this.prisma.drug.findUnique({ where: { id: dto.drugId } });
    if (updatedDrug && updatedDrug.stockQuantity <= updatedDrug.reorderLevel) {
      this.logger.warn(`LOW STOCK ALERT: Drug "${drug.name}" now has ${updatedDrug.stockQuantity} units after dispensing`);
    }

    return { id: prescription.id, dispensedAt: prescription.dispensedAt };
  }

  async getPatientPrescriptions(patientId: string, requestingUser: { sub: string; role: string }) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    this.assertSelfOrClinicStaff(patient.userId, requestingUser);
    const prescriptions = await this.prisma.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { drug: { select: { name: true, form: true, unit: true } } },
    });

    // Decrypt dosage instructions for patient view
    return prescriptions.map((p) => ({
      ...p,
      dosageInstructions: decryptPii(p.dosageInstructions),
    }));
  }
}
