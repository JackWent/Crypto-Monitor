import fetch from 'node-fetch';
import { setCachedXmrRate, setLastUpdated } from './state.js';
import { saveXmrRateSample, setAppState } from './db/metrics.js';

export async function updateXmrRate() {
  try {
    console.log('Updating XMR/USD rate with API...');

    let rate;

    // Try CoinGecko API first
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd');
      if (!response.ok) {
        throw new Error(`Failed to fetch data from CoinGecko: ${response.statusText}`);
      }
      const data = await response.json();

      if (!data.monero || typeof data.monero.usd !== 'number') {
        throw new Error('Unexpected API response structure: Missing "monero.usd" field.');
      }

      rate = data.monero.usd;
      console.log(`XMR/USD rate updated with CoinGecko API: $${rate} at ${new Date()}`);
    } catch (coinGeckoError) {
      console.error('CoinGecko API failed:', coinGeckoError.message);

      // Try alternative API (CoinCap)
      try {
        const response = await fetch('https://api.coincap.io/v2/assets/monero');
        if (!response.ok) {
          throw new Error(`Failed to fetch data from CoinCap: ${response.statusText}`);
        }
        const data = await response.json();

        if (!data.data || typeof data.data.priceUsd !== 'string') {
          throw new Error('Unexpected CoinCap API response structure.');
        }

        rate = parseFloat(data.data.priceUsd);
        if (isNaN(rate)) {
          throw new Error('Invalid price value from CoinCap API.');
        }

        console.log(`XMR/USD rate updated with CoinCap API: $${rate} at ${new Date()}`);
      } catch (coinCapError) {
        console.error('CoinCap API also failed:', coinCapError.message);

        // Try a third alternative API (Binance)
        try {
          const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=XMRUSDT');
          if (!response.ok) {
            throw new Error(`Failed to fetch data from Binance: ${response.statusText}`);
          }
          const data = await response.json();

          if (!data.price) {
            throw new Error('Unexpected Binance API response structure.');
          }

          rate = parseFloat(data.price);
          if (isNaN(rate)) {
            throw new Error('Invalid price value from Binance API.');
          }

          console.log(`XMR/USD rate updated with Binance API: $${rate} at ${new Date()}`);
        } catch (binanceError) {
          console.error('All APIs failed:', binanceError.message);
          throw new Error('All price APIs failed');
        }
      }
    }

    const timestamp = Date.now();
    setCachedXmrRate(rate);
    setLastUpdated(new Date(timestamp));

    await saveXmrRateSample(rate, timestamp);
    await setAppState('cached_xmr_rate', {
      rate,
      lastUpdated: timestamp
    });
  } catch (error) {
    console.error('Error updating XMR/USD rate:', error.message);
    throw error;
  }
}
