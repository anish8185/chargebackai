# ChargebackAI

An AI-powered dispute investigation system for card-issuing banks.

## What it does

ChargebackAI helps fraud analysts at card-issuing banks investigate cardholder disputes faster. Given a dispute case, the system:


## Running locally

**Requirements:** Node.js 18+, an [Anthropic API key](https://console.anthropic.com)

```bash
git clone https://github.com/YOUR_USERNAME/chargebackai
cd chargebackai

# Install dependencies
npm install

# Add your API key
cp .env.example .env
# Edit .env and replace 'your_anthropic_api_key_here' with your actual key

# Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Test cases

Three cases are pre-loaded in the app, selectable from the Investigation tab:

| Case | Reason Code | Expected Outcome |
|------|-------------|-----------------|
| Merchandise Not Received | 13.1 | **Fight** — strong delivery evidence |
| Cancelled Recurring Transaction | 13.2 | **Escalate** — ambiguous cancellation signals |
| Not as Described | 13.3 | **Accept** — weak evidence, credible claim |

## Tech stack

- React 18 (no framework)
- Vite
- Anthropic Claude API (claude-sonnet-4-6)
- Zero external UI dependencies — all styles inline
