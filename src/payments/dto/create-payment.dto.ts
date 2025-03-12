import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, IsEnum } from 'class-validator';

// src/payments/dto/create-payment.dto.ts
export class CreatePaymentDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1000)
  amount: number;

  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @IsNotEmpty()
  @IsString()
  serviceType: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['BANK_TRANSFER'])
  method?: 'BANK_TRANSFER';

  @IsOptional()
  @IsString()
  returnUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

  @IsOptional()
  @IsString()
  orderCode?: number;
}

// Hàm validation thủ công
export function validateCreatePaymentDto(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.amount || typeof data.amount !== 'number' || data.amount < 1000) {
    errors.push('Amount must be a number greater than or equal to 1000');
  }
  
  if (!data.serviceId || typeof data.serviceId !== 'string') {
    errors.push('ServiceId is required and must be a string');
  }
  
  if (!data.serviceType || typeof data.serviceType !== 'string') {
    errors.push('ServiceType is required and must be a string');
  }
  
  if (data.description !== undefined && typeof data.description !== 'string') {
    errors.push('Description must be a string');
  }
  
  if (data.method !== undefined && data.method !== 'BANK_TRANSFER') {
    errors.push('Method must be BANK_TRANSFER');
  }
  
  if (data.returnUrl !== undefined && typeof data.returnUrl !== 'string') {
    errors.push('ReturnUrl must be a string');
  }
  
  if (data.cancelUrl !== undefined && typeof data.cancelUrl !== 'string') {
    errors.push('CancelUrl must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}