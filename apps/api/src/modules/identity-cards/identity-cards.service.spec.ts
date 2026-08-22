import { IdentityCardHolderType, IdentityCardStatus } from '@prisma/client';
import { IdentityCardsService } from './identity-cards.service';

jest.mock('@uniportal/utils', () => ({
  encryptPii: (value: string) => `cipher:${value}`,
  decryptPii: (value: string) => `token-from:${value}`,
}));

describe('IdentityCardsService response disclosure', () => {
  const card = {
    id: 'card-1',
    holderType: IdentityCardHolderType.STUDENT,
    cardNumber: 'STU-001-2026-ABC123',
    serialNumber: 'UP-2026-ABC12345',
    issueDate: new Date('2026-01-01T00:00:00.000Z'),
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    status: IdentityCardStatus.ACTIVE,
    photoUrl: null,
    verificationTokenCiphertext: 'cipher:opaque-token',
    lifecycleReason: null,
    verificationCount: 0,
    lastVerifiedAt: null,
    student: {
      id: 'student-1',
      userId: 'user-1',
      matricNo: 'UP/2026/001',
      firstName: 'Ada',
      lastName: 'Okafor',
      middleName: null,
      passportPhotoUrl: null,
      programme: { name: 'Computer Science', code: 'CSC' },
      department: { name: 'Computing', code: 'CMP' },
    },
    staff: null,
  };

  function createService() {
    const prisma = {
      identityCard: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const audit = { log: jest.fn() };
    const settings = { getSettings: jest.fn() };
    const pdf = { render: jest.fn() };
    return { service: new IdentityCardsService(prisma as never, audit as never, settings as never, pdf as never), prisma, settings, pdf };
  }

  it('omits verification material from administrative list responses', async () => {
    const { service, prisma } = createService();
    prisma.identityCard.findMany.mockResolvedValue([card]);

    const result = await service.list({});

    expect(result[0]).not.toHaveProperty('verificationToken');
    expect(result[0]).not.toHaveProperty('verificationUrl');
    expect(result[0]).toMatchObject({ id: card.id, cardNumber: card.cardNumber, holder: { identifier: card.student.matricNo } });
  });

  it('returns only a scoped public verification URL for the card holder self-view', async () => {
    const { service, prisma } = createService();
    prisma.identityCard.findFirst.mockResolvedValue(card);

    const result = await service.getMine('user-1');

    expect(result).toHaveProperty('verificationUrl', '/verify/card/token-from:cipher:opaque-token');
    expect(result).not.toHaveProperty('verificationToken');
  });

  it('does not return verification material from lifecycle responses', async () => {
    const { service, prisma } = createService();
    prisma.identityCard.findUnique.mockResolvedValue(card);
    prisma.identityCard.update.mockResolvedValue({ ...card, status: IdentityCardStatus.SUSPENDED });

    const result = await service.changeStatus('card-1', IdentityCardStatus.SUSPENDED, { reason: 'Temporary suspension for review' }, 'actor-1');

    expect(result).not.toHaveProperty('verificationToken');
    expect(result).not.toHaveProperty('verificationUrl');
    expect(result).toMatchObject({ id: card.id, status: IdentityCardStatus.SUSPENDED });
  });
});
