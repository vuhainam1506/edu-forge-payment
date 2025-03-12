import { Injectable, Logger, BadRequestException } from '@nestjs/common';
const PayOS = require('@payos/node');
import {Resend} from 'resend';
require('dotenv').config(); // Load .env

@Injectable()
export class PaymentsService {
  private payos: any;
  private readonly logger = new Logger(PaymentsService.name);

  constructor() {
    try {
      this.logger.log('Tao payos instance');
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
    const paymentData = {
      orderCode,
      amount,
      description,
      returnUrl: process.env.DEFAULT_RETURN_URL,
      cancelUrl: process.env.DEFAULT_CANCEL_URL,
    };

    try {
      const paymentLink = await this.payos.createPaymentLink(paymentData);
      // Lay api key tu env
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Acme <payment@eduforge.io.vn>',
        to: ['thinhdz1500@gmail.com'],
        subject: 'Thanh toán khóa học thành công',
        html: 'Chúc mừng bạn đã đăng ký khóa học thành công',
      });

      return paymentLink.checkoutUrl;
    } catch (error) {
      this.logger.error('Error creating payment link', error);
      throw error;
    }
  }
}