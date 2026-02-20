import {Injectable, OnModuleInit} from '@nestjs/common';
import OpenAI from 'openai';
import {AiFilteringDto} from "./dto/ai-filtering-dto";
import {encoding_for_model} from '@dqbd/tiktoken';
import axios from "axios";

type Label =
    | "FURNITURE"
    | "NO_FURNITURE"
    | "NOT_SURE"
    | "OUTDOOR"
    | "IGNORED";

export interface AiFilteringResult {
    id: string;
    counts: Record<Label, number>;
    verdict: 'FURNISHED' | 'EMPTY' | 'UNKNOWN';
}

type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

@Injectable()
export class AiService implements OnModuleInit {
    private openai: OpenAI;
    private readonly apiKey = process.env.OPENAI_API_KEY;

    onModuleInit() {
        if (!this.apiKey) {
            throw new Error('Missing OPENAI_API_KEY in environment');
        }
        this.openai = new OpenAI({apiKey: this.apiKey});
    }

    /**
     * Classify *all* photos in one shot using o4-mini’s vision + reasoning.
     */
    async classifyPropertyBatch(aiFilteringDto: AiFilteringDto): Promise<{
        id: string;
        counts: Record<Label, number>;
        verdict: "FURNISHED" | "EMPTY" | "UNKNOWN";
        raw: string;
    }> {
        const {propertyId, photos} = aiFilteringDto;

        // 1️⃣ Build your parts array
        const parts: ContentPart[] = [
            {
                type: "text",
                text: `
You are an expert home-staging assistant. For each of the images below, label it with exactly one of:
  • OUTDOOR       – shot taken outside
  • IGNORED       – floor plan, bathroom, kitchen-only
  • NO_FURNITURE  – totally empty interior
  • FURNITURE     – interior showing any furniture
  • NOT_SURE      – can’t tell
Respond with a JSON array—no extra text, no explanations.
[
  { "img": "1", "label": "<one-of-the-five>" },
  { "img": "2", "label": "<one-of-the-five>" },
  …
] 
`.trim(),

            },
            // 2️⃣ Then one image_url part for each photo
            ...photos.map((url) => ({
                type: "image_url" as const,
                image_url: {url},
            })),
        ];

        // 3️⃣ Send a single call to o4-mini
        const res = await this.openai.chat.completions.create({
            model: "o4-mini",
            messages: [
                {role: "system", content: "You are an expert home-staging assistant."},
                {role: "user", content: parts},
            ],
        });

        // 4️⃣ Grab the raw JSON reply
        let raw = res.choices[0].message.content.trim();

        // clean out the fences
        raw = this.cleanAIJson(raw);

        console.log(res)
        // 5️⃣ Parse & tally
        let arr: { img: string; label: Label }[];
        try {
            arr = JSON.parse(raw);
        } catch (e) {
            throw new Error("Failed to parse JSON from AI:\n" + raw);
        }

        const counts: Record<Label, number> = {
            OUTDOOR: 0,
            IGNORED: 0,
            NO_FURNITURE: 0,
            FURNITURE: 0,
            NOT_SURE: 0,
        };
        for (const {label} of arr) {
            if (!counts.hasOwnProperty(label)) {
                throw new Error(`Invalid label “${label}” returned by AI`);
            }
            counts[label]++;
        }

        // 6️⃣ Final verdict on interiors
        const furnished = counts.FURNITURE;
        const empty = counts.NO_FURNITURE;
        const verdict: "FURNISHED" | "EMPTY" | "UNKNOWN" =
            furnished > empty
                ? "FURNISHED"
                : empty > furnished
                    ? "EMPTY"
                    : "UNKNOWN";

        return {id: propertyId, counts, verdict, raw};
    }

    private async classifyImage(url: string): Promise<Label> {
        const userContent: ContentPart[] = [
            {
                type: "text",
                text: `
You are an expert home-staging assistant whose only task is to classify whether a room is furnished.
1️⃣First, decide if the photo is OUTDOOR and respond OUTDOOR.  
2️⃣If picture is not OUTDOOR but from INSIDE OF THE HOUSE, decide if you see any furniture (chairs, tables, sofas, beds, shelves) using cues like planar surfaces on legs, repeating structural elements, upholstery, and indoor lighting.  
3️⃣Then respond with exactly one label:
   • FURNITURE     (room shows furniture)
   • NO_FURNITURE  (room is empty)  
   • NOT_SURE      (can’t tell)  
   • IGNORED       (floor plans, bathrooms, cabinet-only shots)
Analyze the following image now:
`
            },
            {
                type: "image_url",
                image_url: {url}
            },
        ];


        // TESTING TOKENS LENGTH
        const rawPrompt = JSON.stringify(userContent);
        console.log('Raw prompt length (chars):', rawPrompt.length);


        const enc = encoding_for_model('gpt-4o-mini');
        console.log('Raw prompt tokens:', enc.encode(rawPrompt).length);

        const res = await this.openai.chat.completions.create({
            model: "o4-mini",      // vision-enabled model
            //temperature: 0,
            messages: [
                {role: "system", content: "You are an expert home-staging assistant."},
                {role: "user", content: userContent}
            ],
        });

        const label = res.choices[0].message.content.trim() as Label;
        if (!['FURNITURE', 'NO_FURNITURE', 'NOT_SURE', 'OUTDOOR', 'IGNORED'].includes(label)) {
            throw new Error(`Unexpected label: ${label}`);
        }
        console.log(res)
        console.log('URL: ', url)
        console.log(label)
        return label;
    }

    private cleanAIJson(raw: string): string {
        return raw
            .trim()                                  // remove leading/trailing whitespace/newlines
            .replace(/^```(?:json)?\r?\n?/, '')      // strip leading ``` or ```json plus newline
            .replace(/\r?\n?```$/, '');             // strip trailing ```
    }


    async classifyProperty(
        aiFilteringDto: AiFilteringDto,
    ): Promise<AiFilteringResult> {
        const { propertyId, photos } = aiFilteringDto;

        // Initialize counts for each Label
        const counts: Record<Label, number> = {
            OUTDOOR: 0,
            IGNORED: 0,
            NO_FURNITURE: 0,
            FURNITURE: 0,
            NOT_SURE: 0,
        };

        // 1) Loop through each photo URL and classify
        for (const url of photos) {
            try {
                const label = await this.classifyImage(url);
                // label is guaranteed to be one of Label
                counts[label]++;
            } catch (err) {
                console.warn(`✱ classifyImage failed for ${url}:`, err);
                // If classifyImage throws, we simply skip that image
            }
        }

        // 2) Determine final verdict based on interior counts only
        //    (i.e., compare FURNITURE vs NO_FURNITURE)
        let verdict: 'FURNISHED' | 'EMPTY' | 'UNKNOWN';
        if (counts.FURNITURE > counts.NO_FURNITURE) {
            verdict = 'FURNISHED';
        } else if (counts.NO_FURNITURE > counts.FURNITURE) {
            verdict = 'EMPTY';
        } else {
            verdict = 'UNKNOWN';
        }

        return {
            id: propertyId,
            counts,
            verdict,
        };
    }


}

