import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DASHBOARD_PIN = '424242';
const { sendPin } = await import('./expense.js');

const fakeSock = () => {
  const sent = [];
  return { sent, sendMessage: async (jid, { text }) => { sent.push({ jid, text }); } };
};

test('/pin in a group does not reveal the PIN', async () => {
  const sock = fakeSock();
  await sendPin(sock, '120363000000000000@g.us', null);
  assert.equal(sock.sent.length, 1);
  assert.doesNotMatch(sock.sent[0].text, /424242/);
});

test('/pin in a private chat replies with the PIN', async () => {
  const sock = fakeSock();
  await sendPin(sock, '6281234567890@s.whatsapp.net', null);
  assert.match(sock.sent[0].text, /424242/);
});
