import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { decryptPii } from '@uniportal/utils';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const CARD_WIDTH = 242.65; // 85.60 mm / ISO/IEC 7810 ID-1
const CARD_HEIGHT = 152.99; // 53.98 mm / ISO/IEC 7810 ID-1
const COLUMN_GAP = 5;
const ROW_GAP = 5;
const COLUMN_MARGIN = (A4_WIDTH - CARD_WIDTH * 2 - COLUMN_GAP) / 2;
const ROW_MARGIN = (A4_HEIGHT - CARD_HEIGHT * 5 - ROW_GAP * 4) / 2;
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const MAX_CARDS = 500;

export type CardSettings = {
  institutionName: string;
  institutionCode: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  identityCardTemplateMode: 'BUILT_IN' | 'EXTERNAL_ARTWORK';
  identityCardFrontBackgroundUrl: string | null;
  identityCardBackBackgroundUrl: string | null;
  identityCardPrimaryColor: string;
  identityCardAccentColor: string;
  identityCardFooterText: string | null;
};

type CardRecord = {
  id: string;
  holderType: 'STUDENT' | 'STAFF';
  cardNumber: string;
  serialNumber: string;
  issueDate: Date;
  expiryDate: Date;
  photoUrl: string | null;
  verificationTokenCiphertext: string;
  student: {
    matricNo: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    passportPhotoUrl: string | null;
    programme: { name: string; code: string } | null;
    department: { name: string; code: string } | null;
  } | null;
  staff: {
    employeeNo: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    photoUrl: string | null;
    designation: string | null;
    department: { name: string; code: string } | null;
  } | null;
};

type RenderableCard = CardRecord & {
  holderName: string;
  identifier: string;
  secondary: string;
  photoReference: string | null;
};

