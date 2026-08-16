import {
  BadRequestException, ConflictException, Injectable, Logger,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, BookingStatus, Prisma, TripStatus, VehicleStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  BookTripDto, CreateRouteDto, CreateTripDto, CreateVehicleDto,
  GetTripsQueryDto, UpdateRouteDto, UpdateTripStatusDto, UpdateVehicleStatusDto,
} from './dto/transport.dto';

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Vehicles ──────────────────────────────────────────────────────────────

  async createVehicle(dto: CreateVehicleDto, actorId: string) {
    const existing = await this.prisma.vehicle.findUnique({
      where: { registrationNo: dto.registrationNo },
    });
    if (existing) {
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: `Vehicle ${dto.registrationNo} already registered` });
    }

    const vehicle = await this.prisma.vehicle.create({
      data: {
        registrationNo:  dto.registrationNo,
        make:            dto.make,
        model:           dto.model,
        year:            dto.year,
        capacity:        dto.capacity,
        vehicleType:     dto.vehicleType,
        status:          VehicleStatus.AVAILABLE,
        lastServiceDate: dto.lastServiceDate ? new Date(dto.lastServiceDate) : null,
        nextServiceDate: dto.nextServiceDate ? new Date(dto.nextServiceDate) : null,
        isActive:        true,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'vehicles', targetId: vehicle.id,
      newValues: { registrationNo: dto.registrationNo, capacity: dto.capacity },
    }, actorId);

    return vehicle;
  }

  async updateVehicleStatus(vehicleId: string, dto: UpdateVehicleStatusDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data:  { status: dto.status },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'vehicles', targetId: vehicleId,
      oldValues: { status: vehicle.status }, newValues: { status: dto.status, notes: dto.notes },
    }, actorId);

    return updated;
  }

  async getVehicles() {
    return this.prisma.vehicle.findMany({
      where: { isActive: true },
      orderBy: { registrationNo: 'asc' },
      include: { _count: { select: { trips: { where: { status: TripStatus.SCHEDULED } } } } },
    });
  }

  async getVehicleById(vehicleId: string) {
    return this.prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  async createRoute(dto: CreateRouteDto, actorId: string) {
    const route = await this.prisma.transportRoute.create({
      data: {
        name:              dto.name,
        origin:            dto.origin,
        destination:       dto.destination,
        stops:             dto.stops ?? [],
        distanceKm:        dto.distanceKm ?? null,
        estimatedMinutes:  dto.estimatedMinutes ?? null,
        fareAmount:        dto.fareAmount,
        isActive:          true,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'transport_routes', targetId: route.id,
      newValues: { name: dto.name, origin: dto.origin, destination: dto.destination },
    }, actorId);

    return route;
  }

  async updateRoute(routeId: string, dto: UpdateRouteDto, actorId: string) {
    const route = await this.prisma.transportRoute.findUniqueOrThrow({ where: { id: routeId } });

    const updated = await this.prisma.transportRoute.update({
      where: { id: routeId },
      data: {
        name:             dto.name             ?? route.name,
        fareAmount:       dto.fareAmount       ?? route.fareAmount,
        distanceKm:       dto.distanceKm       ?? route.distanceKm,
        estimatedMinutes: dto.estimatedMinutes ?? route.estimatedMinutes,
        stops:            (dto.stops ?? route.stops) as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'transport_routes', targetId: routeId,
      newValues: { ...dto },
    }, actorId);

    return updated;
  }

  async getRoutes() {
    return this.prisma.transportRoute.findMany({
      where:   { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  // ── Trips ─────────────────────────────────────────────────────────────────

  async createTrip(dto: CreateTripDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: dto.vehicleId } });

    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Vehicle ${vehicle.registrationNo} is not available (status: ${vehicle.status})`,
      });
    }

    const departureTime = new Date(dto.departureTime);
    if (departureTime <= new Date()) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Departure time must be in the future' });
    }

    // Prevent double-booking: vehicle cannot be assigned to two SCHEDULED trips at the same time
    const conflictingTrip = await this.prisma.trip.findFirst({
      where: {
        vehicleId: dto.vehicleId,
        status:    TripStatus.SCHEDULED,
        departureTime: {
          gte: new Date(departureTime.getTime() - 60 * 60 * 1000), // 1h buffer
          lte: new Date(departureTime.getTime() + 60 * 60 * 1000),
        },
      },
    });

    if (conflictingTrip) {
      throw new ConflictException({
        code: 'DUPLICATE_RESOURCE',
        message: 'Vehicle already assigned to a trip within 1 hour of the requested departure time',
      });
    }

    await this.prisma.transportRoute.findUniqueOrThrow({ where: { id: dto.routeId } });

    const trip = await this.prisma.trip.create({
      data: {
        vehicleId:      dto.vehicleId,
        routeId:        dto.routeId,
        driverUserId:   dto.driverUserId,
        departureTime:  departureTime,
        status:         TripStatus.SCHEDULED,
        availableSeats: vehicle.capacity,
        notes:          dto.notes ?? null,
        createdById:    actorId,
      },
      include: { vehicle: true, route: true },
    });

    // Mark vehicle as IN_USE
    await this.prisma.vehicle.update({
      where: { id: dto.vehicleId },
      data:  { status: VehicleStatus.IN_USE },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'trips', targetId: trip.id,
      newValues: { vehicleId: dto.vehicleId, routeId: dto.routeId, departureTime: dto.departureTime },
    }, actorId);

    return trip;
  }

  async updateTripStatus(tripId: string, dto: UpdateTripStatusDto, actorId: string) {
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });

    if (trip.status === TripStatus.CANCELLED || trip.status === TripStatus.ARRIVED) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Trip cannot transition from ${trip.status}`,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: tripId },
        data:  {
          status:      dto.status,
          arrivalTime: dto.arrivalTime ? new Date(dto.arrivalTime) : null,
        },
      });

      // Release vehicle when trip is ARRIVED or CANCELLED
      if (dto.status === TripStatus.ARRIVED || dto.status === TripStatus.CANCELLED) {
        await tx.vehicle.update({
          where: { id: trip.vehicleId },
          data:  { status: VehicleStatus.AVAILABLE },
        });
      }

      // Cancel all bookings if trip is cancelled
      if (dto.status === TripStatus.CANCELLED) {
        await tx.tripBooking.updateMany({
          where: { tripId, status: BookingStatus.CONFIRMED },
          data:  { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
        });
        this.logger.log(`Cancelled all bookings for trip ${tripId}`);
      }

      return t;
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'trips', targetId: tripId,
      oldValues: { status: trip.status }, newValues: { status: dto.status },
    }, actorId);

    return updated;
  }

  async getTrips(query: GetTripsQueryDto) {
    const { routeId, date, status, page = 1, pageSize = 20 } = query;
    const where: Record<string, unknown> = {};

    if (routeId) where['routeId'] = routeId;
    if (status)  where['status']  = status;
    if (date) {
      const d = new Date(date);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      where['departureTime'] = { gte: d, lt: next };
    }

    const [trips, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where: where as Prisma.TripWhereInput,
        orderBy: { departureTime: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
        include: {
          vehicle: { select: { registrationNo: true, make: true, model: true, capacity: true } },
          route:   { select: { name: true, origin: true, destination: true, fareAmount: true } },
          _count:  { select: { bookings: { where: { status: BookingStatus.CONFIRMED } } } },
        },
      }),
      this.prisma.trip.count({
        where: where as Prisma.TripWhereInput,
      }),
    ]);

    return { trips, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // ── Bookings ──────────────────────────────────────────────────────────────

  async bookSeat(dto: BookTripDto, userId: string) {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: dto.tripId },
      include: { route: { select: { name: true, fareAmount: true } } },
    });

    if (trip.status !== TripStatus.SCHEDULED) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot book a trip with status: ${trip.status}`,
      });
    }

    if (trip.availableSeats <= 0) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: 'No available seats on this trip',
      });
    }

    // Check for existing booking
    const existing = await this.prisma.tripBooking.findUnique({
      where: { uq_trip_user_booking: { tripId: dto.tripId, userId } },
    });
    if (existing && existing.status === BookingStatus.CONFIRMED) {
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'You already have a booking on this trip' });
    }

    // Deep-audit fix (Aug 2026): the availableSeats <= 0 check above reads a
    // value from BEFORE this transaction starts. Two concurrent bookings
    // for the last seat could both pass that check before either commits,
    // then both decrement inside their own $transaction — availableSeats
    // could go negative, and both bookings would be CONFIRMED for one
    // physical seat. Unlike the sequential-ID-generation race elsewhere in
    // this codebase (admission numbers, matric numbers), this one doesn't
    // need an advisory lock: it's a bounded decrement, which Postgres can
    // guard atomically in a single statement. updateMany()'s WHERE clause
    // re-checks availableSeats > 0 at the moment of the actual UPDATE, not
    // moments earlier — if a concurrent request already took the last
    // seat, this affects 0 rows and the whole transaction throws, rolling
    // back the tripBooking insert too.
    const booking = await this.prisma.$transaction(async (tx) => {
      const decremented = await tx.trip.updateMany({
        where: { id: dto.tripId, availableSeats: { gt: 0 } },
        data:  { availableSeats: { decrement: 1 } },
      });
      if (decremented.count === 0) {
        throw new UnprocessableEntityException({
          code: 'BUSINESS_RULE_INVALID_STATE',
          message: 'No available seats on this trip',
        });
      }

      const b = await tx.tripBooking.create({
        data: {
          tripId:     dto.tripId,
          userId,
          seatNumber: dto.seatNumber ?? null,
          status:     BookingStatus.CONFIRMED,
        },
      });
      return b;
    });

    return {
      id:       booking.id,
      tripId:   booking.tripId,
      userId:   booking.userId,
      status:   booking.status,
      bookedAt: booking.bookedAt,
      fare:     trip.route.fareAmount,
    };
  }

  async cancelBooking(bookingId: string, userId: string) {
    const booking = await this.prisma.tripBooking.findUniqueOrThrow({ where: { id: bookingId } });

    if (booking.userId !== userId) {
      throw new UnprocessableEntityException({ code: 'RBAC_FORBIDDEN', message: 'You can only cancel your own bookings' });
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Booking is not CONFIRMED' });
    }

    // Check trip hasn't departed
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: booking.tripId } });
    if (trip.departureTime <= new Date()) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Cannot cancel booking after departure time' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tripBooking.update({
        where: { id: bookingId },
        data:  { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });
      await tx.trip.update({
        where: { id: booking.tripId },
        data:  { availableSeats: { increment: 1 } },
      });
    });

    return { message: 'Booking cancelled successfully' };
  }

  async getUserBookings(userId: string) {
    return this.prisma.tripBooking.findMany({
      where:   { userId },
      orderBy: { bookedAt: 'desc' },
      include: {
        trip: {
          include: {
            route:   { select: { name: true, origin: true, destination: true, fareAmount: true } },
            vehicle: { select: { registrationNo: true, make: true, model: true } },
          },
        },
      },
    });
  }

  async getTripBookings(tripId: string) {
    return this.prisma.tripBooking.findMany({
      where:   { tripId, status: BookingStatus.CONFIRMED },
      orderBy: { bookedAt: 'asc' },
    });
  }
}
