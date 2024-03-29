import { ChatGPTAPI } from "chatgpt";
import puppeteer from "puppeteer";
import { Telegraf } from "telegraf";
import schedule from "node-schedule";
import { sample } from "lodash-es";
import express from "express";
import path from "path";
import Datastore from "nedb-promises";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

console.log("Using email...", process.env.OPENAI_LOGIN_EMAIL);

// list of philosophers we will use
const PHILOSOPHERS = [
    { name: "Marcus Aurelius", img: "./marcus.jpg" },
    { name: "Epictetus", img: "./epictetus.jpg" },
    { name: "Seneca", img: "./seneca.jpg" },
];

export type Philosoper = typeof PHILOSOPHERS[0];

export function extractQuote(str) {
    var rx = /@[ ]*"(.*?)"/;
    var arr = rx.exec(str);
    return arr?.[1] || "";
}

export function extractSummary(str) {
    var rx = /\$(.*)\./g;
    var arr = rx.exec(str);
    return arr?.[1] || "";
}

// load a database of previously sent quotes. Empty initially
let datastore = Datastore.create("quotes.db");

export async function renderQuote(
    quote: string,
    caption: string,
    phil: Philosoper
) {
    if (quote && caption) {
        if (quote.length > 1 && caption.length > 1) {
            // render using puppeteer
            const browser = await puppeteer.launch({
                headless: false,
                defaultViewport: {
                    width: 1366,
                    height: 768,
                },
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            const page = await browser.newPage();

            await page.goto("http://localhost:3008/", {
                waitUntil: "networkidle0",
            });

            await new Promise((r) => setTimeout(r, 2500));

            await page.evaluate(
                (quote, phil) => {
                    let q = document.getElementById("quote-text");
                    q.innerHTML = quote;

                    let qq = document.getElementById("quoter-text");
                    qq.innerHTML = phil.name;

                    let qm: Partial<HTMLImageElement> =
                        document.getElementById("quoter-img");
                    qm.src = phil.img;
                },
                quote,
                phil
            );

            await new Promise((r) => setTimeout(r, 1000));

            const elements = await page.$$("#card");

            const ts = Date.now();

            const renderDir = ".\\renders";

            if (!fs.existsSync(renderDir)) {
                fs.mkdirSync(renderDir);
            }

            const path = `${renderDir}\\${ts}.png`;

            for (let i = 0; i < elements.length; i++) {
                try {
                    // get screenshot of a particular element
                    await elements[i].screenshot({ path });
                } catch (e) {
                    // if element is 'not visible', spit out error and continue
                    console.log(
                        `couldnt take screenshot of element with ${ts} cause: `,
                        e
                    );
                }
            }

            await browser.close();

            return path;
        }
    }
}

async function sendRenderToTelegramChannel(file: string, caption?: string) {
    const bot = new Telegraf(process.env.TELEGRAM_BOT_ID);

    bot.telegram.sendPhoto(
        process.env.TELEGRAM_CHANNEL_ID,
        { source: file },
        {
            caption,
        }
    );
}

/**
 * Function to get unique quote. Compares against historically sent quotes
 */
async function getUniqueQuote({
    parentMessageId,
    responseText,
    api,
}: {
    parentMessageId: string;
    responseText: string;
    api: ChatGPTAPI;
}): Promise<{ quote: string; caption: string }> {
    // get quote and caption
    const quote = extractQuote(responseText).trim();
    const caption = extractSummary(responseText).trim();

    // first check if the input quote exists
    const elements = await datastore.find({ quote: quote });

    // if doesn't exist. This is the quote to be used.
    if (!elements.length) {
        return {
            quote,
            caption,
        };
    } else {
        // wait for 1 second
        await new Promise((r) => setTimeout(r, 1000));

        // send a follow-up to get a different quote
        const result = await api.sendMessage(
            "Can you tell me a different one? It should not be the same as you've already said before.",
            {
                parentMessageId: parentMessageId,
            }
        );

        console.log("Got different quote");

        console.log(result.text);

        // call this function again recursively
        const { caption, quote } = await getUniqueQuote({
            parentMessageId,
            responseText: result.text,
            api,
        });

        return { caption, quote };
    }
}

async function getRandomQuote(
    philosopher: string
): Promise<{ quote: string; caption: string }> {
    // use puppeteer to bypass cloudflare (headful because of captchas)
    const api = new ChatGPTAPI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Tell me a random quote by ${philosopher}.

The quote should being and end with the @ symbol.

You must also give a short explanation about the quote and the explanation must begin and end with $ symbol.`;

    console.log("sending prompt...");

    const result = await api.sendMessage(prompt, {
        timeoutMs: 2 * 60 * 1000,
    });

    console.log(result);

    const { quote, caption } = await getUniqueQuote({
        api,
        parentMessageId: result.id,
        responseText: result.text,
    });

    await datastore.insert({
        quote: quote,
        created: Date.now(),
    });

    return { quote, caption };
}

/**
 * An express server to serve HTML and images for the quote to render.
 * We will take a screenshot of it using puppeteer.
 */
function startStaticServer() {
    const app = express();

    const __dirname = path.resolve();

    const dir = path.join(__dirname, "public");

    app.use(express.static(dir));

    app.listen(3008, function () {
        console.log("Listening on http://localhost:3008/");
    });
}

async function main() {
    const philosopher = sample(PHILOSOPHERS);

    console.log("chose philosopher", philosopher);

    const { quote, caption } = await getRandomQuote(philosopher.name);

    console.log("rendering quote...");

    console.log(quote);

    console.log(caption);

    const file = await renderQuote(quote, caption, philosopher);

    await sendRenderToTelegramChannel(file, caption);
}

startStaticServer();

// comment these during testing

var args = process.argv.slice(2);
if (args[0]) main();

const job = schedule.scheduleJob("1 10 * * *", main);
