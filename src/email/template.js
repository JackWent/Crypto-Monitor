import * as config from '../config.js';

// Email clients don't render backdrop-filter/animations, so this stays a
// conservative table-based layout — just reskinned with the dashboard's new
// neon palette (cyan / violet / amber) instead of the old flat gray/teal.
export function generateDailyEmailBody(xmrPrice, minerStats) {
  const dashboardBaseUrl = config.DASHBOARD_PUBLIC_URL ? config.DASHBOARD_PUBLIC_URL.replace(/\/+$/, '') : '';
  const dashboardLogoUrl = config.DASHBOARD_LOGO_URL
    || (dashboardBaseUrl ? `${dashboardBaseUrl}/xmr-logo.png` : 'https://crypto.example.com/xmr-logo.png');
  const dashboardLinkUrl = dashboardBaseUrl || 'https://crypto.example.com';

  // Get active workers (only those with hashrate > 0)
  const activeWorkers = minerStats.perWorkerStats ? minerStats.perWorkerStats.filter(worker => {
    const hashrate = parseFloat(worker.hashrate);
    return hashrate && hashrate > 0;
  }) : [];

  // Create a quirky greeting message
  let greeting = "Hello Jack! ";
  const quirkyMessages = [
    "Looks like your digital money machines are humming along nicely today!",
    "Your crypto miners have been busy while you were sleeping!",
    "The XMR mining elves have been hard at work overnight.",
    "Rise and shine! Here's your morning dose of crypto mining stats.",
    "Good morning crypto captain! Your mining fleet status report is ready.",
    "Your crypto miners didn't hit the snooze button this morning!",
    "While you were dreaming, your miners were scheming (to make you XMR).",
    "Coffee brewing? Miners mining? Perfect morning!",
    "Checking your mining stats before breakfast? Now that's dedication!",
    "Morning crypto update: still making magic internet money while you sleep!"
  ];

  // Select a random quirky message
  const randomMessage = quirkyMessages[Math.floor(Math.random() * quirkyMessages.length)];
  greeting += randomMessage;

  // Format numbers according to Concep article recommendations
  // Replace digits with HTML entity codes and use spans with specific classes
  const formatNumberToPreventLinking = (number) => {
    if (!number) return '0';
    const numStr = number.toString();

    // This creates a series of spans, each containing one character
    // Using the specific technique from the Concep article
    let result = '';
    for (let i = 0; i < numStr.length; i++) {
      result += `<span class="appleLinks" style="color:inherit; text-decoration:none;">${numStr[i]}</span>`;
    }
    return result;
  };

  // Create worker details HTML with Apple-specific formatting
  let workerDetailsHTML = '';
  if (activeWorkers && activeWorkers.length > 0) {
    workerDetailsHTML = `
      <h2 style="color: #f5f7ff; margin-top: 30px; border-bottom: 1px solid #22e5cc; padding-bottom: 8px;">Active Workers (${activeWorkers.length})</h2>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin-bottom:20px; border:1px solid #262b3d; border-radius: 4px; overflow: hidden;">
        <tr style="background-color:#141826; color:#f5f7ff;">
          <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Worker ID</th>
          <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Hash Rate</th>
          <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Accepted Hashes</th>
          <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Expired Hashes</th>
          <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Last Share</th>
        </tr>
        ${activeWorkers.map((worker, index) => `
          <tr style="background-color:${index % 2 === 0 ? '#171c2c' : '#11141f'}; color:#f5f7ff;">
            <td style="padding:12px; text-align:left; border:1px solid #262b3d;">${worker.workerId || 'Unknown'}</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d; color: #22e5cc; font-weight: 600;">${worker.hashrate || '0 H/s'}</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d;">${formatNumberToPreventLinking(worker.hashes)}</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d;">${formatNumberToPreventLinking(worker.expired)}</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d;">${new Date(worker.lastShare * 1000).toLocaleString()}</td>
          </tr>
        `).join('')}
      </table>
    `;
  } else {
    workerDetailsHTML = '<p style="color: #ff5f7a; padding: 15px; background-color: #171c2c; border-radius: 4px;">No active workers found</p>';
  }

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="format-detection" content="telephone=no" />
      <style type="text/css">
        /* CSS reset */
        body, table, td, p, a, li, blockquote {
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
        }
        /* Specifically for Apple Mail */
        .appleLinks a {color:#000000 !important; text-decoration:none !important;}
        .appleLinksWhite a {color:#ffffff !important; text-decoration:none !important;}
        /* More Apple-specific fixes */
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: none !important;
          font-size: inherit !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }
      </style>
    </head>
    <body style="margin:0; padding:0; background-color:#05070d; color:#f5f7ff; font-family:'Segoe UI', Arial, sans-serif;">
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #05070d; color: #f5f7ff; padding: 25px; border-radius: 8px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #22e5cc; padding-bottom: 15px;">
          <h2 style="margin: 0; margin-right: 16px; color: #f5f7ff;">XMR Update</h2>
          <img src="${dashboardLogoUrl}" alt="XMR Logo" style="height: 35px; width: auto;">
        </div>

        <div style="background-color: #141826; border-radius: 6px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #22e5cc;">
          <p style="margin: 0; font-size: 1.1em; line-height: 1.5;">${greeting}</p>
        </div>

        <div style="background-color: #141826; border-radius: 6px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #b26bff;">
          <p style="margin: 0; font-size: 1.1em;">Current XMR to USD price: <span style="color: #b26bff; font-weight: bold; font-size: 1.2em;">$${xmrPrice}</span></p>
        </div>

        <h2 style="color: #f5f7ff; margin-top: 25px; border-bottom: 1px solid #22e5cc; padding-bottom: 8px;">Overall Mining Stats</h2>

        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 20px 0;">
          <tr>
            <td width="48%" valign="top">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #141826; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <div style="color: #8b93b0; font-size: 0.9em; margin-bottom: 5px;">Total Hashrate</div>
                    <div style="font-size: 1.2em; font-weight: bold; color: #22e5cc;">${minerStats.stats.hashrate || 'N/A'}</div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="4%">&nbsp;</td>
            <td width="48%" valign="top">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #141826; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <div style="color: #8b93b0; font-size: 0.9em; margin-bottom: 5px;">Total Hashes</div>
                    <div style="font-size: 1.2em; font-weight: bold;">${formatNumberToPreventLinking(minerStats.stats.hashes) || 'N/A'}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td colspan="3" height="15">&nbsp;</td>
          </tr>
          <tr>
            <td width="48%" valign="top">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #141826; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <div style="color: #8b93b0; font-size: 0.9em; margin-bottom: 5px;">Pending Balance</div>
                    <div style="font-size: 1.2em; font-weight: bold; color: #ffb020;">${(minerStats.stats.balance / 1e12).toFixed(12)} XMR</div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="4%">&nbsp;</td>
            <td width="48%" valign="top">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #141826; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <div style="color: #8b93b0; font-size: 0.9em; margin-bottom: 5px;">Total Paid</div>
                    <div style="font-size: 1.2em; font-weight: bold; color: #3ddc84;">${(minerStats.stats.paid / 1e12).toFixed(12)} XMR</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td colspan="3" height="15">&nbsp;</td>
          </tr>
          <tr>
            <td width="48%" valign="top">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #141826; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <div style="color: #8b93b0; font-size: 0.9em; margin-bottom: 5px;">Blocks Found</div>
                    <div style="font-size: 1.2em; font-weight: bold; color: #a6f24f;">${minerStats.stats.blocksFound || '0'}</div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="4%">&nbsp;</td>
            <td width="48%" valign="top">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #141826; border-radius: 6px;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <div style="color: #8b93b0; font-size: 0.9em; margin-bottom: 5px;">Expired Hashes</div>
                    <div style="font-size: 1.2em; font-weight: bold; color: #ff5f7a;">
                      <span style="color: #ff5f7a !important; text-decoration: none;">${formatNumberToPreventLinking(minerStats.stats.expired)}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        ${workerDetailsHTML}

        <div style="margin-top: 40px; border-top: 1px solid #262b3d; padding-top: 15px; text-align: center;">
          <p style="color:#8b93b0; font-size:13px; margin-bottom: 5px;">
            This is an automated email from your <a href="${dashboardLinkUrl}" style="color: #22e5cc; text-decoration: none;">XMR Mining Dashboard</a>
          </p>
          <p style="color:#8b93b0; font-size:12px; margin-top: 5px;">
            Generated on ${new Date().toLocaleString()} (Sent daily at 10:00 AM)
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Reuses the daily email's dark neon look (same header/footer/card layout)
// but swaps the accent to red and focuses on a single worker, so an alert
// is instantly recognizable as "something's wrong" rather than a status digest.
export function generateMinerOfflineEmailBody(worker, offlineDurationMs) {
  const dashboardBaseUrl = config.DASHBOARD_PUBLIC_URL ? config.DASHBOARD_PUBLIC_URL.replace(/\/+$/, '') : '';
  const dashboardLogoUrl = config.DASHBOARD_LOGO_URL
    || (dashboardBaseUrl ? `${dashboardBaseUrl}/xmr-logo.png` : 'https://crypto.example.com/xmr-logo.png');
  const dashboardLinkUrl = dashboardBaseUrl || 'https://crypto.example.com';

  const workerId = worker.workerId || 'Unknown worker';
  const lastShareUnix = Number(worker.lastShare);
  const lastShareText = Number.isFinite(lastShareUnix) && lastShareUnix > 0
    ? new Date(lastShareUnix * 1000).toLocaleString()
    : 'Never';

  const totalMinutes = Math.floor(offlineDurationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const offlineDurationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="format-detection" content="telephone=no" />
      <style type="text/css">
        body, table, td, p, a, li, blockquote {
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
        }
        .appleLinks a {color:#000000 !important; text-decoration:none !important;}
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: none !important;
          font-size: inherit !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }
      </style>
    </head>
    <body style="margin:0; padding:0; background-color:#05070d; color:#f5f7ff; font-family:'Segoe UI', Arial, sans-serif;">
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #05070d; color: #f5f7ff; padding: 25px; border-radius: 8px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #ff5f7a; padding-bottom: 15px;">
          <h2 style="margin: 0; margin-right: 16px; color: #f5f7ff;">⚠️ Miner Offline Alert</h2>
          <img src="${dashboardLogoUrl}" alt="XMR Logo" style="height: 35px; width: auto;">
        </div>

        <div style="background-color: #171c2c; border-radius: 6px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #ff5f7a;">
          <p style="margin: 0; font-size: 1.1em; line-height: 1.5;">
            Hey Jack, <strong style="color:#ff5f7a;">${workerId}</strong> has been offline for over <strong>${offlineDurationText}</strong>. You'll get one more email when it comes back online.
          </p>
        </div>

        <table cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin-bottom:20px; border:1px solid #262b3d; border-radius: 4px; overflow: hidden;">
          <tr style="background-color:#141826; color:#f5f7ff;">
            <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Worker ID</th>
            <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Status</th>
            <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Last Share</th>
            <th style="padding:12px; text-align:left; border:1px solid #262b3d; font-weight: 600;">Offline For</th>
          </tr>
          <tr style="background-color:#11141f; color:#f5f7ff;">
            <td style="padding:12px; text-align:left; border:1px solid #262b3d;">${workerId}</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d; color: #ff5f7a; font-weight: 600;">Offline</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d;">${lastShareText}</td>
            <td style="padding:12px; text-align:left; border:1px solid #262b3d; color: #ffb020; font-weight: 600;">${offlineDurationText}</td>
          </tr>
        </table>

        <div style="text-align:center; margin: 25px 0;">
          <a href="${dashboardLinkUrl}" style="display:inline-block; background-color:#ff5f7a; color:#05070d; font-weight:600; text-decoration:none; padding:12px 24px; border-radius:6px;">View Dashboard</a>
        </div>

        <div style="margin-top: 40px; border-top: 1px solid #262b3d; padding-top: 15px; text-align: center;">
          <p style="color:#8b93b0; font-size:13px; margin-bottom: 5px;">
            This is an automated alert from your <a href="${dashboardLinkUrl}" style="color: #22e5cc; text-decoration: none;">XMR Mining Dashboard</a>
          </p>
          <p style="color:#8b93b0; font-size:12px; margin-top: 5px;">
            Generated on ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Sent once a previously-alerted worker's lastShare is fresh again — closes
// the loop on generateMinerOfflineEmailBody so "offline" doesn't go unresolved.
export function generateMinerBackOnlineEmailBody(worker) {
  const dashboardBaseUrl = config.DASHBOARD_PUBLIC_URL ? config.DASHBOARD_PUBLIC_URL.replace(/\/+$/, '') : '';
  const dashboardLogoUrl = config.DASHBOARD_LOGO_URL
    || (dashboardBaseUrl ? `${dashboardBaseUrl}/xmr-logo.png` : 'https://crypto.example.com/xmr-logo.png');
  const dashboardLinkUrl = dashboardBaseUrl || 'https://crypto.example.com';
  const workerId = worker.workerId || 'Unknown worker';

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin:0; padding:0; background-color:#05070d; color:#f5f7ff; font-family:'Segoe UI', Arial, sans-serif;">
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #05070d; color: #f5f7ff; padding: 25px; border-radius: 8px;">
        <div style="display: flex; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #3ddc84; padding-bottom: 15px;">
          <h2 style="margin: 0; margin-right: 16px; color: #f5f7ff;">✅ Miner Back Online</h2>
          <img src="${dashboardLogoUrl}" alt="XMR Logo" style="height: 35px; width: auto;">
        </div>

        <div style="background-color: #171c2c; border-radius: 6px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #3ddc84;">
          <p style="margin: 0; font-size: 1.1em; line-height: 1.5;">
            Good news — <strong style="color:#3ddc84;">${workerId}</strong> is back online and submitting shares again.
          </p>
        </div>

        <div style="text-align:center; margin: 25px 0;">
          <a href="${dashboardLinkUrl}" style="display:inline-block; background-color:#3ddc84; color:#05070d; font-weight:600; text-decoration:none; padding:12px 24px; border-radius:6px;">View Dashboard</a>
        </div>

        <div style="margin-top: 40px; border-top: 1px solid #262b3d; padding-top: 15px; text-align: center;">
          <p style="color:#8b93b0; font-size:13px; margin-bottom: 5px;">
            This is an automated alert from your <a href="${dashboardLinkUrl}" style="color: #22e5cc; text-decoration: none;">XMR Mining Dashboard</a>
          </p>
          <p style="color:#8b93b0; font-size:12px; margin-top: 5px;">
            Generated on ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}
