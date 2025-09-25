require('./keepalive.js');
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');

const { lirePlage, ecrirePlage } = require('./sheets.js');

console.log("TOKEN =", process.env.TOKEN ? "[OK]" : "[MISSING]");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let userData = {};

async function chargerUserData() {
  try {
    const rows = await lirePlage('Bot-Rosen!A2:E');
    if (rows && rows.length) {
      for (const row of rows) {
        const [id, xp, level, progress, validated] = row;
        userData[id] = {
          xp: parseInt(xp) || 0,
          level: parseInt(level) || 1,
          progress: parseInt(progress) || 0,
          validated: validated === 'true'
        };
      }
    }
  } catch (e) {
    console.error('❌ Erreur chargement userData depuis Sheets', e);
  }
}

async function saveUserData(userId, data) {
  try {
    let rows = await lirePlage('Bot-Rosen!A2:A');
    let rowIndex = -1;
    if (rows) {
      rowIndex = rows.findIndex(r => r[0] === userId);
    }

    const values = [[
      data.xp.toString(),
      data.level.toString(),
      data.progress.toString(),
      data.validated.toString()
    ]];

    if (rowIndex === -1) {
      const lastRow = rows ? rows.length + 1 : 1;
      const range = `Bot-Rosen!A${lastRow + 1}:E${lastRow + 1}`;
      await ecrirePlage(range, [[userId, ...values[0]]]);
    } else {
      const range = `Bot-Rosen!B${rowIndex + 2}:E${rowIndex + 2}`;
      await ecrirePlage(range, values);
    }

    userData[userId] = data;
  } catch (error) {
    console.error('❌ Erreur sauvegarde userData', error);
  }
}

client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await chargerUserData();

  // Commandes slash
  const commands = [
    new SlashCommandBuilder().setName('profil').setDescription('Affiche ton profil et métiers'),
    new SlashCommandBuilder().setName('metier').setDescription('Choisis ton métier via un menu déroulant'),
    new SlashCommandBuilder().setName('requete').setDescription('Demande de l’aide à un métier'),
    new SlashCommandBuilder().setName('donxp').setDescription('Donne de l\'XP à un joueur')
      .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur qui reçoit l\'XP').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription('Le nombre d\'XP à donner').setRequired(true)),
    new SlashCommandBuilder().setName('gg').setDescription('Envoie un gros GG qui clignote !')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('✅ Commandes enregistrées');
});

client.on('interactionCreate', async interaction => {
  const { commandName, user, member } = interaction;

  if (!userData[user.id]) {
    userData[user.id] = { xp: 0, level: 1, progress: 0, validated: false };
    await saveUserData(user.id, userData[user.id]);
  }
  const player = userData[user.id];

  try {
    // ---------------- COMMANDES EXISTANTES ----------------
    if (commandName === 'gg') {
      let visible = true;
      let count = 0;
      const message = await interaction.reply({ content: '**🎉 GG 🎉**', fetchReply: true });
      const interval = setInterval(() => {
        if (count >= 6) { clearInterval(interval); return; }
        visible = !visible;
        message.edit({ content: visible ? '**🎉 GG 🎉**' : '‎ ' });
        count++;
      }, 500);
      return;
    }

    if (commandName === 'profil') {
      const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name);
      const e = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📜 Profil de ${user.username}`)
        .addFields(
          { name: '🔢 Niveau', value: `Niv ${player.level}`, inline: true },
          { name: '💠 XP', value: `${player.xp} XP`, inline: true },
          { name: '⚒️ Métiers', value: roles.length ? roles.join(', ') : 'Aucun métier', inline: false }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (commandName === 'donxp') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ Permission refusée.', flags: 64 });
      }
      await interaction.deferReply();
      const tgt = interaction.options.getUser('joueur');
      const xpAmt = interaction.options.getInteger('xp');
      if (!userData[tgt.id]) userData[tgt.id] = { xp: 0, level: 1, progress: 0, validated: false };
      userData[tgt.id].xp += xpAmt;
      await saveUserData(tgt.id, userData[tgt.id]);
      return interaction.editReply(`✅ ${xpAmt} XP donnés à <@${tgt.id}> !`);
    }

    // ---------------- COMMANDES METIER ----------------
    if (commandName === 'metier' || commandName === 'requete') {
      const isRequete = commandName === 'requete';
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(isRequete ? 'requete_metier' : 'choix_metier')
          .setPlaceholder(isRequete ? 'Sélectionne le métier à contacter' : 'Sélectionne ton métier')
          .addOptions([
            { label: 'Forgeron', value: 'Forgeron', emoji: '⚒️' },
            { label: 'Mineur', value: 'Mineur', emoji: '⛏️' },
            { label: 'Alchimiste', value: 'Alchimiste', emoji: '🧪' },
            { label: 'Couturier', value: 'Couturier', emoji: '🧵' },
            { label: 'Ingénieur', value: 'Ingénieur', emoji: '🔧' },
            { label: 'Enchanteur', value: 'Enchanteur', emoji: '✨' },
            { label: 'Herboriste', value: 'Herboriste', emoji: '🌿' },
            { label: 'Travailleur du cuir', value: 'Travailleur du cuir', emoji: '👞' }
          ])
      );
      await interaction.reply({ content: isRequete ? '🔽 Sélectionne le métier pour ta requête :' : '🔽 Choisis ton métier :', components: [row], ephemeral: true });
      return;
    }

    // ---------------- GESTION DU MENU SELECT ----------------
    if (interaction.isStringSelectMenu()) {
      const metier = interaction.values[0];
      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === metier.toLowerCase());
      if (!role) return interaction.reply({ content: `❌ Le rôle **${metier}** n'existe pas.`, ephemeral: true });

      if (interaction.customId === 'choix_metier') {
        // Ajouter rôle
        await interaction.member.roles.add(role);
        // Message public
        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) publicChannel.send(`🎉 **${interaction.user.username}** a rejoint la guilde des **${metier}** !`);
        // DM au membre
        await interaction.user.send(`✅ Merci d'avoir rejoint la guilde des **${metier}** !`);
        return interaction.reply({ content: `✅ Tu es maintenant **${metier}** !`, ephemeral: true });
      }

      if (interaction.customId === 'requete_metier') {
        // Envoi DM aux membres du rôle
        role.members.forEach(m => m.send(`📢 ${interaction.user.username} a envoyé une requête à la guilde des ${metier} !`).catch(() => {}));
        // Message public
        const publicChannel = interaction.guild.channels.cache.find(c => c.name === 'metiers' && c.isTextBased());
        if (publicChannel) publicChannel.send(`📢 ${interaction.user.username} a envoyé une requête à la guilde des ${metier} !`);
        return interaction.reply({ content: `✅ Ta requête a été envoyée à la guilde des ${metier}.`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Une erreur est survenue.');
    } else {
      await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 });
    }
  }
});

client.login(process.env.TOKEN);
