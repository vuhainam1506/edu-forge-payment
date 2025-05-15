// src/payments/payments.controller.ts
import { Controller, Get, Post, Body, Param, Put, Logger, Headers, BadRequestException, Query, DefaultValuePipe, ParseIntPipe } from "@nestjs/common"
import { PaymentsService } from "./payments.service"
import { payment_status } from "@prisma/client"

/**
 * Controller quản lý các API liên quan đến thanh toán
 * Cung cấp các endpoint để tạo, truy vấn và cập nhật thông tin thanh toán
 */
@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name)

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Tạo một giao dịch thanh toán mới
   * 
   * @param paymentData Dữ liệu thanh toán bao gồm số tiền, mô tả và các thông tin khác
   * @returns Thông tin thanh toán đã tạo bao gồm ID, mã đơn hàng và URL thanh toán
   * 
   * @example
   * POST /api/v1/payments
   * Body: {
   *   "amount": 500000,
   *   "description": "Thanh toán khóa học Lập trình Web",
   *   "method": "BANK_TRANSFER",
   *   "serviceName": "Enrollment",
   *   "userId": "user-123",
   *   "serviceId": "course-456",
   *   "returnUrl": "https://example.com/success",
   *   "cancelUrl": "https://example.com/cancel",
   *   "metadata": { "courseId": "course-456", "userId": "user-123" }
   * }
   */
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

  /**
   * Xử lý webhook từ cổng thanh toán (PayOS)
   * Cập nhật trạng thái thanh toán và thực hiện các hành động liên quan
   * 
   * @param data Dữ liệu từ cổng thanh toán
   * @param signature Chữ ký xác thực từ cổng thanh toán
   * @returns Kết quả xử lý webhook
   * 
   * @example
   * POST /api/v1/payments/webhook
   * Headers: { "x-payos-signature": "abc123..." }
   * Body: { "orderCode": "230506095712", "status": "PAID", ... }
   */
  @Post("webhook")
  async handleWebhook(@Body() data: any, @Headers('x-payos-signature') signature: string) {
    this.logger.log(`Received payment webhook: ${JSON.stringify(data)}`)
    return this.paymentsService.handlePaymentWebhook(data)
  }

  /**
   * Lấy thống kê về thanh toán
   * 
   * @returns Thông tin thống kê thanh toán bao gồm tổng doanh thu, doanh thu 30 ngày qua, giá trị trung bình, tỷ lệ thất bại
   * 
   * @example
   * GET /api/v1/payments/stats
   */
  @Get('stats')
  async getPaymentStats() {
    return this.paymentsService.getPaymentStats();
  }

  /**
   * Lấy thông tin chi tiết của một giao dịch thanh toán theo mã đơn hàng
   * 
   * @param orderCode Mã đơn hàng của giao dịch thanh toán
   * @returns Thông tin chi tiết của giao dịch thanh toán
   * 
   * @example
   * GET /api/v1/payments/order/230506095712
   */
  @Get('order/:orderCode')
  async getPaymentByOrderCode(@Param('orderCode') orderCode: string) {
    this.logger.log(`Getting payment with order code: ${orderCode}`);
    return this.paymentsService.getPaymentByOrderCode(orderCode);
  }

  /**
   * Lấy danh sách tất cả các giao dịch thanh toán
   * 
   * @returns Danh sách các giao dịch thanh toán
   * 
   * @example
   * GET /api/v1/payments
   */
  @Get()
  async getAllPayments() {
    this.logger.log('Getting all payments');
    return this.paymentsService.getAllPayments();
  }

  /**
   * Lấy thông tin chi tiết của một giao dịch thanh toán theo ID
   * 
   * @param id ID của giao dịch thanh toán
   * @returns Thông tin chi tiết của giao dịch thanh toán
   * 
   * @example
   * GET /api/v1/payments/123e4567-e89b-12d3-a456-426614174000
   */
  @Get(':id')
  async getPayment(@Param('id') id: string) {
    this.logger.log(`Getting payment with ID: ${id}`);
    return this.paymentsService.getPaymentById(id);
  }

  /**
   * Cập nhật trạng thái của một giao dịch thanh toán theo ID
   * 
   * @param id ID của giao dịch thanh toán
   * @param status Trạng thái mới của giao dịch thanh toán (PENDING, COMPLETED, CANCELLED, FAILED, EXPIRED)
   * @returns Thông tin giao dịch thanh toán đã được cập nhật
   * 
   * @example
   * PUT /api/v1/payments/123e4567-e89b-12d3-a456-426614174000/status
   * Body: { "status": "COMPLETED" }
   */
  @Put(":id/status")
  async updateStatus(@Param('id') id: string, @Body('status') status: payment_status) {
    this.logger.log(`Updating payment ${id} status to ${status}`)
    return this.paymentsService.updatePaymentStatus(id, status)
  }

  /**
   * Cập nhật trạng thái của một giao dịch thanh toán theo mã đơn hàng
   * 
   * @param orderCode Mã đơn hàng của giao dịch thanh toán
   * @param status Trạng thái mới của giao dịch thanh toán (PENDING, COMPLETED, CANCELLED, FAILED, EXPIRED)
   * @returns Thông tin giao dịch thanh toán đã được cập nhật
   * 
   * @example
   * PUT /api/v1/payments/order/230506095712/status
   * Body: { "status": "COMPLETED" }
   */
  @Put("order/:orderCode/status")
  async updateStatusByOrderCode(@Param('orderCode') orderCode: string, @Body('status') status: payment_status) {
    this.logger.log(`Updating payment with order code ${orderCode} status to ${status}`)
    return this.paymentsService.updatePaymentStatusByOrderCode(orderCode, status)
  }
}

