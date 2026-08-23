import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Authenticated, CurrentUser, FeatureFlag, Roles, SelfScoped, StaffScopes } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '@uniportal/types';
import { TransportService } from './transport.service';
import type {
  BookTripDto, CreateRouteDto, CreateTripDto, CreateVehicleDto,
  GetTripsQueryDto, UpdateRouteDto, UpdateTripStatusDto, UpdateVehicleStatusDto,
} from './dto/transport.dto';

@FeatureFlag('module_transport')
@UseGuards(RolesGuard)
@Controller({ path: 'transport', version: '1' })
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Post('vehicles')
  createVehicle(@Body() dto: CreateVehicleDto, @CurrentUser() user: JwtPayload) {
    return this.transport.createVehicle(dto, user.sub);
  }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Get('vehicles')
  getVehicles() { return this.transport.getVehicles(); }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Patch('vehicles/:id/status')
  updateVehicleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleStatusDto,
    @CurrentUser() user: JwtPayload,
  ) { return this.transport.updateVehicleStatus(id, dto, user.sub); }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Post('routes')
  createRoute(@Body() dto: CreateRouteDto, @CurrentUser() user: JwtPayload) {
    return this.transport.createRoute(dto, user.sub);
  }

  @Authenticated()
  @Get('routes')
  getRoutes() { return this.transport.getRoutes(); }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Patch('routes/:id')
  updateRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser() user: JwtPayload,
  ) { return this.transport.updateRoute(id, dto, user.sub); }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Post('trips')
  createTrip(@Body() dto: CreateTripDto, @CurrentUser() user: JwtPayload) {
    return this.transport.createTrip(dto, user.sub);
  }

  @Authenticated()
  @Get('trips')
  getTrips(@Query() query: GetTripsQueryDto) { return this.transport.getTrips(query); }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Patch('trips/:id/status')
  updateTripStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripStatusDto,
    @CurrentUser() user: JwtPayload,
  ) { return this.transport.updateTripStatus(id, dto, user.sub); }

  @Roles('STAFF', 'SUPER_ADMIN')
  @StaffScopes('transport')
  @Get('trips/:id/bookings')
  getTripBookings(@Param('id', ParseUUIDPipe) id: string) {
    return this.transport.getTripBookings(id);
  }

  @SelfScoped()
  @Post('bookings')
  bookSeat(@Body() dto: BookTripDto, @CurrentUser() user: JwtPayload) {
    return this.transport.bookSeat(dto, user.sub);
  }

  @SelfScoped()
  @Delete('bookings/:id')
  cancelBooking(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.transport.cancelBooking(id, user.sub);
  }

  @SelfScoped()
  @Get('bookings/me')
  getMyBookings(@CurrentUser() user: JwtPayload) {
    return this.transport.getUserBookings(user.sub);
  }
}
