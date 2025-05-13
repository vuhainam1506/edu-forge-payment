import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaClient, type payment_status, type payment_method } from "@prisma/client";
import axios from 'axios';
import { Resend } from "resend";
import { ConfigService } from "@nestjs/config";

const PayOS = require("@payos/node");

// Định nghĩa interface cho metadata
interface PaymentMetadata {
  courseId?: string;
  userId?: string;
  userName?: string;
  courseName?: string;
  serviceType?: string;
  instructor?: string;
  duration?: string;
  level?: string;
  [key: string]: any;
}

@Injectable()
export class PaymentsService {
  private payos: any;
  private readonly logger = new Logger(PaymentsService.name);
  private prisma: PrismaClient;
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.prisma = new PrismaClient();
    this.configService = configService;
    
    try {
      this.logger.log("Initializing PayOS instance");
      
      // Lấy thông tin môi trường từ biến môi trường
      const environment = process.env.PAYOS_ENVIRONMENT || 'sandbox';
      this.logger.log(`Using PayOS environment: ${environment}`);
      
      // Khởi tạo PayOS với các thông số từ biến môi trường
      this.payos = new PayOS(
        process.env.PAYOS_CLIENT_ID,
        process.env.PAYOS_API_KEY,
        process.env.PAYOS_CHECKSUM_KEY,
        environment // Thêm tham số environment
      );
      
      this.logger.log("PayOS instance created successfully");
    } catch (error) {
      this.logger.error("Error creating PayOS instance", error);
      throw error;
    }
  }

  /**
   * Tạo một giao dịch thanh toán mới
   * - Tạo payment link với PayOS
   * - Lưu thông tin thanh toán vào database
   * 
   * @param data Dữ liệu thanh toán
   * @returns Thông tin thanh toán đã tạo bao gồm ID, mã đơn hàng và URL thanh toán
   */
  async createPayment(data: {
    amount: number
    ordercode: string | number
    description: string
    method?: payment_method | string
    serviceName?: string
    userId?: string
    serviceId?: string
    returnUrl?: string
    cancelUrl?: string
    metadata?: PaymentMetadata
  }) {
    try {
      const orderCode = typeof data.ordercode === "string" 
        ? Number.parseInt(data.ordercode) 
        : data.ordercode;

      const paymentMethod = "BANK_TRANSFER";

      const paymentLinkData = {
        orderCode: orderCode,
        amount: Number(data.amount),
        description: data.description,
        returnUrl: data.returnUrl
          ? `${data.returnUrl}?orderCode=${orderCode}&status=COMPLETED`
          : `${process.env.DEFAULT_RETURN_URL}?orderCode=${orderCode}&status=COMPLETED`,
        cancelUrl: data.cancelUrl || process.env.DEFAULT_CANCEL_URL,
      };

      // Ghi log để debug
      this.logger.log(`Creating payment link with data: ${JSON.stringify(paymentLinkData)}`);

      const paymentLink = await this.payos.createPaymentLink(paymentLinkData);
      
      // Ghi log kết quả từ PayOS
      this.logger.log(`PayOS response: ${JSON.stringify(paymentLink)}`);

      const payment = await this.prisma.payment.create({
        data: {
          amount: data.amount,
          method: paymentMethod,
          serviceName: data.serviceName || "Enrollment",
          ordercode: orderCode.toString(),
          description: data.description,
          returnUrl: data.returnUrl || process.env.DEFAULT_RETURN_URL,
          cancelUrl: data.cancelUrl || process.env.DEFAULT_CANCEL_URL,
          status: "PENDING",
          userId: data.userId,
          serviceId: data.serviceId,
          checkoutUrl: paymentLink.checkoutUrl,
          metadata: data.metadata,
        },
      });

      return {
        id: payment.id,
        orderCode: orderCode,
        checkoutUrl: paymentLink.checkoutUrl,
      };
    } catch (error) {
      this.logger.error(`Error creating payment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Lấy thông tin chi tiết của một giao dịch thanh toán theo ID
   * 
   * @param id ID của giao dịch thanh toán
   * @returns Thông tin chi tiết của giao dịch thanh toán
   * @throws BadRequestException nếu không tìm thấy giao dịch thanh toán
   */
  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new BadRequestException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  /**
   * Lấy thông tin chi tiết của một giao dịch thanh toán theo mã đơn hàng
   * 
   * @param orderCode Mã đơn hàng của giao dịch thanh toán
   * @returns Thông tin chi tiết của giao dịch thanh toán
   * @throws BadRequestException nếu không tìm thấy giao dịch thanh toán
   */
  async getPaymentByOrderCode(orderCode: string | number) {
    const orderCodeStr = orderCode.toString();
    
    const payment = await this.prisma.payment.findUnique({
      where: { ordercode: orderCodeStr },
    });

    if (!payment) {
      throw new BadRequestException(`Payment with order code ${orderCode} not found`);
    }

    return payment;
  }

  /**
   * Cập nhật trạng thái của một giao dịch thanh toán
   * 
   * @param id ID của giao dịch thanh toán
   * @param status Trạng thái mới của giao dịch thanh toán
   * @returns Thông tin giao dịch thanh toán đã được cập nhật
   */
  async updatePaymentStatus(id: string, status: payment_status) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new BadRequestException(`Payment with ID ${id} not found`);
    }

    return this.prisma.payment.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Cập nhật trạng thái của một giao dịch thanh toán theo mã đơn hàng
   * Nếu trạng thái là COMPLETED, gửi email thông báo
   * 
   * @param orderCode Mã đơn hàng của giao dịch thanh toán
   * @param status Trạng thái mới của giao dịch thanh toán
   * @returns Thông tin giao dịch thanh toán đã được cập nhật
   * @throws BadRequestException nếu không tìm thấy giao dịch thanh toán
   */
  async updatePaymentStatusByOrderCode(orderCode: string | number, status: payment_status) {
    const orderCodeStr = orderCode.toString();
    
    const payment = await this.prisma.payment.findUnique({
      where: { ordercode: orderCodeStr },
    });

    if (!payment) {
      throw new BadRequestException(`Payment with order code ${orderCode} not found`);
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    if (status === "COMPLETED") {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Acme <payment@eduforge.io.vn>",
          to: ["thinhdz1500@gmail.com"],
          subject: "Thanh toán khóa học thành công",
          html: `
            <h1>Thanh toán thành công</h1>
            <p>Cảm ơn bạn đã thanh toán. Mã đơn hàng của bạn là: ${updatedPayment.ordercode}</p>
            <p>Số tiền: ${updatedPayment.amount} VND</p>
          `,
        });
      } catch (emailError) {
        this.logger.error("Error sending email notification", emailError);
      }
    }

    return updatedPayment;
  }

  /**
   * Xử lý webhook từ cổng thanh toán (PayOS)
   * - Cập nhật trạng thái thanh toán
   * - Tạo enrollment nếu thanh toán thành công
   * 
   * @param data Dữ liệu từ cổng thanh toán
   * @returns Kết quả xử lý webhook
   */
  async handlePaymentWebhook(data: any) {
    const { orderCode, status } = data;
    const orderCodeStr = orderCode.toString();

    const payment = await this.getPaymentByOrderCode(orderCodeStr);

    let paymentStatus: payment_status;
    switch (status) {
      case "PAID":
        paymentStatus = "COMPLETED";
        if (payment.metadata) {
          try {
            // Ép kiểu metadata thành PaymentMetadata
            const metadata = payment.metadata as PaymentMetadata;
            
            const enrollmentApi = axios.create({
              baseURL: process.env.ENROLLMENT_SERVICE_URL
            });
            
            await enrollmentApi.post("/enrollments", {
              courseId: metadata.courseId,
              userId: metadata.userId,
              userName: metadata.userName,
              courseName: metadata.courseName,
              isFree: false,
              paymentId: payment.id
            });
          } catch (enrollError) {
            this.logger.error("Error creating enrollment:", enrollError);
          }
        }
        break;
      case "CANCELLED":
        paymentStatus = "CANCELLED";
        break;
      case "EXPIRED":
        paymentStatus = "EXPIRED";
        break;
      case "FAILED":
        paymentStatus = "FAILED";
        break;
      default:
        paymentStatus = "PENDING";
    }

    await this.updatePaymentStatusByOrderCode(orderCodeStr, paymentStatus);

    return { success: true };
  }

  /**
   * Lấy danh sách tất cả các giao dịch thanh toán
   * 
   * @returns Danh sách các giao dịch thanh toán
   */
  async getAllPayments() {
    return this.prisma.payment.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}

