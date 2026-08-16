import type { BaseEntity } from './common';

// ── Clinic ────────────────────────────────────────────────────────────────────
export type DrugForm         = 'TABLET'|'CAPSULE'|'SYRUP'|'INJECTION'|'CREAM'|'INHALER'|'DROPS'|'OTHER';
export type AppointmentStatus = 'SCHEDULED'|'COMPLETED'|'CANCELLED'|'NO_SHOW';

export interface PatientV1 extends BaseEntity {
  userId: string;
  bloodGroup: string|null;
  genotype: string|null;
  allergies: string|null;
  chronicConditions: string|null;
  emergencyContactName: string|null;
  emergencyContactPhone: string|null;
  isActive: boolean;
}

export interface AppointmentV1 extends BaseEntity {
  patientId: string;
  doctorUserId: string;
  appointmentDate: string;
  reason: string|null;
  status: AppointmentStatus;
  notes: string|null;
  patient?: { userId: string; bloodGroup: string|null; allergies: string|null };
}

export interface MedicalRecordV1 extends BaseEntity {
  appointmentId: string;
  patientId: string;
  /** Returned decrypted by API — stored AES-256-GCM encrypted in DB */
  diagnosis: string|null;
  treatmentNotes: string|null;
  prescriptionNotes: string|null;
  followUpDate: string|null;
  createdById: string;
}

export interface DrugV1 extends BaseEntity {
  name: string;
  genericName: string|null;
  form: DrugForm;
  unit: string;
  stockQuantity: number;
  reorderLevel: number;
  unitCost: string;
  isActive: boolean;
}

export interface PrescriptionV1 extends BaseEntity {
  medicalRecordId: string;
  patientId: string;
  drugId: string;
  /** Returned decrypted by API */
  dosageInstructions: string;
  quantity: number;
  dispensedAt: string|null;
  dispensedById: string|null;
  drug?: { name: string; form: DrugForm; unit: string };
}

// ── Transport ─────────────────────────────────────────────────────────────────
export type VehicleType   = 'BUS'|'MINIBUS'|'CAR'|'VAN'|'AMBULANCE'|'OTHER';
export type VehicleStatus = 'AVAILABLE'|'IN_USE'|'MAINTENANCE'|'DECOMMISSIONED';
export type TripStatus    = 'SCHEDULED'|'DEPARTED'|'ARRIVED'|'CANCELLED';
export type BookingStatus = 'CONFIRMED'|'CANCELLED'|'NO_SHOW';

export interface VehicleV1 extends BaseEntity {
  registrationNo: string; make: string; model: string; year: number;
  capacity: number; vehicleType: VehicleType; status: VehicleStatus;
  lastServiceDate: string|null; nextServiceDate: string|null; isActive: boolean;
  _count?: { trips: number };
}

export interface TransportRouteV1 extends BaseEntity {
  name: string; origin: string; destination: string;
  stops: string[]; distanceKm: string|null; estimatedMinutes: number|null;
  fareAmount: string; isActive: boolean;
}

export interface TripV1 extends BaseEntity {
  vehicleId: string; routeId: string; driverUserId: string;
  departureTime: string; arrivalTime: string|null; status: TripStatus;
  availableSeats: number; notes: string|null; createdById: string;
  vehicle?: { registrationNo: string; make: string; model: string; capacity: number };
  route?:   { name: string; origin: string; destination: string; fareAmount: string };
  _count?:  { bookings: number };
}

export interface TripBookingV1 extends BaseEntity {
  tripId: string; userId: string; seatNumber: number|null;
  status: BookingStatus; bookedAt: string; cancelledAt: string|null;
  trip?: TripV1; fare?: string;
}

// ── Research ──────────────────────────────────────────────────────────────────
export type ResearchStatus = 'PENDING'|'ETHICS_REVIEW'|'ACTIVE'|'COMPLETED'|'SUSPENDED'|'CANCELLED';
export type MemberRole     = 'LEAD'|'CO_RESEARCHER'|'RESEARCH_ASSISTANT'|'CONSULTANT';
export type GrantStatus    = 'ACTIVE'|'EXHAUSTED'|'CLOSED';
export type OutputType     = 'JOURNAL_ARTICLE'|'CONFERENCE_PAPER'|'BOOK'|'BOOK_CHAPTER'|'PATENT'|'REPORT'|'THESIS'|'DATASET'|'OTHER';

export interface ResearchProjectV1 extends BaseEntity {
  title: string; abstract: string; leadResearcherId: string; department: string;
  status: ResearchStatus; ethicsApprovalRef: string|null; ethicsApprovedAt: string|null;
  startDate: string|null; endDate: string|null; budget: string; budgetSpent: string;
  keywords: string[];
  members?: { userId: string; role: MemberRole }[];
  grants?: GrantV1[];
  outputs?: ResearchOutputV1[];
  _count?:  { grants: number; outputs: number };
}

export interface GrantV1 extends BaseEntity {
  projectId: string; funder: string; grantRef: string|null;
  amount: string; currency: string; startDate: string; endDate: string;
  status: GrantStatus;
  expenditures?: GrantExpenditureV1[];
}

export interface GrantExpenditureV1 extends BaseEntity {
  grantId: string; description: string; amount: string;
  receiptRef: string|null; expendedAt: string; recordedById: string;
}

export interface ResearchOutputV1 extends BaseEntity {
  projectId: string; outputType: OutputType; title: string;
  authors: string[]; publishedIn: string|null; publishDate: string|null;
  doi: string|null; url: string|null; abstract: string|null; createdById: string;
}

export interface ResearchSummaryV1 {
  totalProjects: number;
  byStatus: { status: ResearchStatus; count: number }[];
  totalGrants: number;
  totalGrantAmount: string;
  totalOutputs: number;
}

// ── Alumni ────────────────────────────────────────────────────────────────────
export type CampaignStatus = 'DRAFT'|'ACTIVE'|'COMPLETED'|'CANCELLED';
export type DonationStatus = 'PENDING'|'COMPLETED'|'FAILED'|'REFUNDED';

export interface AlumniV1 extends BaseEntity {
  studentId: string; graduationYear: number; programme: string;
  classAwarded: string; cgpaAtGrad: string;
  occupation: string|null; employer: string|null; industry: string|null;
  linkedinUrl: string|null; currentCountry: string|null; currentCity: string|null;
  bio: string|null; isProfilePublic: boolean;
}

export interface CampaignV1 extends BaseEntity {
  title: string; description: string; targetAmount: string;
  raisedAmount: string; currency: string; startDate: string;
  endDate: string|null; status: CampaignStatus; imageUrl: string|null;
  _count?: { donations: number };
  donations?: DonationV1[];
}

export interface DonationV1 extends BaseEntity {
  campaignId: string; alumniId: string|null; amount: string; currency: string;
  isAnonymous: boolean;
  /** Null when isAnonymous=true on public-facing views */
  donorName: string|null;
  message: string|null; status: DonationStatus;
  campaign?: { title: string };
}
