import { PDFDocument } from 'pdf-lib';
import { IdentityCardPdfService, type CardSettings } from './identity-card-pdf.service';

jest.mock('@uniportal/utils', () => ({
  decryptPii: (value: string) => `token-from:${value}`,
}));

const settings: CardSettings = {
  institutionName: 'UniPortal University',
  institutionCode: 'UPU',
  websiteUrl: null,
  logoUrl: null,
  identityCardTemplateMode: 'BUILT_IN',
  identityCardFrontBackgroundUrl: null,
  identityCardBackBackgroundUrl: null,
  identityCardPrimaryColor: '#0056B3',
  identityCardAccentColor: '#C9960C',
  identityCardFooterText: null,
};

function makeCard(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    holderType: 'STUDENT' as const,
    cardNumber: `CARD-${index}`,
    serialNumber: `SERIAL-${index}`,
    issueDate: new Date('2026-01-01T00:00:00.000Z'),
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    photoUrl: null,
    verificationTokenCiphertext: `cipher-${index}`,
    student: {
      matricNo: `UP/2026/${String(index).padStart(4, '0')}`,
      firstName: 'Test',
      lastName: `Student ${index}`,
      middleName: null,
      passportPhotoUrl: null,
      programme: { name: 'Computer Science', code: 'CSC' },
      department: { name: 'Computing', code: 'CMP' },
    },
    staff: null,
  };
}

describe('IdentityCardPdfService five-up duplex layout', () => {
  it('creates one front/back A4 pair for five cards', async () => {
    const service = new IdentityCardPdfService(
      { get: () => 'http://localhost:3000' } as never,
      { presignGet: jest.fn() } as never,
    );

    const buffer = await service.render(
      Array.from({ length: 5 }, (_, index) => makeCard(index + 1)),
      settings,
    );
    const pdf = await PDFDocument.load(buffer);

    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toMatchObject({ width: 595.28, height: 841.89 });
    expect(pdf.getPage(1).getSize()).toMatchObject({ width: 595.28, height: 841.89 });
  });

  it('starts a second front/back pair after the fifth card', async () => {
    const service = new IdentityCardPdfService(
      { get: () => 'http://localhost:3000' } as never,
      { presignGet: jest.fn() } as never,
    );

    const buffer = await service.render(
      Array.from({ length: 6 }, (_, index) => makeCard(index + 1)),
      settings,
    );
    const pdf = await PDFDocument.load(buffer);

    expect(pdf.getPageCount()).toBe(4);
  });
});

export {};
