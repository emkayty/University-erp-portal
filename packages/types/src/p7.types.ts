import type { BaseEntity } from './common';

// ── Library ───────────────────────────────────────────────────────────────────
export type LibraryCategory = 'TEXTBOOK'|'REFERENCE'|'JOURNAL'|'THESIS'|'NOVEL'|'PERIODICAL'|'MULTIMEDIA'|'OTHER';
export type LoanStatus = 'ACTIVE'|'RETURNED'|'OVERDUE'|'LOST';

export interface LibraryItemV1 extends BaseEntity {
  accessionNo: string; title: string; author: string|null; isbn: string|null;
  publisher: string|null; publishYear: number|null; edition: string|null;
  category: LibraryCategory; totalCopies: number; availableCopies: number;
  shelfLocation: string|null; isActive: boolean;
}

export interface LibraryLoanV1 extends BaseEntity {
  libraryItemId: string; userId: string; borrowedAt: string; dueDate: string;
  returnedAt: string|null; renewalCount: number; fineAmount: string; finePaid: boolean;
  status: LoanStatus;
  libraryItem?: { title: string; author: string|null; accessionNo: string };
}

// ── Hostel ────────────────────────────────────────────────────────────────────
export type RoomType = 'STANDARD'|'ENSUITE'|'STUDIO'|'ACCESSIBLE';
export type AllocationStatus = 'ACTIVE'|'VACATED'|'TRANSFERRED'|'CANCELLED';

export interface HostelBlockV1 extends BaseEntity {
  name: string; gender: string; totalRooms: number; isActive: boolean;
  _count?: { rooms: number };
}

export interface RoomV1 extends BaseEntity {
  hostelBlockId: string; roomNumber: string; capacity: number;
  currentOccupancy: number; roomType: RoomType; isActive: boolean;
}

export interface RoomAllocationV1 extends BaseEntity {
  roomId: string; studentId: string; academicYear: string;
  startDate: string; endDate: string|null; status: AllocationStatus; allocatedById: string;
  room?: { roomNumber: string; hostelBlock: { name: string } };
}

// ── LMS ───────────────────────────────────────────────────────────────────────
export type ContentType = 'SLIDE'|'VIDEO'|'DOCUMENT'|'LINK'|'ASSIGNMENT'|'QUIZ'|'RECORDING';

export interface CourseContentV1 extends BaseEntity {
  courseOfferingId: string; title: string; contentType: ContentType;
  url: string|null; body: string|null; orderIndex: number;
  isPublished: boolean; publishedAt: string|null; uploadedById: string;
}

export interface CourseAnnouncementV1 extends BaseEntity {
  courseOfferingId: string; title: string; body: string;
  isPublished: boolean; postedById: string;
}

export interface LtiConfigV1 extends BaseEntity {
  platformName: string; issuer: string; authLoginUrl: string;
  authTokenUrl: string; jwksUrl: string; clientId: string;
  deploymentId: string; isActive: boolean;
}
