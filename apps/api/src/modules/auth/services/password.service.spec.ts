import * as bcrypt from 'bcrypt';
import { PasswordService } from './password.service';

describe('PasswordService OTP redemption', () => {
  const redis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    evalsha: jest.fn(),
    eval: jest.fn(),
  } as any;
  const config = {} as any;
  let service: PasswordService;

  beforeEach(() => {
    jest.clearAllMocks();
    redis.set.mockResolvedValue('OK');
    redis.get.mockResolvedValue('bcrypt-hash');
    redis.del.mockResolvedValue(1);
    redis.evalsha.mockResolvedValue(1);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    service = new PasswordService(config, redis);
  });

  afterEach(() => jest.restoreAllMocks());

  it('redeems a valid OTP and releases only its own lock', async () => {
    await expect(service.verifyOtp('User@Example.com', '123456')).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('otp:password-reset-lock:user@example.com'), expect.any(String), 'EX', 5, 'NX');
    expect(redis.get).toHaveBeenCalledWith('otp:password-reset:user@example.com');
    expect(redis.del).toHaveBeenCalledWith('otp:password-reset:user@example.com');
    expect(redis.evalsha).toHaveBeenCalled();
  });

  it('returns false when another verifier owns the account lock', async () => {
    redis.set.mockResolvedValue(null);
    await expect(service.verifyOtp('user@example.com', '123456')).resolves.toBe(false);
    expect(redis.get).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('does not delete an invalid or missing OTP', async () => {
    redis.get.mockResolvedValue(null);
    await expect(service.verifyOtp('user@example.com', '123456')).resolves.toBe(false);
    expect(redis.del).not.toHaveBeenCalledWith('otp:password-reset:user@example.com');
  });
});
