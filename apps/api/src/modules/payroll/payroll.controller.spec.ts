import { PayrollController } from './payroll.controller';

function user(role: 'STAFF' | 'BURSAR', roles: Array<'STAFF' | 'BURSAR'>) {
  return { sub: 'user-1', role, roles } as any;
}

describe('PayrollController', () => {
  it('routes a Staff user to the relation-based own-payslips query', async () => {
    const service = {
      getOwnPayslips: jest.fn().mockResolvedValue(['own']),
      getStaffPayslips: jest.fn().mockResolvedValue(['other']),
    };
    const controller = new PayrollController(service as any);

    await expect(controller.getStaffPayslips('staff-foreign', user('STAFF', ['STAFF']), 2026))
      .resolves.toEqual({ success: true, data: ['own'] });
    expect(service.getOwnPayslips).toHaveBeenCalledWith('user-1', 2026);
    expect(service.getStaffPayslips).not.toHaveBeenCalled();
  });

  it('preserves selected-staff access for payroll administrators', async () => {
    const service = {
      getOwnPayslips: jest.fn(),
      getStaffPayslips: jest.fn().mockResolvedValue(['selected']),
    };
    const controller = new PayrollController(service as any);

    await expect(controller.getStaffPayslips('staff-2', user('BURSAR', ['BURSAR']), 2026))
      .resolves.toEqual({ success: true, data: ['selected'] });
    expect(service.getStaffPayslips).toHaveBeenCalledWith('staff-2', 2026);
    expect(service.getOwnPayslips).not.toHaveBeenCalled();
  });

  it('does not treat a combined Staff and Bursar context as self-service', async () => {
    const service = {
      getOwnPayslips: jest.fn(),
      getStaffPayslips: jest.fn().mockResolvedValue(['selected']),
    };
    const controller = new PayrollController(service as any);

    await controller.getStaffPayslips('staff-2', user('BURSAR', ['STAFF', 'BURSAR']), 2026);
    expect(service.getStaffPayslips).toHaveBeenCalledWith('staff-2', 2026);
    expect(service.getOwnPayslips).not.toHaveBeenCalled();
  });
});
