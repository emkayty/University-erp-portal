import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { BookingStatus, TripStatus, VehicleStatus } from '@prisma/client';
import { TransportService } from './transport.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

describe('TransportService operational boundaries', () => {
  let service: TransportService;
  const prisma: any = {
    vehicle: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    transportRoute: { findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    trip: { findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    tripBooking: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((operation: unknown) => Array.isArray(operation) ? Promise.all(operation) : (operation as (tx: unknown) => unknown)(prisma)),
  };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TransportService(prisma as PrismaService, audit as unknown as AuditService);
  });

  it('rejects creating a trip with a vehicle that is not available', async () => {
    prisma.vehicle.findUniqueOrThrow.mockResolvedValue({ id: 'vehicle-1', registrationNo: 'BUS-01', status: VehicleStatus.MAINTENANCE, capacity: 40 });
    await expect(service.createTrip({ vehicleId: 'vehicle-1', routeId: 'route-1', driverUserId: 'driver-1', departureTime: '2099-01-01T09:00:00Z' }, 'staff-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it('rejects a vehicle double-booked within the safety buffer', async () => {
    prisma.vehicle.findUniqueOrThrow.mockResolvedValue({ id: 'vehicle-1', registrationNo: 'BUS-01', status: VehicleStatus.AVAILABLE, capacity: 40 });
    prisma.trip.findFirst.mockResolvedValue({ id: 'trip-existing', status: TripStatus.SCHEDULED });
    await expect(service.createTrip({ vehicleId: 'vehicle-1', routeId: 'route-1', driverUserId: 'driver-1', departureTime: '2099-01-01T09:00:00Z' }, 'staff-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses an atomic positive-seat update before confirming a booking', async () => {
    prisma.trip.findUniqueOrThrow.mockResolvedValue({ id: 'trip-1', status: TripStatus.SCHEDULED, availableSeats: 1, route: { name: 'Main', fareAmount: 500 } });
    prisma.tripBooking.findUnique.mockResolvedValue(null);
    prisma.trip.updateMany.mockResolvedValue({ count: 1 });
    prisma.tripBooking.create.mockResolvedValue({ id: 'booking-1', tripId: 'trip-1', userId: 'user-1', status: BookingStatus.CONFIRMED, bookedAt: new Date() });
    await expect(service.bookSeat({ tripId: 'trip-1' }, 'user-1')).resolves.toEqual(expect.objectContaining({ status: BookingStatus.CONFIRMED }));
    expect(prisma.trip.updateMany).toHaveBeenCalledWith({ where: { id: 'trip-1', availableSeats: { gt: 0 } }, data: { availableSeats: { decrement: 1 } } });
  });

  it('rejects a duplicate confirmed booking', async () => {
    prisma.trip.findUniqueOrThrow.mockResolvedValue({ id: 'trip-1', status: TripStatus.SCHEDULED, availableSeats: 1, route: { name: 'Main', fareAmount: 500 } });
    prisma.tripBooking.findUnique.mockResolvedValue({ id: 'booking-existing', status: BookingStatus.CONFIRMED });
    await expect(service.bookSeat({ tripId: 'trip-1' }, 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tripBooking.create).not.toHaveBeenCalled();
  });

  it('prevents users from cancelling another user’s booking', async () => {
    prisma.tripBooking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', userId: 'owner-1', status: BookingStatus.CONFIRMED, tripId: 'trip-1' });
    await expect(service.cancelBooking('booking-1', 'other-user')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.tripBooking.update).not.toHaveBeenCalled();
  });
});
