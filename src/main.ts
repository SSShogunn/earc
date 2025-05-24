import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.listen(process.env.PORT ?? 3000).then(() => {
    console.log(`Application is running on: ${process.env.PORT ?? 3000}`);
  }).catch(err => {
    console.error('Error starting the application:', err);
  });
}
bootstrap();
