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
    console.error('Discord webhook error:', error.message);
  }
}
