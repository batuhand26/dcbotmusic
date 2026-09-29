const { MessageFlags } = require('discord.js');

async function replyError(interaction, message) {
  const content = `❌ ${message}`;

  try {
    if (interaction.deferred && !interaction.replied) {
      return await interaction.editReply({ content });
    }
    if (interaction.replied) {
      return await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
    return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) {
      console.warn(`Ignored expired or already-handled interaction: ${error.code}`);
      return null;
    }
    throw error;
  }
}

module.exports = { replyError };