@Injectable()
export class IdentityCardPdfService {
  private readonly logger = new Logger(IdentityCardPdfService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  async render(cards: CardRecord[], settings: CardSettings): Promise<Buffer> {
    if (!cards.length || cards.length > MAX_CARDS) throw new Error(`Identity-card PDF must contain between 1 and ${MAX_CARDS} cards.`);
    const renderable = cards.map((card) => this.toRenderable(card));
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${settings.institutionName} identity cards`);
    pdf.setAuthor('UniPortal ERP');
    pdf.setSubject('Controlled institutional identity-card print batch');
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const media = await this.loadMedia(pdf, renderable, settings);
    const origin = this.resolveFrontendOrigin();

    for (let pageStart = 0; pageStart < renderable.length; pageStart += 10) {
      const pageCards = renderable.slice(pageStart, pageStart + 10);
      const front = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      pageCards.forEach((card, index) => {
        const position = this.position(index);
        this.drawCard(front, card, position.x, position.y, false, settings, regularFont, boldFont, media, origin);
      });
      this.drawSheetLabel(front, `FRONT - cards ${pageStart + 1}-${pageStart + pageCards.length}`, regularFont);

      const back = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      pageCards.forEach((card, index) => {
        const position = this.position(index);
        // Mirror the columns on the back page for duplex printing on the short edge.
        const mirroredX = A4_WIDTH - position.x - CARD_WIDTH;
        this.drawCard(back, card, mirroredX, position.y, true, settings, regularFont, boldFont, media, origin);
      });
      this.drawSheetLabel(back, `BACK - cards ${pageStart + 1}-${pageStart + pageCards.length} - flip short edge`, regularFont);
    }

    return Buffer.from(await pdf.save());
  }

  private toRenderable(card: CardRecord): RenderableCard {
    const holder = card.student
      ? {
          name: [card.student.firstName, card.student.middleName, card.student.lastName].filter(Boolean).join(' '),
          identifier: card.student.matricNo,
          secondary: card.student.programme?.name ?? card.student.department?.name ?? 'Student',
          photoReference: card.photoUrl ?? card.student.passportPhotoUrl,
        }
      : {
          name: [card.staff?.firstName, card.staff?.middleName, card.staff?.lastName].filter(Boolean).join(' '),
          identifier: card.staff?.employeeNo ?? 'STAFF',
          secondary: card.staff?.designation ?? card.staff?.department?.name ?? 'Staff',
          photoReference: card.photoUrl ?? card.staff?.photoUrl ?? null,
        };
    return { ...card, holderName: holder.name, identifier: holder.identifier, secondary: holder.secondary, photoReference: holder.photoReference };
  }

  private position(index: number): { x: number; y: number } {
    const column = index % 2;
    const row = Math.floor(index / 2);
    return {
      x: COLUMN_MARGIN + column * (CARD_WIDTH + COLUMN_GAP),
      y: A4_HEIGHT - ROW_MARGIN - CARD_HEIGHT - row * (CARD_HEIGHT + ROW_GAP),
    };
  }

  private drawSheetLabel(page: PDFPage, label: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>): void {
    page.drawText(label, { x: 12, y: 8, size: 5.5, font, color: rgb(0.35, 0.35, 0.35) });
  }

  private drawCard(
    page: PDFPage,
    card: RenderableCard,
    x: number,
    y: number,
    back: boolean,
    settings: CardSettings,
    regularFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
    boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
    media: Map<string, PDFImage>,
    origin: string,
  ): void {
    const primary = parseHex(settings.identityCardPrimaryColor, [0, 0.337, 0.702]);
    const accent = parseHex(settings.identityCardAccentColor, [0.788, 0.588, 0.047]);
    const background = back ? settings.identityCardBackBackgroundUrl : settings.identityCardFrontBackgroundUrl;
    const backgroundImage = settings.identityCardTemplateMode === 'EXTERNAL_ARTWORK' && background ? media.get(background) : undefined;
    if (backgroundImage) {
      page.drawImage(backgroundImage, { x, y, width: CARD_WIDTH, height: CARD_HEIGHT, opacity: 0.98 });
    } else {
      page.drawRectangle({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT, color: back ? rgb(0.96, 0.97, 0.99) : primary, borderColor: accent, borderWidth: 1 });
      if (!back) page.drawCircle({ x: x + CARD_WIDTH - 15, y: y + CARD_HEIGHT + 10, size: 50, color: rgb(1, 1, 1), opacity: 0.08 });
    }

    if (back) {
      page.drawText(settings.institutionName.slice(0, 54), { x: x + 18, y: y + CARD_HEIGHT - 25, size: 10, font: boldFont, color: backgroundImage ? rgb(0.06, 0.10, 0.16) : primary });
      page.drawText('This card remains the property of the institution.', { x: x + 18, y: y + CARD_HEIGHT - 45, size: 6.8, font: regularFont, color: rgb(0.12, 0.12, 0.14) });
      page.drawText('If found, return it to the Registry or Human Resources Office.', { x: x + 18, y: y + CARD_HEIGHT - 58, size: 6.4, font: regularFont, color: rgb(0.12, 0.12, 0.14) });
      page.drawText(`Serial: ${card.serialNumber}`, { x: x + 18, y: y + 35, size: 6.4, font: regularFont, color: rgb(0.12, 0.12, 0.14) });
      page.drawText(settings.identityCardFooterText?.slice(0, 75) ?? 'Verify this credential using the QR code on the front.', { x: x + 18, y: y + 20, size: 5.8, font: regularFont, color: rgb(0.18, 0.18, 0.2) });
      return;
    }

    page.drawText(settings.institutionName.slice(0, 40), { x: x + 12, y: y + CARD_HEIGHT - 18, size: 8.5, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText(settings.institutionCode?.slice(0, 22) ?? 'INSTITUTIONAL ID', { x: x + 12, y: y + CARD_HEIGHT - 29, size: 5.5, font: regularFont, color: rgb(0.86, 0.92, 1) });
    page.drawText(card.holderType === 'STUDENT' ? 'STUDENT IDENTITY CARD' : 'STAFF IDENTITY CARD', { x: x + 12, y: y + 12, size: 5.6, font: boldFont, color: rgb(1, 1, 1) });

    const photo = media.get(card.photoReference ?? '');
    if (photo) page.drawImage(photo, { x: x + 12, y: y + 48, width: 48, height: 61 });
    else {
      page.drawRectangle({ x: x + 12, y: y + 48, width: 48, height: 61, color: rgb(0.9, 0.94, 0.98), borderColor: rgb(1, 1, 1), borderWidth: 0.5 });
      page.drawText(card.holderName.slice(0, 1).toUpperCase(), { x: x + 30, y: y + 72, size: 20, font: boldFont, color: primary });
    }
    page.drawText(card.holderName.slice(0, 30), { x: x + 70, y: y + 94, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText(card.identifier.slice(0, 28), { x: x + 70, y: y + 80, size: 7.4, font: boldFont, color: rgb(0.93, 0.97, 1) });
    page.drawText(card.secondary.slice(0, 30), { x: x + 70, y: y + 66, size: 6.2, font: regularFont, color: rgb(0.86, 0.92, 1) });
    page.drawText(`Card: ${card.cardNumber.slice(0, 32)}`, { x: x + 12, y: y + 33, size: 5.7, font: regularFont, color: rgb(0.86, 0.92, 1) });
    page.drawText(`Valid to: ${formatDate(card.expiryDate)}`, { x: x + 12, y: y + 22, size: 5.7, font: regularFont, color: rgb(0.86, 0.92, 1) });

    const token = decryptPii(card.verificationTokenCiphertext);
    const verificationUrl = `${origin.replace(/\/$/, '')}/verify/card/${token}`;
    const qr = media.get(`qr:${card.id}`);
    if (qr) page.drawImage(qr, { x: x + CARD_WIDTH - 58, y: y + 12, width: 45, height: 45 });
    else this.logger.warn(`QR image was unavailable for identity card ${card.id}`);
    void verificationUrl;
  }

  private async loadMedia(pdf: PDFDocument, cards: RenderableCard[], settings: CardSettings): Promise<Map<string, PDFImage>> {
    const media = new Map<string, PDFImage>();
    const references = new Set<string>();
    for (const card of cards) if (card.photoReference) references.add(card.photoReference);
    if (settings.identityCardTemplateMode === 'EXTERNAL_ARTWORK') {
      if (settings.identityCardFrontBackgroundUrl) references.add(settings.identityCardFrontBackgroundUrl);
      if (settings.identityCardBackBackgroundUrl) references.add(settings.identityCardBackBackgroundUrl);
    }
    const loaded = await this.mapWithConcurrency([...references], 8, async (reference) => [reference, await this.fetchImage(reference)] as const);
    for (const [reference, bytes] of loaded) {
      if (!bytes) continue;
      try {
        media.set(reference, isPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes));
      } catch (error) {
        this.logger.warn(`Could not embed approved identity-card artwork or photo: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    for (const card of cards) {
      try {
        const token = decryptPii(card.verificationTokenCiphertext);
        const qrData = await QRCode.toDataURL(`${this.resolveFrontendOrigin().replace(/\/$/, '')}/verify/card/${token}`, { errorCorrectionLevel: 'H', margin: 1, width: 180 });
        const bytes = Buffer.from(qrData.split(',')[1] ?? '', 'base64');
        media.set(`qr:${card.id}`, isPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes));
      } catch (error) {
        this.logger.warn(`Could not create QR image for identity card ${card.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    return media;
  }

  private async fetchImage(reference: string): Promise<Buffer | null> {
    try {
      let url = reference;
      if (isStorageKey(reference)) {
        url = (await this.storage.presignGet(reference)).url;
      } else if (!isAllowedExternalUrl(reference, this.config.get<string>('IDENTITY_CARD_MEDIA_HOSTS', ''))) {
        this.logger.warn('Skipped identity-card media that is not an approved storage key or allow-listed HTTPS URL.');
        return null;
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(7_500) });
      if (!response.ok) return null;
      const declaredSize = Number(response.headers.get('content-length') ?? 0);
      if (declaredSize > MAX_MEDIA_BYTES) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_MEDIA_BYTES || (!isPng(bytes) && !isJpeg(bytes))) return null;
      return bytes;
    } catch {
      return null;
    }
  }

  private resolveFrontendOrigin(): string {
    return this.config.get<string>('FRONTEND_ORIGIN')?.split(',')[0]?.trim() || 'http://localhost:3000';
  }

  private async mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const output: R[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const index = cursor++;
        output[index] = await fn(items[index]!);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    return output;
  }
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseHex(value: string, fallback: [number, number, number]) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return rgb(...fallback);
  const hex = match[1]!;
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isStorageKey(value: string): boolean {
  return /^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_./-]+$/.test(value);
}

function isAllowedExternalUrl(value: string, allowedHosts: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    const hosts = allowedHosts.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
    return hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}
