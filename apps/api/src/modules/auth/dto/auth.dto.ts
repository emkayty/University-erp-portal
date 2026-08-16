import {
  IsEmail, IsNotEmpty, IsString, IsUUID, Length, Matches, MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@uniportal.dev' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  password: string;
}

export class MfaVerifyDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  mfaToken: string;

  @ApiProperty({ example: '482951' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be exactly 6 digits' })
  totpCode: string;
}

export class MfaBackupVerifyDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  mfaToken: string;

  @ApiProperty({ example: 'A3F9B2D1' })
  @IsString()
  @Length(8, 8, { message: 'Backup code must be exactly 8 characters' })
  backupCode: string;
}

export class MfaVerifySetupDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be exactly 6 digits' })
  totpCode: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  secret: string;
}

// AUDIT-C3: mandatory-MFA setup flow — the user has no session yet (that's
// the whole point), so these endpoints take setupToken instead of relying
// on @CurrentUser().
export class MfaSetupTokenDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  setupToken: string;
}

export class MfaConfirmMandatorySetupDto extends MfaSetupTokenDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be exactly 6 digits' })
  totpCode: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  secret: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@unilag.edu.ng' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482951' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  newPassword: string;
}
