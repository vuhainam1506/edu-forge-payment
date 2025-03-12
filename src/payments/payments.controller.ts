// src/payments/payments.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  Logger,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
async create(@Body() paymentData: { amount: number; orderCode?: number; description: string }) {
let { amount, orderCode, description } = paymentData;

// Nếu không có orderCode, tự sinh một mã
if (!orderCode) {
  orderCode = Math.floor(Math.random() * 1000000);
}

if (!amount || !description) {
  throw new BadRequestException('Missing required fields: amount or description');
}

const checkoutUrl = await this.paymentsService.createPaymentLink(amount, orderCode, description);
return { id: orderCode, checkoutUrl };
}

}