const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { replyError } = require('../src/interaction');

test('replyError edits an outstanding deferred reply', async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    replied: false,
    editReply: async (payload) => calls.push(['editReply', payload]),
  };

  await replyError(interaction, 'failed');
  assert.deepEqual(calls, [['editReply', { content: '❌ failed' }]]);
});

test('replyError uses an ephemeral follow-up after a completed response', async () => {
  const calls = [];
  const interaction = {
    deferred: false,
    replied: true,
    followUp: async (payload) => calls.push(['followUp', payload]),
  };

  await replyError(interaction, 'failed');
  assert.deepEqual(calls, [[
    'followUp',
    { content: '❌ failed', flags: MessageFlags.Ephemeral },
  ]]);
});

test('replyError sends an ephemeral first response', async () => {
  const calls = [];
  const interaction = {
    deferred: false,
    replied: false,
    reply: async (payload) => calls.push(['reply', payload]),
  };

  await replyError(interaction, 'failed');
  assert.deepEqual(calls, [[
    'reply',
    { content: '❌ failed', flags: MessageFlags.Ephemeral },
  ]]);
});
