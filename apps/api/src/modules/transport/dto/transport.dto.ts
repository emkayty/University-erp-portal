import {
  IsDateString, IsDecimal, IsEnum, IsInt, IsOptional, IsString,
  IsUUID, Length, Max, Min,
} from 'class-validator';
import { VehicleType, VehicleStatus, TripStatus } from '@prisma/client';

// ── Vehicle ───────────────────────────────────────────────────────────────────
export class CreateVehicleDto {
  @IsString() @Length(3, 20)    registrationNo: string;
  @IsString() @Length(1, 100)   make: string;
  @IsString() @Length(1, 100)   model: string;
  @IsInt() @Min(1900) @Max(2100) year: number;
  @IsInt() @Min(1) @Max(200)    capacity: number;
  @IsEnum(VehicleType)          vehicleType: VehicleType;
  @IsOptional() @IsDateString() lastServiceDate?: string;
  @IsOptional() @IsDateString() nextServiceDate?: string;
}

export class UpdateVehicleStatusDto {
  @IsEnum(VehicleStatus) status: VehicleStatus;
  @IsOptional() @IsString() notes?: string;
}

// ── Route ─────────────────────────────────────────────────────────────────────
export class CreateRouteDto {
  @IsString() @Length(1, 200) name: string;
  @IsString() @Length(1, 200) origin: string;
  @IsString() @Length(1, 200) destination: string;
  @IsOptional() stops?: string[];    // array of stop names
  @IsOptional() @IsDecimal()  distanceKm?: string;
  @IsOptional() @IsInt() @Min(1) estimatedMinutes?: number;
  @IsDecimal()  fareAmount: string;  // NGN Decimal as string
}

export class UpdateRouteDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsDecimal() fareAmount?: string;
  @IsOptional() @IsDecimal() distanceKm?: string;
  @IsOptional() @IsInt() @Min(1) estimatedMinutes?: number;
  @IsOptional() stops?: string[];
}

// ── Trip ──────────────────────────────────────────────────────────────────────
export class CreateTripDto {
  @IsUUID('4')       vehicleId: string;
  @IsUUID('4')       routeId: string;
  @IsUUID('4')       driverUserId: string;
  @IsDateString()    departureTime: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTripStatusDto {
  @IsEnum(TripStatus) status: TripStatus;
  @IsOptional() @IsDateString() arrivalTime?: string;
}

// ── Booking ───────────────────────────────────────────────────────────────────
export class BookTripDto {
  @IsUUID('4') tripId: string;
  @IsOptional() @IsInt() @Min(1) seatNumber?: number;
}

// ── Query ─────────────────────────────────────────────────────────────────────
export class GetTripsQueryDto {
  @IsOptional() @IsUUID('4') routeId?: string;
  @IsOptional() @IsString()  date?: string;    // YYYY-MM-DD
  @IsOptional() @IsEnum(TripStatus) status?: TripStatus;
  @IsOptional() @IsInt() @Min(1)  page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
