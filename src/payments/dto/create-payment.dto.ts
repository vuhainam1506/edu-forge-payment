// src/payments/dto/create-payment.dto.ts
export class CreatePaymentDto {
    amount: number
    ordercode?: string | number
    description: string
    method?: string
    serviceName?: string
    userId?: string
    serviceId?: string
    returnUrl?: string
    cancelUrl?: string
    metadata?: any
  }
  
  