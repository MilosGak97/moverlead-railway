import * as dotenv from 'dotenv';
dotenv.config(); // Load .env variables immediately
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import { webcrypto } from 'crypto';
import * as express from 'express';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Set the global prefix for all routes to 'hejre'
  app.setGlobalPrefix('api');
  app.use(cookieParser());

    app.use(
        '/api/stripe/webhook',
        bodyParser.raw({ type: 'application/json' }) // Ensure raw body for Stripe
    );

    // ✅ Only one raw parser for Stripe, and assign rawBody
    app.use(
        '/api/stripe/webhook',
        express.raw({ type: 'application/json' }),
        (req: express.Request & { rawBody?: Buffer }, _res, next) => {
            req.rawBody = req.body;
            next();
        }
    );

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));


  //(global as any).crypto = crypto.webcrypto;

  if (!global.crypto) {
    (global as any).crypto = webcrypto;
  }
  app.useGlobalPipes(new ValidationPipe());

  app.enableCors({
    origin: ['https://dev.moverlead.com', 'wss://api.moverlead.com', 'https://localhost:3000', 'https://www.localhost:3000', 'https://apidev.moverlead.com', 'https://moverlead.com', 'https://www.moverlead.com', 'https://dev.moverlead.com'],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger setup
  const config = new DocumentBuilder()
      .setTitle('MoverLead Documentation')
      .setDescription('MoverLead Backend documentation for API references')
      .setVersion('1.0')
      .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('', app, document);

  // Expose OpenAPI JSON at /api-json
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  httpAdapter.get('/api-json', (req, res) => {
    res.json(document);
  });

  await app.listen(process.env.PORT ?? 3008);
}
bootstrap();
