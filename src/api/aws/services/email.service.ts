import {Injectable} from '@nestjs/common';
import {SendEmailCommand, SESClient} from '@aws-sdk/client-ses';
import {ContactFormWebhookDto} from "../../common/dto/contact-form-webhook.dto";
import {PostcardFormWebhookDto} from "../../common/dto/postcard-form-webhook.dto";

@Injectable()
export class EmailService {
    private sesClient: SESClient;

    constructor() {
        this.sesClient = new SESClient({
            region: process.env.AWS_REGION_EMAIL,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    async sendWelcomeEmail(email: string, verifyEmailLink: string) {
        const subject = 'Welcome to Mover Lead';
        const body = `
      <h1>Welcome to MoverLead.com</h1>
      <p>We are excited to have you on board. To verify your email, please use the following link:</p>
         <a href="${verifyEmailLink}">Verify your email</a> 
      <p>If you did not sign up, please ignore this email.</p>
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses: [email],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    async resendEmailVerification(email: string, verifyEmailLink: string) {
        const subject = 'Welcome to Mover Lead';
        const body = `
      <h1>Verify your email at MoverLead.com</h1>
      <p>W To verify your email, please use the following link:</p>
         <a href="${verifyEmailLink}">Verify your email</a>  
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses: [email],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    async forgotPasswordEmail(email: string, resetLink: string) {
        const subject = 'Welcome to Mover Lead';
        const body = `
      <h1>Reset your password</h1>
      <p>Let's get you back on board. To reset your password, please use the following link to reset your password</p>
     <a href="${resetLink}">Reset your password</a> 
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses: [email],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    async contactFormEmail(contactFormWebhookDto: ContactFormWebhookDto) {
        const subject = 'MOVERLEAD.COM FORM: Contact Form';
        const body = `
      <h1>Dear Admin, </h1>
      <p>We have a new contact request:</p>
      <br>
      <strong>Full Name: </strong> ${contactFormWebhookDto.firstName} ${contactFormWebhookDto.lastName} </strong>
      <br>
      <strong>Email: </strong> ${contactFormWebhookDto.email} </strong>
      <br>
      <strong>Phone: </strong> ${contactFormWebhookDto.phone} </strong>
      <br>
      <strong>Message: </strong> ${contactFormWebhookDto.message} </strong> 
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses:  ['support@moverlead.com'],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    async postcardOrderEmail(postcardFormWebhookDto: PostcardFormWebhookDto) {
        const subject = 'MOVERLEAD.COM FORM: Postcard Order Form';
        const body = `
      <h1>Dear Admin, </h1>
      <p>We have a new postcard order:</p>
      <br>
      <strong>Full Name: </strong> ${postcardFormWebhookDto.firstName} ${postcardFormWebhookDto.lastName} </strong>
      <br>
      <strong>Email: </strong> ${postcardFormWebhookDto.email} </strong>
      <br>
      <strong>Phone: </strong> ${postcardFormWebhookDto.phone} </strong>
      <br>
      <strong>Message: </strong> ${postcardFormWebhookDto.message} </strong>
      <br>
      <strong>Postcard ID: </strong> ${postcardFormWebhookDto.postcardId} </strong>
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses: ['support@moverlead.com'],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    async susbcribeToBlogEmail(email: string) {
        const subject = 'MOVERLEAD.COM FORM: Subscribe to blog';
        const body = `
      <h1>Dear Admin,</h1>
      <p>You have a new subscriber to your blog:</p>
      <br>
         <strong> Email of subscriber: </strong> ${email} 
    
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses:  ['support@moverlead.com'],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    async incomingWebhookEmail(
        payload: unknown,
        meta?: { query?: unknown; path?: string; method?: string },
    ) {
        const subject = 'MOVERLEAD.COM WEBHOOK: Incoming payload';
        const payloadJson = this.escapeHtml(this.safeStringify(payload));
        const queryJson = this.escapeHtml(this.safeStringify(meta?.query ?? {}));
        const body = `
      <h1>Incoming webhook payload</h1>
      <p><strong>Path:</strong> ${meta?.path ?? 'unknown'}</p>
      <p><strong>Method:</strong> ${meta?.method ?? 'unknown'}</p>
      <h2>Query</h2>
      <pre>${queryJson}</pre>
      <h2>Payload</h2>
      <pre>${payloadJson}</pre>
    `;
        try {
            const command = new SendEmailCommand({
                Source: process.env.AWS_SES_EMAIL_FROM,
                Destination: {
                    ToAddresses: ['lazhar@moverlead.com', 'milo@vanexpressmoving.com'],
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                    Subject: {
                        Charset: 'UTF-8',
                        Data: subject,
                    },
                },
            });
            const data = await this.sesClient.send(command);
            console.log(data);
            return true;
        } catch (err) {
            console.log(err);
            throw new Error('Could not send aws');
        }
    }

    private safeStringify(value: unknown): string {
        try {
            const json = JSON.stringify(value, null, 2);
            if (json !== undefined) {
                return json;
            }
        } catch (err) {
            try {
                return String(value);
            } catch (stringErr) {
                return '[unserializable payload]';
            }
        }
        try {
            return String(value);
        } catch (stringErr) {
            return '[unserializable payload]';
        }
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

}
