// src/payments/payments.controller.ts
import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async create(@Body() paymentData: { 
    amount: number; 
    orderCode?: number; 
    description: string;
    serviceId?: string;
    serviceName?: string;
    userId?: string;
  }) {
    this.logger.log(`Payment request received: ${JSON.stringify(paymentData)}`);
    
    let { amount, orderCode, description } = paymentData;

    // Nếu không có orderCode, tự sinh một mã
    if (!orderCode) {
      orderCode = Math.floor(Math.random() * 1000000);
    }

    if (!amount || !description) {
      throw new BadRequestException('Missing required fields: amount or description');
    }

    try {
      const checkoutUrl = await this.paymentsService.createPaymentLink(amount, orderCode, description);
      return { id: orderCode, checkoutUrl };
    } catch (error) {
      this.logger.error(`Error in create payment: ${error.message}`, error.stack);
      throw error;
    }
  }
}