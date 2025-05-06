import { Injectable, Logger, BadRequestException } from "@nestjs/common"
import { PrismaClient, type payment_status, type payment_method } from "@prisma/client"
const PayOS = require("@payos/node")
import { Resend } from "resend"
require("dotenv").config() // Load .env
import axios from 'axios';

@Injectable()
export class PaymentsService {
  private payos: any
  private readonly logger = new Logger(PaymentsService.name)
  private prisma: PrismaClient

  constructor() {
    try {
      this.logger.log("Tạo PayOS instance")
      this.payos = new PayOS(process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, process.env.PAYOS_CHECKSUM_KEY)
      this.logger.log("PayOS instance created successfully")
      this.prisma = new PrismaClient()
    } catch (error) {
      this.logger.error("Error creating PayOS instance", error)
      throw error
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
    metadata?: any
  }) {
    try {
      // Đảm bảo orderCode là number
      const orderCode = typeof data.ordercode === "string" ? Number.parseInt(data.ordercode) : data.ordercode

      this.logger.log(`Creating payment with orderCode: ${orderCode} (${typeof orderCode})`)

      // Xử lý method nếu là string
      const paymentMethod =
        typeof data.method === "string" ? (data.method as payment_method) : data.method || "BANK_TRANSFER"

      // Tạo payment link với PayOS
      const paymentLinkData = {
        orderCode: orderCode,
        amount: Number(data.amount),
        description: data.description,
        returnUrl: data.returnUrl
          ? `${data.returnUrl}?orderCode=${orderCode}&courseId=${data.metadata?.courseId || ""}&userId=${data.metadata?.userId || ""}&userName=${encodeURIComponent(data.metadata?.userName || "")}&courseName=${encodeURIComponent(data.metadata?.courseName || "")}`
          : `${process.env.DEFAULT_RETURN_URL}?orderCode=${orderCode}`,
        cancelUrl: data.cancelUrl || process.env.DEFAULT_CANCEL_URL,
      }

      this.logger.log(`Creating PayOS payment link with data: ${JSON.stringify(paymentLinkData)}`)

      const paymentLink = await this.payos.createPaymentLink(paymentLinkData)

      this.logger.log(`PayOS payment link created: ${JSON.stringify(paymentLink)}`)

      // Tạo payment trong database
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
      })

      this.logger.log(`Created payment record with ID: ${payment.id}`)

      return {
        id: payment.id,
        orderCode: orderCode,
        checkoutUrl: paymentLink.checkoutUrl,
      }
    } catch (error) {
      this.logger.error(`Error creating payment: ${error.message}`, error.stack)
      throw error
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
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id },
      })

      if (!payment) {
        throw new BadRequestException(`Payment with ID ${id} not found`)
      }

      return payment
    } catch (error) {
      this.logger.error(`Error getting payment with ID ${id}`, error)
      throw error
    }
  }

  /**
   * Lấy thông tin chi tiết của một giao dịch thanh toán theo mã đơn hàng
   * 
   * @param orderCode Mã đơn hàng của giao dịch thanh toán
   * @returns Thông tin chi tiết của giao dịch thanh toán
   * @throws BadRequestException nếu không tìm thấy giao dịch thanh toán
   */
  async getPaymentByOrderCode(orderCode: string | number) {
    try {
      // Đảm bảo orderCode là string
      const orderCodeStr = orderCode.toString()
      this.logger.log(`Getting payment with orderCode: ${orderCodeStr}`)

      const payment = await this.prisma.payment.findUnique({
        where: { ordercode: orderCodeStr },
      })

      if (!payment) {
        throw new BadRequestException(`Payment with order code ${orderCode} not found`)
      }

      return payment
    } catch (error) {
      this.logger.error(`Error getting payment with order code ${orderCode}`, error)
      throw error
    }
  }

  /**
   * Cập nhật trạng thái của một giao dịch thanh toán
   * 
   * @param id ID của giao dịch thanh toán
   * @param status Trạng thái mới của giao dịch thanh toán
   * @returns Thông tin giao dịch thanh toán đã được cập nhật
   */
  async updatePaymentStatus(id: string, status: payment_status) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id },
      })

      if (!payment) {
        throw new BadRequestException(`Payment with ID ${id} not found`)
      }

      const updatedPayment = await this.prisma.payment.update({
        where: { id },
        data: {
          status,
          updatedAt: new Date(),
        },
      })

      return updatedPayment
    } catch (error) {
      this.logger.error(`Error updating payment status for ID ${id}`, error)
      throw error
    }
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
    try {
      // Đảm bảo orderCode là string
      const orderCodeStr = orderCode.toString()

      // Tìm payment theo orderCode
      const payment = await this.prisma.payment.findUnique({
        where: { ordercode: orderCodeStr },
      })

      if (!payment) {
        throw new BadRequestException(`Payment with order code ${orderCode} not found`)
      }

      // Cập nhật trạng thái
      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          updatedAt: new Date(),
        },
      })

      // Nếu thanh toán thành công, gửi email thông báo
      if (status === "COMPLETED") {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: "Acme <payment@eduforge.io.vn>",
            to: ["thinhdz1500@gmail.com"], // Thay bằng email thật từ user service
            subject: "Thanh toán khóa học thành công",
            html: `
              <h1>Thanh toán thành công</h1>
              <p>Cảm ơn bạn đã thanh toán. Mã đơn hàng của bạn là: ${updatedPayment.ordercode}</p>
              <p>Số tiền: ${updatedPayment.amount} VND</p>
            `,
          })
        } catch (emailError) {
          this.logger.error("Error sending email notification", emailError)
          // Không throw error ở đây, vẫn tiếp tục flow
        }
      }

      return updatedPayment
    } catch (error) {
      this.logger.error(`Error updating payment status for order code ${orderCode}`, error)
      throw error
    }
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
    try {
      const { orderCode, status } = data;
      const orderCodeStr = orderCode.toString();

      // Tìm payment theo orderCode
      const payment = await this.getPaymentByOrderCode(orderCodeStr);

      // Cập nhật trạng thái payment
      let paymentStatus: payment_status;
      switch (status) {
        case "PAID":
          paymentStatus = "COMPLETED";
          // Tạo enrollment khi thanh toán thành công
          if (payment.metadata) {
            try {
              const enrollmentApi = await axios.create({
                baseURL: process.env.ENROLLMENT_SERVICE_URL
              });
              
              await enrollmentApi.post("/enrollments", {
                courseId: payment.metadata.courseId,
                userId: payment.metadata.userId,
                userName: payment.metadata.userName,
                courseName: payment.metadata.courseName,
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

      // Cập nhật trạng thái payment
      await this.updatePaymentStatusByOrderCode(orderCodeStr, paymentStatus);

      return { success: true };
    } catch (error) {
      this.logger.error("Error handling payment webhook:", error);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả các giao dịch thanh toán
   * 
   * @returns Danh sách các giao dịch thanh toán
   */
  async getAllPayments() {
    try {
      const payments = await this.prisma.payment.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      return payments;
    } catch (error) {
      this.logger.error("Error getting all payments:", error);
      throw error;
    }
  }
}

