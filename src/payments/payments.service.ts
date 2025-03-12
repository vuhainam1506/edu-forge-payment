// src/payments/payments.service.ts
import { Injectable, Logger } from '@nestjs/common';
const PayOS = require('@payos/node');
require('dotenv').config();

@Injectable()
export class PaymentsService {
  private payos: any;
  private readonly logger = new Logger(PaymentsService.name);

  constructor() {
    try {
      this.logger.log('Initializing PayOS instance');
      this.payos = new PayOS(
        process.env.PAYOS_CLIENT_ID,
        process.env.PAYOS_API_KEY,
        process.env.PAYOS_CHECKSUM_KEY
      );
      this.logger.log('PayOS instance created successfully');
    } catch (error) {
      this.logger.error('Error creating PayOS instance', error);
      throw error;
    }
  }

  async createPaymentLink(amount: number, orderCode: number, description: string): Promise<string> {
    try {
      this.logger.log(`Creating payment link for order ${orderCode} with amount ${amount}`);
      
      const paymentData = {
        orderCode,
        amount,
        description,
        returnUrl: process.env.DEFAULT_RETURN_URL || 'http://localhost:3000/payment/success',
        cancelUrl: process.env.DEFAULT_CANCEL_URL || 'http://localhost:3000/payment/expired',
      };

      const paymentLink = await this.payos.createPaymentLink(paymentData);
      this.logger.log(`Payment link created successfully: ${paymentLink.checkoutUrl}`);
      
      return paymentLink.checkoutUrl;
    } catch (error) {
      this.logger.error(`Error creating payment link: ${error.message}`, error.stack);
      throw error;
    }
  }
}