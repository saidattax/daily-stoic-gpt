import {
    extractSummary,
    renderQuote,
    extractQuote,
    Philosoper,
} from "./main.js";

async function test() {
    const testPhil: Philosoper = {
        name: "Marcus Aurelius",
        img: "./marcus.jpg",
    };

    const testOutput = {
        response:
            '@ "The best revenge is to be unlike him who performed the injury." @\n' +
            "\n" +
            "$ This quote is often attributed to Marcus Aurelius, a Roman philosopher and writer who lived from 121-180 AD. It is a reminder to focus on one's own actions and values rather than seeking revenge or trying to emulate those who have caused harm. Aurelius believed that living a virtuous life was the most effective way to confront adversity and to find peace and fulfillment. $\n",
        conversationId: "XXXXX",
        messageId: "XXXXX",
        testCaption:
            "This quote is often attributed to Marcus Aurelius, a Roman philosopher and writer who lived from 121-180 AD. It is a reminder to focus on one's own actions and values rather than seeking revenge or trying to emulate those who have caused harm. Aurelius believed that living a virtuous life was the most effective way to confront adversity and to find peace and fulfillment.",
    };

    const quote = extractQuote(testOutput.response).trim();
    const caption = extractSummary(testOutput.response).trim();

    const file = await renderQuote(quote, caption, testPhil);

    // await sendRenderToChannel(file, caption);
}

test();
