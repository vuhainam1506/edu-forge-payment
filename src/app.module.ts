// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios'; // Import HttpModule
import { PaymentsModule } from './payments/payments.module';
import { PaymentsController } from './payments/payments.controller';
import { Payments } from './payments/payments';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HttpModule, // Add HttpModule to imports
    PaymentsModule,
  ],
  controllers: [PaymentsController],
  providers: [Payments],
})
export class AppModule {}