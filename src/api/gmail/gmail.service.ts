// src/gmail/gmail.service.ts
import {forwardRef, Inject, Injectable, Logger} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { google } from 'googleapis';
import { PropertiesService } from '../properties/properties.service'; // <-- inject this

function decodeB64url(data: string) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function extractFirstUrl(htmlOrText: string): string | null {
    const s3 = htmlOrText.match(/https?:\/\/[^\s"'<>]+\.csv[^\s"'<>]*/i);
    if (s3) return s3[0];
    const href = htmlOrText.match(/href\s*=\s*["']([^"']+)["']/i);
    return href ? href[1] : null;
}
async function followRedirects(url: string, max = 6): Promise<string> {
    let current = url;
    for (let i = 0; i < max; i++) {
        const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'MoverLeadBot/1.0' } });
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).toString(); continue; }
        return current;
    }
    return current;
}

@Injectable()
export class GmailService {
    private readonly log = new Logger(GmailService.name);
    private lastProcessedId?: string;

    constructor(
        @Inject(forwardRef(() => PropertiesService))
        private readonly propertiesService: PropertiesService,
    ) {} // <-- inject

    private gmailClient() {
        const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI, GMAIL_REFRESH_TOKEN } = process.env;
        const oAuth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);
        oAuth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
        return google.gmail({ version: 'v1', auth: oAuth2 });
    }

    async poll() {
        try {
            this.log.log('⏳ Checking Gmail for new DealMachine export emails...');
            const sender = process.env.DEALMACHINE_SENDER || 'no-reply@dealmachine.com';
            const gmail = this.gmailClient();

            const q = `from:${sender} subject:(export) newer_than:1d`;
            const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 3 });
            const msgs = list.data.messages || [];

            if (!msgs.length) {
                this.log.log('📭 No new DealMachine emails found.');
                return;
            }

            for (const m of msgs) {
                if (!m.id) continue;
                if (this.lastProcessedId && m.id <= this.lastProcessedId) continue;

                this.log.log(`📨 Processing message ${m.id}`);
                const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });

                // extract body (html / text)
                const parts = full.data.payload?.parts || [];
                let body = '';
                const stack = [...parts];
                while (stack.length) {
                    const p = stack.pop();
                    if (!p) continue;
                    if (p.parts) stack.push(...p.parts);
                    const mime = p.mimeType || '';
                    const data = p.body?.data;
                    if (data && (mime.includes('text/html') || mime.includes('text/plain'))) {
                        body += '\n' + decodeB64url(data);
                    }
                }
                if (!body && full.data.payload?.body?.data) body = decodeB64url(full.data.payload.body.data);
                if (!body) continue;

                const rawUrl = extractFirstUrl(body);
                if (!rawUrl) {
                    this.log.warn(`⚠️ No download link found in message ${m.id}`);
                    this.lastProcessedId = m.id;
                    continue;
                }

                this.log.log('🔗 Found link, resolving redirects…');
                const finalUrl = await followRedirects(rawUrl);
                this.log.log(`➡️ Final CSV URL: ${finalUrl}`);

                // DIRECT SERVICE CALL — no JWT needed
                this.log.log('🚀 Importing CSV via PropertiesService.importFromUrl(finalUrl)…');
                const result = await this.propertiesService.importDealmachineFromUrl(finalUrl);
                this.log.log(`✅ Import done. rows=${result?.rows ?? 0}, emailsValidated=${result?.emailsValidated ?? 0}`);

                try {
                    const res = await gmail.users.messages.delete({ userId: 'me', id: m.id });
                    this.log.log(`🗑 Deleted Gmail message ${m.id} | Status: ${res?.status || 'no status'}`);
                } catch (e: any) {
                    this.log.error(`❌ Failed to delete Gmail message ${m.id}`, {
                        message: e?.message,
                        status: e?.response?.status,
                        data: e?.response?.data,
                        headers: e?.response?.headers,
                    });
                }
            }
        } catch (e: any) {
            this.log.error(`❌ Gmail poll error: ${e?.message || e}`);
        }
    }
}