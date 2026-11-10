import axios from 'axios';
import qs from 'qs';
import * as config from '../config.js';

export function getMissingEmailConfigKeys() {
  const missing = [];
  if (!config.GRAPH_TENANT_ID) missing.push('GRAPH_TENANT_ID');
  if (!config.GRAPH_CLIENT_ID) missing.push('GRAPH_CLIENT_ID');
  if (!config.GRAPH_CLIENT_SECRET) missing.push('GRAPH_CLIENT_SECRET');
  if (!config.GRAPH_SENDER_EMAIL) missing.push('GRAPH_SENDER_EMAIL');
  if (config.GRAPH_RECIPIENT_EMAILS.length === 0) missing.push('GRAPH_RECIPIENT_EMAILS');
  return missing;
}

export function isEmailConfigured() {
  return getMissingEmailConfigKeys().length === 0;
}

export function assertEmailConfigured() {
  const missing = getMissingEmailConfigKeys();
  if (missing.length > 0) {
    throw new Error(`Email configuration missing: ${missing.join(', ')}`);
  }
}

export async function getAccessToken() {
  assertEmailConfigured();

  const tenantId = config.GRAPH_TENANT_ID;
  const clientId = config.GRAPH_CLIENT_ID;
  const clientSecret = config.GRAPH_CLIENT_SECRET;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const requestBody = qs.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error obtaining access token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

export async function sendEmail(accessToken, subject, bodyContent, recipients = config.GRAPH_RECIPIENT_EMAILS) {
  assertEmailConfigured();

  const graphApiEndpoint = 'https://graph.microsoft.com/v1.0';
  const url = `${graphApiEndpoint}/users/${encodeURIComponent(config.GRAPH_SENDER_EMAIL)}/sendMail`;
  const emailData = {
    message: {
      subject: subject,
      body: {
        contentType: 'HTML',
        content: bodyContent,
      },
      toRecipients: recipients.map((address) => ({
        emailAddress: { address }
      })),
    },
  };

  try {
    await axios.post(url, emailData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Email sent successfully.');
  } catch (error) {
    console.error('Error sending email:', error.response ? error.response.data : error.message);
    throw error;
  }
}
