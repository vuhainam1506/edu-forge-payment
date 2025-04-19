// src/payments/payments.controller.ts
import { Controller, Get, Post, Body, Param, Put, Logger, Headers, BadRequestException, Query, DefaultValuePipe, ParseIntPipe } from "@nestjs/common"
import  { PaymentsService } from "./payments.service"
import  { payment_status } from "@prisma/client"

@Controller("")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name)

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async create(@Body() paymentData: {
    amount: number;
    ordercode?: string | number;
    description: string;
    method?: string;
    serviceName?: string;
    userId?: string;
    serviceId?: string;
    returnUrl?: string;
    cancelUrl?: string;
    metadata?: any;
  }) {
    this.logger.log(`Creating payment: ${JSON.stringify(paymentData)}`);
    
    // Validate required fields
    if (!paymentData.amount || !paymentData.description) {
      throw new BadRequestException('Missing required fields: amount or description');
    }

    // Nếu không có ordercode, tự sinh một mã
    if (!paymentData.ordercode) {
      const now = new Date();
      const year = Number(String(now.getFullYear()).slice(-2));
      const month = Number(String(now.getMonth() + 1).padStart(2, '0'));
      const day = Number(String(now.getDate()).padStart(2, '0'));
      const hours = Number(String(now.getHours()).padStart(2, '0'));
      const minutes = Number(String(now.getMinutes()).padStart(2, '0'));
      const seconds = Number(String(now.getSeconds()).padStart(2, '0'));
      paymentData.ordercode = year + month + day + hours + minutes + seconds;
    }

    // Create a new object with all properties from paymentData
    // This ensures ordercode is included and not optional
    const paymentDataWithOrdercode = {
      ...paymentData,
      ordercode: paymentData.ordercode
    };

    const result = await this.paymentsService.createPayment(paymentDataWithOrdercode);
    return result;
  }

  @Get(':id')
  async getPayment(@Param('id') id: string) {
    this.logger.log(`Getting payment with ID: ${id}`);
    return this.paymentsService.getPaymentById(id);
  }

  @Get('order/:orderCode')
  async getPaymentByOrderCode(@Param('orderCode') orderCode: string) {
    this.logger.log(`Getting payment with order code: ${orderCode}`);
    return this.paymentsService.getPaymentByOrderCode(orderCode);
  }

  @Put(":id/status")
  async updateStatus(@Param('id') id: string, @Body('status') status: payment_status) {
    this.logger.log(`Updating payment ${id} status to ${status}`)
    return this.paymentsService.updatePaymentStatus(id, status)
  }

  @Put("order/:orderCode/status")
  async updateStatusByOrderCode(@Param('orderCode') orderCode: string, @Body('status') status: payment_status) {
    this.logger.log(`Updating payment with order code ${orderCode} status to ${status}`)
    return this.paymentsService.updatePaymentStatusByOrderCode(orderCode, status)
  }

  @Post("webhook")
  async handleWebhook(@Body() data: any, @Headers('x-payos-signature') signature: string) {
    this.logger.log(`Received payment webhook: ${JSON.stringify(data)}`)

    // Trong thực tế, bạn cần xác thực signature từ PayOS
    // if (!this.paymentsService.verifyWebhookSignature(data, signature)) {
    //   throw new BadRequestException('Invalid webhook signature');
    // }

    return this.paymentsService.handlePaymentWebhook(data)
  }

  @Get()
  async getAllPayments() {
    this.logger.log('Getting all payments');
    return this.paymentsService.getAllPayments();
  }
}

