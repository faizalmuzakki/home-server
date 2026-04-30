import QRCode from 'qrcode';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const FIELD_MAX = 1000;

function truncate(value, max = FIELD_MAX) {
  if (!value) return '-';
  const str = String(value);
  return str.length <= max ? str : `${str.slice(0, max - 3)}...`;
}

export async function notifyError({ endpoint, method, status, errorMessage, sender, messagePreview }) {
  if (!WEBHOOK_URL) return;

  const isHttp = typeof status === 'number';
  const titleStatus = isHttp ? String(status) : (errorMessage || 'network error');
  const path = endpoint || '(unknown)';

  const payload = {
    embeds: [{
      title: `❌ Expense bot: ${titleStatus} on ${path}`,
      color: 15158332,
      fields: [
        { name: 'Endpoint', value: truncate(`${method || 'REQ'} ${path}`, 200), inline: true },
        { name: 'Status', value: isHttp ? String(status) : 'network', inline: true },
        { name: 'Error', value: truncate(errorMessage) },
        { name: 'Sender', value: truncate(sender || '-', 200) },
        { name: 'Message', value: truncate(messagePreview || '-', 200) }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Discord webhook error:', error?.message ?? error);
  }
}

export async function notifyQrCode(qr) {
  if (!WEBHOOK_URL) return;

  let pngBuffer;
  try {
    pngBuffer = await QRCode.toBuffer(qr, { errorCorrectionLevel: 'M', margin: 2, scale: 8 });
  } catch (error) {
    console.error('QR render error:', error?.message ?? error);
    return;
  }

  const payloadJson = {
    embeds: [{
      title: '📱 WhatsApp bot needs re-pairing',
      description: 'Scan the QR below with WhatsApp → Linked devices. Code rotates every ~20 seconds; if it expires a new one will be posted.',
      color: 16753920,
      timestamp: new Date().toISOString()
    }]
  };

  const boundary = `----WaQR${Date.now().toString(16)}`;
  const head =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="payload_json"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    `${JSON.stringify(payloadJson)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="files[0]"; filename="whatsapp-qr.png"\r\n' +
    'Content-Type: image/png\r\n\r\n';
  const tail = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([Buffer.from(head, 'utf8'), pngBuffer, Buffer.from(tail, 'utf8')]);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });
    if (!response.ok) {
      console.error(`Discord QR webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Discord QR webhook error:', error?.message ?? error);
  }
}
